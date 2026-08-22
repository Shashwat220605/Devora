import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as cp from "node:child_process";
import { promisify } from "node:util";

const DEVORA_URL = "https://devora-rose.vercel.app";
const API_BASE = `${DEVORA_URL}/api`;
const TOKEN_KEY = "devora.authToken";
const PROJECT_KEY = "devora.projectId";

const execFile = promisify(cp.execFile);

interface DevoraFile {
  id: string;
  path: string;
  content: string;
  language?: string | null;
}

function projectRoot() {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function runGit(command: string, args: string[]) {
  const root = projectRoot();
  if (!root) throw new Error("Open a local project folder first.");
  const { stdout, stderr } = await execFile(command, args, { cwd: root });
  return `${stdout}${stderr}`.trim();
}

async function request<T>(
  token: string,
  method: string,
  url: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message =
      typeof data === "object" && data && "message" in data
        ? String((data as { message?: unknown }).message)
        : `Devora API returned ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

async function getConfig(context: vscode.ExtensionContext) {
  let token = await context.secrets.get(TOKEN_KEY);
  let projectId = context.workspaceState.get<string>(PROJECT_KEY);

  if (!token) {
    token = await vscode.window.showInputBox({
      prompt: "Paste your Devora login JWT",
      password: true,
      ignoreFocusOut: true,
      placeHolder: "eyJhbGciOi...",
    });
    if (!token) throw new Error("Devora login JWT is required.");
    await context.secrets.store(TOKEN_KEY, token.trim());
  }

  if (!projectId) {
    projectId = await vscode.window.showInputBox({
      prompt: "Enter the Devora project ID to sync",
      ignoreFocusOut: true,
      placeHolder: "Project ID",
    });
    if (!projectId) throw new Error("Devora project ID is required.");
    await context.workspaceState.update(PROJECT_KEY, projectId.trim());
  }

  return { token: token.trim(), projectId: projectId.trim() };
}

function toLocalPath(root: string, relativePath: string) {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const candidate = path.resolve(root, ...normalized.split("/"));
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Unsafe Devora file path: ${relativePath}`);
  }
  return candidate;
}

function shouldSync(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const blocked = new Set([
    ".git",
    "node_modules",
    ".next",
    "dist",
    "build",
    "coverage",
    "out",
    ".turbo",
  ]);
  return !parts.some((part) => blocked.has(part)) && normalized !== ".devora-sync.json";
}

async function collectLocalFiles(root: string) {
  const files: Array<{ path: string; content: string }> = [];

  async function walk(directory: string) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).replace(/\\/g, "/");
      if (!shouldSync(relative)) continue;

      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }

      if (!entry.isFile()) continue;
      const stat = await fs.stat(absolute);
      if (stat.size > 1_000_000) continue;
      const content = await fs.readFile(absolute, "utf8");
      files.push({ path: relative, content });
    }
  }

  await walk(root);
  return files;
}

async function fetchDevoraFiles(token: string, projectId: string) {
  return request<DevoraFile[]>(
    token,
    "GET",
    `${API_BASE}/projects/${encodeURIComponent(projectId)}/files`,
  );
}

async function configure(context: vscode.ExtensionContext) {
  await context.secrets.delete(TOKEN_KEY);
  await context.workspaceState.update(PROJECT_KEY, undefined);
  await getConfig(context);
  vscode.window.showInformationMessage("Devora sync is configured for this workspace.");
}

async function pullFromDevora(context: vscode.ExtensionContext) {
  const root = projectRoot();
  if (!root) throw new Error("Open the local project folder you want to sync first.");

  const { token, projectId } = await getConfig(context);
  const files = await fetchDevoraFiles(token, projectId);
  if (!files.length) {
    vscode.window.showInformationMessage("Devora project has no files to pull.");
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Pull ${files.length} Devora files into this local workspace? Existing matching files will be overwritten.`,
    { modal: true },
    "Pull Files",
  );
  if (confirm !== "Pull Files") return;

  let written = 0;
  for (const file of files) {
    const target = toLocalPath(root, file.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content, "utf8");
    written += 1;
  }

  vscode.window.showInformationMessage(`Devora pull complete: ${written} files written.`);
}

async function pushToDevora(context: vscode.ExtensionContext) {
  const root = projectRoot();
  if (!root) throw new Error("Open the local project folder you want to sync first.");

  const { token, projectId } = await getConfig(context);
  const localFiles = await collectLocalFiles(root);
  const remoteFiles = await fetchDevoraFiles(token, projectId);
  const remoteMap = new Map(remoteFiles.map((file) => [file.path, file]));

  if (!localFiles.length) {
    vscode.window.showInformationMessage("No supported local files found to push.");
    return;
  }

  const confirm = await vscode.window.showInformationMessage(
    `Push ${localFiles.length} local files to Devora? Existing Devora files with matching paths will be overwritten.`,
    { modal: true },
    "Push Files",
  );
  if (confirm !== "Push Files") return;

  let created = 0;
  let updated = 0;

  for (const file of localFiles) {
    const existing = remoteMap.get(file.path);
    if (existing) {
      await request<DevoraFile>(
        token,
        "PUT",
        `${API_BASE}/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(existing.id)}`,
        { content: file.content },
      );
      updated += 1;
    } else {
      await request<DevoraFile>(
        token,
        "POST",
        `${API_BASE}/projects/${encodeURIComponent(projectId)}/files`,
        { path: file.path, content: file.content },
      );
      created += 1;
    }
  }

  vscode.window.showInformationMessage(`Devora push complete: ${created} created, ${updated} updated.`);
}

async function pull(context: vscode.ExtensionContext) {
  try {
    await pullFromDevora(context);
  } catch (error) {
    vscode.window.showErrorMessage(`Devora pull failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function push(context: vscode.ExtensionContext) {
  try {
    await pushToDevora(context);
  } catch (error) {
    vscode.window.showErrorMessage(`Devora push failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function gitPull() {
  try {
    const output = await runGit("git", ["pull", "--ff-only"]);
    vscode.window.showInformationMessage(output || "GitHub: local workspace is up to date.");
  } catch (error) {
    vscode.window.showErrorMessage(`Git pull failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function gitPush() {
  try {
    const status = await runGit("git", ["status", "--short"]);
    if (!status) {
      vscode.window.showInformationMessage("GitHub: no local changes to push.");
      return;
    }
    const message = await vscode.window.showInputBox({ prompt: "Commit message", value: "Update from Devora" });
    if (!message) return;
    await runGit("git", ["add", "."]);
    await runGit("git", ["commit", "-m", message]);
    const output = await runGit("git", ["push"]);
    vscode.window.showInformationMessage(output || "GitHub: changes pushed.");
  } catch (error) {
    vscode.window.showErrorMessage(`Git push failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function openWorkspace() {
  await vscode.env.openExternal(vscode.Uri.parse(`${DEVORA_URL}/projects`));
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("devora.configure", () => configure(context)),
    vscode.commands.registerCommand("devora.pull", () => pull(context)),
    vscode.commands.registerCommand("devora.push", () => push(context)),
    vscode.commands.registerCommand("devora.gitPull", gitPull),
    vscode.commands.registerCommand("devora.gitPush", gitPush),
    vscode.commands.registerCommand("devora.openWorkspace", openWorkspace),
  );
  vscode.window.setStatusBarMessage("Devora connected", 3000);
}

export function deactivate() {}
