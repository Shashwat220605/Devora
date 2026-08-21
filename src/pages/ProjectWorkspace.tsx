import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  Code2,
  FileCode2,
  Folder,
  GitBranch,
  Play,
  Save,
  Send,
  Sparkles,
  Terminal,
} from "lucide-react";
import Editor from "@monaco-editor/react";

import api from "../services/api";

interface Project {
  id: string;
  name: string;
  description: string | null;
  language: string | null;
}

const starterFiles = [
  {
    name: "README.md",
    type: "file",
  },
  {
    name: "src",
    type: "folder",
  },
  {
    name: "App.tsx",
    type: "file",
  },
  {
    name: "index.ts",
    type: "file",
  },
];

const starterCode = `import express from "express";

const app = express();
const PORT = 3000;

app.get("/", (_req, res) => {
  res.json({
    message: "Welcome to your Devora project!",
  });
});

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
`;

export default function ProjectWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState(starterCode);
  const [activeFile, setActiveFile] = useState("index.ts");
  const [saved, setSaved] = useState(true);
  const [aiMessage, setAiMessage] = useState("");

  useEffect(() => {
    const loadProject = async () => {
      try {
        const response = await api.get<Project>(`/projects/${id}`);
        setProject(response.data);
      } catch (error) {
        console.error("Failed to load project:", error);
        navigate("/dashboard");
      } finally {
        setLoading(false);
      }
    };

    loadProject();
  }, [id, navigate]);

  const handleEditorChange = (value: string | undefined) => {
    setCode(value ?? "");
    setSaved(false);
  };

  const saveFile = () => {
    setSaved(true);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090b] text-zinc-500">
        Loading project...
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#09090b] text-white">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#0f0f12] px-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/dashboard")}
            className="rounded-lg p-2 text-zinc-500 hover:bg-white/[0.05] hover:text-white"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-black">
              <Code2 size={16} />
            </div>

            <div>
              <p className="text-sm font-medium">{project.name}</p>
              <p className="text-[11px] text-zinc-500">
                {project.language || "Project"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-zinc-600 sm:block">
            {saved ? "Saved" : "Unsaved changes"}
          </span>

          <button
            onClick={saveFile}
            disabled={saved}
            className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.05] disabled:opacity-40"
          >
            <Save size={14} />
            Save
          </button>

          <button className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-medium text-black hover:bg-zinc-200">
            <Play size={14} />
            Run
          </button>
        </div>
      </header>

      {/* Workspace */}
      <div className="flex min-h-0 flex-1">
        {/* File explorer */}
        <aside className="hidden w-60 shrink-0 border-r border-white/10 bg-[#0c0c0f] md:block">
          <div className="flex h-11 items-center justify-between border-b border-white/10 px-4">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Explorer
            </span>

            <span className="text-xs text-zinc-700">
              {starterFiles.length} items
            </span>
          </div>

          <div className="p-2">
            <div className="flex items-center gap-2 rounded-md px-2 py-2 text-xs text-zinc-400 hover:bg-white/[0.04]">
              <ChevronDown size={13} />
              <Folder size={14} />
              {project.name}
            </div>

            <div className="ml-5 mt-1 space-y-1">
              {starterFiles.map((file) => (
                <button
                  key={file.name}
                  onClick={() =>
                    file.type === "file" &&
                    setActiveFile(file.name)
                  }
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition ${
                    activeFile === file.name
                      ? "bg-white/[0.08] text-white"
                      : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
                  }`}
                >
                  {file.type === "folder" ? (
                    <Folder size={14} />
                  ) : (
                    <FileCode2 size={14} />
                  )}

                  {file.name}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Editor */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 bg-[#0f0f12]">
            <div className="flex h-full items-center">
              <div className="flex h-full items-center gap-2 border-r border-white/10 bg-[#09090b] px-4 text-xs text-zinc-300">
                <FileCode2 size={14} />
                {activeFile}
                {!saved && <span className="text-zinc-600">●</span>}
              </div>
            </div>

            <div className="px-3 text-zinc-600">
              <GitBranch size={15} />
            </div>
          </div>

          <div className="min-h-0 flex-1">
            <Editor
              height="100%"
              theme="vs-dark"
              language="typescript"
              value={code}
              onChange={handleEditorChange}
              options={{
                minimap: {
                  enabled: false,
                },
                fontSize: 14,
                padding: {
                  top: 16,
                },
                smoothScrolling: true,
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>

          {/* Bottom terminal */}
          <div className="hidden h-40 shrink-0 border-t border-white/10 bg-[#09090b] lg:block">
            <div className="flex h-9 items-center gap-2 border-b border-white/10 px-4 text-xs text-zinc-500">
              <Terminal size={14} />
              Terminal
            </div>

            <div className="p-4 font-mono text-xs text-zinc-600">
              <p>$ Devora terminal</p>
              <p className="mt-2 text-zinc-700">
                Terminal execution will be connected later.
              </p>
            </div>
          </div>
        </main>

        {/* AI panel */}
        <aside className="hidden w-80 shrink-0 flex-col border-l border-white/10 bg-[#0f0f12] xl:flex">
          <div className="flex h-11 items-center gap-2 border-b border-white/10 px-4">
            <Sparkles size={15} />
            <span className="text-sm font-medium">
              Devora AI
            </span>
          </div>

          <div className="flex flex-1 flex-col">
            <div className="flex-1 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-black">
                  <Bot size={15} />
                </div>

                <div className="rounded-xl bg-white/[0.05] p-3 text-xs leading-5 text-zinc-400">
                  I&apos;m ready to help with{" "}
                  <span className="text-white">
                    {project.name}
                  </span>
                  . Select some code or ask me a question.
                </div>
              </div>

              <div className="mt-5 grid gap-2">
                {[
                  "Explain this file",
                  "Find potential bugs",
                  "Write tests",
                  "Improve this code",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => setAiMessage(prompt)}
                    className="rounded-lg border border-white/10 px-3 py-2 text-left text-xs text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-white/10 p-3">
              <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-black/20 p-2">
                <textarea
                  value={aiMessage}
                  onChange={(event) =>
                    setAiMessage(event.target.value)
                  }
                  placeholder="Ask Devora..."
                  rows={2}
                  className="min-h-10 flex-1 resize-none bg-transparent px-2 py-1 text-xs text-white outline-none placeholder:text-zinc-700"
                />

                <button
                  disabled={!aiMessage.trim()}
                  className="rounded-lg bg-white p-2 text-black disabled:opacity-30"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Status bar */}
      <footer className="flex h-6 shrink-0 items-center justify-between border-t border-white/10 bg-[#0f0f12] px-3 text-[10px] text-zinc-600">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <GitBranch size={10} />
            main
          </span>

          <span className="flex items-center gap-1">
            <Check size={10} />
            Devora ready
          </span>
        </div>

        <span>TypeScript</span>
      </footer>
    </div>
  );
}