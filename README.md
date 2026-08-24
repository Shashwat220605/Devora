# Devora

**AI Developer Workspace for coding, project intelligence, GitHub workflows, and deployments.**

Devora is a developer workspace that brings everyday software-engineering tasks into one interface. It combines an AI coding assistant with project-aware context, code execution, GitHub workflows, source control, pull-request tooling, deployment checks, and persistent project memory.

## 🌐 Live Demo

**Devora:** [Open Devora](https://devora-rose.vercel.app/)

## ✨ What Devora Includes

### 🤖 AI Assistant
- Gemini-powered developer assistant
- Project-aware conversations
- Relevant project files are included as context
- Markdown/code responses are rendered in a developer-friendly format
- Copyable code blocks
- Conversation history support

### 🧠 Project-aware AI
- Select a Devora project before chatting
- AI can use relevant source files, project metadata, and saved project memory
- Sensitive files such as `.env`, private keys, and credential files are excluded from AI context

### 🩺 AI Error Doctor
- Detect runtime/build errors from the Code Runner
- Send the error, code, and project context to Devora AI
- Receive:
  - Summary
  - Likely cause
  - Suggested fix
  - Suggested replacement code
  - Confidence level
- Apply the suggested code after reviewing it

### 🪄 AI Code Actions
- Explain code
- Fix code
- Refactor code
- Generate tests
- Review proposed changes before applying them

### 🔀 AI Diff & Apply
- Generate proposed code changes
- Review before modifying project files
- View additions/deletions
- Apply or reject proposed changes

### 🌿 GitHub Integration
- GitHub OAuth connection
- Repository browsing/import
- Repository synchronization
- Source-control workflow
- Pull request creation
- Pull request comments
- Pull request merging
- GitHub diff viewing

### 🧑‍💻 Source Control
- View changed files
- Added/modified/deleted status
- Addition/deletion counts
- Select changes
- AI-generated commit messages
- Commit and push selected changes

### 👀 AI Pull Request Review
- Review pull-request title, description, changed files, and patches
- Risk classification
- Findings grouped as blocker, warning, suggestion, or info
- Actionable review recommendation
- Project context can be included in reviews

### 🚀 Deployment Center
- Deployment preflight checks
- Project/package configuration checks
- Sensitive-file checks
- File-size validation
- Build/deployment readiness information
- Production deployment workflow support

### 💾 Project Memory
Store durable project knowledge such as:
- Architecture
- Tech stack
- Coding conventions
- Engineering decisions
- Known bugs
- Deployment notes
- General project notes

Project memory is persisted per project and is automatically available to project-aware AI features.

### ▶️ Code Runner
Browser-based execution for basic languages:
- JavaScript
- HTML
- CSS

JavaScript executes inside an isolated browser sandbox with console output, errors, result capture, and a timeout.

## 🧱 Tech Stack

### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS
- Monaco Editor
- Axios
- React Router
- Lucide React

### Backend
- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL / Neon
- Cloudflare Workers

### AI
- Google Gemini API
- Gemini Flash-Lite model configured for Devora's developer-assistant workflows

### Integrations
- GitHub API / GitHub OAuth
- Vercel for frontend deployment
- Cloudflare Workers for backend deployment

## 🏗️ High-Level Architecture

```text
┌─────────────────────────────┐
│          Devora UI          │
│ React + Vite + TypeScript   │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│        Devora API           │
│ Express + TypeScript        │
│ Cloudflare Workers          │
└───────┬─────────┬───────────┘
        │         │
        │         ├──────────────► GitHub API
        │         │
        │         └──────────────► Gemini API
        │
        ▼
┌─────────────────────────────┐
│         Prisma ORM          │
│      PostgreSQL / Neon      │
└─────────────────────────────┘
```

## 📁 Main Frontend Areas

```text
src/
├── pages/
│   ├── AIChat.tsx
│   ├── AICodeActions.tsx
│   ├── CodeRunner.tsx
│   ├── SourceControl.tsx
│   ├── DeploymentCenter.tsx
│   ├── ProjectMemory.tsx
│   ├── PullRequestCenter.tsx
│   └── ProjectWorkspaceFinal.tsx
├── services/
└── App.tsx
```

## 📁 Main Backend Areas

```text
server/src/
├── routes/
│   ├── ai.routes.ts
│   ├── github-pr.routes.ts
│   ├── github-sync.routes.ts
│   ├── deployment.routes.ts
│   └── ...
├── middleware/
├── lib/
├── app.ts
└── worker.ts
```

## 🚀 Local Development

### Frontend

```bash
npm install
npm run dev
```

Build the frontend:

```bash
npm run build
```

### Backend

```bash
cd server
npm install
npm run dev
```

Build the backend:

```bash
npm run build
```

Deploy the Cloudflare Worker:

```bash
npm run cf-deploy
```

## 🔐 Environment Variables

The exact configuration depends on your local/deployment setup. The backend uses secrets/configuration including:

```text
DATABASE_URL
FRONTEND_URL
JWT_SECRET
GITHUB_OAUTH_CLIENT_ID
GITHUB_OAUTH_CLIENT_SECRET
GITHUB_TOKEN_ENCRYPTION_KEY
GEMINI_API_KEY
```

Never commit real secrets to GitHub. Devora intentionally excludes common environment files, private keys, and credential files from AI project context.

## 🔒 Security Notes

- Authenticated API routes require the Devora authentication middleware.
- GitHub credentials are encrypted before persistent storage.
- AI project context filters sensitive file paths.
- Code Runner JavaScript execution uses a browser sandbox rather than executing arbitrary code on the backend worker.
- GitHub operations are performed through authenticated API requests.

## 🛣️ Roadmap

Planned/next-stage improvements include:

- Persistent AI review history
- Richer Git-style diff visualization
- Deployment logs and rollback controls
- Branch management
- Test execution workflows
- More complete project intelligence and automated context generation

## 📌 Project Status

Devora is an actively developed project. Core AI, GitHub, code-runner, source-control, project-memory, deployment, and pull-request workflows are implemented and continue to be refined.

## 📄 License

This repository is currently private and does not define a public open-source license.
