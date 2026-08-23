import { useEffect, useMemo, useState } from "react";
import { Bot, FileCode2, Lightbulb, RefreshCw, Sparkles, Wand2, X } from "lucide-react";
import Layout from "./Layout";
import api from "../services/api";

type Project = { id: string; name: string };
type FileItem = { id: string; path: string; content: string; language: string | null };
type Action = "explain" | "fix" | "refactor" | "tests";
type AIResponse = { model: string; action: Action; explanation: string; result: string };

export default function AICodeActions() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [projectId, setProjectId] = useState("");
  const [fileId, setFileId] = useState("");
  const [action, setAction] = useState<Action>("explain");
  const [preview, setPreview] = useState("");
  const [explanation, setExplanation] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selected = useMemo(
    () => files.find((file) => file.id === fileId) || files[0] || null,
    [files, fileId],
  );

  const loadProjects = async () => {
    const response = await api.get<Project[]>("/projects");
    setProjects(response.data);
    if (!projectId && response.data[0]) setProjectId(response.data[0].id);
  };

  const loadFiles = async () => {
    if (!projectId) return;
    const response = await api.get<FileItem[]>(`/projects/${projectId}/files`);
    setFiles(response.data);
    setFileId((current) => current || response.data[0]?.id || "");
  };

  useEffect(() => {
    void loadProjects().catch(() => setError("Unable to load projects."));
  }, []);

  useEffect(() => {
    setFiles([]);
    setFileId("");
    setPreview("");
    setExplanation("");
    if (projectId) {
      void loadFiles().catch(() => setError("Unable to load project files."));
    }
  }, [projectId]);

  const run = async () => {
    if (!selected) return;
    try {
      setBusy(true);
      setError("");
      setMessage("");
      const response = await api.post<AIResponse>("/ai/code-action", {
        action,
        path: selected.path,
        language: selected.language,
        content: selected.content,
      });
      setPreview(response.data.result);
      setExplanation(response.data.explanation);
      setModel(response.data.model);
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to run Gemini code action.");
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!selected || !preview || action === "explain") return;
    try {
      setBusy(true);
      setError("");
      const response = await api.put<FileItem>(
        `/projects/${projectId}/files/${selected.id}`,
        { content: preview },
      );
      setFiles((items) =>
        items.map((item) => (item.id === response.data.id ? response.data : item)),
      );
      setPreview("");
      setExplanation("");
      setMessage(`Applied ${action} action to ${response.data.path}.`);
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to apply changes.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout active="AI Assistant">
      <div className="border-b border-white/10 px-5 py-6 sm:px-8">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">Devora AI</p>
        <h1 className="mt-2 text-2xl font-semibold">AI Code Actions</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">
          Gemini-powered explain, fix, refactor, and test suggestions with review-before-apply workflow.
        </p>
      </div>

      <section className="p-5 sm:p-8">
        {error && (
          <div className="mb-5 flex justify-between rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <span>{error}</span>
            <button onClick={() => setError("")}><X size={15} /></button>
          </div>
        )}
        {message && (
          <div className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
            {message}
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[300px_1fr]">
          <aside className="rounded-2xl border border-white/10 bg-[#0f0f12] p-4">
            <div className="flex items-center gap-2">
              <Bot size={17} />
              <span className="font-medium">Code context</span>
            </div>

            <label className="mt-5 block text-xs text-zinc-500">
              Project
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#101014] px-3 py-2.5 text-sm outline-none">
                <option value="">Select project</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </label>

            <label className="mt-4 block text-xs text-zinc-500">
              File
              <select value={fileId} onChange={(e) => setFileId(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#101014] px-3 py-2.5 text-sm outline-none">
                <option value="">Select file</option>
                {files.map((file) => <option key={file.id} value={file.id}>{file.path}</option>)}
              </select>
            </label>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {([['explain', 'Explain'], ['fix', 'Fix'], ['refactor', 'Refactor'], ['tests', 'Tests']] as const).map(([id, label]) => (
                <button key={id} onClick={() => { setAction(id); setPreview(""); setExplanation(""); }} className={`rounded-xl border px-3 py-2.5 text-xs ${action === id ? "border-white/20 bg-white text-black" : "border-white/10 text-zinc-400"}`}>
                  {label}
                </button>
              ))}
            </div>

            <button onClick={() => void run()} disabled={busy || !selected} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-black disabled:opacity-40">
              {busy ? <RefreshCw size={15} className="animate-spin" /> : <Sparkles size={15} />} Generate with Gemini
            </button>
          </aside>

          <div className="grid min-h-[620px] gap-4 lg:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-sm">
                <FileCode2 size={15} />
                <span>{selected?.path || "No file selected"}</span>
              </div>
              <pre className="max-h-[560px] overflow-auto p-5 font-mono text-xs leading-6 text-zinc-400">
                {selected?.content || "Select a project file to inspect it."}
              </pre>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <Lightbulb size={15} />
                  <span>Gemini result</span>
                </div>
                {preview && action !== "explain" && (
                  <button onClick={() => void apply()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-black disabled:opacity-40">
                    <Wand2 size={13} /> Apply
                  </button>
                )}
              </div>
              {model && <div className="border-b border-white/5 px-4 py-2 text-[11px] text-zinc-600">Model: {model}</div>}
              {explanation && <div className="border-b border-white/5 px-4 py-3 text-xs leading-5 text-zinc-400">{explanation}</div>}
              <pre className="max-h-[500px] overflow-auto p-5 font-mono text-xs leading-6 text-zinc-300">
                {preview || "Generate a Gemini preview to see the proposed result."}
              </pre>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
