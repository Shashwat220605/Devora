import { useEffect, useMemo, useState } from "react";
import { Bot, Check, FileCode2, GitCompareArrows, Lightbulb, RefreshCw, Sparkles, X } from "lucide-react";
import Layout from "./Layout";
import api from "../services/api";

type Project = { id: string; name: string };
type FileItem = { id: string; path: string; content: string; language: string | null };
type Action = "explain" | "fix" | "refactor" | "tests";
type AIResponse = { model: string; action: Action; explanation: string; result: string };
type DiffLine = { kind: "same" | "add" | "remove"; text: string; oldNo?: number; newNo?: number };

function buildDiff(before: string, after: string): DiffLine[] {
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  const rows: DiffLine[] = [];

  let oldNo = 1;
  let newNo = 1;
  const max = Math.max(oldLines.length, newLines.length);

  for (let index = 0; index < max; index += 1) {
    const oldLine = oldLines[index];
    const newLine = newLines[index];

    if (oldLine === newLine) {
      rows.push({ kind: "same", text: oldLine ?? "", oldNo, newNo });
      oldNo += 1;
      newNo += 1;
      continue;
    }

    if (typeof oldLine === "string") {
      rows.push({ kind: "remove", text: oldLine, oldNo });
      oldNo += 1;
    }
    if (typeof newLine === "string") {
      rows.push({ kind: "add", text: newLine, newNo });
      newNo += 1;
    }
  }

  return rows;
}

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
  const [reviewOpen, setReviewOpen] = useState(false);

  const selected = useMemo(
    () => files.find((file) => file.id === fileId) || files[0] || null,
    [files, fileId],
  );

  const diff = useMemo(
    () => (selected && preview && action !== "explain" ? buildDiff(selected.content, preview) : []),
    [selected, preview, action],
  );

  const changedLines = useMemo(
    () => diff.filter((line) => line.kind !== "same").length,
    [diff],
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
    setReviewOpen(false);
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
      setReviewOpen(false);
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

  const reject = () => {
    setReviewOpen(false);
    setPreview("");
    setExplanation("");
    setMessage("AI changes rejected. Your file was not modified.");
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
      setReviewOpen(false);
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
                <button key={id} onClick={() => { setAction(id); setPreview(""); setExplanation(""); setReviewOpen(false); }} className={`rounded-xl border px-3 py-2.5 text-xs ${action === id ? "border-white/20 bg-white text-black" : "border-white/10 text-zinc-400"}`}>
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
                  <button onClick={() => setReviewOpen(true)} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-black disabled:opacity-40">
                    <GitCompareArrows size={13} /> Review changes
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

        {reviewOpen && selected && preview && action !== "explain" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0e] shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <div className="flex items-center gap-2 font-medium"><GitCompareArrows size={17} /> Review AI changes</div>
                  <p className="mt-1 text-xs text-zinc-500">{selected.path} · {changedLines} changed line{changedLines === 1 ? "" : "s"}</p>
                </div>
                <button onClick={reject} className="rounded-lg p-2 text-zinc-500 hover:bg-white/[0.05] hover:text-white"><X size={18} /></button>
              </div>

              <div className="grid min-h-0 flex-1 overflow-auto lg:grid-cols-2">
                <div className="border-b border-white/10 lg:border-b-0 lg:border-r">
                  <div className="border-b border-white/10 px-4 py-3 text-xs font-medium text-red-300">Current file</div>
                  <pre className="max-h-[60vh] overflow-auto p-4 font-mono text-xs leading-6 text-zinc-400">{selected.content}</pre>
                </div>
                <div>
                  <div className="border-b border-white/10 px-4 py-3 text-xs font-medium text-emerald-300">Proposed file</div>
                  <pre className="max-h-[60vh] overflow-auto p-4 font-mono text-xs leading-6 text-zinc-300">{preview}</pre>
                </div>
              </div>

              <div className="border-t border-white/10 px-5 py-4">
                <div className="mb-3 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                  <div className="border-b border-white/10 px-4 py-2 text-xs text-zinc-500">Change summary</div>
                  <div className="max-h-48 overflow-auto font-mono text-[11px] leading-5">
                    {diff.map((line, index) => {
                      const marker = line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " ";
                      const tone = line.kind === "add" ? "bg-emerald-500/10 text-emerald-300" : line.kind === "remove" ? "bg-red-500/10 text-red-300" : "text-zinc-600";
                      return <div key={`${line.kind}-${index}`} className={`grid grid-cols-[48px_48px_1fr] px-3 ${tone}`}><span className="text-right pr-2 text-zinc-700">{line.oldNo ?? ""}</span><span className="text-right pr-2 text-zinc-700">{line.newNo ?? ""}</span><span className="whitespace-pre-wrap break-words"><span className="mr-2">{marker}</span>{line.text}</span></div>;
                    })}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={reject} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-400 hover:bg-white/[0.04] hover:text-white"><X size={15} /> Reject</button>
                  <button onClick={() => void apply()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black disabled:opacity-40"><Check size={15} /> Apply changes</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </Layout>
  );
}
