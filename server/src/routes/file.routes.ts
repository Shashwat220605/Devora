import { Router } from "express";
import prisma from "../lib/prisma.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware.js";

const router = Router();

const MAX_GITHUB_FILES = 150;
const MAX_GITHUB_FILE_BYTES = 1_000_000;

function getUserId(req: AuthenticatedRequest) {
  return req.userId;
}

function normalizePath(path: string) {
  return path
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

function getLanguage(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "ts":
    case "tsx":
      return "typescript";

    case "js":
    case "jsx":
      return "javascript";

    case "json":
      return "json";

    case "css":
      return "css";

    case "html":
      return "html";

    case "py":
      return "python";

    case "java":
      return "java";

    case "cpp":
    case "cc":
    case "cxx":
      return "cpp";

    case "c":
      return "c";

    case "md":
      return "markdown";

    case "sql":
      return "sql";

    case "xml":
      return "xml";

    default:
      return "plaintext";
  }
}

async function verifyProjectOwnership(
  projectId: string,
  userId: string,
) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      ownerId: userId,
    },
  });
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
    throw new Error(`GitHub request failed with ${response.status}`);
  }

  return response.json();
}

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
    const repo = parts[1]?.replace(/\.git$/i, "");

    if (!owner || !repo) {
      return null;
    }

    return { owner, repo };
  } catch {
    return null;
  }
}

/*
  GET /api/projects/:projectId/files
*/
router.get(
  "/projects/:projectId/files",
  authenticate,
  async (req, res) => {
    try {
      const userId = getUserId(
        req as AuthenticatedRequest,
      );

      if (!userId) {
        return res.status(401).json({
          message: "Authentication required",
        });
      }

      const projectId = String(req.params.projectId);

      const project = await verifyProjectOwnership(
        projectId,
        userId,
      );

      if (!project) {
        return res.status(404).json({
          message: "Project not found",
        });
      }

      const files = await prisma.projectFile.findMany({
        where: {
          projectId,
        },
        orderBy: {
          path: "asc",
        },
      });

      return res.json(files);
    } catch (error) {
      console.error("GET files error:", error);

      return res.status(500).json({
        message: "Failed to load project files",
      });
    }
  },
);

/*
  POST /api/projects/:projectId/files
*/
router.post(
  "/projects/:projectId/files",
  authenticate,
  async (req, res) => {
    try {
      const userId = getUserId(
        req as AuthenticatedRequest,
      );

      if (!userId) {
        return res.status(401).json({
          message: "Authentication required",
        });
      }

      const projectId = String(req.params.projectId);

      const project = await verifyProjectOwnership(
        projectId,
        userId,
      );

      if (!project) {
        return res.status(404).json({
          message: "Project not found",
        });
      }

      const { path, content = "" } = req.body;

      if (typeof path !== "string" || !path.trim()) {
        return res.status(400).json({
          message: "File path is required",
        });
      }

      const normalizedPath = normalizePath(path);

      if (
        !normalizedPath ||
        normalizedPath.includes("..")
      ) {
        return res.status(400).json({
          message: "Invalid file path",
        });
      }

      const existingFile =
        await prisma.projectFile.findUnique({
          where: {
            projectId_path: {
              projectId,
              path: normalizedPath,
            },
          },
        });

      if (existingFile) {
        return res.status(409).json({
          message: "A file with this path already exists",
        });
      }

      const file = await prisma.projectFile.create({
        data: {
          path: normalizedPath,
          content:
            typeof content === "string" ? content : "",
          language: getLanguage(normalizedPath),
          projectId,
        },
      });

      return res.status(201).json(file);
    } catch (error) {
      console.error("POST file error:", error);

      return res.status(500).json({
        message: "Failed to create file",
      });
    }
  },
);

/*
  PUT /api/projects/:projectId/files/:fileId
*/
router.put(
  "/projects/:projectId/files/:fileId",
  authenticate,
  async (req, res) => {
    try {
      const userId = getUserId(
        req as AuthenticatedRequest,
      );

      if (!userId) {
        return res.status(401).json({
          message: "Authentication required",
        });
      }

      const projectId = String(req.params.projectId);
      const fileId = String(req.params.fileId);

      const project = await verifyProjectOwnership(
        projectId,
        userId,
      );

      if (!project) {
        return res.status(404).json({
          message: "Project not found",
        });
      }

      const file = await prisma.projectFile.findFirst({
        where: {
          id: fileId,
          projectId,
        },
      });

      if (!file) {
        return res.status(404).json({
          message: "File not found",
        });
      }

      const { content } = req.body;

      if (typeof content !== "string") {
        return res.status(400).json({
          message: "File content must be a string",
        });
      }

      const updatedFile =
        await prisma.projectFile.update({
          where: {
            id: file.id,
          },
          data: {
            content,
          },
        });

      return res.json(updatedFile);
    } catch (error) {
      console.error("PUT file error:", error);

      return res.status(500).json({
        message: "Failed to save file",
      });
    }
  },
);

/*
  DELETE /api/projects/:projectId/files/:fileId
*/
router.delete(
  "/projects/:projectId/files/:fileId",
  authenticate,
  async (req, res) => {
    try {
      const userId = getUserId(
        req as AuthenticatedRequest,
      );

      if (!userId) {
        return res.status(401).json({
          message: "Authentication required",
        });
      }

      const projectId = String(req.params.projectId);
      const fileId = String(req.params.fileId);

      const project = await verifyProjectOwnership(
        projectId,
        userId,
      );

      if (!project) {
        return res.status(404).json({
          message: "Project not found",
        });
      }

      const file = await prisma.projectFile.findFirst({
        where: {
          id: fileId,
          projectId,
        },
      });

      if (!file) {
        return res.status(404).json({
          message: "File not found",
        });
      }

      await prisma.projectFile.delete({
        where: {
          id: file.id,
        },
      });

      return res.json({
        message: "File deleted successfully",
      });
    } catch (error) {
      console.error("DELETE file error:", error);

      return res.status(500).json({
        message: "Failed to delete file",
      });
    }
  },
);

/*
  POST /api/github/import
  Public repository import for the first GitHub integration.
*/
router.post(
  "/github/import",
  authenticate,
  async (req, res) => {
    try {
      const userId = getUserId(
        req as AuthenticatedRequest,
      );

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

      const project = await verifyProjectOwnership(
        projectId,
        userId,
      );

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

      const apiBase =
        `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;

      const repoData = (await githubRequest(apiBase)) as {
        name?: string;
        html_url?: string;
        default_branch?: string;
      };

      const defaultBranch =
        repoData.default_branch || "main";

      const treeData = (await githubRequest(
        `${apiBase}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`,
      )) as {
        truncated?: boolean;
        tree?: Array<{
          path: string;
          type: string;
          sha: string;
          size?: number;
        }>;
      };

      const blobs = (treeData.tree || []).filter(
        (item) =>
          item.type === "blob" &&
          typeof item.path === "string" &&
          !item.path.startsWith(".git/") &&
          (item.size ?? 0) <= MAX_GITHUB_FILE_BYTES,
      );

      if (
        treeData.truncated ||
        blobs.length > MAX_GITHUB_FILES
      ) {
        return res.status(413).json({
          message: `Repository is too large. Maximum ${MAX_GITHUB_FILES} files under ${MAX_GITHUB_FILE_BYTES / 1_000_000} MB each.`,
        });
      }

      let filesImported = 0;

      for (const item of blobs) {
        const blob = (await githubRequest(
          `${apiBase}/git/blobs/${encodeURIComponent(item.sha)}`,
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

        const content = Buffer.from(
          blob.content,
          "base64",
        ).toString("utf8");

        await prisma.projectFile.upsert({
          where: {
            projectId_path: {
              projectId,
              path: normalizePath(item.path),
            },
          },
          update: {
            content,
            language: getLanguage(item.path),
          },
          create: {
            projectId,
            path: normalizePath(item.path),
            content,
            language: getLanguage(item.path),
          },
        });

        filesImported += 1;
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
        message:
          "GitHub repository imported successfully",
        repository: {
          id: repository.id,
          name: repository.name,
          url: repository.url,
          branch: defaultBranch,
        },
        filesImported,
      });
    } catch (error) {
      console.error(
        "GitHub import error:",
        error,
      );

      return res.status(502).json({
        message:
          "Unable to import the GitHub repository. Make sure the repository is public.",
      });
    }
  },
);

export default router;
