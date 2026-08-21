import { Router } from "express";
import prisma from "../lib/prisma.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware.js";

const router = Router();

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

export default router;