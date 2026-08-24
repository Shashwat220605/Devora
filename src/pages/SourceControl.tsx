import { useEffect, useMemo, useState } from "react";
import { Bot, Check, FileCode2, GitBranch, Loader2, RefreshCw, Send, Sparkles, X } from "lucide-react";
import Layout from "./Layout";
import api from "../services/api";

type Project = { id: string; name: string };
type Change = { path: string; status: "modified" | "added" | "deleted"; additions: number; deletions: number; content?: string | null };
type ChangesResponse = { branch: string; repository: string; changes: Change[]; ahead: number; behind: number };

export default function SourceControl() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState<ChangesResponse | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [commitMessage, setCommitMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadProjects = async () => {
    const response = await api.get<Project[]>("/projects");
    setProjects(response.data);
    if (!projectId && response.data[0]) setProjectId(response.data[0].id);
  };

  const loadChanges = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError("");
      const response = await api.get<ChangesResponse>(`/github/source-control?projectId=${encodeURIComponent(projectId)}`);
      setData(response.data);
      setSelected(response.data.changes.map((change) => change.path));
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to load source control changes.");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadProjects().catch(() => setError("Unable to load projects.")); }, []);
  useEffect(() => { void loadChanges(); }, [projectId]);

  const selectedChanges = useMemo(
    () => data?.changes.filter((change) => selected.includes(change.path)) || [],
    [data, selected],
  );

  const generateMessage = async () => {
    if (!projectId || selectedChanges.length === 0) return;
    try {
      setAiBusy(true);
      setError("");
      const response = await api.post<{ message: string }>("/ai/commit-message", {
        projectId,
        changes: selectedChanges.map(({ path, status, additions, deletions }) => ({ path, status, additions, deletions })),
      });
      setCommitMessage(response.data.message);
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to generate a commit message.");
    } finally {
      setAiBusy(false);
    }
  };

  const commit = async () => {
    if (!projectId || selectedChanges.length === 0 || !commitMessage.trim()) return;
    try {
      setBusy(true);
      setError("");
      const response = await api.post<{ message: string; commitUrl?: string | null }>("/github/commit", {
        projectId,
        paths: selected,
        commitMessage: commitMessage.trim(),
      });
      setNotice(response.data.commitUrl ? `${response.data.message} · ${response.data.commitUrl}` : response.data.message);
      await loadChanges();
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to commit changes.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (path: string) => setSelected((current) => current.includes(path) ? current.filter((item) => item !== path) : [...current, path]);
  const allSelected = Boolean(data?.changes.length) && selected.length === data?.changes.length;

  return (
    <Layout active="Source Control">
      <div className="border-b border-white/10 px-5 py-6 sm:px-8">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">Git</p>
        <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold">Source Control</h1>{data && <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-zinc-500">{data.branch}</span>}</div>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">Review project changes, generate a commit message with Devora AI, and push selected changes to GitHub.</p>
      </div>

      <section className="p-5 sm:p-8">
        {error && <div className="mb-5 flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"><span>{error}</span><button onClick={() => setError("")}><X size={15}/></button></div>}
        {notice && <div className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{notice}</div>}

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="block max-w-sm text-xs text-zinc-500">Project<select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#101014] px-3 py-2.5 text-sm outline-none"><option value="">Select project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <button onClick={() => void loadChanges()} disabled={loading || !projectId} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-400 hover:bg-white/[0.04] hover:text-white disabled:opacity-40">{loading ? <Loader2 size={15} className="animate-spin"/> : <RefreshCw size={15}/>} Refresh</button>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0f0f12]">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div className="flex items-center gap-2 text-sm font-medium"><GitBranch size={16}/> Changes {data ? `(${data.changes.length})` : ""}</div><button onClick={() => setSelected(allSelected ? [] : (data?.changes.map((change) => change.path) || []))} disabled={!data?.changes.length} className="text-xs text-zinc-500 hover:text-white">{allSelected ? "Unselect all" : "Select all"}</button></div>
            {data?.changes.length ? <div className="divide-y divide-white/5">{data.changes.map((change) => <label key={change.path} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-white/[0.03]"><input type="checkbox" checked={selected.includes(change.path)} onChange={() => toggle(change.path)} className="accent-white"/><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-black"><FileCode2 size={14}/></span><span className="min-w-0 flex-1"><span className="block truncate text-sm text-zinc-300">{change.path}</span><span className="text-[11px] text-zinc-600">{change.status} · <span className="text-emerald-400">+{change.additions}</span> <span className="text-red-400">-{change.deletions}</span></span></span><span className={`text-xs font-medium ${change.status === "added" ? "text-emerald-400" : change.status === "deleted" ? "text-red-400" : "text-amber-400"}`}>{change.status}</span></label>)}</div> : <div className="p-12 text-center text-sm text-zinc-600">{loading ? "Loading changes…" : "No uncommitted changes found."}</div>}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-4">
              <div className="flex items-center justify-between"><div><p className="text-sm font-medium">Commit message</p><p className="mt-1 text-xs text-zinc-600">AI-assisted, editable before commit.</p></div><button onClick={() => void generateMessage()} disabled={aiBusy || selectedChanges.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-medium text-black disabled:opacity-40">{aiBusy ? <Loader2 size={13} className="animate-spin"/> : <Sparkles size={13}/>} Generate</button></div>
              <input value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} placeholder="Describe your changes…" className="mt-4 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm outline-none placeholder:text-zinc-700"/>
              <button onClick={() => void commit()} disabled={busy || selectedChanges.length === 0 || !commitMessage.trim()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-black disabled:opacity-40">{busy ? <Loader2 size={15} className="animate-spin"/> : <Send size={15}/>} Commit & Push</button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-4"><div className="flex items-center gap-2 text-sm font-medium"><Bot size={15}/> Devora AI</div><p className="mt-2 text-xs leading-5 text-zinc-500">The AI sees the selected change metadata and your project context. Your commit message stays editable before anything is sent to GitHub.</p></div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
