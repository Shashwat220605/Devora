import { Router } from "express";
import { randomUUID } from "node:crypto";
import prisma from "../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.middleware.js";

const router = Router();
const CATEGORIES = ["architecture", "stack", "conventions", "decision", "bug", "deployment", "note"] as const;
type Category = (typeof CATEGORIES)[number];

type MemoryRow = {
  id: string;
  project_id: string;
  category: Category;
  title: string;
  content: string;
  created_at: Date;
  updated_at: Date;
};

let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS project_memories (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT project_memories_category_check CHECK (category IN ('architecture','stack','conventions','decision','bug','deployment','note'))
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS project_memories_project_idx ON project_memories(project_id)`);
  tableReady = true;
}

async function ownsProject(projectId: string, userId: string) {
  return prisma.project.findFirst({ where: { id: projectId, ownerId: userId }, select: { id: true, name: true } });
}

router.get("/projects/:projectId/memory", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const projectId = String(req.params.projectId);
    const project = await ownsProject(projectId, userId);
    if (!project) return res.status(404).json({ message: "Project not found" });

    await ensureTable();
    const rows = await prisma.$queryRaw<MemoryRow[]>`
      SELECT id, project_id, category, title, content, created_at, updated_at
      FROM project_memories
      WHERE project_id = ${projectId}
      ORDER BY category ASC, updated_at DESC
    `;

    return res.json(rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      category: row.category,
      title: row.title,
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })));
  } catch (error) {
    console.error("GET project memory error:", error);
    return res.status(500).json({ message: "Unable to load project memory" });
  }
});

router.post("/projects/:projectId/memory", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const projectId = String(req.params.projectId);
    const project = await ownsProject(projectId, userId);
    if (!project) return res.status(404).json({ message: "Project not found" });

    const category = typeof req.body?.category === "string" ? req.body.category : "note";
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";

    if (!CATEGORIES.includes(category as Category)) return res.status(400).json({ message: "Invalid memory category" });
    if (!title) return res.status(400).json({ message: "Memory title is required" });
    if (!content) return res.status(400).json({ message: "Memory content is required" });
    if (title.length > 160) return res.status(400).json({ message: "Memory title is too long" });
    if (content.length > 8_000) return res.status(413).json({ message: "Memory content is too large" });

    await ensureTable();
    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO project_memories (id, project_id, category, title, content)
      VALUES (${id}, ${projectId}, ${category}, ${title}, ${content})
    `;

    return res.status(201).json({ id, projectId, category, title, content });
  } catch (error) {
    console.error("POST project memory error:", error);
    return res.status(500).json({ message: "Unable to save project memory" });
  }
});

router.put("/projects/:projectId/memory/:memoryId", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const projectId = String(req.params.projectId);
    const memoryId = String(req.params.memoryId);
    const project = await ownsProject(projectId, userId);
    if (!project) return res.status(404).json({ message: "Project not found" });

    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    const category = typeof req.body?.category === "string" ? req.body.category : "note";
    if (!CATEGORIES.includes(category as Category)) return res.status(400).json({ message: "Invalid memory category" });
    if (!title || !content) return res.status(400).json({ message: "Title and content are required" });

    await ensureTable();
    const result = await prisma.$executeRaw`
      UPDATE project_memories
      SET category = ${category}, title = ${title}, content = ${content}, updated_at = NOW()
      WHERE id = ${memoryId} AND project_id = ${projectId}
    `;
    if (result === 0) return res.status(404).json({ message: "Memory not found" });
    return res.json({ id: memoryId, projectId, category, title, content });
  } catch (error) {
    console.error("PUT project memory error:", error);
    return res.status(500).json({ message: "Unable to update project memory" });
  }
});

router.delete("/projects/:projectId/memory/:memoryId", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const projectId = String(req.params.projectId);
    const memoryId = String(req.params.memoryId);
    const project = await ownsProject(projectId, userId);
    if (!project) return res.status(404).json({ message: "Project not found" });

    await ensureTable();
    const result = await prisma.$executeRaw`
      DELETE FROM project_memories WHERE id = ${memoryId} AND project_id = ${projectId}
    `;
    if (result === 0) return res.status(404).json({ message: "Memory not found" });
    return res.json({ message: "Memory deleted" });
  } catch (error) {
    console.error("DELETE project memory error:", error);
    return res.status(500).json({ message: "Unable to delete project memory" });
  }
});

export default router;
