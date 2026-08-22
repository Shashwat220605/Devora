import express from "express";
import cors from "cors";
import fileRoutes from "./routes/file.routes.js";
import authRoutes from "./routes/auth.routes.js";
import projectRoutes from "./routes/project.routes.js";
import githubStatusRoutes from "./routes/github-status.routes.js";
import githubRoutes from "./routes/github.routes.js";
import githubRepoRoutes from "./routes/github-repo.routes.js";
import githubOAuthRoutes from "./routes/github-oauth.routes.js";
import githubOAuthUrlRoutes from "./routes/github-oauth-url.routes.js";
import githubOAuthBeginRoutes from "./routes/github-oauth-begin.routes.js";
import githubDiffRoutes from "./routes/github-diff.routes.js";
import githubSyncRoutes from "./routes/github-sync.routes.js";

const app = express();

const configuredFrontendOrigin = process.env.FRONTEND_URL;

const isAllowedOrigin = (origin?: string) => {
  if (!origin) return true;
  if (origin === configuredFrontendOrigin) return true;
  if (origin === "http://localhost:5173") return true;

  try {
    const url = new URL(origin);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".vercel.app") &&
      url.hostname.startsWith("devora-")
    );
  } catch {
    return false;
  }
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed by Devora CORS policy"));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "2mb" }));

app.use("/api", fileRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api", githubStatusRoutes);
app.use("/api", githubRoutes);
app.use("/api", githubRepoRoutes);
app.use("/api", githubOAuthRoutes);
app.use("/api", githubOAuthUrlRoutes);
// OAuth start endpoint: POST /api/github/oauth/begin
app.use("/api", githubOAuthBeginRoutes);
app.use("/api", githubDiffRoutes);
app.use("/api", githubSyncRoutes);

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    message: "Devora backend is running",
    runtime: "cloudflare-workers",
  });
});

export default app;
