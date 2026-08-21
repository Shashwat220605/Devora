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

function getEncryptionKey() {
  if (!ENCRYPTION_KEY_HEX || !/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY_HEX)) {
    throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY must be a 32-byte hex key");
  }
  return Buffer.from(ENCRYPTION_KEY_HEX, "hex");
}

function decrypt(value: string) {
  const [ivHex, tagHex, ciphertextHex] = value.split(":");
  if (!ivHex || !tagHex || !ciphertextHex) {
    throw new Error("Invalid encrypted GitHub token");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

async function getConnectedToken(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubTokenEnc: true },
  });

  if (!user?.githubTokenEnc) return null;
  return decrypt(user.githubTokenEnc);
}

function parseGitHubUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.hostname !== "github.com") return null;

    const parts = url.pathname
      .replace(/^\/+|\/+$/g, "")
      .split("/");

    if (parts.length < 2) return null;

    const owner = parts[0];
    const repo = parts[1]?.replace(/\.git$/i, "");

    if (!owner || !repo) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

async function githubRequest(url: string, token?: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Devora",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}`);
  }

  return response.json();
}

function lineDiffCounts(before: string, after: string) {
  const oldLines = before.split("\n");
  const newLines = after.split("\n");

  if (oldLines.length > 400 || newLines.length > 400) {
    return {
      additions: Math.max(newLines.length - oldLines.length, 0),
      deletions: Math.max(oldLines.length - newLines.length, 0),
    };
  }

  const rows = oldLines.length + 1;
  const cols = newLines.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () =>
    new Array<number>(cols).fill(0),
  );

  for (let i = oldLines.length - 1; i >= 0; i -= 1) {
    for (let j = newLines.length - 1; j >= 0; j -= 1) {
      dp[i][j] = oldLines[i] === newLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  let i = 0;
  let j = 0;
  let additions = 0;
  let deletions = 0;

  while (i < oldLines.length && j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      i += 1;
      j += 1;
      continue;
    }

    if (dp[i + 1][j] >= dp[i][j + 1]) {
      deletions += 1;
      i += 1;
    } else {
      additions += 1;
      j += 1;
    }
  }

  deletions += oldLines.length - i;
  additions += newLines.length - j;

  return { additions, deletions };
}

router.post("/github/diff", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { projectId, repositoryUrl, branch } = req.body;

    if (typeof projectId !== "string") {
      return res.status(400).json({ message: "projectId is required" });
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, ownerId: userId },
      include: { repositories: true },
    });

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const fallbackRepository = project.repositories[0]?.url;
    const resolvedUrl =
      typeof repositoryUrl === "string" && repositoryUrl.trim()
        ? repositoryUrl.trim()
        : fallbackRepository;

    if (!resolvedUrl) {
      return res.status(400).json({
        message: "Connect or import a GitHub repository first",
      });
    }

    const parsed = parseGitHubUrl(resolvedUrl);
    if (!parsed) {
      return res.status(400).json({
        message: "Enter a valid GitHub repository URL",
      });
    }

    const token = await getConnectedToken(userId);
    const apiBase = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;

    const repoData = (await githubRequest(
      apiBase,
      token || undefined,
    )) as { default_branch?: string };

    const targetBranch =
      typeof branch === "string" && branch.trim()
        ? branch.trim()
        : repoData.default_branch || "main";

    const treeData = (await githubRequest(
      `${apiBase}/git/trees/${encodeURIComponent(targetBranch)}?recursive=1`,
      token || undefined,
    )) as {
      truncated?: boolean;
      tree?: Array<{
        path: string;
        type: string;
        sha: string;
        size?: number;
      }>;
    };

    const remoteFiles = (treeData.tree || []).filter(
      (item) =>
        item.type === "blob" &&
        !item.path.startsWith(".git/") &&
        (item.size ?? 0) <= MAX_FILE_BYTES,
    );

    if (treeData.truncated || remoteFiles.length > MAX_FILES) {
      return res.status(413).json({
        message: `Repository exceeds the ${MAX_FILES}-file diff limit`,
      });
    }

    const localFiles = await prisma.projectFile.findMany({
      where: { projectId },
      orderBy: { path: "asc" },
    });

    if (localFiles.length > MAX_FILES) {
      return res.status(413).json({
        message: `Project exceeds the ${MAX_FILES}-file diff limit`,
      });
    }

    const localMap = new Map(
      localFiles.map((file) => [file.path, file.content]),
    );

    const changes: Array<{
      path: string;
      status: "added" | "modified";
      additions: number;
      deletions: number;
      preview?: string;
    }> = [];

    for (const file of localFiles) {
      const remote = remoteFiles.find((item) => item.path === file.path);

      if (!remote) {
        const counts = lineDiffCounts("", file.content);
        changes.push({
          path: file.path,
          status: "added",
          additions: counts.additions,
          deletions: 0,
          preview: file.content.split("\n").slice(0, 40).join("\n"),
        });
        continue;
      }

      const blob = (await githubRequest(
        `${apiBase}/git/blobs/${remote.sha}`,
        token || undefined,
      )) as { encoding?: string; content?: string };

      if (blob.encoding !== "base64" || typeof blob.content !== "string") {
        continue;
      }

      const remoteContent = Buffer.from(blob.content, "base64").toString("utf8");

      if (remoteContent === file.content) continue;

      const counts = lineDiffCounts(remoteContent, file.content);
      const preview = file.content
        .split("\n")
        .slice(0, 40)
        .join("\n");

      changes.push({
        path: file.path,
        status: "modified",
        additions: counts.additions,
        deletions: counts.deletions,
        preview,
      });
    }

    return res.json({
      repository: `${parsed.owner}/${parsed.repo}`,
      branch: targetBranch,
      remoteOnlyFiles: remoteFiles.filter(
        (item) => !localMap.has(item.path),
      ).length,
      filesChecked: localFiles.length,
      changes,
      totalChanges: changes.length,
    });
  } catch (error) {
    console.error("GitHub diff error:", error);
    return res.status(502).json({
      message: "Unable to calculate GitHub changes",
    });
  }
});

export default router;
