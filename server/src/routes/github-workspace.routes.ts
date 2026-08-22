import { Router } from "express";
import crypto from "node:crypto";
import prisma from "../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.middleware.js";

const router = Router();
const ENCRYPTION_KEY_HEX = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
const MAX_FILES = 150;
const MAX_FILE_BYTES = 1_000_000;

type StoredCredentials = {
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
};

function getEncryptionKey() {
  if (!ENCRYPTION_KEY_HEX || !/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY_HEX)) {
    throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY must be a 32-byte hex key");
  }
  return Buffer.from(ENCRYPTION_KEY_HEX, "hex");
}

function decrypt(value: string) {
  const [ivHex, tagHex, cipherHex] = value.split(":");
  if (!ivHex || !tagHex || !cipherHex) throw new Error("Invalid encrypted GitHub token");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

function accessTokenFromStored(value: string) {
  try {
    const parsed = JSON.parse(value) as StoredCredentials;
    if (parsed && typeof parsed.accessToken === "string") return parsed.accessToken;
  } catch {
    // Legacy manually connected tokens were stored directly.
  }
  return value;
}

async function getToken(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubTokenEnc: true },
  });
  if (!user?.githubTokenEnc) return null;
  return accessTokenFromStored(decrypt(user.githubTokenEnc));
}

function parseRepository(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.hostname !== "github.com") return null;
    const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1]?.replace(/\.git$/i, "");
    return owner && repo ? { owner, repo } : null;
  } catch {
    return null;
  }
}

function gitBlobSha(content: string) {
  const body = Buffer.from(content, "utf8");
  const header = Buffer.from(`blob ${body.length}\0`, "utf8");
  return crypto.createHash("sha1").update(Buffer.concat([header, body])).digest("hex");
}

async function github(url: string, token: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Devora",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

router.get("/github/local-status", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
    const repositoryUrl = typeof req.query.repositoryUrl === "string" ? req.query.repositoryUrl : "";
    const branch = typeof req.query.branch === "string" && req.query.branch.trim() ? req.query.branch.trim() : "main";

    if (!projectId || !repositoryUrl) {
      return res.status(400).json({ message: "projectId and repositoryUrl are required" });
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, ownerId: userId },
      select: { id: true, name: true },
    });
    if (!project) return res.status(404).json({ message: "Project not found" });

    const parsed = parseRepository(repositoryUrl);
    if (!parsed) return res.status(400).json({ message: "Invalid GitHub repository URL" });

    const token = await getToken(userId);
    if (!token) return res.status(401).json({ message: "Connect GitHub first" });

    const base = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
    const ref = await github(`${base}/git/ref/heads/${encodeURIComponent(branch)}`, token) as { object?: { sha?: string } };
    const headSha = ref.object?.sha || null;

    const tree = await github(`${base}/git/trees/${encodeURIComponent(branch)}?recursive=1`, token) as {
      truncated?: boolean;
      tree?: Array<{ path: string; type: string; sha: string; size?: number }>;
    };

    const remote = (tree.tree || []).filter(
      (entry) => entry.type === "blob" && !entry.path.startsWith(".git/") && (entry.size ?? 0) <= MAX_FILE_BYTES,
    );

    if (tree.truncated || remote.length > MAX_FILES) {
      return res.status(413).json({ message: `Repository exceeds the ${MAX_FILES}-file status limit` });
    }

    const local = await prisma.projectFile.findMany({
      where: { projectId },
      select: { path: true, content: true },
      orderBy: { path: "asc" },
    });

    if (local.length > MAX_FILES) {
      return res.status(413).json({ message: `Project exceeds the ${MAX_FILES}-file status limit` });
    }

    const localMap = new Map(local.map((file) => [file.path, gitBlobSha(file.content)]));
    const remoteMap = new Map(remote.map((file) => [file.path, file.sha]));
    const changes: Array<{ path: string; status: "added" | "modified" | "deleted" }> = [];

    for (const [path, localSha] of localMap) {
      const remoteSha = remoteMap.get(path);
      if (!remoteSha) changes.push({ path, status: "added" });
      else if (remoteSha !== localSha) changes.push({ path, status: "modified" });
    }

    for (const path of remoteMap.keys()) {
      if (!localMap.has(path)) changes.push({ path, status: "deleted" });
    }

    const counts = {
      changed: changes.filter((item) => item.status === "modified").length,
      added: changes.filter((item) => item.status === "added").length,
      deleted: changes.filter((item) => item.status === "deleted").length,
      unchanged: Math.max(0, Math.min(local.length, remote.length) - changes.filter((item) => item.status !== "deleted").length),
    };

    return res.json({
      project: project.name,
      branch,
      headSha,
      totalLocal: local.length,
      totalRemote: remote.length,
      clean: changes.length === 0,
      counts,
      changes: changes.slice(0, 100),
    });
  } catch (error) {
    console.error("GitHub local status error:", error);
    return res.status(502).json({ message: error instanceof Error ? error.message : "Unable to compare Devora with GitHub" });
  }
});

export default router;
