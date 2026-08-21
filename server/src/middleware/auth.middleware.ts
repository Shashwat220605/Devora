import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

interface DevoraJwtPayload extends jwt.JwtPayload {
  userId?: unknown;
}

export function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const jwtSecret = process.env.JWT_SECRET;

  if (typeof jwtSecret !== "string" || jwtSecret.length === 0) {
    console.error("JWT_SECRET is not configured");
    return res.status(500).json({
      message: "Authentication configuration error",
    });
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Authentication required",
    });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, jwtSecret);

    if (typeof decoded === "string" || decoded === null) {
      return res.status(401).json({
        message: "Invalid authentication token",
      });
    }

    const payload = decoded as DevoraJwtPayload;

    if (typeof payload.userId !== "string" || payload.userId.length === 0) {
      return res.status(401).json({
        message: "Invalid authentication token",
      });
    }

    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}