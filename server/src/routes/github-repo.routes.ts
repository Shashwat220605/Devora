import { Router } from "express";
import crypto from "node:crypto";
import prisma from "../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.middleware.js";

const router = Router();
const ENCRYPTION_KEY_HEX = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;

function getEncryptionKey() {
  if (!ENCRYPTION_KEY_HEX || !/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY_HEX)) {
    throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY must be a 32-byte hex key");
  }
  return Buffer.from(ENCRYPTION_KEY_HEX, "hex");
}

function decrypt(value: string) {
  const [ivHex, tagHex, ciphertextHex] = value.split(":");
  if (!ivHex || !tagHex || !ciphertextHex) throw new Error("Invalid encrypted GitHub token");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

async function getToken(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubTokenEnc: true },
  });
  return user?.githubTokenEnc ? decrypt(user.githubTokenEnc) : null;
}

function parseGitHubUrl(value: string) {
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

async function githubRequest(url: string, token: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Devora",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token}`,
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${body}`);
  return body ? JSON.parse(body) : null;
}

function getRepoUrl(req: AuthenticatedRequest) {
  const value = typeof req.query.repositoryUrl === "string" ? req.query.repositoryUrl : "";
  return value.trim();
}

router.get("/github/branches", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const token = await getToken(userId);
    if (!token) return res.status(401).json({ message: "Connect GitHub first" });
    const parsed = parseGitHubUrl(getRepoUrl(req));
    if (!parsed) return res.status(400).json({ message: "Valid repositoryUrl is required" });
    const data = await githubRequest(
      `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/branches?per_page=100`,
      token,
    ) as Array<{ name: string; protected?: boolean; commit?: { sha?: string } }>;
    return res.json(data.map((item) => ({
      name: item.name,
      protected: Boolean(item.protected),
      sha: item.commit?.sha || null,
    })));
  } catch (error) {
    console.error("GitHub branches error:", error);
    return res.status(502).json({ message: "Unable to load GitHub branches" });
  }
});

router.get("/github/commits", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const token = await getToken(userId);
    if (!token) return res.status(401).json({ message: "Connect GitHub first" });
    const repositoryUrl = getRepoUrl(req);
    const parsed = parseGitHubUrl(repositoryUrl);
    if (!parsed) return res.status(400).json({ message: "Valid repositoryUrl is required" });
    const branch = typeof req.query.branch === "string" && req.query.branch.trim() ? req.query.branch.trim() : "main";
    const data = await githubRequest(
      `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/commits?per_page=30&sha=${encodeURIComponent(branch)}`,
      token,
    ) as Array<{
      sha: string;
      html_url: string;
      commit: { message: string; author?: { name?: string; date?: string } };
      author?: { login?: string; avatar_url?: string } | null;
    }>;
    return res.json(data.map((item) => ({
      sha: item.sha,
      shortSha: item.sha.slice(0, 7),
      message: item.commit.message.split("\n")[0],
      author: item.author?.login || item.commit.author?.name || "Unknown",
      avatarUrl: item.author?.avatar_url || null,
      date: item.commit.author?.date || null,
      url: item.html_url,
    })));
  } catch (error) {
    console.error("GitHub commits error:", error);
    return res.status(502).json({ message: "Unable to load GitHub commits" });
  }
});

router.get("/github/compare", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const token = await getToken(userId);
    if (!token) return res.status(401).json({ message: "Connect GitHub first" });
    const repositoryUrl = getRepoUrl(req);
    const parsed = parseGitHubUrl(repositoryUrl);
    if (!parsed) return res.status(400).json({ message: "Valid repositoryUrl is required" });
    const base = typeof req.query.base === "string" ? req.query.base.trim() : "";
    const head = typeof req.query.head === "string" ? req.query.head.trim() : "";
    if (!base || !head) return res.status(400).json({ message: "base and head branches are required" });
    const data = await githubRequest(
      `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
      token,
    ) as {
      status?: string;
      ahead_by?: number;
      behind_by?: number;
      total_commits?: number;
      html_url?: string;
      commits?: Array<{ sha: string; commit: { message: string; author?: { name?: string; date?: string } } }>;
      files?: Array<{ filename: string; status: string; additions: number; deletions: number; changes: number; patch?: string }>;
    };
    return res.json({
      status: data.status || "unknown",
      aheadBy: data.ahead_by || 0,
      behindBy: data.behind_by || 0,
      totalCommits: data.total_commits || 0,
      url: data.html_url || null,
      commits: (data.commits || []).slice(0, 30).map((item) => ({
        sha: item.sha,
        shortSha: item.sha.slice(0, 7),
        message: item.commit.message.split("\n")[0],
        author: item.commit.author?.name || "Unknown",
        date: item.commit.author?.date || null,
      })),
      files: (data.files || []).slice(0, 100).map((file) => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch || null,
      })),
    });
  } catch (error) {
    console.error("GitHub compare error:", error);
    return res.status(502).json({ message: "Unable to compare GitHub branches" });
  }
});

export default router;
