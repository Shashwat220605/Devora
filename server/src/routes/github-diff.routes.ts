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
const MAX_DIFF_LINES = 500;
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

function splitLines(value: string) {
  return value.replace(/\r\n/g, "\n").split("\n");
}

function createUnifiedDiff(before: string, after: string) {
  const oldLines = splitLines(before);
  const newLines = splitLines(after);

  if (
    oldLines.length > MAX_DIFF_LINES ||
    newLines.length > MAX_DIFF_LINES
  ) {
    return [
      "--- github",
      "+++ devora",
      `@@ large file: ${oldLines.length} -> ${newLines.length} lines @@`,
      ...newLines.slice(0, 120).map((line) => `+${line}`),
      ...(newLines.length > 120 ? ["+... preview truncated ..."] : []),
    ].join("\n");
  }

  const rows = oldLines.length + 1;
  const cols = newLines.length + 1;
  const dp: number[][] = Array.from(
    { length: rows },
    () => new Array<number>(cols).fill(0),
  );

  for (let i = oldLines.length - 1; i >= 0; i -= 1) {
    for (let j = newLines.length - 1; j >= 0; j -= 1) {
      dp[i][j] =
        oldLines[i] === newLines[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const operations: Array<{ type: "same" | "add" | "delete"; line: string }> = [];
  let i = 0;
  let j = 0;

  while (i < oldLines.length && j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      operations.push({ type: "same", line: oldLines[i] });
      i += 1;
      j += 1;
      continue;
    }

    if (dp[i + 1][j] >= dp[i][j + 1]) {
      operations.push({ type: "delete", line: oldLines[i] });
      i += 1;
    } else {
      operations.push({ type: "add", line: newLines[j] });
      j += 1;
    }
  }

  while (i < oldLines.length) {
    operations.push({ type: "delete", line: oldLines[i] });
    i += 1;
  }

  while (j < newLines.length) {
    operations.push({ type: "add", line: newLines[j] });
    j += 1;
  }

  const firstChange = Math.max(
    0,
    operations.findIndex((operation) => operation.type !== "same") - 3,
  );

  const lastChange = operations.reduce(
    (last, operation, index) =>
      operation.type === "same" ? last : index,
    0,
  );

  const start = firstChange;
  const end = Math.min(operations.length, lastChange + 4);
  const windowed = operations.slice(start, end);

  return [
    "--- github",
    "+++ devora",
    `@@ ${start + 1},${windowed.length} @@`,
    ...windowed.map((operation) => {
      if (operation.type === "add") return `+${operation.line}`;
      if (operation.type === "delete") return `-${operation.line}`;
      return ` ${operation.line}`;
    }),
    ...(end < operations.length ? [" ... context truncated ..."] : []),
  ].join("\n");
}

function lineCounts(before: string, after: string) {
  const diff = createUnifiedDiff(before, after);

  let additions = 0;
  let deletions = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
    if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
  }

  return { additions, deletions };
}

async function getRemoteFiles(
  apiBase: string,
  branch: string,
  token?: string,
) {
  const treeData = (await githubRequest(
    `${apiBase}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    token,
  )) as {
    truncated?: boolean;
    tree?: Array<{
      path: string;
      type: string;
      sha: string;
      size?: number;
    }>;
  };

  const allBlobs = (treeData.tree || []).filter(
    (item) =>
      item.type === "blob" &&
      !item.path.startsWith(".git/"),
  );

  if (treeData.truncated || allBlobs.length > MAX_FILES) {
    throw new Error(`Repository exceeds the ${MAX_FILES}-file diff limit`);
  }

  const files = allBlobs.filter(
    (item) => (item.size ?? 0) <= MAX_FILE_BYTES,
  );

  return { files, allBlobs };
}

async function getRemoteContent(
  apiBase: string,
  sha: string,
  token?: string,
) {
  const blob = (await githubRequest(
    `${apiBase}/git/blobs/${sha}`,
    token,
  )) as {
    encoding?: string;
    content?: string;
  };

  if (blob.encoding !== "base64" || typeof blob.content !== "string") {
    return null;
  }

  return Buffer.from(blob.content, "base64").toString("utf8");
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

    const resolvedUrl =
      typeof repositoryUrl === "string" && repositoryUrl.trim()
        ? repositoryUrl.trim()
        : project.repositories[0]?.url;

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

    const { files: remoteFiles } = await getRemoteFiles(
      apiBase,
      targetBranch,
      token || undefined,
    );

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
      status: "added" | "modified" | "deleted";
      additions: number;
      deletions: number;
      preview: string;
    }> = [];

    for (const localFile of localFiles) {
      const remote = remoteFiles.find(
        (item) => item.path === localFile.path,
      );

      if (!remote) {
        const counts = lineCounts("", localFile.content);

        changes.push({
          path: localFile.path,
          status: "added",
          additions: counts.additions,
          deletions: 0,
          preview: createUnifiedDiff("", localFile.content),
        });
        continue;
      }

      const remoteContent = await getRemoteContent(
        apiBase,
        remote.sha,
        token || undefined,
      );

      if (remoteContent === null || remoteContent === localFile.content) {
        continue;
      }

      const counts = lineCounts(remoteContent, localFile.content);

      changes.push({
        path: localFile.path,
        status: "modified",
        additions: counts.additions,
        deletions: counts.deletions,
        preview: createUnifiedDiff(remoteContent, localFile.content),
      });
    }

    for (const remote of remoteFiles) {
      if (localMap.has(remote.path)) continue;

      const remoteContent = await getRemoteContent(
        apiBase,
        remote.sha,
        token || undefined,
      );

      if (remoteContent === null) continue;

      const counts = lineCounts(remoteContent, "");

      changes.push({
        path: remote.path,
        status: "deleted",
        additions: 0,
        deletions: counts.deletions,
        preview: createUnifiedDiff(remoteContent, ""),
      });
    }

    return res.json({
      repository: `${parsed.owner}/${parsed.repo}`,
      branch: targetBranch,
      filesChecked: localFiles.length,
      totalChanges: changes.length,
      changes,
    });
  } catch (error) {
    console.error("GitHub diff error:", error);

    return res.status(502).json({
      message:
        error instanceof Error
          ? error.message
          : "Unable to calculate GitHub changes",
    });
  }
});

router.post("/github/sync", authenticate, async (req, res) => {
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

    const resolvedUrl =
      typeof repositoryUrl === "string" && repositoryUrl.trim()
        ? repositoryUrl.trim()
        : project.repositories[0]?.url;

    if (!resolvedUrl) {
      return res.status(400).json({ message: "GitHub repository is required" });
    }

    const parsed = parseGitHubUrl(resolvedUrl);
    if (!parsed) {
      return res.status(400).json({ message: "Enter a valid GitHub repository URL" });
    }

    const token = await getConnectedToken(userId);

    if (!token) {
      return res.status(401).json({
        message: "Connect GitHub before pulling remote changes",
      });
    }

    const apiBase = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;

    const repoData = (await githubRequest(apiBase, token)) as {
      default_branch?: string;
    };

    const targetBranch =
      typeof branch === "string" && branch.trim()
        ? branch.trim()
        : repoData.default_branch || "main";

    const { files: remoteFiles } = await getRemoteFiles(
      apiBase,
      targetBranch,
      token,
    );

    const remotePaths = new Set(remoteFiles.map((file) => file.path));
    let created = 0;
    let updated = 0;
    let removed = 0;

    for (const remote of remoteFiles) {
      const content = await getRemoteContent(
        apiBase,
        remote.sha,
        token,
      );

      if (content === null) continue;

      const existing = await prisma.projectFile.findUnique({
        where: {
          projectId_path: {
            projectId,
            path: remote.path,
          },
        },
      });

      if (!existing) {
        await prisma.projectFile.create({
          data: {
            projectId,
            path: remote.path,
            content,
            language: remote.path.split(".").pop()?.toLowerCase() || null,
          },
        });
        created += 1;
      } else if (existing.content !== content) {
        await prisma.projectFile.update({
          where: { id: existing.id },
          data: { content },
        });
        updated += 1;
      }
    }

    const localFiles = await prisma.projectFile.findMany({
      where: { projectId },
    });

    for (const local of localFiles) {
      if (!remotePaths.has(local.path)) {
        await prisma.projectFile.delete({
          where: { id: local.id },
        });
        removed += 1;
      }
    }

    return res.json({
      message: "Devora workspace synced from GitHub",
      branch: targetBranch,
      created,
      updated,
      removed,
      total: remoteFiles.length,
    });
  } catch (error) {
    console.error("GitHub sync error:", error);

    return res.status(502).json({
      message:
        error instanceof Error
          ? error.message
          : "Unable to sync GitHub changes",
    });
  }
});

export default router;
