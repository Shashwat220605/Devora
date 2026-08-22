import * as vscode from "vscode";
import * as path from "node:path";

const DEVORA_URL = "https://devora-rose.vercel.app";

function projectRoot() {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function runGit(command: string, args: string[]) {
  const cp = require("node:child_process") as typeof import("node:child_process");
  return new Promise<string>((resolve, reject) => {
    cp.execFile(command, args, { cwd: projectRoot() }, (error: Error | null, stdout: string, stderr: string) => {
      if (error) return reject(new Error(stderr || error.message));
      resolve(stdout.trim());
    });
  });
}

async function pull() {
  if (!projectRoot()) return vscode.window.showErrorMessage("Open a local project folder first.");
  try {
    const output = await runGit("git", ["pull", "--ff-only"]);
    vscode.window.showInformationMessage(output || "Devora: local workspace is up to date.");
  } catch (error) {
    vscode.window.showErrorMessage(`Devora pull failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function push() {
  if (!projectRoot()) return vscode.window.showErrorMessage("Open a local project folder first.");
  try {
    const status = await runGit("git", ["status", "--short"]);
    if (!status) return vscode.window.showInformationMessage("Devora: no local changes to push.");
    const message = await vscode.window.showInputBox({ prompt: "Commit message", value: "Update from Devora" });
    if (!message) return;
    await runGit("git", ["add", "."]);
    await runGit("git", ["commit", "-m", message]);
    const output = await runGit("git", ["push"]);
    vscode.window.showInformationMessage(output || "Devora: changes pushed.");
  } catch (error) {
    vscode.window.showErrorMessage(`Devora push failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function openWorkspace() {
  const root = projectRoot();
  if (!root) return vscode.window.showErrorMessage("Open a local project folder first.");
  const uri = vscode.Uri.parse(`${DEVORA_URL}/projects`);
  await vscode.env.openExternal(uri);
  void path; // keep Node path available for future local/remote mapping.
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("devora.pull", pull),
    vscode.commands.registerCommand("devora.push", push),
    vscode.commands.registerCommand("devora.openWorkspace", openWorkspace),
  );
  vscode.window.setStatusBarMessage("Devora connected", 3000);
}

export function deactivate() {}
