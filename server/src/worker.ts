import { httpServerHandler } from "cloudflare:node";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

type HyperdriveEnv = {
  HYPERDRIVE: {
    connectionString: string;
  };
};

type WorkerHandler = {
  fetch: (
    request: Request,
  ) => Response | Promise<Response>;
};

let handlerPromise: Promise<WorkerHandler> | null = null;

const FRONTEND_URL = () => process.env.FRONTEND_URL || "https://devora-rose.vercel.app";
const OAUTH_CLIENT_ID = () => process.env.GITHUB_OAUTH_CLIENT_ID;
const OAUTH_REDIRECT_URI = () =>
  process.env.GITHUB_OAUTH_REDIRECT_URI ||
  "https://devora-api.shxshwat23.workers.dev/api/github/callback";
const JWT_SECRET = () => process.env.JWT_SECRET;

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function createOAuthState(userId: string) {
  const secret = JWT_SECRET();
  if (!secret) throw new Error("JWT_SECRET is not defined");

  const payload = base64Url(
    JSON.stringify({
      userId,
      issuedAt: Date.now(),
      nonce: crypto.randomBytes(18).toString("hex"),
    }),
  );

  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || FRONTEND_URL(),
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
  };
}

async function handleOAuthBegin(request: Request) {
  const origin = request.headers.get("Origin");
  const headers = corsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ message: "Method not allowed" }), {
      status: 405,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const clientId = OAUTH_CLIENT_ID();
  const jwtSecret = JWT_SECRET();
  if (!clientId || !jwtSecret) {
    return new Response(JSON.stringify({ message: "GitHub OAuth is not configured" }), {
      status: 503,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!token) {
    return new Response(JSON.stringify({ message: "Authentication required" }), {
      status: 401,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as { userId?: string };
    if (!decoded.userId) throw new Error("Invalid authentication token");

    const state = createOAuthState(decoded.userId);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: OAUTH_REDIRECT_URI(),
      scope: "repo read:user",
      state,
    });

    return new Response(JSON.stringify({
      url: `https://github.com/login/oauth/authorize?${params.toString()}`,
    }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      message: error instanceof Error ? error.message : "Unable to start GitHub authorization",
    }), {
      status: 401,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
}

async function getHandler(env: HyperdriveEnv) {
  if (!handlerPromise) {
    process.env.DATABASE_URL = env.HYPERDRIVE.connectionString;

    handlerPromise = import("./app.js").then(({ default: app }) => {
      app.listen(3000);
      return httpServerHandler({ port: 3000 }) as WorkerHandler;
    });
  }

  return handlerPromise;
}

export default {
  async fetch(
    request: Request,
    env: HyperdriveEnv,
  ) {
    const url = new URL(request.url);

    if (url.pathname === "/api/github/oauth/begin") {
      return handleOAuthBegin(request);
    }

    const handler = await getHandler(env);
    return handler.fetch(request);
  },
};
