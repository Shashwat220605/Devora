import { Router } from "express";
import crypto from "node:crypto";
import prisma from "../lib/prisma.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware.js";

const router = Router();

const MAX_FILES = 500;
const MAX_FILE_BYTES = 1_000_000;
const IGNORED_PATHS = [
  /^\.git\//i,
  /(^|\/)node_modules\//i,
  /(^|\/)dist\//i,
  /(^|\/)build\//i,
  /(^|\/)coverage\//i,
  /(^|\/)\.next\//i,
  /(^|\/)\.vite\//i,
  /(^|\/)\.turbo\//i,
  /(^|\/)\.cache\//i,
  /(^|\/)out\//i,
];
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const OAUTH_CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.GITHUB_OAUTH_CLIENT_SECRET;
const OAUTH_REDIRECT_URI =
  process.env.GITHUB_OAUTH_REDIRECT_URI ||
  "https://devora-api.shxshwat23.workers.dev/api/github/callback";
const JWT_SECRET = process.env.JWT_SECRET;
const ENCRYPTION_KEY_HEX = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;

type StoredGitHubCredentials = {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
  refreshTokenExpiresAt?: number;
};

function getEncryptionKey() {
  if (!ENCRYPTION_KEY_HEX || !/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY_HEX)) {
    throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY must be a 32-byte hex key");
  }
  return Buffer.from(ENCRYPTION_KEY_HEX, "hex");
}

function encrypt(value: string) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${ciphertext.toString("hex")}`;
}

function decrypt(value: string) {
  const key = getEncryptionKey();
  const [ivHex, tagHex, ciphertextHex] = value.split(":");
  if (!ivHex || !tagHex || !ciphertextHex) throw new Error("Invalid encrypted GitHub token");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

function toBase64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function createOAuthState(userId: string) {
  if (!JWT_SECRET) throw new Error("JWT_SECRET is not defined");

  const payload = toBase64Url(
    JSON.stringify({
      userId,
      issuedAt: Date.now(),
      nonce: crypto.randomBytes(18).toString("hex"),
    }),
  );

  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

function verifyOAuthState(state: string) {
  if (!JWT_SECRET) throw new Error("JWT_SECRET is not defined");

  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new Error("Invalid OAuth state");

  const expected = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(payload)
    .digest("base64url");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid OAuth state signature");
  }

  const parsed = JSON.parse(fromBase64Url(payload)) as {
    userId?: string;
    issuedAt?: number;
  };

  if (!parsed.userId || !parsed.issuedAt) throw new Error("Invalid OAuth state payload");
  if (Date.now() - parsed.issuedAt > 10 * 60 * 1000) {
    throw new Error("OAuth state expired");
  }

  return parsed.userId;
}

function parseStoredCredentials(value: string): StoredGitHubCredentials {
  try {
    const parsed = JSON.parse(value) as StoredGitHubCredentials;
    if (parsed && typeof parsed.accessToken === "string") return parsed;
  } catch {
    // Existing manually connected tokens were stored as plain text.
  }

  return { accessToken: value };
}

function serializeCredentials(value: StoredGitHubCredentials) {
  return JSON.stringify(value);
}

function parseGitHubUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.hostname !== "github.com") return null;
    const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, "");
    if (!owner || !repo) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

function shouldIgnorePath(path: string) {
  return IGNORED_PATHS.some((pattern) => pattern.test(path));
}

async function githubRequest(url: string, token?: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Devora",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status}: ${body}`);
  }

  return response.json();
}

async function exchangeOAuthCode(code: string) {
  if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
    throw new Error("GitHub OAuth credentials are not configured");
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: OAUTH_REDIRECT_URI,
    }),
  });

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "GitHub OAuth exchange failed");
  }

  return data;
}

async function refreshOAuthToken(userId: string, credentials: StoredGitHubCredentials) {
  if (!credentials.refreshToken || !OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
    return credentials;
  }

  if (
    credentials.refreshTokenExpiresAt &&
    Date.now() > credentials.refreshTokenExpiresAt
  ) {
    return credentials;
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken,
    }),
  });

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "GitHub OAuth refresh failed");
  }

  const next: StoredGitHubCredentials = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || credentials.refreshToken,
    accessTokenExpiresAt: data.expires_in
      ? Date.now() + data.expires_in * 1000
      : credentials.accessTokenExpiresAt,
    refreshTokenExpiresAt: data.refresh_token_expires_in
      ? Date.now() + data.refresh_token_expires_in * 1000
      : credentials.refreshTokenExpiresAt,
  };

  await prisma.user.update({
    where: { id: userId },
    data: { githubTokenEnc: encrypt(serializeCredentials(next)) },
  });

  return next;
}

async function getConnectedToken(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubTokenEnc: true },
  });

  if (!user?.githubTokenEnc) return null;

  const credentials = parseStoredCredentials(decrypt(user.githubTokenEnc));

  if (
    credentials.accessTokenExpiresAt &&
    Date.now() > credentials.accessTokenExpiresAt - 60_000
  ) {
    const refreshed = await refreshOAuthToken(userId, credentials);
    return refreshed.accessToken;
  }

  return credentials.accessToken;
}

function oauthErrorRedirect(message: string) {
  return `${FRONTEND_URL}/github?oauth=error&message=${encodeURIComponent(message)}`;
}

// Starts GitHub OAuth for the currently logged-in Devora user.
router.get("/github/oauth/start", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
      return res.status(503).json({ message: "GitHub OAuth is not configured" });
    }

    const state = createOAuthState(userId);
    const params = new URLSearchParams({
      client_id: OAUTH_CLIENT_ID,
      redirect_uri: OAUTH_REDIRECT_URI,
      scope: "repo read:user",
      state,
    });

    return res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  } catch (error) {
    console.error("GitHub OAuth start error:", error);
    return res.status(500).json({ message: "Unable to start GitHub authorization" });
  }
});

// OAuth callback configured in the GitHub application.
router.get("/github/callback", async (req, res) => {
  try {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const githubError = typeof req.query.error === "string" ? req.query.error : "";

    if (githubError) {
      return res.redirect(oauthErrorRedirect(`GitHub authorization was ${githubError}.`));
    }

    if (!code || !state) {
      return res.redirect(oauthErrorRedirect("Missing GitHub OAuth code or state."));
    }

    const userId = verifyOAuthState(state);
    const oauth = await exchangeOAuthCode(code);
    const githubUser = (await githubRequest("https://api.github.com/user", oauth.access_token)) as {
      login?: string;
    };

    if (!githubUser.login) {
      throw new Error("GitHub did not return a user profile");
    }

    const credentials: StoredGitHubCredentials = {
      accessToken: oauth.access_token,
      refreshToken: oauth.refresh_token,
      accessTokenExpiresAt: oauth.expires_in
        ? Date.now() + oauth.expires_in * 1000
        : undefined,
      refreshTokenExpiresAt: oauth.refresh_token_expires_in
        ? Date.now() + oauth.refresh_token_expires_in * 1000
        : undefined,
    };

    await prisma.user.update({
      where: { id: userId },
      data: {
        githubTokenEnc: encrypt(serializeCredentials(credentials)),
        githubUsername: githubUser.login,
      },
    });

    return res.redirect(`${FRONTEND_URL}/github?oauth=connected`);
  } catch (error) {
    console.error("GitHub OAuth callback error:", error);
    return res.redirect(
      oauthErrorRedirect(
        error instanceof Error ? error.message : "GitHub authorization failed.",
      ),
    );
  }
});

router.get("/github/status", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { githubUsername: true, githubTokenEnc: true },
    });

    return res.json({
      connected: Boolean(user?.githubTokenEnc),
      username: user?.githubUsername || null,
    });
  } catch (error) {
    console.error("GitHub status error:", error);
    return res.status(500).json({ message: "Failed to read GitHub connection status" });
  }
});

router.post("/github/connect", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    if (!token) return res.status(400).json({ message: "GitHub token is required" });

    const githubUser = (await githubRequest("https://api.github.com/user", token)) as {
      login?: string;
    };

    if (!githubUser.login) {
      return res.status(400).json({ message: "GitHub token is invalid" });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        githubTokenEnc: encrypt(token),
        githubUsername: githubUser.login,
      },
    });

    return res.json({
      connected: true,
      username: githubUser.login,
    });
  } catch (error) {
    console.error("GitHub connect error:", error);
    return res.status(400).json({ message: "Unable to connect that GitHub token" });
  }
});

router.post("/github/disconnect", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    await prisma.user.update({
      where: { id: userId },
      data: { githubTokenEnc: null, githubUsername: null },
    });

    return res.json({ connected: false });
  } catch (error) {
    console.error("GitHub disconnect error:", error);
    return res.status(500).json({ message: "Failed to disconnect GitHub" });
  }
});

router.get("/github/repos", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const token = await getConnectedToken(userId);
    if (!token) return res.status(401).json({ message: "Connect GitHub first" });

    const repos = await githubRequest(
      "https://api.github.com/user/repos?per_page=100&sort=updated",
      token,
    );

    return res.json(repos);
  } catch (error) {
    console.error("GitHub repos error:", error);
    return res.status(502).json({
      message: error instanceof Error ? error.message : "Unable to load GitHub repositories",
    });
  }
});

router.post("/github/import", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const { projectId, repositoryUrl } = req.body;
    if (typeof projectId !== "string" || typeof repositoryUrl !== "string") {
      return res.status(400).json({ message: "projectId and repositoryUrl are required" });
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, ownerId: userId },
    });
    if (!project) return res.status(404).json({ message: "Project not found" });

    const parsed = parseGitHubUrl(repositoryUrl);
    if (!parsed) return res.status(400).json({ message: "Enter a valid GitHub repository URL" });

    const token = await getConnectedToken(userId);
    const apiBase = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
    const repoData = (await githubRequest(apiBase, token || undefined)) as {
      name?: string;
      html_url?: string;
      default_branch?: string;
    };
    const defaultBranch = repoData.default_branch || "main";

    const treeData = (await githubRequest(
      `${apiBase}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`,
      token || undefined,
    )) as {
      truncated?: boolean;
      tree?: Array<{ path: string; type: string; sha: string; size?: number }>;
    };

    const blobs = (treeData.tree || []).filter(
      (item) =>
        item.type === "blob" &&
        !shouldIgnorePath(item.path) &&
        (item.size ?? 0) <= MAX_FILE_BYTES,
    );

    if (treeData.truncated) {
      return res.status(413).json({
        message: "GitHub returned a truncated repository tree. This repository is too large to import in one pass. Try a smaller repository or exclude generated folders before importing.",
      });
    }

    if (blobs.length > MAX_FILES) {
      return res.status(413).json({
        message: `Repository has ${blobs.length} importable files. Devora currently supports ${MAX_FILES} files per import after excluding generated folders such as node_modules, dist, build, and coverage.`,
      });
    }

    let imported = 0;
    for (const item of blobs) {
      const blob = (await githubRequest(`${apiBase}/git/blobs/${item.sha}`, token || undefined)) as {
        encoding?: string;
        content?: string;
      };
      if (blob.encoding !== "base64" || typeof blob.content !== "string") continue;

      const content = Buffer.from(blob.content, "base64").toString("utf8");
      await prisma.projectFile.upsert({
        where: { projectId_path: { projectId, path: item.path } },
        update: { content },
        create: {
          projectId,
          path: item.path,
          content,
          language: item.path.split(".").pop()?.toLowerCase() || null,
        },
      });
      imported += 1;
    }

    const existing = await prisma.repository.findFirst({
      where: { projectId, url: repoData.html_url || `https://github.com/${parsed.owner}/${parsed.repo}` },
    });

    if (!existing) {
      await prisma.repository.create({
        data: {
          name: repoData.name || parsed.repo,
          url: repoData.html_url || `https://github.com/${parsed.owner}/${parsed.repo}`,
          provider: "github",
          projectId,
        },
      });
    }

    return res.status(201).json({
      message: "GitHub repository imported successfully",
      repository: {
        name: repoData.name || parsed.repo,
        url: repoData.html_url || `https://github.com/${parsed.owner}/${parsed.repo}`,
        branch: defaultBranch,
      },
      filesImported: imported,
    });
  } catch (error) {
    console.error("GitHub import error:", error);
    return res.status(502).json({
      message: error instanceof Error ? error.message : "Unable to import the GitHub repository",
    });
  }
});

export default router;
