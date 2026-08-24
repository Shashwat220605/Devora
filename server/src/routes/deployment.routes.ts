import { Router } from "express";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { getPrisma } from "../lib/prisma.js";

const router = Router();
const SECRET_PATH = /(^|\/)(\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx)|credentials?\.json|secrets?\.(?:json|ya?ml))$/i;
const MAX_FILE_BYTES = 1_000_000;

router.get("/deployments/preflight", authenticate, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    if (!projectId) return res.status(400).json({ message: "projectId is required" });

    const prisma = getPrisma();
    const project = await prisma.project.findFirst({
      where: { id: projectId, ownerId: userId },
      include: { files: true, repositories: true },
    });
    if (!project) return res.status(404).json({ message: "Project not found" });

    const files = project.files;
    const checks: Array<{ name: string; status: "pass" | "warn" | "fail"; detail: string }> = [];
    const packageFile = files.find((file) => file.path === "package.json");
    const secretFiles = files.filter((file) => SECRET_PATH.test(file.path));
    const oversized = files.filter((file) => Buffer.byteLength(file.content, "utf8") > MAX_FILE_BYTES);

    checks.push({
      name: "Project files",
      status: files.length ? "pass" : "fail",
      detail: files.length ? `${files.length} project file${files.length === 1 ? "" : "s"} available.` : "The project contains no files.",
    });

    if (packageFile) {
      try {
        const pkg = JSON.parse(packageFile.content) as { scripts?: Record<string, string>; name?: string };
        checks.push({
          name: "package.json",
          status: "pass",
          detail: `${pkg.name || project.name} detected${pkg.scripts?.build ? ` · build script: ${pkg.scripts.build}` : ""}.`,
        });
        checks.push({
          name: "Build script",
          status: pkg.scripts?.build ? "pass" : "warn",
          detail: pkg.scripts?.build ? `npm run build is available.` : "No build script was found in package.json.",
        });
      } catch {
        checks.push({ name: "package.json", status: "fail", detail: "package.json is not valid JSON." });
      }
    } else {
      checks.push({ name: "package.json", status: "warn", detail: "No package.json detected. Vercel may use a different build configuration." });
    }

    checks.push({
      name: "Sensitive files",
      status: secretFiles.length ? "fail" : "pass",
      detail: secretFiles.length ? `Remove ${secretFiles.length} sensitive file${secretFiles.length === 1 ? "" : "s"} before deployment: ${secretFiles.map((file) => file.path).join(", ")}.` : "No environment files, private keys, or credential files detected.",
    });

    checks.push({
      name: "File size",
      status: oversized.length ? "warn" : "pass",
      detail: oversized.length ? `${oversized.length} file${oversized.length === 1 ? "" : "s"} exceed${oversized.length === 1 ? "s" : ""} the 1 MB preflight limit.` : "All files are within the deployment preflight limit.",
    });

    checks.push({
      name: "GitHub connection",
      status: project.repositories.length ? "pass" : "warn",
      detail: project.repositories.length ? `Connected repository: ${project.repositories[0].name}.` : "No repository is linked to this project.",
    });

    const failed = checks.filter((check) => check.status === "fail").length;
    const warnings = checks.filter((check) => check.status === "warn").length;

    return res.json({
      project: { id: project.id, name: project.name },
      productionUrl: process.env.FRONTEND_URL || "https://devora-rose.vercel.app",
      checks,
      ready: failed === 0,
      failed,
      warnings,
      recommendedCommand: "npm run build",
    });
  } catch (error) {
    console.error("Deployment preflight error:", error);
    return res.status(500).json({ message: "Unable to run deployment preflight" });
  }
});

export default router;
