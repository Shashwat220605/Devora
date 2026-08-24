import { Router } from "express";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { getPrisma } from "../lib/prisma.js";

const router = Router();
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const MAX_CONTEXT_FILES = 24;
const MAX_FILE_CHARS = 10_000;
const SECRET_PATH = /(^|\/)(\.env(?:\..*)?|.*\.pem|.*\.key|.*\.p12|.*\.pfx|credentials?\.json|secrets?\.(json|ya?ml))$/i;

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

function parseGeminiJson<T>(raw: string): T | null {
  const candidates = [
    raw.trim(),
    raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim(),
  ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try the next normalized form.
    }
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as T;
    } catch {
      return null;
    }
  }

  return null;
}

function normalizeConfidence(value: unknown): "high" | "medium" | "low" {
  const normalized = String(value || "").toLowerCase();
  return normalized === "high" || normalized === "low" ? normalized : "medium";
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
        take: 80,
        select: { path: true, language: true, content: true },
      },
    },
  });

  if (!project) return "";

  const visibleFiles = project.files
    .filter((file) => !SECRET_PATH.test(file.path))
    .sort((a, b) => {
      const score = (path: string) => {
        if (path === "package.json") return 100;
        if (path === "README.md") return 90;
        if (/^(src|server)\//.test(path)) return 70;
        if (/(route|api|auth|app|index|main|config)/i.test(path)) return 60;
        return 20;
      };
      return score(b.path) - score(a.path) || a.path.localeCompare(b.path);
    })
    .slice(0, MAX_CONTEXT_FILES);

  const files = visibleFiles.map((file) => {
    const content = file.content.length > MAX_FILE_CHARS
      ? `${file.content.slice(0, MAX_FILE_CHARS)}\n...[truncated]`
      : file.content;
    return `### ${file.path} (${file.language || "plaintext"})\n${content}`;
  }).join("\n\n");

  return [
    `Project: ${project.name}`,
    `Description: ${project.description || "None"}`,
    `Primary language: ${project.language || "Unspecified"}`,
    `Included source files: ${visibleFiles.length}`,
    "Sensitive files such as environment files, private keys, and credential files are excluded from AI context.",
    "Project file context follows. Treat it as source-of-truth context for this project.",
    files || "No safe project files are available yet.",
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

router.post("/ai/error-doctor", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const errorText = typeof req.body?.error === "string" ? req.body.error.trim() : "";
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const language = typeof req.body?.language === "string" ? req.body.language : "unknown";
    const projectId = typeof req.body?.projectId === "string" ? req.body.projectId : undefined;

    if (!errorText) return res.status(400).json({ message: "error is required" });
    if (errorText.length > 16_000) return res.status(413).json({ message: "Error output is too large" });
    if (code.length > 100_000) return res.status(413).json({ message: "Code is too large" });

    const projectContext = await getProjectContext(projectId, userId);
    const prompt = [
      "You are Devora Error Doctor, a senior software engineer diagnosing a runtime or build error.",
      "Use the error output as the primary evidence. Use the code and project context to identify the most likely cause.",
      "Return ONLY a single valid JSON object. Do not use Markdown fences, headings, commentary, or code blocks.",
      "The JSON must contain exactly these keys: summary, cause, fix, suggestedCode, confidence.",
      "confidence must be exactly one of: high, medium, low.",
      "Escape all newlines and quotes correctly so the response can be parsed by JSON.parse.",
      "suggestedCode must be the complete replacement for the provided code when a code change is clearly appropriate. Otherwise return an empty string.",
      "Do not invent files, logs, execution results, or dependencies.",
      `Language: ${language}`,
      `Error output:\n${errorText}`,
      code ? `Current code:\n${code}` : "No source code was supplied.",
      projectContext ? `Project context:\n${projectContext}` : "No project context was supplied.",
    ].join("\n\n");

    const raw = await generateGemini(prompt);
    const parsed = parseGeminiJson<{
      summary?: unknown;
      cause?: unknown;
      fix?: unknown;
      suggestedCode?: unknown;
      confidence?: unknown;
    }>(raw);

    if (!parsed) {
      console.error("Gemini error doctor returned non-JSON output", { preview: raw.slice(0, 500) });
      return res.status(502).json({ message: "Gemini returned invalid error-doctor output" });
    }

    return res.json({
      model: GEMINI_MODEL,
      summary: String(parsed.summary || "Unable to summarize the error."),
      cause: String(parsed.cause || "Gemini could not determine a reliable cause."),
      fix: String(parsed.fix || "Try reproducing the error with the smallest failing example."),
      suggestedCode: typeof parsed.suggestedCode === "string" ? parsed.suggestedCode : "",
      confidence: normalizeConfidence(parsed.confidence),
      projectAware: Boolean(projectContext),
    });
  } catch (error) {
    console.error("Gemini error doctor error:", error);
    const message = error instanceof Error ? error.message : "Unable to diagnose the error";
    return res.status(message === "Gemini is not configured on the Devora backend" ? 503 : 502).json({ message });
  }
});

router.post("/ai/pr-review", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const title = typeof req.body?.title === "string" ? req.body.title.slice(0, 300) : "";
    const body = typeof req.body?.body === "string" ? req.body.body.slice(0, 6_000) : "";
    const files = Array.isArray(req.body?.files) ? req.body.files : [];
    const projectId = typeof req.body?.projectId === "string" ? req.body.projectId : undefined;

    if (!title) return res.status(400).json({ message: "Pull request title is required" });
    if (files.length > 100) return res.status(413).json({ message: "Too many changed files" });

    const normalizedFiles = files.slice(0, 60).map((file: any) => ({
      path: String(file?.path || "").slice(0, 300),
      status: String(file?.status || "unknown"),
      additions: Number(file?.additions || 0),
      deletions: Number(file?.deletions || 0),
      patch: typeof file?.patch === "string" ? file.patch.slice(0, 8_000) : "",
    }));
    const projectContext = await getProjectContext(projectId, userId);

    const prompt = [
      "You are Devora AI Code Review, reviewing a GitHub pull request before merge.",
      "Prioritize correctness, security, breaking changes, missing tests, and meaningful maintainability risks.",
      "Do not invent issues. If the patch is clean, say so.",
      "Return ONLY one valid JSON object with exactly these keys: summary, risk, findings, recommendation.",
      "risk must be exactly one of low, medium, high.",
      "findings must be an array of objects with exactly: severity, file, title, detail, suggestion.",
      "severity must be exactly one of blocker, warning, suggestion, info.",
      "recommendation must be a short actionable review conclusion.",
      `Pull request title: ${title}`,
      `Pull request description: ${body || "None"}`,
      `Changed files:\n${JSON.stringify(normalizedFiles)}`,
      projectContext ? `Project context:\n${projectContext}` : "No project context was supplied.",
    ].join("\n\n");

    const raw = await generateGemini(prompt);
    const parsed = parseGeminiJson<{
      summary?: unknown;
      risk?: unknown;
      findings?: unknown;
      recommendation?: unknown;
    }>(raw);

    if (!parsed) return res.status(502).json({ message: "Gemini returned invalid code-review output" });

    const riskValue = String(parsed.risk || "medium").toLowerCase();
    const risk = riskValue === "high" || riskValue === "low" ? riskValue : "medium";
    const findings = Array.isArray(parsed.findings) ? parsed.findings.slice(0, 40).map((item: any) => ({
      severity: ["blocker", "warning", "suggestion", "info"].includes(String(item?.severity)) ? String(item.severity) : "info",
      file: String(item?.file || "").slice(0, 300),
      title: String(item?.title || "Finding").slice(0, 200),
      detail: String(item?.detail || "").slice(0, 2000),
      suggestion: String(item?.suggestion || "").slice(0, 2000),
    })) : [];

    return res.json({
      model: GEMINI_MODEL,
      projectAware: Boolean(projectContext),
      summary: String(parsed.summary || "Review completed."),
      risk,
      findings,
      recommendation: String(parsed.recommendation || "Review the findings before merging."),
    });
  } catch (error) {
    console.error("Gemini PR review error:", error);
    const message = error instanceof Error ? error.message : "Unable to review pull request";
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
    const result = parseGeminiJson<{ explanation?: unknown; result?: unknown }>(raw);

    if (!result) {
      return res.status(502).json({ message: "Gemini returned invalid structured output" });
    }

    return res.json({
      model: GEMINI_MODEL,
      action,
      explanation: String(result.explanation || ""),
      result: String(result.result || ""),
    });
  } catch (error) {
    console.error("Gemini code action error:", error);
    const message = error instanceof Error ? error.message : "Unable to run Gemini code action";
    return res.status(message === "Gemini is not configured on the Devora backend" ? 503 : 502).json({ message });
  }
});

export default router;
