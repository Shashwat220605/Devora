import { Router } from "express";
import prisma from "../lib/prisma.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware.js";

const router = Router();

// Get current user's projects
router.get("/", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;

    if (!userId) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    // Keep the list query lightweight. The Projects page only needs
    // project fields, while repository data can be loaded separately.
    const projects = await prisma.project.findMany({
      where: {
        ownerId: userId,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    res.json(projects);
  } catch (error) {
    console.error("GET /projects error:", error);

    res.status(500).json({
      message: "Failed to fetch projects",
    });
  }
});

// Get one current user's project
router.get("/:id", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;

    if (!userId) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const projectId = String(req.params.id);

    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        ownerId: userId,
      },
      include: {
        repositories: true,
        tasks: true,
        conversations: true,
        activities: true,
      },
    });

    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    res.json(project);
  } catch (error) {
    console.error("GET /projects/:id error:", error);

    res.status(500).json({
      message: "Failed to fetch project",
    });
  }
});

// Create project for logged-in user
router.post("/", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;

    if (!userId) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const { name, description, language } = req.body;

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        message: "Project name is required",
      });
    }

    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        description:
          typeof description === "string" && description.trim()
            ? description.trim()
            : null,
        language:
          typeof language === "string" && language.trim()
            ? language.trim()
            : null,
        ownerId: userId,
      },
    });

    res.status(201).json(project);
  } catch (error) {
    console.error("POST /projects error:", error);

    res.status(500).json({
      message: "Failed to create project",
    });
  }
});

// Delete current user's project
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;

    if (!userId) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const projectId = String(req.params.id);

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

    await prisma.project.delete({
      where: {
        id: projectId,
      },
    });

    res.json({
      message: "Project deleted successfully",
    });
  } catch (error) {
    console.error("DELETE /projects/:id error:", error);

    res.status(500).json({
      message: "Failed to delete project",
    });
  }
});

export default router;
