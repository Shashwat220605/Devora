import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fileRoutes from "./routes/file.routes.js";
import authRoutes from "./routes/auth.routes.js";
import projectRoutes from "./routes/project.routes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use("/api", fileRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    message: "Devora backend is running",
  });
});

app.listen(PORT, () => {
  console.log(
    `🚀 Devora backend running on http://localhost:${PORT}`,
  );
});
