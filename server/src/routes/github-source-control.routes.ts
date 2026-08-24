import { Router } from "express";
import crypto from "node:crypto";
import prisma from "../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.middleware.js";

const router = Router();
const MAX_FILES = 150;
const MAX_FILE_BYTES = 1_000_000;
const KEY = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;

type Credentials = { accessToken?: string };

type RemoteEntry = { path: string; type: string; sha: string; size?: number };

function encryptionKey() {
  if (!KEY || !/^[0-9a-fA-F]{64}$/.test(KEY)) throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY must be a 32-byte hex key");
  return Buffer.from(KEY, "hex");
}

function decrypt(value: string) {
  const [ivHex, tagHex, cipherHex] = value.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(cipherHex, "hex")), decipher.final()]).toString("utf8");
}

async function tokenFor(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { githubTokenEnc: true } });
  if (!user?.githubTokenEnc) return null;
  const raw = decrypt(user.githubTokenEnc);
  try {
    const parsed = JSON.parse(raw) as Credentials;
    return parsed.accessToken || raw;
  } catch {
    return raw;
  }
}

function repoParts(value: string) {
  const url = new URL(value.trim());
  if (url.hostname !== "github.com") return null;
  const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (parts.length < 2) return null;
  const repo = parts[1]?.replace(/\.git$/i, "");
  return parts[0] && repo ? { owner: parts[0], repo } : null;
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
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  return response.json();
}

function lineStats(before: string, after: string) {
  const a = before.split("\n");
  const b = after.split("\n");
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix += 1;
  return { additions: Math.max(0, b.length - prefix - suffix), deletions: Math.max(0, a.length - prefix - suffix) };
}

async function projectAndRepo(projectId: string, userId: string) {
  return prisma.project.findFirst({ where: { id: projectId, ownerId: userId }, include: { repositories: true, files: true } });
}

router.get("/github/source-control", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    if (!projectId) return res.status(400).json({ message: "projectId is required" });

    const project = await projectAndRepo(projectId, userId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const repositoryUrl = project.repositories[0]?.url;
    if (!repositoryUrl) return res.status(400).json({ message: "Connect a GitHub repository to this project first" });
    const parts = repoParts(repositoryUrl);
    if (!parts) return res.status(400).json({ message: "Invalid GitHub repository URL" });
    const token = await tokenFor(userId);
    if (!token) return res.status(401).json({ message: "Connect GitHub first" });

    const base = `https://api.github.com/repos/${encodeURIComponent(parts.owner)}/${encodeURIComponent(parts.repo)}`;
    const repo = (await github(base, token)) as { default_branch?: string };
    const branch = repo.default_branch || "main";
    const treeData = (await github(`${base}/git/trees/${encodeURIComponent(branch)}?recursive=1`, token)) as { tree?: RemoteEntry[]; truncated?: boolean };
    const remote = (treeData.tree || []).filter((entry) => entry.type === "blob" && !entry.path.startsWith(".git/") && (entry.size ?? 0) <= MAX_FILE_BYTES);
    if (treeData.truncated || remote.length > MAX_FILES) return res.status(413).json({ message: `Repository exceeds the ${MAX_FILES}-file limit` });

    const remoteMap = new Map<string, string>();
    for (const entry of remote) {
      const blob = (await github(`${base}/git/blobs/${entry.sha}`, token)) as { encoding?: string; content?: string };
      if (blob.encoding === "base64" && typeof blob.content === "string") remoteMap.set(entry.path, Buffer.from(blob.content, "base64").toString("utf8"));
    }

    const localMap = new Map(project.files.map((file) => [file.path, file.content]));
    const paths = new Set([...remoteMap.keys(), ...localMap.keys()]);
    const changes = [] as Array<{ path: string; status: "modified" | "added" | "deleted"; additions: number; deletions: number; content?: string | null }>;

    for (const path of Array.from(paths).sort()) {
      const local = localMap.get(path);
      const remoteContent = remoteMap.get(path);
      if (typeof local === "string" && typeof remoteContent === "string" && local !== remoteContent) {
        const stats = lineStats(remoteContent, local);
        changes.push({ path, status: "modified", ...stats, content: local });
      } else if (typeof local === "string" && typeof remoteContent !== "string") {
        const stats = lineStats("", local);
        changes.push({ path, status: "added", ...stats, content: local });
      } else if (typeof local !== "string" && typeof remoteContent === "string") {
        const stats = lineStats(remoteContent, "");
        changes.push({ path, status: "deleted", ...stats, content: null });
      }
    }

    return res.json({ branch, repository: `${parts.owner}/${parts.repo}`, changes, ahead: changes.length, behind: 0 });
  } catch (error) {
    console.error("Source control status error:", error);
    return res.status(502).json({ message: error instanceof Error ? error.message : "Unable to load source control status" });
  }
});

router.post("/github/commit", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const projectId = typeof req.body?.projectId === "string" ? req.body.projectId : "";
    const paths = Array.isArray(req.body?.paths) ? req.body.paths.filter((value: unknown): value is string => typeof value === "string") : [];
    const commitMessage = typeof req.body?.commitMessage === "string" ? req.body.commitMessage.trim().slice(0, 120) : "";
    if (!projectId || !paths.length || !commitMessage) return res.status(400).json({ message: "projectId, paths and commitMessage are required" });

    const project = await projectAndRepo(projectId, userId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const repositoryUrl = project.repositories[0]?.url;
    if (!repositoryUrl) return res.status(400).json({ message: "Connect a GitHub repository to this project first" });
    const parts = repoParts(repositoryUrl);
    if (!parts) return res.status(400).json({ message: "Invalid GitHub repository URL" });
    const token = await tokenFor(userId);
    if (!token) return res.status(401).json({ message: "Connect GitHub first" });

    const base = `https://api.github.com/repos/${encodeURIComponent(parts.owner)}/${encodeURIComponent(parts.repo)}`;
    const repo = (await github(base, token)) as { default_branch?: string };
    const branch = repo.default_branch || "main";
    const ref = (await github(`${base}/git/ref/heads/${encodeURIComponent(branch)}`, token)) as { object?: { sha?: string } };
    const parentSha = ref.object?.sha;
    if (!parentSha) return res.status(400).json({ message: "Unable to resolve target branch" });
    const commit = (await github(`${base}/git/commits/${parentSha}`, token)) as { tree?: { sha?: string } };
    if (!commit.tree?.sha) return res.status(400).json({ message: "Unable to resolve target tree" });

    const existingRemote = (await github(`${base}/git/trees/${encodeURIComponent(branch)}?recursive=1`, token)) as { tree?: RemoteEntry[]; truncated?: boolean };
    const remotePaths = new Set((existingRemote.tree || []).filter((entry) => entry.type === "blob").map((entry) => entry.path));
    const localMap = new Map(project.files.map((file) => [file.path, file.content]));
    const changes = paths.map((path) => ({ path, content: localMap.get(path) }));
    const tree: Array<{ path: string; mode: "100644"; type: "blob"; sha: string | null }> = [];

    for (const change of changes) {
      if (typeof change.content === "string") {
        if (Buffer.byteLength(change.content, "utf8") > MAX_FILE_BYTES) return res.status(413).json({ message: `File ${change.path} exceeds the size limit` });
        const blob = (await github(`${base}/git/blobs`, token, { method: "POST", body: JSON.stringify({ content: Buffer.from(change.content, "utf8").toString("base64"), encoding: "base64" }) })) as { sha?: string };
        if (!blob.sha) throw new Error(`Unable to create GitHub blob for ${change.path}`);
        tree.push({ path: change.path, mode: "100644", type: "blob", sha: blob.sha });
      } else if (remotePaths.has(change.path)) {
        tree.push({ path: change.path, mode: "100644", type: "blob", sha: null });
      }
    }

    if (!tree.length) return res.status(400).json({ message: "No selected changes are still present" });
    const newTree = (await github(`${base}/git/trees`, token, { method: "POST", body: JSON.stringify({ base_tree: commit.tree.sha, tree }) })) as { sha?: string };
    if (!newTree.sha) throw new Error("Unable to create Git tree");
    const createdCommit = (await github(`${base}/git/commits`, token, { method: "POST", body: JSON.stringify({ message: commitMessage, tree: newTree.sha, parents: [parentSha] }) })) as { sha?: string; html_url?: string };
    if (!createdCommit.sha) throw new Error("Unable to create Git commit");
    await github(`${base}/git/refs/heads/${encodeURIComponent(branch)}`, token, { method: "PATCH", body: JSON.stringify({ sha: createdCommit.sha, force: false }) });

    return res.json({ message: `Committed ${tree.length} selected change${tree.length === 1 ? "" : "s"} to GitHub`, commitSha: createdCommit.sha, commitUrl: createdCommit.html_url || null, branch });
  } catch (error) {
    console.error("Source control commit error:", error);
    return res.status(502).json({ message: error instanceof Error ? error.message : "Unable to commit selected changes" });
  }
});

export default router;
