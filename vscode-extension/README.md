# Devora for VS Code

A lightweight VS Code companion for Devora.

## Commands

- `Devora: Pull Changes` runs `git pull --ff-only` in the current workspace.
- `Devora: Push Changes` stages, commits, and pushes local changes.
- `Devora: Open Project Workspace` opens Devora in your browser.

## Local development

```bash
cd vscode-extension
npm install
npm run compile
```

Then open the `vscode-extension` folder in VS Code and press `F5` to launch an Extension Development Host.

## Important

This first version deliberately uses the local Git repository as the secure bridge. It does not expose your filesystem to the Devora web app or execute arbitrary remote code locally.

The next iteration can add authenticated Devora project linking and explicit `Pull from Devora` / `Push to Devora` commands once the API contract is finalized.
