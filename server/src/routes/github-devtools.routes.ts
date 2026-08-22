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
  const [ivHex, tagHex, cipherHex] = value.split(":");
  if (!ivHex || !tagHex || !cipherHex) throw new Error("Invalid encrypted GitHub token");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(cipherHex, "hex")), decipher.final()]).toString("utf8");
}

function tokenFromStored(value: string) {
  try {
    const parsed = JSON.parse(value) as { accessToken?: string };
    if (parsed && typeof parsed.accessToken === "string") return parsed.accessToken;
  } catch {
    // Legacy credentials can be stored directly.
  }
  return value;
}

async function getToken(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { githubTokenEnc: true } });
  return user?.githubTokenEnc ? tokenFromStored(decrypt(user.githubTokenEnc)) : null;
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

async function github(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Devora",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${body}`);
  return body ? JSON.parse(body) : null;
}

async function authRepo(req: AuthenticatedRequest) {
  const userId = req.userId;
  const repositoryUrl = typeof req.query.repositoryUrl === "string" ? req.query.repositoryUrl.trim() : "";
  if (!userId) throw new Error("Authentication required");
  if (!repositoryUrl) throw new Error("repositoryUrl is required");
  const parsed = parseRepository(repositoryUrl);
  if (!parsed) throw new Error("Invalid GitHub repository URL");
  const token = await getToken(userId);
  if (!token) throw new Error("Connect GitHub first");
  return { userId, token, parsed };
}

router.get("/github/activity", authenticate, async (req, res) => {
  try {
    const { token, parsed } = await authRepo(req as AuthenticatedRequest);
    const base = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
    const [commits, prs, branches] = await Promise.all([
      github(`${base}/commits?per_page=20`, token),
      github(`${base}/pulls?state=all&per_page=20&sort=updated&direction=desc`, token),
      github(`${base}/branches?per_page=20`, token),
    ]);

    return res.json({
      commits: (commits || []).map((item: any) => ({
        type: "commit",
        id: item.sha,
        title: item.commit?.message?.split("\n")[0] || "Commit",
        actor: item.author?.login || item.commit?.author?.name || "Unknown",
        avatarUrl: item.author?.avatar_url || null,
        date: item.commit?.author?.date || null,
        url: item.html_url,
        branch: null,
      })),
      pullRequests: (prs || []).map((item: any) => ({
        type: "pull_request",
        id: String(item.id),
        title: item.title,
        actor: item.user?.login || "Unknown",
        avatarUrl: item.user?.avatar_url || null,
        date: item.updated_at || item.created_at || null,
        url: item.html_url,
        state: item.state,
        merged: Boolean(item.merged_at),
        number: item.number,
      })),
      branches: (branches || []).map((item: any) => ({
        name: item.name,
        protected: Boolean(item.protected),
      })),
    });
  } catch (error) {
    console.error("GitHub activity error:", error);
    const message = error instanceof Error ? error.message : "Unable to load GitHub activity";
    return res.status(message === "Authentication required" ? 401 : 502).json({ message });
  }
});

router.get("/github/actions", authenticate, async (req, res) => {
  try {
    const { token, parsed } = await authRepo(req as AuthenticatedRequest);
    const base = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
    const [workflows, runs] = await Promise.all([
      github(`${base}/actions/workflows?per_page=50`, token),
      github(`${base}/actions/runs?per_page=30`, token),
    ]);

    return res.json({
      workflows: (workflows?.workflows || []).map((workflow: any) => ({
        id: workflow.id,
        name: workflow.name,
        path: workflow.path,
        state: workflow.state,
        htmlUrl: workflow.html_url,
      })),
      runs: (runs?.workflow_runs || []).map((run: any) => ({
        id: run.id,
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        branch: run.head_branch,
        event: run.event,
        sha: run.head_sha,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        url: run.html_url,
        runNumber: run.run_number,
      })),
    });
  } catch (error) {
    console.error("GitHub Actions error:", error);
    const message = error instanceof Error ? error.message : "Unable to load GitHub Actions";
    return res.status(message === "Authentication required" ? 401 : 502).json({ message });
  }
});

router.post("/github/actions/:runId/rerun", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const repositoryUrl = typeof req.body?.repositoryUrl === "string" ? req.body.repositoryUrl.trim() : "";
    const parsed = parseRepository(repositoryUrl);
    if (!parsed) return res.status(400).json({ message: "Valid repositoryUrl is required" });
    const token = await getToken(userId);
    if (!token) return res.status(401).json({ message: "Connect GitHub first" });
    const runId = encodeURIComponent(String(req.params.runId));
    const base = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
    await github(`${base}/actions/runs/${runId}/rerun-failed-jobs`, token, { method: "POST" });
    return res.json({ message: "Failed jobs queued for rerun" });
  } catch (error) {
    console.error("GitHub Actions rerun error:", error);
    return res.status(502).json({ message: error instanceof Error ? error.message : "Unable to rerun GitHub Actions" });
  }
});

export default router;
