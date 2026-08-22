import { Router } from "express";
import crypto from "node:crypto";

import prisma from "../lib/prisma.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware.js";

const router = Router();
const MAX_FILES = 150;
const MAX_FILE_BYTES = 1_000_000;
const ENCRYPTION_KEY_HEX = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;

type StoredCredentials = {
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
};

function getKey() {
  if (!ENCRYPTION_KEY_HEX || !/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY_HEX)) {
    throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY must be a 32-byte hex key");
  }
  return Buffer.from(ENCRYPTION_KEY_HEX, "hex");
}

function decrypt(value: string) {
  const [ivHex, tagHex, cipherHex] = value.split(":");
  if (!ivHex || !tagHex || !cipherHex) throw new Error("Invalid encrypted GitHub token");

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivHex, "hex"),
  );
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

async function tokenFor(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubTokenEnc: true },
  });
  return user?.githubTokenEnc ? accessTokenFromStored(decrypt(user.githubTokenEnc)) : null;
}

function repoParts(value: string) {
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

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status}: ${body}`);
  }

  return response.json();
}

router.post("/github/sync", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const { projectId, repositoryUrl, branch } = req.body;
    if (typeof projectId !== "string") {
      return res.status(400).json({ message: "projectId is required" });
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, ownerId: userId },
      include: { repositories: true },
    });
    if (!project) return res.status(404).json({ message: "Project not found" });

    const resolvedUrl =
      typeof repositoryUrl === "string" && repositoryUrl.trim()
        ? repositoryUrl.trim()
        : project.repositories[0]?.url;
    if (!resolvedUrl) return res.status(400).json({ message: "GitHub repository is required" });

    const parts = repoParts(resolvedUrl);
    if (!parts) return res.status(400).json({ message: "Invalid GitHub repository URL" });

    const token = await tokenFor(userId);
    if (!token) return res.status(401).json({ message: "Connect GitHub first" });

    const base = `https://api.github.com/repos/${encodeURIComponent(parts.owner)}/${encodeURIComponent(parts.repo)}`;
    const repo = (await github(base, token)) as { default_branch?: string };
    const targetBranch = typeof branch === "string" && branch.trim() ? branch.trim() : repo.default_branch || "main";

    const tree = (await github(`${base}/git/trees/${encodeURIComponent(targetBranch)}?recursive=1`, token)) as {
      truncated?: boolean;
      tree?: Array<{ path: string; type: string; sha: string; size?: number }>;
    };

    const remote = (tree.tree || []).filter(
      (entry) => entry.type === "blob" && !entry.path.startsWith(".git/") && (entry.size ?? 0) <= MAX_FILE_BYTES,
    );

    if (tree.truncated || remote.length > MAX_FILES) {
      return res.status(413).json({ message: `Repository exceeds the ${MAX_FILES}-file sync limit` });
    }

    let created = 0;
    let updated = 0;
    let removed = 0;
    const remotePaths = new Set(remote.map((entry) => entry.path));

    for (const entry of remote) {
      const blob = (await github(`${base}/git/blobs/${entry.sha}`, token)) as {
        encoding?: string;
        content?: string;
      };
      if (blob.encoding !== "base64" || typeof blob.content !== "string") continue;

      const content = Buffer.from(blob.content, "base64").toString("utf8");
      const existing = await prisma.projectFile.findUnique({
        where: { projectId_path: { projectId, path: entry.path } },
      });

      if (!existing) {
        await prisma.projectFile.create({
          data: {
            projectId,
            path: entry.path,
            content,
            language: entry.path.split(".").pop()?.toLowerCase() || null,
          },
        });
        created += 1;
      } else if (existing.content !== content) {
        await prisma.projectFile.update({ where: { id: existing.id }, data: { content } });
        updated += 1;
      }
    }

    const local = await prisma.projectFile.findMany({ where: { projectId } });
    for (const file of local) {
      if (!remotePaths.has(file.path)) {
        await prisma.projectFile.delete({ where: { id: file.id } });
        removed += 1;
      }
    }

    return res.json({
      message: "Pulled GitHub branch into Devora",
      branch: targetBranch,
      created,
      updated,
      removed,
      total: remote.length,
    });
  } catch (error) {
    console.error("GitHub pull error:", error);
    return res.status(502).json({ message: error instanceof Error ? error.message : "Unable to pull from GitHub" });
  }
});

router.post("/github/push-mirror", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const { projectId, repositoryUrl, branch, commitMessage } = req.body;
    if (typeof projectId !== "string") return res.status(400).json({ message: "projectId is required" });

    const project = await prisma.project.findFirst({
      where: { id: projectId, ownerId: userId },
      include: { repositories: true },
    });
    if (!project) return res.status(404).json({ message: "Project not found" });

    const resolvedUrl =
      typeof repositoryUrl === "string" && repositoryUrl.trim()
        ? repositoryUrl.trim()
        : project.repositories[0]?.url;
    if (!resolvedUrl) return res.status(400).json({ message: "GitHub repository is required" });

    const parts = repoParts(resolvedUrl);
    if (!parts) return res.status(400).json({ message: "Invalid GitHub repository URL" });

    const token = await tokenFor(userId);
    if (!token) return res.status(401).json({ message: "Connect GitHub first" });

    const base = `https://api.github.com/repos/${encodeURIComponent(parts.owner)}/${encodeURIComponent(parts.repo)}`;
    const repo = (await github(base, token)) as { default_branch?: string };
    const targetBranch = typeof branch === "string" && branch.trim() ? branch.trim() : repo.default_branch || "main";

    const ref = (await github(`${base}/git/ref/heads/${encodeURIComponent(targetBranch)}`, token)) as { object?: { sha?: string } };
    const parentSha = ref.object?.sha;
    if (!parentSha) return res.status(400).json({ message: "Unable to resolve target branch" });

    const parentCommit = (await github(`${base}/git/commits/${parentSha}`, token)) as { tree?: { sha?: string } };
    const baseTree = parentCommit.tree?.sha;
    if (!baseTree) return res.status(400).json({ message: "Unable to resolve target tree" });

    const remoteTree = (await github(`${base}/git/trees/${encodeURIComponent(targetBranch)}?recursive=1`, token)) as {
      truncated?: boolean;
      tree?: Array<{ path: string; type: string; sha: string; size?: number }>;
    };

    const remoteFiles = (remoteTree.tree || []).filter(
      (entry) => entry.type === "blob" && !entry.path.startsWith(".git/") && (entry.size ?? 0) <= MAX_FILE_BYTES,
    );

    if (remoteTree.truncated || remoteFiles.length > MAX_FILES) {
      return res.status(413).json({ message: `Repository exceeds the ${MAX_FILES}-file push limit` });
    }

    const files = await prisma.projectFile.findMany({ where: { projectId }, orderBy: { path: "asc" } });
    if (files.length > MAX_FILES) return res.status(413).json({ message: `Project exceeds the ${MAX_FILES}-file push limit` });

    const localPaths = new Set(files.map((file) => file.path));
    const treeEntries: Array<{
      path: string;
      mode: "100644";
      type: "blob";
      sha: string | null;
    }> = [];

    for (const file of files) {
      if (Buffer.byteLength(file.content, "utf8") > MAX_FILE_BYTES) {
        return res.status(413).json({ message: `File ${file.path} exceeds the ${MAX_FILE_BYTES / 1_000_000} MB limit` });
      }

      const blob = (await github(`${base}/git/blobs`, token, {
        method: "POST",
        body: JSON.stringify({
          content: Buffer.from(file.content, "utf8").toString("base64"),
          encoding: "base64",
        }),
      })) as { sha?: string };

      if (!blob.sha) throw new Error(`Failed to create GitHub blob for ${file.path}`);
      treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
    }

    let deletedRemote = 0;
    for (const remote of remoteFiles) {
      if (!localPaths.has(remote.path)) {
        treeEntries.push({ path: remote.path, mode: "100644", type: "blob", sha: null });
        deletedRemote += 1;
      }
    }

    const newTree = (await github(`${base}/git/trees`, token, {
      method: "POST",
      body: JSON.stringify({ base_tree: baseTree, tree: treeEntries }),
    })) as { sha?: string };

    if (!newTree.sha) throw new Error("Failed to create Git tree");

    const message =
      typeof commitMessage === "string" && commitMessage.trim()
        ? commitMessage.trim().slice(0, 120)
        : `Devora sync: ${project.name}`;

    const commit = (await github(`${base}/git/commits`, token, {
      method: "POST",
      body: JSON.stringify({
        message,
        tree: newTree.sha,
        parents: [parentSha],
      }),
    })) as { sha?: string; html_url?: string };

    if (!commit.sha) throw new Error("Failed to create Git commit");

    await github(`${base}/git/refs/heads/${encodeURIComponent(targetBranch)}`, token, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });

    return res.json({
      message: "Devora project committed to GitHub",
      branch: targetBranch,
      commitSha: commit.sha,
      commitUrl: commit.html_url || null,
      commitMessage: message,
      filesPushed: files.length,
      filesDeleted: deletedRemote,
    });
  } catch (error) {
    console.error("GitHub mirror push error:", error);
    return res.status(502).json({ message: error instanceof Error ? error.message : "Unable to push Devora to GitHub" });
  }
});

export default router;
