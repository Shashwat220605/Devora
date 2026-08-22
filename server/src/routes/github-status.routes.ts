import { Router } from "express";
import { getPrisma } from "../lib/prisma.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware.js";

const router = Router();

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

    return res.json({
      connected: Boolean(user?.githubTokenEnc),
      username: user?.githubUsername || null,
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
