import { Router } from "express";
import crypto from "node:crypto";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware.js";

const router = Router();

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const OAUTH_CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.GITHUB_OAUTH_CLIENT_SECRET;
const OAUTH_REDIRECT_URI =
  process.env.GITHUB_OAUTH_REDIRECT_URI ||
  "https://devora-api.shxshwat23.workers.dev/api/github/callback";
const JWT_SECRET = process.env.JWT_SECRET;

function toBase64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function createOAuthState(userId: string) {
  if (!JWT_SECRET) throw new Error("JWT_SECRET is not defined");

  const payload = toBase64Url(
    JSON.stringify({
      userId,
      issuedAt: Date.now(),
      nonce: crypto.randomBytes(18).toString("hex"),
    }),
  );

  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

router.get("/github/oauth/url", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;

    if (!userId) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
      return res.status(503).json({
        message: "GitHub OAuth is not configured",
      });
    }

    const state = createOAuthState(userId);

    const params = new URLSearchParams({
      client_id: OAUTH_CLIENT_ID,
      redirect_uri: OAUTH_REDIRECT_URI,
      scope: "repo read:user",
      state,
    });

    return res.json({
      url: `https://github.com/login/oauth/authorize?${params.toString()}`,
    });
  } catch (error) {
    console.error("GitHub OAuth URL error:", error);

    return res.status(500).json({
      message: "Unable to start GitHub authorization",
    });
  }
});

export default router;
