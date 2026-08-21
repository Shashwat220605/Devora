import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  Check,
  Code2,
  File,
  FileCode2,
  Folder,
  GitBranch,
  Github,
  Play,
  Plus,
  Save,
  Send,
  Sparkles,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import Editor from "@monaco-editor/react";

import api from "../services/api";

interface Project {
  id: string;
  name: string;
  description: string | null;
  language: string | null;
}

interface ProjectFile {
  id: string;
  path: string;
  content: string;
  language: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ImportResult {
  message: string;
  repository: {
    name: string;
    url: string;
    branch: string;
  };
  filesImported: number;
}

const starterFiles = [
  {
    path: "README.md",
    content:
      "# Welcome to Devora\n\nStart building your project here.\n",
  },
  {
    path: "src/index.ts",
    content:
      'const message = "Welcome to Devora";\n\nconsole.log(message);\n',
  },
];

function detectLanguage(path: string, fallback = "plaintext") {
  const extension = path.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "css":
      return "css";
    case "html":
      return "html";
    case "py":
      return "python";
    case "java":
      return "java";
    case "cpp":
    case "cc":
    case "cxx":
      return "cpp";
    case "c":
      return "c";
    case "md":
      return "markdown";
    case "sql":
      return "sql";
    case "xml":
      return "xml";
    default:
      return fallback;
  }
}

function getFileName(path: string) {
  return path.split("/").pop() || path;
}

export default function ProjectWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);

  const [creatingFile, setCreatingFile] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);

  const [showGithubImport, setShowGithubImport] = useState(false);
  const [githubUrl, setGithubUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const [aiMessage, setAiMessage] = useState("");

  const activeFile = useMemo(
    () => files.find((file) => file.id === activeFileId) || null,
    [files, activeFileId],
  );

  useEffect(() => {
    const loadWorkspace = async () => {
      if (!id) {
        navigate("/dashboard");
        return;
      }

      try {
        setLoading(true);

        const [projectResponse, filesResponse] = await Promise.all([
          api.get<Project>(`/projects/${id}`),
          api.get<ProjectFile[]>(`/projects/${id}/files`),
        ]);

        setProject(projectResponse.data);

        let loadedFiles = filesResponse.data;

        if (loadedFiles.length === 0) {
          const createdFiles: ProjectFile[] = [];

          for (const starter of starterFiles) {
            const response = await api.post<ProjectFile>(
              `/projects/${id}/files`,
              starter,
            );
            createdFiles.push(response.data);
          }

          loadedFiles = createdFiles;
        }

        setFiles(loadedFiles);

        if (loadedFiles.length > 0) {
          setActiveFileId(loadedFiles[0].id);
          setCode(loadedFiles[0].content);
        }

        setSaved(true);
      } catch (error) {
        console.error("Failed to load project workspace:", error);
        navigate("/dashboard");
      } finally {
        setLoading(false);
      }
    };

    void loadWorkspace();
  }, [id, navigate]);

  const openFile = (file: ProjectFile) => {
    setActiveFileId(file.id);
    setCode(file.content);
    setSaved(true);
  };

  const saveFile = async () => {
    if (!activeFile || !id) return;

    try {
      setSaving(true);

      const response = await api.put<ProjectFile>(
        `/projects/${id}/files/${activeFile.id}`,
        { content: code },
      );

      setFiles((current) =>
        current.map((file) =>
          file.id === activeFile.id ? response.data : file,
        ),
      );

      setSaved(true);
    } catch (error) {
      console.error("Failed to save file:", error);
    } finally {
      setSaving(false);
    }
  };

  const createFile = async () => {
    const path = newFilePath.trim();

    if (!id || !path) return;

    try {
      const response = await api.post<ProjectFile>(
        `/projects/${id}/files`,
        { path, content: "" },
      );

      setFiles((current) => [...current, response.data]);
      setActiveFileId(response.data.id);
      setCode("");
      setSaved(true);
      setNewFilePath("");
      setCreatingFile(false);
    } catch (error: any) {
      window.alert(
        error.response?.data?.message || "Failed to create file.",
      );
    }
  };

  const deleteFile = async (file: ProjectFile) => {
    if (!id || !window.confirm(`Delete ${file.path}? This cannot be undone.`)) {
      return;
    }

    try {
      setDeletingFileId(file.id);
      await api.delete(`/projects/${id}/files/${file.id}`);

      const remaining = files.filter((item) => item.id !== file.id);
      setFiles(remaining);

      if (activeFileId === file.id) {
        const next = remaining[0] || null;
        setActiveFileId(next?.id ?? null);
        setCode(next?.content ?? "");
        setSaved(true);
      }
    } catch (error) {
      console.error("Failed to delete file:", error);
    } finally {
      setDeletingFileId(null);
    }
  };

  const importGithubRepository = async () => {
    if (!id || !githubUrl.trim()) return;

    try {
      setImporting(true);
      setImportError("");
      setImportResult(null);

      const response = await api.post<ImportResult>("/github/import", {
        projectId: id,
        repositoryUrl: githubUrl.trim(),
      });

      const refreshed = await api.get<ProjectFile[]>(
        `/projects/${id}/files`,
      );

      setFiles(refreshed.data);

      if (refreshed.data.length > 0) {
        const first = refreshed.data[0];
        setActiveFileId(first.id);
        setCode(first.content);
      }

      setSaved(true);
      setImportResult(response.data);
      setGithubUrl("");
    } catch (error: any) {
      console.error("GitHub import failed:", error);
      setImportError(
        error.response?.data?.message ||
          "Unable to import the GitHub repository.",
      );
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090b] text-zinc-500">
        Loading project...
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#09090b] text-white">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#0f0f12] px-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => navigate("/dashboard")}
            className="rounded-lg p-2 text-zinc-500 hover:bg-white/[0.05] hover:text-white"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-black">
            <Code2 size={16} />
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{project.name}</p>
            <p className="text-[11px] text-zinc-500">
              {project.language || "Development project"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowGithubImport(true);
              setImportError("");
              setImportResult(null);
            }}
            className="hidden items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.05] sm:flex"
          >
            <Github size={14} />
            Import GitHub
          </button>

          <span className="hidden text-xs text-zinc-600 lg:block">
            {saving ? "Saving..." : saved ? "Saved" : "Unsaved changes"}
          </span>

          <button
            onClick={() => void saveFile()}
            disabled={saving || saved || !activeFile}
            className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.05] disabled:opacity-40"
          >
            <Save size={14} />
            Save
          </button>

          <button
            disabled
            className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-medium text-black opacity-60"
          >
            <Play size={14} />
            Run
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-[#0c0c0f] md:flex">
          <div className="flex h-11 items-center justify-between border-b border-white/10 px-4">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Explorer
            </span>

            <div className="flex items-center gap-1">
              <span className="mr-1 text-xs text-zinc-700">{files.length}</span>
              <button
                onClick={() => setCreatingFile(true)}
                className="rounded-md p-1.5 text-zinc-600 hover:bg-white/[0.05] hover:text-white"
                title="New file"
              >
                <Plus size={15} />
              </button>
            </div>
          </div>

          {creatingFile && (
            <div className="border-b border-white/10 p-3">
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={newFilePath}
                  onChange={(event) => setNewFilePath(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void createFile();
                    if (event.key === "Escape") {
                      setCreatingFile(false);
                      setNewFilePath("");
                    }
                  }}
                  placeholder="src/example.ts"
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-2 py-2 text-xs outline-none focus:border-white/20"
                />

                <button
                  onClick={() => void createFile()}
                  className="rounded-md bg-white px-2 text-black"
                >
                  <Check size={14} />
                </button>

                <button
                  onClick={() => {
                    setCreatingFile(false);
                    setNewFilePath("");
                  }}
                  className="rounded-md border border-white/10 px-2 text-zinc-500 hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <div className="flex items-center gap-2 rounded-md px-2 py-2 text-xs text-zinc-400">
              <Folder size={14} />
              <span className="truncate">{project.name}</span>
            </div>

            <div className="mt-1 space-y-1">
              {files.map((file) => (
                <div
                  key={file.id}
                  className={`group flex items-center rounded-md ${
                    activeFileId === file.id ? "bg-white/[0.08]" : ""
                  }`}
                >
                  <button
                    onClick={() => openFile(file)}
                    className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-xs ${
                      activeFileId === file.id
                        ? "text-white"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <File size={14} className="shrink-0" />
                    <span className="truncate">{file.path}</span>
                  </button>

                  <button
                    onClick={() => void deleteFile(file)}
                    disabled={deletingFileId === file.id}
                    className="mr-1 rounded p-1 text-zinc-700 opacity-0 hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100 disabled:opacity-40"
                    title="Delete file"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 bg-[#0f0f12]">
            <div className="flex h-full items-center">
              {activeFile && (
                <div className="flex h-full max-w-xs items-center gap-2 border-r border-white/10 bg-[#09090b] px-4 text-xs text-zinc-300">
                  <FileCode2 size={14} />
                  <span className="truncate">{getFileName(activeFile.path)}</span>
                  {!saved && <span className="text-zinc-500">●</span>}
                </div>
              )}
            </div>

            <div className="px-3 text-zinc-600">
              <GitBranch size={15} />
            </div>
          </div>

          <div className="min-h-0 flex-1">
            {activeFile ? (
              <Editor
                height="100%"
                theme="vs-dark"
                language={detectLanguage(
                  activeFile.path,
                  activeFile.language || "plaintext",
                )}
                value={code}
                onChange={(value) => {
                  setCode(value ?? "");
                  setSaved(false);
                }}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  padding: { top: 16 },
                  smoothScrolling: true,
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  wordWrap: "on",
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-600">
                Create a file to start coding.
              </div>
            )}
          </div>

          <div className="hidden h-40 shrink-0 border-t border-white/10 bg-[#09090b] lg:block">
            <div className="flex h-9 items-center gap-2 border-b border-white/10 px-4 text-xs text-zinc-500">
              <Terminal size={14} />
              Terminal
            </div>

            <div className="p-4 font-mono text-xs text-zinc-600">
              <p>$ devora terminal</p>
              <p className="mt-2 text-zinc-700">
                Secure execution will be added later.
              </p>
            </div>
          </div>
        </main>

        <aside className="hidden w-80 shrink-0 flex-col border-l border-white/10 bg-[#0f0f12] xl:flex">
          <div className="flex h-11 items-center gap-2 border-b border-white/10 px-4">
            <Sparkles size={15} />
            <span className="text-sm font-medium">Devora AI</span>
          </div>

          <div className="flex flex-1 flex-col">
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-black">
                  <Bot size={15} />
                </div>

                <div className="rounded-xl bg-white/[0.05] p-3 text-xs leading-5 text-zinc-400">
                  I&apos;m ready to help with{" "}
                  <span className="text-white">{project.name}</span>.
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
                  onChange={(event) => setAiMessage(event.target.value)}
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
        <span>{activeFile ? detectLanguage(activeFile.path) : "No file"}</span>
      </footer>

      {showGithubImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#101014] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Github size={18} />
                  <h3 className="text-xl font-semibold">Import GitHub repository</h3>
                </div>
                <p className="mt-2 text-sm text-zinc-500">
                  Import a public GitHub repository into this Devora project.
                </p>
              </div>

              <button
                onClick={() => setShowGithubImport(false)}
                className="rounded-lg p-2 text-zinc-500 hover:bg-white/[0.05] hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6">
              <label className="mb-2 block text-sm text-zinc-400">
                Repository URL
              </label>
              <input
                value={githubUrl}
                onChange={(event) => setGithubUrl(event.target.value)}
                placeholder="https://github.com/owner/repository"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-zinc-700 focus:border-white/20"
              />
              <p className="mt-2 text-xs text-zinc-600">
                Public repositories only for this first GitHub integration.
              </p>
            </div>

            {importError && (
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {importError}
              </div>
            )}

            {importResult && (
              <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                Imported {importResult.filesImported} files from{" "}
                <strong>{importResult.repository.name}</strong> on branch{" "}
                <strong>{importResult.repository.branch}</strong>.
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowGithubImport(false)}
                className="flex-1 rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-400 hover:bg-white/[0.05] hover:text-white"
              >
                Close
              </button>

              <button
                onClick={() => void importGithubRepository()}
                disabled={importing || !githubUrl.trim()}
                className="flex-1 rounded-xl bg-white px-4 py-3 text-sm font-medium text-black hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importing ? "Importing..." : "Import repository"}
              </button>
            </div>

            <div className="mt-4 text-xs text-zinc-700">
              GitHub authentication for private repositories will be added next.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
