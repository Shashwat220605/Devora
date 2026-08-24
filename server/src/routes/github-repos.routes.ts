import { Router } from "express";
import crypto from "node:crypto";
import prisma from "../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.middleware.js";

const router = Router();
const ENCRYPTION_KEY_HEX = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
const OAUTH_CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.GITHUB_OAUTH_CLIENT_SECRET;

type StoredGitHubCredentials = {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
  refreshTokenExpiresAt?: number;
};

function getEncryptionKey() {
  if (!ENCRYPTION_KEY_HEX || !/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY_HEX)) {
    throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY is not configured correctly");
  }
  return Buffer.from(ENCRYPTION_KEY_HEX, "hex");
}

function decrypt(value: string) {
  const [ivHex, tagHex, ciphertextHex] = value.split(":");
  if (!ivHex || !tagHex || !ciphertextHex) throw new Error("Invalid encrypted GitHub credentials");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

function parseCredentials(value: string): StoredGitHubCredentials {
  try {
    const parsed = JSON.parse(value) as StoredGitHubCredentials;
    if (parsed && typeof parsed.accessToken === "string") return parsed;
  } catch {
    // Legacy token format.
  }
  return { accessToken: value };
}

function encrypt(value: string) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${Buffer.from(iv).toString("hex")}:${Buffer.from(tag).toString("hex")}:${Buffer.from(ciphertext).toString("hex")}`;
}

async function refreshTokenIfNeeded(userId: string, credentials: StoredGitHubCredentials) {
  if (!credentials.refreshToken || !credentials.accessTokenExpiresAt) return credentials;
  if (Date.now() < credentials.accessTokenExpiresAt - 60_000) return credentials;
  if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) return credentials;

  if (credentials.refreshTokenExpiresAt && Date.now() > credentials.refreshTokenExpiresAt) {
    return credentials;
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken,
    }),
  });

  const data = await response.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "GitHub token refresh failed");
  }

  const next: StoredGitHubCredentials = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || credentials.refreshToken,
    accessTokenExpiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : credentials.accessTokenExpiresAt,
    refreshTokenExpiresAt: data.refresh_token_expires_in ? Date.now() + data.refresh_token_expires_in * 1000 : credentials.refreshTokenExpiresAt,
  };

  await prisma.user.update({
    where: { id: userId },
    data: { githubTokenEnc: encrypt(JSON.stringify(next)) },
  });

  return next;
}

async function getCredentials(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubTokenEnc: true },
  });
  if (!user?.githubTokenEnc) return null;
  const credentials = parseCredentials(decrypt(user.githubTokenEnc));
  return refreshTokenIfNeeded(userId, credentials);
}

router.get("/github/repos", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const credentials = await getCredentials(userId);
    if (!credentials?.accessToken) return res.status(401).json({ message: "Connect GitHub first" });

    const response = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Devora",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${credentials.accessToken}`,
      },
    });

    const body = await response.text();
    let payload: unknown = null;
    try { payload = body ? JSON.parse(body) : null; } catch { /* keep raw body out of the response */ }

    if (!response.ok) {
      if (response.status === 401) {
        await prisma.user.update({ where: { id: userId }, data: { githubTokenEnc: null, githubUsername: null } });
        return res.status(401).json({ message: "GitHub authorization expired. Reconnect GitHub." });
      }
      if (response.status === 403) {
        return res.status(403).json({ message: "GitHub denied repository access. Check OAuth permissions or GitHub rate limits." });
      }
      const detail = typeof payload === "object" && payload && "message" in payload ? String((payload as { message?: unknown }).message || "") : "";
      return res.status(502).json({ message: detail ? `GitHub: ${detail}` : `GitHub returned ${response.status}` });
    }

    if (!Array.isArray(payload)) {
      return res.status(502).json({ message: "GitHub returned an unexpected repository response" });
    }

    return res.json(payload);
  } catch (error) {
    console.error("GitHub repos loader error:", error);
    const message = error instanceof Error ? error.message : "Unable to load GitHub repositories";
    return res.status(502).json({ message });
  }
});

export default router;
