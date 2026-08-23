import { Router } from "express";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { getPrisma } from "../lib/prisma.js";

const router = Router();
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const MAX_CONTEXT_FILES = 24;
const MAX_FILE_CHARS = 10_000;

const actionInstructions: Record<string, string> = {
  explain: "Explain the selected code clearly for a developer. Do not rewrite the code.",
  fix: "Identify likely bugs or correctness issues and return a corrected version of the code.",
  refactor: "Refactor the code for readability, maintainability, and sensible performance while preserving behavior.",
  tests: "Generate practical tests for the selected code. Prefer the existing language and common conventions.",
};

function getGeminiKey() {
  return process.env.GEMINI_API_KEY;
}

async function generateGemini(prompt: string) {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error("Gemini is not configured on the Devora backend");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {},
      }),
    },
  );

  const payload = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };

  if (!response.ok) throw new Error(payload.error?.message || "Gemini request failed");

  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

async function getProjectContext(projectId: string | undefined, userId: string) {
  if (!projectId) return "";

  const prisma = getPrisma();
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: userId },
    select: {
      name: true,
      description: true,
      language: true,
      files: {
        orderBy: { path: "asc" },
        take: MAX_CONTEXT_FILES,
        select: { path: true, language: true, content: true },
      },
    },
  });

  if (!project) return "";

  const preferred = [...project.files].sort((a, b) => {
    const score = (path: string) => {
      if (path === "package.json") return 100;
      if (path === "README.md") return 90;
      if (/^(src|server)\//.test(path)) return 70;
      if (/(route|api|auth|app|index|main|config)/i.test(path)) return 60;
      return 20;
    };
    return score(b.path) - score(a.path) || a.path.localeCompare(b.path);
  });

  const files = preferred.map((file) => {
    const content = file.content.length > MAX_FILE_CHARS
      ? `${file.content.slice(0, MAX_FILE_CHARS)}\n...[truncated]`
      : file.content;
    return `### ${file.path} (${file.language || "plaintext"})\n${content}`;
  }).join("\n\n");

  return [
    `Project: ${project.name}`,
    `Description: ${project.description || "None"}`,
    `Primary language: ${project.language || "Unspecified"}`,
    `Visible project files: ${project.files.length}`,
    "Project file context follows. Treat it as source-of-truth context for this project.",
    files || "No project files are available yet.",
  ].join("\n\n");
}

router.post("/ai/chat", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const projectId = typeof req.body?.projectId === "string" ? req.body.projectId : undefined;

    if (!message) return res.status(400).json({ message: "message is required" });
    if (message.length > 12_000) return res.status(413).json({ message: "Message is too large" });

    const safeHistory = history
      .filter((item: any) => item && (item.role === "user" || item.role === "assistant") && typeof item.text === "string")
      .slice(-12)
      .map((item: any) => `${item.role === "user" ? "User" : "Devora AI"}: ${item.text.slice(0, 8_000)}`)
      .join("\n");

    const projectContext = await getProjectContext(projectId, userId);

    const prompt = [
      "You are Devora AI, an expert software engineering assistant inside the Devora developer workspace.",
      "Be concise but useful. Help with programming, debugging, architecture, Git, testing, APIs, databases, and development workflows.",
      "When project context is provided, use it actively. Reference concrete filenames and explain why they matter.",
      "If the requested information is not present in the provided project context, say so instead of pretending you inspected files you cannot see.",
      "When the user asks for code, provide practical code with brief reasoning.",
      "Never claim you executed code unless the request includes execution output.",
      projectContext ? `Current project context:\n${projectContext}` : "No project is selected. Answer using only the conversation and the user's message.",
      safeHistory ? `Conversation history:\n${safeHistory}` : "",
      `User: ${message}`,
      "Devora AI:",
    ].filter(Boolean).join("\n\n");

    const reply = await generateGemini(prompt);
    return res.json({ model: GEMINI_MODEL, reply, projectAware: Boolean(projectContext) });
  } catch (error) {
    console.error("Gemini chat error:", error);
    const message = error instanceof Error ? error.message : "Unable to run Gemini chat";
    return res.status(message === "Gemini is not configured on the Devora backend" ? 503 : 502).json({ message });
  }
});

router.post("/ai/code-action", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const { action, path, language, content } = req.body || {};
    if (!(action in actionInstructions)) {
      return res.status(400).json({ message: "Unsupported AI action" });
    }
    if (typeof path !== "string" || typeof content !== "string") {
      return res.status(400).json({ message: "path and content are required" });
    }
    if (content.length > 120_000) {
      return res.status(413).json({ message: "Selected file is too large for an AI action" });
    }

    const prompt = [
      "You are Devora AI, a careful software engineering assistant.",
      actionInstructions[action as string],
      "Return JSON only with these fields:",
      '{"explanation":"string","result":"string"}',
      "For explain, result may contain the explanation instead of rewritten code.",
      "For fix, refactor, and tests, result must be the complete proposed file content or complete test scaffold.",
      "Do not wrap result in Markdown fences.",
      `File: ${path}`,
      `Language: ${typeof language === "string" ? language : "unknown"}`,
      "Selected code:",
      content,
    ].join("\n\n");

    const raw = await generateGemini(prompt);

    let result: { explanation: string; result: string };
    try {
      result = JSON.parse(raw);
    } catch {
      return res.status(502).json({ message: "Gemini returned invalid structured output" });
    }

    return res.json({
      model: GEMINI_MODEL,
      action,
      explanation: result.explanation || "",
      result: result.result || "",
    });
  } catch (error) {
    console.error("Gemini code action error:", error);
    const message = error instanceof Error ? error.message : "Unable to run Gemini code action";
    return res.status(message === "Gemini is not configured on the Devora backend" ? 503 : 502).json({ message });
  }
});

export default router;
