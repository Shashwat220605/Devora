import express from "express";
import cors from "cors";
import fileRoutes from "./routes/file.routes.js";
import authRoutes from "./routes/auth.routes.js";
import projectRoutes from "./routes/project.routes.js";
import githubRoutes from "./routes/github.routes.js";
import githubDiffRoutes from "./routes/github-diff.routes.js";
import githubSyncRoutes from "./routes/github-sync.routes.js";

const app = express();

const allowedOrigin = process.env.FRONTEND_URL;

app.use(
  cors({
    origin: allowedOrigin || true,
    credentials: true,
  }),
);

app.use(express.json({ limit: "2mb" }));

app.use("/api", fileRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api", githubRoutes);
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
