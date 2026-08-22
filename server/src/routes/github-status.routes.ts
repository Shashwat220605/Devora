import { Router } from "express";
import crypto from "node:crypto";
import { getPrisma } from "../lib/prisma.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware.js";

const router = Router();

const OAUTH_CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID;
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

router.get("/github/status", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        githubUsername: true,
        githubTokenEnc: true,
      },
    });

    let oauthUrl: string | null = null;
    if (!user?.githubTokenEnc && OAUTH_CLIENT_ID && JWT_SECRET) {
      const state = createOAuthState(userId);
      const params = new URLSearchParams({
        client_id: OAUTH_CLIENT_ID,
        redirect_uri: OAUTH_REDIRECT_URI,
        scope: "repo read:user",
        state,
      });
      oauthUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
    }

    return res.json({
      connected: Boolean(user?.githubTokenEnc),
      username: user?.githubUsername || null,
      oauthUrl,
    });
  } catch (error) {
    console.error("GitHub status error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      message: "Failed to read GitHub connection status",
      detail,
    });
  }
});

export default router;
