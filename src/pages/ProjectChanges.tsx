import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  FileCode2,
  Github,
  GitCommitHorizontal,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";

import api from "../services/api";

interface Repository { id: string; name: string; url: string; provider: string; }
interface Project { id: string; name: string; repositories: Repository[]; }
interface DiffChange { path: string; status: "added" | "modified"; additions: number; deletions: number; preview?: string; }
interface DiffResponse { repository: string; branch: string; remoteOnlyFiles: number; filesChecked: number; totalChanges: number; changes: DiffChange[]; }
interface PushResponse { message: string; branch: string; commitUrl: string | null; filesPushed: number; }

export default function ProjectChanges() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [diff, setDiff] = useState<DiffResponse | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedChange = useMemo(
    () => diff?.changes.find((change) => change.path === selectedPath) || null,
    [diff, selectedPath],
  );

  const loadDiff = async (showSpinner = true) => {
    if (!id) { navigate("/dashboard"); return; }
    try {
      if (showSpinner) setRefreshing(true);
      setError("");
      const projectResponse = await api.get<Project>(`/projects/${id}`);
      setProject(projectResponse.data);
      const response = await api.post<DiffResponse>("/github/diff", {
        projectId: id,
        repositoryUrl: projectResponse.data.repositories?.[0]?.url,
      });
      setDiff(response.data);
      setSelectedPath(response.data.changes[0]?.path || null);
    } catch (err: any) {
      console.error("Failed to load GitHub diff:", err);
      setError(err.response?.data?.message || "Unable to calculate GitHub changes.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void loadDiff(false); }, [id]);

  const pushChanges = async () => {
    if (!id) return;
    try {
      setPushing(true);
      setError("");
      setMessage("");
      const response = await api.post<PushResponse>("/github/push", {
        projectId: id,
        repositoryUrl: project?.repositories?.[0]?.url,
        branch: diff?.branch,
      });
      setMessage(`${response.data.message}. ${response.data.filesPushed} files pushed to ${response.data.branch}.`);
      await loadDiff(false);
    } catch (err: any) {
      console.error("Failed to push GitHub changes:", err);
      setError(err.response?.data?.message || "Unable to push changes to GitHub.");
    } finally {
      setPushing(false);
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#09090b] text-zinc-500">Loading changes...</div>;
  if (!project) return null;

  const added = diff?.changes.filter((change) => change.status === "added").length || 0;
  const modified = diff?.changes.filter((change) => change.status === "modified").length || 0;

  return (
    <div className="flex min-h-screen flex-col bg-[#09090b] text-white">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#0f0f12] px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={() => navigate(`/projects/${id}`)} className="rounded-lg p-2 text-zinc-500 hover:bg-white/[0.05] hover:text-white"><ArrowLeft size={18} /></button>
          <div><p className="text-xs text-zinc-500">GitHub Changes</p><h1 className="truncate text-sm font-semibold sm:text-base">{project.name}</h1></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void loadDiff()} disabled={refreshing} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.05] disabled:opacity-40"><RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />Refresh</button>
          <button onClick={() => void pushChanges()} disabled={pushing || !diff || diff.totalChanges === 0} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-medium text-black hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40">{pushing ? <Loader2 size={14} className="animate-spin" /> : <GitCommitHorizontal size={14} />}{pushing ? "Pushing..." : "Push Changes"}</button>
        </div>
      </header>

      <main className="min-h-0 flex-1 p-4 sm:p-6">
        <div className="mx-auto max-w-7xl">
          {error && <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
          {message && <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400"><Check size={16} />{message}</div>}

          <section className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2"><Github size={18} /><h2 className="font-semibold">{diff?.repository || "GitHub"}</h2><span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-zinc-500">{diff?.branch || "main"}</span></div>
                <p className="mt-2 text-sm text-zinc-500">Compare your Devora project with the current GitHub branch before pushing.</p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-3"><Stat label="Changes" value={String(diff?.totalChanges || 0)} /><Stat label="Added" value={String(added)} icon={<Plus size={12} />} /><Stat label="Modified" value={String(modified)} icon={<FileCode2 size={12} />} /></div>
            </div>
            {diff?.remoteOnlyFiles ? <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-400">{diff.remoteOnlyFiles} remote file{diff.remoteOnlyFiles === 1 ? "" : "s"} are not currently stored in Devora. They will remain untouched by this push flow.</div> : null}
          </section>

          <div className="mt-5 grid min-h-[560px] gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0f0f12]">
              <div className="border-b border-white/10 px-4 py-3"><p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Changed Files</p></div>
              {diff?.changes.length ? <div className="max-h-[520px] overflow-y-auto p-2">{diff.changes.map((change) => <button key={change.path} onClick={() => setSelectedPath(change.path)} className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition ${selectedPath === change.path ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${change.status === "added" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>{change.status === "added" ? <Plus size={14} /> : <FileCode2 size={14} />}</span><span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-300">{change.path}</span><span className="shrink-0 text-[10px] text-zinc-600">+{change.additions} -{change.deletions}</span></button>)}</div> : <div className="flex h-[480px] flex-col items-center justify-center px-6 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400"><Check size={20} /></div><p className="mt-4 font-medium">Everything is synced</p><p className="mt-2 text-sm text-zinc-600">There are no local changes to push.</p></div>}
            </section>

            <section className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0e]">
              <div className="flex h-12 items-center justify-between border-b border-white/10 px-4"><div className="flex min-w-0 items-center gap-2"><FileCode2 size={14} className="shrink-0" /><span className="truncate font-mono text-xs text-zinc-300">{selectedChange?.path || "No file selected"}</span></div>{selectedChange && <div className="flex items-center gap-3 text-[11px]"><span className="text-emerald-400">+{selectedChange.additions}</span><span className="text-red-400">-{selectedChange.deletions}</span></div>}</div>
              {selectedChange ? <div className="h-[510px] overflow-auto p-4 font-mono text-xs leading-6"><div className="mb-3 text-zinc-600">{selectedChange.status === "added" ? "New file" : "Modified file"}</div>{(selectedChange.preview || "").split("\n").map((line, index) => <div key={`${selectedChange.path}-${index}`} className="flex min-w-max"><span className="mr-4 w-8 select-none text-right text-zinc-700">{index + 1}</span><span className="mr-3 select-none text-emerald-600">+</span><span className="text-zinc-300">{line || " "}</span></div>)}{selectedChange.preview && selectedChange.preview.split("\n").length >= 40 && <p className="mt-4 text-zinc-700">Preview limited to the first 40 lines.</p>}</div> : <div className="flex h-[510px] items-center justify-center text-sm text-zinc-600">Select a changed file to preview it.</div>}
            </section>
          </div>

          <p className="mt-4 text-xs text-zinc-700">Devora compares the files stored in your workspace against the selected GitHub branch.</p>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return <div className="min-w-20 rounded-xl border border-white/10 bg-black/10 px-3 py-2"><div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-600">{icon}{label}</div><p className="mt-1 text-lg font-semibold">{value}</p></div>;
}
