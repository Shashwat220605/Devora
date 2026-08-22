import { Router } from "express";
import { getPrisma } from "../lib/prisma.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware.js";

const router = Router();

function userIdFrom(req: AuthenticatedRequest) {
  return req.userId;
}

router.get("/", authenticate, async (req, res) => {
  try {
    const userId = userIdFrom(req as AuthenticatedRequest);
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const prisma = getPrisma();
    const projects = await prisma.project.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        name: true,
        description: true,
        language: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    return res.json(projects);
  } catch (error) {
    console.error("GET /projects error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ message: "Failed to fetch projects", detail });
  }
});

router.get("/:id", authenticate, async (req, res) => {
  try {
    const userId = userIdFrom(req as AuthenticatedRequest);
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const prisma = getPrisma();
    const projectId = String(req.params.id);
    const project = await prisma.project.findFirst({
      where: { id: projectId, ownerId: userId },
      select: {
        id: true,
        name: true,
        description: true,
        language: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!project) return res.status(404).json({ message: "Project not found" });
    return res.json(project);
  } catch (error) {
    console.error("GET /projects/:id error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ message: "Failed to fetch project", detail });
  }
});

router.post("/", authenticate, async (req, res) => {
  try {
    const userId = userIdFrom(req as AuthenticatedRequest);
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const { name, description, language } = req.body;
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Project name is required" });
    }

    const prisma = getPrisma();
    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        description: typeof description === "string" && description.trim() ? description.trim() : null,
        language: typeof language === "string" && language.trim() ? language.trim() : null,
        ownerId: userId,
      },
      select: {
        id: true,
        name: true,
        description: true,
        language: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(201).json(project);
  } catch (error) {
    console.error("POST /projects error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ message: "Failed to create project", detail });
  }
});

router.delete("/:id", authenticate, async (req, res) => {
  try {
    const userId = userIdFrom(req as AuthenticatedRequest);
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const prisma = getPrisma();
    const projectId = String(req.params.id);
    const project = await prisma.project.findFirst({
      where: { id: projectId, ownerId: userId },
      select: { id: true },
    });

    if (!project) return res.status(404).json({ message: "Project not found" });

    await prisma.project.delete({ where: { id: projectId } });
    return res.json({ message: "Project deleted successfully" });
  } catch (error) {
    console.error("DELETE /projects/:id error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ message: "Failed to delete project", detail });
  }
});

export default router;
