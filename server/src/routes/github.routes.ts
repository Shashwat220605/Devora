import { Router } from "express";
import prisma from "../lib/prisma.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware.js";

const router = Router();

const MAX_FILES = 150;
const MAX_FILE_BYTES = 1_000_000;

function parseGitHubUrl(value: string) {
  try {
    const url = new URL(value.trim());

    if (url.hostname !== "github.com") {
      return null;
    }

    const parts = url.pathname
      .replace(/^\/+|\/+$/g, "")
      .split("/");

    if (parts.length < 2) {
      return null;
    }

    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, "");

    if (!owner || !repo) {
      return null;
    }

    return { owner, repo };
  } catch {
    return null;
  }
}

async function githubRequest(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Devora",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status}: ${body}`);
  }

  return response.json();
}

router.post(
  "/github/import",
  authenticate,
  async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).userId;

      if (!userId) {
        return res.status(401).json({
          message: "Authentication required",
        });
      }

      const { projectId, repositoryUrl } = req.body;

      if (
        typeof projectId !== "string" ||
        typeof repositoryUrl !== "string"
      ) {
        return res.status(400).json({
          message: "projectId and repositoryUrl are required",
        });
      }

      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          ownerId: userId,
        },
      });

      if (!project) {
        return res.status(404).json({
          message: "Project not found",
        });
      }

      const parsed = parseGitHubUrl(repositoryUrl);

      if (!parsed) {
        return res.status(400).json({
          message: "Enter a valid public GitHub repository URL",
        });
      }

      const apiBase = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;

      const repoData = (await githubRequest(apiBase)) as {
        name?: string;
        html_url?: string;
        default_branch?: string;
      };

      const defaultBranch = repoData.default_branch || "main";

      const treeData = (await githubRequest(
        `${apiBase}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`,
      )) as {
        truncated?: boolean;
        tree?: Array<{
          path: string;
          mode: string;
          type: "blob" | "tree" | string;
          sha: string;
          size?: number;
        }>;
      };

      const blobs = (treeData.tree || []).filter(
        (item) =>
          item.type === "blob" &&
          typeof item.path === "string" &&
          !item.path.startsWith(".git/") &&
          (item.size ?? 0) <= MAX_FILE_BYTES,
      );

      if (treeData.truncated || blobs.length > MAX_FILES) {
        return res.status(413).json({
          message: `Repository is too large to import. Limit is ${MAX_FILES} files under ${MAX_FILE_BYTES / 1_000_000} MB each.`,
        });
      }

      const importedFiles = [];

      for (const item of blobs) {
        const blob = (await githubRequest(
          `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/git/blobs/${encodeURIComponent(item.sha)}`,
        )) as {
          encoding?: string;
          content?: string;
        };

        if (
          blob.encoding !== "base64" ||
          typeof blob.content !== "string"
        ) {
          continue;
        }

        const content = Buffer.from(blob.content, "base64").toString(
          "utf8",
        );

        const file = await prisma.projectFile.upsert({
          where: {
            projectId_path: {
              projectId,
              path: item.path,
            },
          },
          update: {
            content,
          },
          create: {
            projectId,
            path: item.path,
            content,
            language: item.path.split(".").pop()?.toLowerCase() || null,
          },
        });

        importedFiles.push(file);
      }

      const repository = await prisma.repository.create({
        data: {
          name: repoData.name || parsed.repo,
          url:
            repoData.html_url ||
            `https://github.com/${parsed.owner}/${parsed.repo}`,
          provider: "github",
          projectId,
        },
      });

      return res.status(201).json({
        message: "GitHub repository imported successfully",
        repository: {
          id: repository.id,
          name: repository.name,
          url: repository.url,
          branch: defaultBranch,
        },
        filesImported: importedFiles.length,
      });
    } catch (error) {
      console.error("GitHub import error:", error);

      return res.status(502).json({
        message: "Unable to import the GitHub repository",
      });
    }
  },
);

export default router;
