import { Router } from "express";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.middleware.js";

const router = Router();
const GEMINI_MODEL = "gemini-3.7-flash";

const actionInstructions: Record<string, string> = {
  explain: "Explain the selected code clearly for a developer. Do not rewrite the code.",
  fix: "Identify likely bugs or correctness issues and return a corrected version of the code.",
  refactor: "Refactor the code for readability, maintainability, and sensible performance while preserving behavior.",
  tests: "Generate practical tests for the selected code. Prefer the existing language and common conventions.",
};

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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ message: "Gemini is not configured on the Devora backend" });
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
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                explanation: { type: "STRING" },
                result: { type: "STRING" },
              },
              required: ["explanation", "result"],
            },
          },
        }),
      },
    );

    const payload = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      return res.status(502).json({
        message: payload.error?.message || "Gemini request failed",
      });
    }

    const raw = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    if (!raw) return res.status(502).json({ message: "Gemini returned an empty response" });

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
    return res.status(502).json({
      message: error instanceof Error ? error.message : "Unable to run Gemini code action",
    });
  }
});

export default router;
