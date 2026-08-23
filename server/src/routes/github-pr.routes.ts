import { Router } from "express";
import crypto from "node:crypto";
import prisma from "../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.middleware.js";

const router = Router();
const KEY = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;

function key() {
  if (!KEY || !/^[0-9a-fA-F]{64}$/.test(KEY)) throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY must be a 32-byte hex key");
  return Buffer.from(KEY, "hex");
}
function decrypt(value: string) {
  const [iv, tag, cipher] = value.split(":");
  if (!iv || !tag || !cipher) throw new Error("Invalid encrypted GitHub token");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(cipher, "hex")), decipher.final()]).toString("utf8");
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
function parseRepo(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.hostname !== "github.com") return null;
    const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1]?.replace(/\.git$/i, "");
    return owner && repo ? { owner, repo } : null;
  } catch { return null; }
}
async function token(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { githubTokenEnc: true } });
  return user?.githubTokenEnc ? tokenFromStored(decrypt(user.githubTokenEnc)) : null;
}
async function github(url: string, accessToken: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: {
    Accept: "application/vnd.github+json",
    "User-Agent": "Devora",
    "X-GitHub-Api-Version": "2022-11-28",
    Authorization: `Bearer ${accessToken}`,
    ...(init.headers || {}),
  }});
  const body = await res.text();
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${body}`);
  return body ? JSON.parse(body) : null;
}
async function context(req: AuthenticatedRequest) {
  if (!req.userId) throw new Error("Authentication required");
  const repositoryUrl = typeof req.query.repositoryUrl === "string" ? req.query.repositoryUrl.trim() : "";
  const parsed = parseRepo(repositoryUrl);
  if (!parsed) throw new Error("Valid repositoryUrl is required");
  const accessToken = await token(req.userId);
  if (!accessToken) throw new Error("Connect GitHub first");
  const base = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
  return { accessToken, base };
}

router.get("/github/prs", authenticate, async (req, res) => {
  try {
    const { accessToken, base } = await context(req as AuthenticatedRequest);
    const state = typeof req.query.state === "string" ? req.query.state : "open";
    const data = await github(`${base}/pulls?state=${encodeURIComponent(state)}&sort=updated&direction=desc&per_page=50`, accessToken);
    return res.json((data || []).map((item: any) => ({
      number: item.number,
      title: item.title,
      body: item.body || "",
      state: item.state,
      draft: Boolean(item.draft),
      merged: Boolean(item.merged_at),
      head: item.head?.ref || "",
      base: item.base?.ref || "",
      author: item.user?.login || "Unknown",
      avatarUrl: item.user?.avatar_url || null,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      url: item.html_url,
    })));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load pull requests";
    return res.status(message === "Authentication required" ? 401 : 502).json({ message });
  }
});

router.get("/github/prs/:number", authenticate, async (req, res) => {
  try {
    const { accessToken, base } = await context(req as AuthenticatedRequest);
    const number = encodeURIComponent(String(req.params.number));
    const [pr, files, comments] = await Promise.all([
      github(`${base}/pulls/${number}`, accessToken),
      github(`${base}/pulls/${number}/files?per_page=100`, accessToken),
      github(`${base}/issues/${number}/comments?per_page=100`, accessToken),
    ]);
    return res.json({
      number: pr.number, title: pr.title, body: pr.body || "", state: pr.state, draft: Boolean(pr.draft),
      merged: Boolean(pr.merged_at), mergeable: pr.mergeable, mergeableState: pr.mergeable_state,
      head: pr.head?.ref || "", base: pr.base?.ref || "", author: pr.user?.login || "Unknown", url: pr.html_url,
      createdAt: pr.created_at, updatedAt: pr.updated_at,
      files: (files || []).map((file: any) => ({ path: file.filename, status: file.status, additions: file.additions, deletions: file.deletions, changes: file.changes, patch: file.patch || null })),
      comments: (comments || []).map((comment: any) => ({ id: comment.id, author: comment.user?.login || "Unknown", body: comment.body || "", createdAt: comment.created_at, avatarUrl: comment.user?.avatar_url || null })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load pull request";
    return res.status(message === "Authentication required" ? 401 : 502).json({ message });
  }
});

router.post("/github/prs", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const repositoryUrl = typeof req.body?.repositoryUrl === "string" ? req.body.repositoryUrl.trim() : "";
    const parsed = parseRepo(repositoryUrl);
    if (!parsed) return res.status(400).json({ message: "Valid repositoryUrl is required" });
    const accessToken = await token(userId);
    if (!accessToken) return res.status(401).json({ message: "Connect GitHub first" });
    const base = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
    const { title, body, head, base: baseBranch, draft } = req.body || {};
    if (typeof title !== "string" || typeof head !== "string" || typeof baseBranch !== "string") return res.status(400).json({ message: "title, head and base are required" });
    const pr = await github(`${base}/pulls`, accessToken, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body: typeof body === "string" ? body : "", head, base: baseBranch, draft: Boolean(draft) }) });
    return res.status(201).json(pr);
  } catch (error) {
    return res.status(502).json({ message: error instanceof Error ? error.message : "Unable to create pull request" });
  }
});

router.post("/github/prs/:number/comments", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const repositoryUrl = typeof req.body?.repositoryUrl === "string" ? req.body.repositoryUrl.trim() : "";
    const parsed = parseRepo(repositoryUrl);
    if (!parsed) return res.status(400).json({ message: "Valid repositoryUrl is required" });
    const accessToken = await token(userId);
    if (!accessToken) return res.status(401).json({ message: "Connect GitHub first" });
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (!body) return res.status(400).json({ message: "Comment body is required" });
    const base = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
    const result = await github(`${base}/issues/${encodeURIComponent(String(req.params.number))}/comments`, accessToken, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
    return res.status(201).json(result);
  } catch (error) {
    return res.status(502).json({ message: error instanceof Error ? error.message : "Unable to comment on pull request" });
  }
});

router.post("/github/prs/:number/merge", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const repositoryUrl = typeof req.body?.repositoryUrl === "string" ? req.body.repositoryUrl.trim() : "";
    const parsed = parseRepo(repositoryUrl);
    if (!parsed) return res.status(400).json({ message: "Valid repositoryUrl is required" });
    const accessToken = await token(userId);
    if (!accessToken) return res.status(401).json({ message: "Connect GitHub first" });
    const base = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
    const payload = { merge_method: req.body?.method === "squash" ? "squash" : req.body?.method === "rebase" ? "rebase" : "merge", commit_title: typeof req.body?.commitTitle === "string" ? req.body.commitTitle : undefined };
    const result = await github(`${base}/pulls/${encodeURIComponent(String(req.params.number))}/merge`, accessToken, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return res.json(result);
  } catch (error) {
    return res.status(502).json({ message: error instanceof Error ? error.message : "Unable to merge pull request" });
  }
});

export default router;
