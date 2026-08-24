import { Router } from "express";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { getPrisma } from "../lib/prisma.js";

const router = Router();
const GEMINI_MODEL = "gemini-3.5-flash-lite";

async function generate(prompt: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini is not configured on the Devora backend");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: {} }),
  });
  const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || "Gemini request failed");
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

router.post("/ai/commit-message", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const projectId = typeof req.body?.projectId === "string" ? req.body.projectId : "";
    const changes = Array.isArray(req.body?.changes) ? req.body.changes : [];
    if (!projectId || !changes.length) return res.status(400).json({ message: "projectId and changes are required" });

    const prisma = getPrisma();
    const project = await prisma.project.findFirst({ where: { id: projectId, ownerId: userId }, select: { name: true, description: true } });
    if (!project) return res.status(404).json({ message: "Project not found" });

    const normalized = changes.slice(0, 40).map((change: any) => ({
      path: typeof change?.path === "string" ? change.path : "unknown",
      status: typeof change?.status === "string" ? change.status : "modified",
      additions: Number.isFinite(change?.additions) ? change.additions : 0,
      deletions: Number.isFinite(change?.deletions) ? change.deletions : 0,
    }));

    const prompt = [
      "You are Devora AI generating a Git commit message.",
      "Return ONLY one concise imperative commit subject, no quotes, no bullets, no period, maximum 72 characters.",
      `Project: ${project.name}`,
      `Description: ${project.description || "None"}`,
      `Changes: ${JSON.stringify(normalized)}`,
      "Use conventional wording when natural, for example feat:, fix:, refactor:, docs:, test:, chore:.",
    ].join("\n\n");

    const message = (await generate(prompt)).replace(/^['\"]|['\"]$/g, "").split("\n")[0].trim().slice(0, 72);
    return res.json({ model: GEMINI_MODEL, message: message || `chore: update ${project.name}` });
  } catch (error) {
    console.error("AI commit message error:", error);
    const message = error instanceof Error ? error.message : "Unable to generate commit message";
    return res.status(message === "Gemini is not configured on the Devora backend" ? 503 : 502).json({ message });
  }
});

export default router;
