import { Router } from "express";
import crypto from "node:crypto";
import prisma from "../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.middleware.js";

const router = Router();
const KEY = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
const MAX_FILES = 150;
const MAX_FILE_BYTES = 1_000_000;

type Stored = { accessToken?: string };
function key() {
  if (!KEY || !/^[0-9a-fA-F]{64}$/.test(KEY)) throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY must be a 32-byte hex key");
  return Buffer.from(KEY, "hex");
}
function decrypt(value: string) {
  const [ivHex, tagHex, cipherHex] = value.split(":");
  if (!ivHex || !tagHex || !cipherHex) throw new Error("Invalid encrypted GitHub token");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(cipherHex, "hex")), decipher.final()]).toString("utf8");
}
function tokenFromStored(value: string) {
  try { const parsed = JSON.parse(value) as Stored; if (parsed.accessToken) return parsed.accessToken; } catch {}
  return value;
}
async function getToken(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { githubTokenEnc: true } });
  return user?.githubTokenEnc ? tokenFromStored(decrypt(user.githubTokenEnc)) : null;
}
function parseRepo(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.hostname !== "github.com") return null;
    const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
    const owner = parts[0]; const repo = parts[1]?.replace(/\.git$/i, "");
    return owner && repo ? { owner, repo } : null;
  } catch { return null; }
}
async function gh(url: string, token: string) {
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": "Devora", "X-GitHub-Api-Version": "2022-11-28", Authorization: `Bearer ${token}` } });
  const text = await response.text();
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}
function lines(value: string) { return value.replace(/\r\n/g, "\n").split("\n"); }
function simpleDiff(before: string, after: string) {
  const a = lines(before); const b = lines(after);
  const max = Math.max(a.length, b.length);
  const out = ["--- github", "+++ devora"];
  for (let i = 0; i < max && out.length < 520; i += 1) {
    if (a[i] === b[i]) out.push(` ${a[i] ?? ""}`);
    else { if (a[i] !== undefined) out.push(`-${a[i]}`); if (b[i] !== undefined) out.push(`+${b[i]}`); }
  }
  if (max >= 520) out.push("... diff preview truncated ...");
  return out.join("\n");
}

router.post("/github/diff-view", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const { projectId, repositoryUrl, branch } = req.body as { projectId?: string; repositoryUrl?: string; branch?: string };
    if (!projectId || !repositoryUrl || !branch) return res.status(400).json({ message: "projectId, repositoryUrl, and branch are required" });
    const project = await prisma.project.findFirst({ where: { id: projectId, ownerId: userId }, select: { id: true } });
    if (!project) return res.status(404).json({ message: "Project not found" });
    const parsed = parseRepo(repositoryUrl);
    if (!parsed) return res.status(400).json({ message: "Invalid GitHub repository URL" });
    const token = await getToken(userId);
    if (!token) return res.status(401).json({ message: "Connect GitHub first" });
    const base = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
    const tree = await gh(`${base}/git/trees/${encodeURIComponent(branch)}?recursive=1`, token) as { truncated?: boolean; tree?: Array<{ path: string; type: string; sha: string; size?: number }> };
    const remote = (tree.tree || []).filter((item) => item.type === "blob" && !item.path.startsWith(".git/") && (item.size ?? 0) <= MAX_FILE_BYTES);
    if (tree.truncated || remote.length > MAX_FILES) return res.status(413).json({ message: `Repository exceeds the ${MAX_FILES}-file diff limit` });
    const local = await prisma.projectFile.findMany({ where: { projectId }, select: { path: true, content: true }, orderBy: { path: "asc" } });
    if (local.length > MAX_FILES) return res.status(413).json({ message: `Project exceeds the ${MAX_FILES}-file diff limit` });
    const localMap = new Map(local.map((file) => [file.path, file.content]));
    const changes: Array<{ path: string; status: "added" | "modified" | "deleted"; additions: number; deletions: number; preview: string }> = [];
    const remoteCache = new Map<string, string>();
    for (const item of remote) {
      const blob = await gh(`${base}/git/blobs/${item.sha}`, token) as { encoding?: string; content?: string };
      if (blob.encoding === "base64" && blob.content) remoteCache.set(item.path, Buffer.from(blob.content, "base64").toString("utf8"));
    }
    for (const file of local) {
      const remoteContent = remoteCache.get(file.path);
      if (remoteContent === undefined) { const preview = simpleDiff("", file.content); changes.push({ path: file.path, status: "added", additions: lines(file.content).length, deletions: 0, preview }); continue; }
      if (remoteContent === file.content) continue;
      const preview = simpleDiff(remoteContent, file.content);
      const additions = preview.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
      const deletions = preview.split("\n").filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
      changes.push({ path: file.path, status: "modified", additions, deletions, preview });
    }
    for (const item of remote) {
      if (localMap.has(item.path)) continue;
      const content = remoteCache.get(item.path);
      if (content === undefined) continue;
      const preview = simpleDiff(content, "");
      changes.push({ path: item.path, status: "deleted", additions: 0, deletions: lines(content).length, preview });
    }
    return res.json({ repository: `${parsed.owner}/${parsed.repo}`, branch, filesChecked: local.length, totalChanges: changes.length, changes });
  } catch (error) {
    console.error("GitHub diff-view error:", error);
    return res.status(502).json({ message: error instanceof Error ? error.message : "Unable to calculate GitHub diff" });
  }
});

export default router;
