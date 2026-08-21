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
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const ENCRYPTION_KEY_HEX = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;

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

async function getConnectedToken(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubTokenEnc: true },
  });

  if (!user?.githubTokenEnc) return null;
  return decrypt(user.githubTokenEnc);
}

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
    return res.status(502).json({ message: "Unable to load GitHub repositories" });
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
        !item.path.startsWith(".git/") &&
        (item.size ?? 0) <= MAX_FILE_BYTES,
    );

    if (treeData.truncated || blobs.length > MAX_FILES) {
      return res.status(413).json({
        message: `Repository is too large to import. Limit is ${MAX_FILES} files under ${MAX_FILE_BYTES / 1_000_000} MB each.`,
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
    return res.status(502).json({ message: "Unable to import the GitHub repository" });
  }
});

router.post("/github/push", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const { projectId, repositoryUrl, branch } = req.body;
    if (typeof projectId !== "string" || typeof repositoryUrl !== "string") {
      return res.status(400).json({ message: "projectId and repositoryUrl are required" });
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, ownerId: userId },
    });
    if (!project) return res.status(404).json({ message: "Project not found" });

    const token = await getConnectedToken(userId);
    if (!token) return res.status(401).json({ message: "Connect GitHub first" });

    const parsed = parseGitHubUrl(repositoryUrl);
    if (!parsed) return res.status(400).json({ message: "Enter a valid GitHub repository URL" });

    const apiBase = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
    const repoData = (await githubRequest(apiBase, token)) as { default_branch?: string };
    const targetBranch = typeof branch === "string" && branch.trim() ? branch.trim() : repoData.default_branch || "main";

    const refData = (await githubRequest(`${apiBase}/git/ref/heads/${encodeURIComponent(targetBranch)}`, token)) as {
      object?: { sha?: string };
    };
    const parentSha = refData.object?.sha;
    if (!parentSha) return res.status(400).json({ message: "Unable to resolve the target branch" });

    const commitData = (await githubRequest(`${apiBase}/git/commits/${parentSha}`, token)) as {
      tree?: { sha?: string };
    };
    const baseTreeSha = commitData.tree?.sha;
    if (!baseTreeSha) return res.status(400).json({ message: "Unable to resolve the target tree" });

    const files = await prisma.projectFile.findMany({
      where: { projectId },
      orderBy: { path: "asc" },
    });

    if (files.length > MAX_FILES) {
      return res.status(413).json({ message: `Project exceeds the ${MAX_FILES}-file push limit` });
    }

    const tree: Array<{ path: string; mode: "100644"; type: "blob"; sha: string }> = [];
    for (const file of files) {
      if (Buffer.byteLength(file.content, "utf8") > MAX_FILE_BYTES) {
        return res.status(413).json({ message: `File ${file.path} exceeds the ${MAX_FILE_BYTES / 1_000_000} MB limit` });
      }

      const blob = (await githubRequest(`${apiBase}/git/blobs`, token, {
        method: "POST",
        body: JSON.stringify({ content: Buffer.from(file.content, "utf8").toString("base64"), encoding: "base64" }),
      })) as { sha?: string };
      if (!blob.sha) throw new Error(`Failed to create GitHub blob for ${file.path}`);
      tree.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
    }

    const treeData = (await githubRequest(`${apiBase}/git/trees`, token, {
      method: "POST",
      body: JSON.stringify({ base_tree: baseTreeSha, tree }),
    })) as { sha?: string };
    if (!treeData.sha) return res.status(502).json({ message: "Failed to create Git tree" });

    const newCommit = (await githubRequest(`${apiBase}/git/commits`, token, {
      method: "POST",
      body: JSON.stringify({
        message: `Devora sync: ${project.name}`,
        tree: treeData.sha,
        parents: [parentSha],
      }),
    })) as { sha?: string; html_url?: string };
    if (!newCommit.sha) return res.status(502).json({ message: "Failed to create Git commit" });

    await githubRequest(`${apiBase}/git/refs/heads/${encodeURIComponent(targetBranch)}`, token, {
      method: "PATCH",
      body: JSON.stringify({ sha: newCommit.sha, force: false }),
    });

    return res.json({
      message: "Changes pushed to GitHub",
      branch: targetBranch,
      commitSha: newCommit.sha,
      commitUrl: newCommit.html_url || null,
      filesPushed: files.length,
      frontendUrl: FRONTEND_URL,
    });
  } catch (error) {
    console.error("GitHub push error:", error);
    return res.status(502).json({ message: "Unable to push changes to GitHub" });
  }
});

export default router;
