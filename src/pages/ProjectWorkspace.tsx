import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  Check,
  Code2,
  Download,
  File,
  FileCode2,
  Folder,
  GitBranch,
  Play,
  Plus,
  Save,
  Send,
  Sparkles,
  Terminal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Editor from "@monaco-editor/react";

import api from "../services/api";

interface Repository {
  id: string;
  name: string;
  url: string;
  provider: string;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  language: string | null;
  repositories?: Repository[];
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

interface GitHubStatus {
  connected: boolean;
  username: string | null;
}

interface PushResult {
  message: string;
  branch: string;
  commitUrl: string | null;
  filesPushed: number;
}

function detectLanguage(
  path: string,
  fallback = "plaintext",
) {
  const extension = path
    .split(".")
    .pop()
    ?.toLowerCase();

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

    case "cs":
      return "csharp";

    case "go":
      return "go";

    case "rs":
      return "rust";

    case "sql":
      return "sql";

    case "md":
      return "markdown";

    case "xml":
      return "xml";

    case "sh":
      return "shell";

    default:
      return fallback;
  }
}

function getFileName(path: string) {
  const pieces = path.split("/");

  return pieces[pieces.length - 1] || path;
}

export default function ProjectWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [project, setProject] =
    useState<Project | null>(null);

  const [files, setFiles] = useState<
    ProjectFile[]
  >([]);

  const [activeFileId, setActiveFileId] =
    useState<string | null>(null);

  const [code, setCode] = useState("");

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [saved, setSaved] =
    useState(true);

  const [creatingFile, setCreatingFile] =
    useState(false);

  const [newFilePath, setNewFilePath] =
    useState("");

  const [deletingFileId, setDeletingFileId] =
    useState<string | null>(null);

  const [showGitHub, setShowGitHub] =
    useState(false);

  const [githubUrl, setGithubUrl] =
    useState("");

  const [githubToken, setGithubToken] =
    useState("");

  const [githubStatus, setGithubStatus] =
    useState<GitHubStatus>({
      connected: false,
      username: null,
    });

  const [githubBusy, setGithubBusy] =
    useState(false);

  const [githubError, setGithubError] =
    useState("");

  const [githubMessage, setGithubMessage] =
    useState("");

  const [aiMessage, setAiMessage] =
    useState("");

  const activeFile = useMemo(() => {
    return (
      files.find(
        (file) =>
          file.id === activeFileId,
      ) || null
    );
  }, [files, activeFileId]);

  const loadGitHubStatus = async () => {
    try {
      const response =
        await api.get<GitHubStatus>(
          "/github/status",
        );

      setGithubStatus(response.data);
    } catch (error) {
      console.error(
        "GitHub status failed:",
        error,
      );
    }
  };

  useEffect(() => {
    const loadWorkspace = async () => {
      if (!id) {
        navigate("/dashboard");
        return;
      }

      try {
        setLoading(true);

        const [
          projectResponse,
          filesResponse,
        ] = await Promise.all([
          api.get<Project>(
            `/projects/${id}`,
          ),

          api.get<ProjectFile[]>(
            `/projects/${id}/files`,
          ),
        ]);

        setProject(
          projectResponse.data,
        );

        let loadedFiles =
          filesResponse.data;

        /*
          Create starter files only when
          this project has no files.
        */

        if (loadedFiles.length === 0) {
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

          loadedFiles = [];

          for (const starterFile of starterFiles) {
            const response =
              await api.post<ProjectFile>(
                `/projects/${id}/files`,
                starterFile,
              );

            loadedFiles.push(
              response.data,
            );
          }
        }

        setFiles(loadedFiles);

        if (loadedFiles.length > 0) {
          setActiveFileId(
            loadedFiles[0].id,
          );

          setCode(
            loadedFiles[0].content,
          );
        }

        setSaved(true);

        await loadGitHubStatus();
      } catch (error) {
        console.error(
          "Failed to load project workspace:",
          error,
        );

        navigate("/dashboard");
      } finally {
        setLoading(false);
      }
    };

    void loadWorkspace();
  }, [id, navigate]);

  const openFile = (
    file: ProjectFile,
  ) => {
    setActiveFileId(file.id);
    setCode(file.content);
    setSaved(true);
  };

  const saveFile = async () => {
    if (!activeFile || !id) {
      return;
    }

    try {
      setSaving(true);

      const response =
        await api.put<ProjectFile>(
          `/projects/${id}/files/${activeFile.id}`,
          {
            content: code,
          },
        );

      setFiles((current) =>
        current.map((file) =>
          file.id === activeFile.id
            ? response.data
            : file,
        ),
      );

      setSaved(true);
    } catch (error) {
      console.error(
        "Failed to save file:",
        error,
      );
    } finally {
      setSaving(false);
    }
  };

  const createFile = async () => {
    if (!id) {
      return;
    }

    const path =
      newFilePath.trim();

    if (!path) {
      return;
    }

    try {
      const response =
        await api.post<ProjectFile>(
          `/projects/${id}/files`,
          {
            path,
            content: "",
          },
        );

      setFiles((current) => [
        ...current,
        response.data,
      ]);

      setActiveFileId(
        response.data.id,
      );

      setCode("");

      setSaved(true);

      setNewFilePath("");

      setCreatingFile(false);
    } catch (error: any) {
      console.error(
        "Failed to create file:",
        error,
      );

      window.alert(
        error.response?.data?.message ||
          "Failed to create file.",
      );
    }
  };

  const deleteFile = async (
    file: ProjectFile,
  ) => {
    if (!id) {
      return;
    }

    const confirmed =
      window.confirm(
        `Delete ${file.path}? This cannot be undone.`,
      );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingFileId(
        file.id,
      );

      await api.delete(
        `/projects/${id}/files/${file.id}`,
      );

      const remaining =
        files.filter(
          (item) =>
            item.id !== file.id,
        );

      setFiles(remaining);

      if (
        activeFileId === file.id
      ) {
        const nextFile =
          remaining[0] || null;

        setActiveFileId(
          nextFile?.id ?? null,
        );

        setCode(
          nextFile?.content ?? "",
        );

        setSaved(true);
      }
    } catch (error) {
      console.error(
        "Failed to delete file:",
        error,
      );
    } finally {
      setDeletingFileId(null);
    }
  };

  const connectGitHub = async () => {
    const token =
      githubToken.trim();

    if (!token) {
      return;
    }

    try {
      setGithubBusy(true);
      setGithubError("");
      setGithubMessage("");

      const response =
        await api.post<GitHubStatus>(
          "/github/connect",
          {
            token,
          },
        );

      setGithubStatus(
        response.data,
      );

      setGithubToken("");

      setGithubMessage(
        `Connected as ${response.data.username}.`,
      );
    } catch (error: any) {
      console.error(
        "GitHub connect failed:",
        error,
      );

      setGithubError(
        error.response?.data
          ?.message ||
          "Unable to connect GitHub.",
      );
    } finally {
      setGithubBusy(false);
    }
  };

  const disconnectGitHub =
    async () => {
      try {
        setGithubBusy(true);
        setGithubError("");
        setGithubMessage("");

        await api.post(
          "/github/disconnect",
        );

        setGithubStatus({
          connected: false,
          username: null,
        });

        setGithubMessage(
          "GitHub disconnected.",
        );
      } catch (error: any) {
        console.error(
          "GitHub disconnect failed:",
          error,
        );

        setGithubError(
          error.response?.data
            ?.message ||
            "Unable to disconnect GitHub.",
        );
      } finally {
        setGithubBusy(false);
      }
    };

  const importGitHub =
    async () => {
      if (!id) {
        return;
      }

      const url =
        githubUrl.trim();

      if (!url) {
        return;
      }

      try {
        setGithubBusy(true);
        setGithubError("");
        setGithubMessage("");

        const response =
          await api.post<ImportResult>(
            "/github/import",
            {
              projectId: id,
              repositoryUrl: url,
            },
          );

        const refreshed =
          await api.get<
            ProjectFile[]
          >(
            `/projects/${id}/files`,
          );

        setFiles(refreshed.data);

        if (
          refreshed.data.length > 0
        ) {
          setActiveFileId(
            refreshed.data[0].id,
          );

          setCode(
            refreshed.data[0]
              .content,
          );
        }

        setSaved(true);

        setGithubMessage(
          `Imported ${response.data.filesImported} files from ${response.data.repository.name}.`,
        );

        setGithubUrl("");
      } catch (error: any) {
        console.error(
          "GitHub import failed:",
          error,
        );

        setGithubError(
          error.response?.data
            ?.message ||
            "Unable to import repository.",
        );
      } finally {
        setGithubBusy(false);
      }
    };

  const pushToGitHub =
    async () => {
      if (!id) {
        return;
      }

      const url =
        githubUrl.trim();

      if (!url) {
        setGithubError(
          "Enter a GitHub repository URL first.",
        );

        return;
      }

      try {
        setGithubBusy(true);
        setGithubError("");
        setGithubMessage("");

        const response =
          await api.post<PushResult>(
            "/github/push",
            {
              projectId: id,
              repositoryUrl: url,
            },
          );

        setGithubMessage(
          `${response.data.message}: ${response.data.filesPushed} files pushed to ${response.data.branch}.`,
        );
      } catch (error: any) {
        console.error(
          "GitHub push failed:",
          error,
        );

        setGithubError(
          error.response?.data
            ?.message ||
            "Unable to push changes to GitHub.",
        );
      } finally {
        setGithubBusy(false);
      }
    };

  const openChangesPage = () => {
    if (!id) {
      return;
    }

    navigate(
      `/projects/${id}/changes`,
    );
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
      {/* HEADER */}

      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#0f0f12] px-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() =>
              navigate("/dashboard")
            }
            className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/[0.05] hover:text-white"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-black">
            <Code2 size={16} />
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {project.name}
            </p>

            <p className="text-[11px] text-zinc-500">
              {project.language ||
                "Development project"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* CHANGES */}

          <button
            onClick={
              openChangesPage
            }
            className="hidden items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 transition hover:bg-white/[0.05] sm:flex"
          >
            <GitBranch size={14} />
            Changes
          </button>

          {/* GITHUB */}

          <button
            onClick={() => {
              setShowGitHub(true);
              setGithubError("");
              setGithubMessage("");
            }}
            className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 transition hover:bg-white/[0.05]"
          >
            <GitBranch size={14} />

            <span className="hidden sm:inline">
              {githubStatus.connected
                ? githubStatus.username
                : "GitHub"}
            </span>
          </button>

          <span className="hidden text-xs text-zinc-600 lg:block">
            {saving
              ? "Saving..."
              : saved
                ? "Saved"
                : "Unsaved changes"}
          </span>

          {/* SAVE */}

          <button
            onClick={() =>
              void saveFile()
            }
            disabled={
              saving ||
              saved ||
              !activeFile
            }
            className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 transition hover:bg-white/[0.05] disabled:opacity-40"
          >
            <Save size={14} />
            Save
          </button>

          {/* RUN */}

          <button
            disabled
            className="hidden items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-medium text-black opacity-60 sm:flex"
          >
            <Play size={14} />
            Run
          </button>
        </div>
      </header>

      {/* WORKSPACE */}

      <div className="flex min-h-0 flex-1">
        {/* EXPLORER */}

        <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-[#0c0c0f] md:flex">
          <div className="flex h-11 items-center justify-between border-b border-white/10 px-4">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Explorer
            </span>

            <div className="flex items-center gap-1">
              <span className="mr-1 text-xs text-zinc-700">
                {files.length}
              </span>

              <button
                onClick={() =>
                  setCreatingFile(
                    true,
                  )
                }
                title="New file"
                className="rounded-md p-1.5 text-zinc-600 transition hover:bg-white/[0.05] hover:text-white"
              >
                <Plus size={15} />
              </button>
            </div>
          </div>

          {/* NEW FILE */}

          {creatingFile && (
            <div className="border-b border-white/10 p-3">
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={newFilePath}
                  onChange={(event) =>
                    setNewFilePath(
                      event.target.value,
                    )
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key ===
                      "Enter"
                    ) {
                      void createFile();
                    }

                    if (
                      event.key ===
                      "Escape"
                    ) {
                      setCreatingFile(
                        false,
                      );

                      setNewFilePath(
                        "",
                      );
                    }
                  }}
                  placeholder="src/example.ts"
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-2 py-2 text-xs outline-none placeholder:text-zinc-700 focus:border-white/20"
                />

                <button
                  onClick={() =>
                    void createFile()
                  }
                  className="rounded-md bg-white px-2 text-black"
                >
                  <Check size={14} />
                </button>

                <button
                  onClick={() => {
                    setCreatingFile(
                      false,
                    );
                    setNewFilePath(
                      "",
                    );
                  }}
                  className="rounded-md border border-white/10 px-2 text-zinc-500 transition hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* FILE TREE */}

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <div className="flex items-center gap-2 rounded-md px-2 py-2 text-xs text-zinc-400">
              <Folder size={14} />

              <span className="truncate">
                {project.name}
              </span>
            </div>

            <div className="mt-1 space-y-1">
              {files.map((file) => {
                const active =
                  activeFileId ===
                  file.id;

                return (
                  <div
                    key={file.id}
                    className={`group flex items-center rounded-md ${
                      active
                        ? "bg-white/[0.08]"
                        : ""
                    }`}
                  >
                    <button
                      onClick={() =>
                        openFile(file)
                      }
                      className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-xs ${
                        active
                          ? "text-white"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      <File
                        size={14}
                        className="shrink-0"
                      />

                      <span className="truncate">
                        {file.path}
                      </span>
                    </button>

                    <button
                      onClick={() =>
                        void deleteFile(
                          file,
                        )
                      }
                      disabled={
                        deletingFileId ===
                        file.id
                      }
                      title="Delete file"
                      className="mr-1 rounded p-1 text-zinc-700 opacity-0 transition hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                    >
                      <Trash2
                        size={12}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* EDITOR */}

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 bg-[#0f0f12]">
            <div className="flex h-full min-w-0 items-center">
              {activeFile && (
                <div className="flex h-full max-w-xs items-center gap-2 border-r border-white/10 bg-[#09090b] px-4 text-xs text-zinc-300">
                  <FileCode2 size={14} />

                  <span className="truncate">
                    {getFileName(
                      activeFile.path,
                    )}
                  </span>

                  {!saved && (
                    <span className="text-zinc-500">
                      ●
                    </span>
                  )}
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
                  activeFile.language ||
                    "plaintext",
                )}
                value={code}
                onChange={(value) => {
                  setCode(value ?? "");
                  setSaved(false);
                }}
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
                  wordWrap: "on",
                  renderWhitespace:
                    "selection",
                  tabSize: 2,
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-600">
                Create or select a file
                to begin.
              </div>
            )}
          </div>

          {/* TERMINAL */}

          <div className="hidden h-40 shrink-0 border-t border-white/10 bg-[#09090b] lg:block">
            <div className="flex h-9 items-center gap-2 border-b border-white/10 px-4 text-xs text-zinc-500">
              <Terminal size={14} />
              Terminal
            </div>

            <div className="p-4 font-mono text-xs text-zinc-600">
              <p>
                $ devora terminal
              </p>

              <p className="mt-2 text-zinc-700">
                Secure code execution will
                be connected in a later
                stage.
              </p>
            </div>
          </div>
        </main>

        {/* AI PANEL */}

        <aside className="hidden w-80 shrink-0 flex-col border-l border-white/10 bg-[#0f0f12] xl:flex">
          <div className="flex h-11 items-center gap-2 border-b border-white/10 px-4">
            <Sparkles size={15} />

            <span className="text-sm font-medium">
              Devora AI
            </span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-black">
                  <Bot size={15} />
                </div>

                <div className="rounded-xl bg-white/[0.05] p-3 text-xs leading-5 text-zinc-400">
                  I&apos;m ready to help with{" "}
                  <span className="text-white">
                    {project.name}
                  </span>
                  .
                </div>
              </div>

              <div className="mt-5 grid gap-2">
                {[
                  "Explain this file",
                  "Find potential bugs",
                  "Write tests",
                  "Improve this code",
                ].map(
                  (prompt) => (
                    <button
                      key={prompt}
                      onClick={() =>
                        setAiMessage(
                          prompt,
                        )
                      }
                      className="rounded-lg border border-white/10 px-3 py-2 text-left text-xs text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-300"
                    >
                      {prompt}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="border-t border-white/10 p-3">
              <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-black/20 p-2">
                <textarea
                  value={aiMessage}
                  onChange={(event) =>
                    setAiMessage(
                      event.target.value,
                    )
                  }
                  placeholder="Ask Devora..."
                  rows={2}
                  className="min-h-10 flex-1 resize-none bg-transparent px-2 py-1 text-xs text-white outline-none placeholder:text-zinc-700"
                />

                <button
                  disabled={
                    !aiMessage.trim()
                  }
                  className="rounded-lg bg-white p-2 text-black disabled:opacity-30"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* STATUS BAR */}

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

        <span>
          {activeFile
            ? detectLanguage(
                activeFile.path,
                activeFile.language ||
                  "plaintext",
              )
            : "No file"}
        </span>
      </footer>

      {/* GITHUB MODAL */}

      {showGitHub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#101014] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <GitBranch size={18} />

                  <h2 className="text-lg font-semibold">
                    GitHub
                  </h2>
                </div>

                <p className="mt-1 text-sm text-zinc-500">
                  Connect a GitHub account and
                  import or push repositories.
                </p>
              </div>

              <button
                onClick={() =>
                  setShowGitHub(false)
                }
                className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/[0.05] hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {githubError && (
              <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {githubError}
              </div>
            )}

            {githubMessage && (
              <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                {githubMessage}
              </div>
            )}

            {/* CONNECTION */}

            <div className="mt-6 rounded-xl border border-white/10 bg-black/10 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">
                    GitHub connection
                  </p>

                  <p className="mt-1 text-xs text-zinc-600">
                    {githubStatus.connected
                      ? `Connected as ${githubStatus.username}`
                      : "Not connected"}
                  </p>
                </div>

                {githubStatus.connected ? (
                  <button
                    onClick={() =>
                      void disconnectGitHub()
                    }
                    disabled={
                      githubBusy
                    }
                    className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-40"
                  >
                    Disconnect
                  </button>
                ) : (
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-zinc-600">
                    Not connected
                  </span>
                )}
              </div>

              {!githubStatus.connected && (
                <div className="mt-4">
                  <input
                    type="password"
                    value={githubToken}
                    onChange={(event) =>
                      setGithubToken(
                        event.target.value,
                      )
                    }
                    placeholder="GitHub personal access token"
                    className="w-full rounded-xl border border-white/10 bg-[#09090b] px-4 py-3 text-sm outline-none placeholder:text-zinc-700 focus:border-white/20"
                  />

                  <button
                    onClick={() =>
                      void connectGitHub()
                    }
                    disabled={
                      githubBusy ||
                      !githubToken.trim()
                    }
                    className="mt-3 w-full rounded-xl bg-white px-4 py-3 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:opacity-40"
                  >
                    {githubBusy
                      ? "Connecting..."
                      : "Connect GitHub"}
                  </button>
                </div>
              )}
            </div>

            {/* REPOSITORY */}

            <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-4">
              <p className="text-sm font-medium">
                Repository
              </p>

              <p className="mt-1 text-xs text-zinc-600">
                Example:
                https://github.com/owner/repository
              </p>

              <input
                value={githubUrl}
                onChange={(event) =>
                  setGithubUrl(
                    event.target.value,
                  )
                }
                placeholder="https://github.com/owner/repository"
                className="mt-4 w-full rounded-xl border border-white/10 bg-[#09090b] px-4 py-3 text-sm outline-none placeholder:text-zinc-700 focus:border-white/20"
              />

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  onClick={() =>
                    void importGitHub()
                  }
                  disabled={
                    githubBusy ||
                    !githubUrl.trim()
                  }
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-300 transition hover:bg-white/[0.05] disabled:opacity-40"
                >
                  <Download size={15} />
                  Import
                </button>

                <button
                  onClick={() =>
                    void pushToGitHub()
                  }
                  disabled={
                    githubBusy ||
                    !githubUrl.trim()
                  }
                  className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:opacity-40"
                >
                  <Upload size={15} />
                  Push
                </button>
              </div>

              <button
                onClick={
                  openChangesPage
                }
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-400 transition hover:bg-white/[0.05] hover:text-white"
              >
                <GitBranch size={15} />
                View Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}