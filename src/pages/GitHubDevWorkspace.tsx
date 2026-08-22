import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Activity,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  Code2,
  ExternalLink,
  FileCode2,
  GitBranch,
  GitCommitHorizontal,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Workflow,
  X,
} from "lucide-react";
import Layout from "./Layout";
import api from "../services/api";

interface Project { id: string; name: string; }
interface ProjectFile { id: string; path: string; content: string; language: string | null; }
interface Branch { name: string; protected: boolean; sha: string | null; }
interface StatusChange { path: string; status: "added" | "modified" | "deleted"; }
interface LocalStatus {
  branch: string;
  headSha: string | null;
  totalLocal: number;
  totalRemote: number;
  clean: boolean;
  counts: { changed: number; added: number; deleted: number; unchanged: number };
  changes: StatusChange[];
}
interface ActivityItem { type: "commit" | "pull_request"; id: string; title: string; actor: string; avatarUrl: string | null; date: string | null; url: string; state?: string; merged?: boolean; number?: number; }
interface WorkflowItem { id: number; name: string; path: string; state: string; htmlUrl: string; }
interface RunItem { id: number; name: string; status: string; conclusion: string | null; branch: string | null; event: string; sha: string; createdAt: string; updatedAt: string; url: string; runNumber: number; }

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function highlightCode(code: string, language: string | null) {
  let html = escapeHtml(code);
  html = html.replace(/(\/\/.*$|#.*$)/gm, '<span class="text-zinc-500">$1</span>');
  html = html.replace(/(&quot;[^&]*?&quot;|'[^']*')/g, '<span class="text-emerald-300">$1</span>');
  if (["typescript", "javascript", "java", "cpp", "c", "python"].includes(language || "")) {
    html = html.replace(/\b(const|let|var|function|return|if|else|for|while|class|new|import|from|export|default|async|await|try|catch|throw|extends|interface|type|public|private|static|void|int|string|boolean|def|in|True|False|None)\b/g, '<span class="text-sky-300">$1</span>');
  }
  html = html.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="text-amber-300">$1</span>');
  return html;
}

function short(value: string | null) { return value ? value.slice(0, 7) : "unknown"; }

export default function GitHubDevWorkspace() {
  const [params] = useSearchParams();
  const repositoryUrl = params.get("url") || "";
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState("");
  const [draft, setDraft] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branch, setBranch] = useState("");
  const [status, setStatus] = useState<LocalStatus | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"editor" | "activity" | "ci">("editor");
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const repoName = useMemo(() => {
    try {
      const url = new URL(repositoryUrl);
      const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
      return parts.length >= 2 ? `${parts[0]}/${parts[1].replace(/\.git$/i, "")}` : "GitHub repository";
    } catch { return "GitHub repository"; }
  }, [repositoryUrl]);

  const selectedFile = files.find((file) => file.id === selectedFileId) || null;
  const dirty = Boolean(selectedFile && draft !== savedContent);
  const filteredFiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? files.filter((file) => file.path.toLowerCase().includes(query)) : files;
  }, [files, search]);

  const loadProjects = async () => {
    const response = await api.get<Project[]>("/projects");
    setProjects(response.data);
    if (!projectId && response.data[0]) setProjectId(response.data[0].id);
  };

  const loadFiles = async () => {
    if (!projectId) return;
    const response = await api.get<ProjectFile[]>(`/projects/${projectId}/files`);
    setFiles(response.data);
    if (!selectedFileId && response.data[0]) {
      setSelectedFileId(response.data[0].id);
      setDraft(response.data[0].content);
      setSavedContent(response.data[0].content);
    }
  };

  const loadRepo = async (nextBranch?: string) => {
    if (!repositoryUrl) return;
    const branchesResponse = await api.get<Branch[]>("/github/branches", { params: { repositoryUrl } });
    setBranches(branchesResponse.data);
    const next = nextBranch || branch || branchesResponse.data[0]?.name || "main";
    setBranch(next);
  };

  const loadStatus = async () => {
    if (!repositoryUrl || !projectId || !branch) return;
    const response = await api.get<LocalStatus>("/github/local-status", { params: { repositoryUrl, projectId, branch } });
    setStatus(response.data);
  };

  const loadActivity = async () => {
    if (!repositoryUrl) return;
    const response = await api.get<{ commits: ActivityItem[]; pullRequests: ActivityItem[] }>("/github/activity", { params: { repositoryUrl } });
    setActivity([...response.data.pullRequests, ...response.data.commits].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()));
  };

  const loadActions = async () => {
    if (!repositoryUrl) return;
    const response = await api.get<{ workflows: WorkflowItem[]; runs: RunItem[] }>("/github/actions", { params: { repositoryUrl } });
    setWorkflows(response.data.workflows);
    setRuns(response.data.runs);
  };

  const refresh = async () => {
    try {
      setLoading(true); setError("");
      await loadProjects();
      await loadFiles();
      await loadRepo();
      await Promise.all([loadActivity(), loadActions()]);
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to load developer workspace.");
    } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, [repositoryUrl]);
  useEffect(() => { if (projectId) void loadFiles().catch((err: any) => setError(err.response?.data?.message || "Unable to load project files.")); }, [projectId]);
  useEffect(() => { if (projectId && branch) void loadStatus().catch((err: any) => setError(err.response?.data?.message || "Unable to compare project with GitHub.")); }, [projectId, branch]);

  const chooseFile = (file: ProjectFile) => {
    setSelectedFileId(file.id);
    setDraft(file.content);
    setSavedContent(file.content);
    setPreview(false);
  };

  const saveFile = async () => {
    if (!selectedFile || !dirty) return;
    try {
      setSaving(true); setError("");
      const response = await api.put<ProjectFile>(`/projects/${projectId}/files/${selectedFile.id}`, { content: draft });
      setFiles((prev) => prev.map((file) => file.id === response.data.id ? response.data : file));
      setSavedContent(response.data.content);
      setDraft(response.data.content);
      setMessage(`Saved ${response.data.path}.`);
      await loadStatus();
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to save file.");
    } finally { setSaving(false); }
  };

  const commit = async () => {
    if (!projectId || !branch) { setError("Select a project and branch first."); return; }
    if (dirty) { setError("Save the open file before committing."); return; }
    if (status?.clean) { setError("No changes to commit."); return; }
    try {
      setBusy(true); setError("");
      const response = await api.post<{ commitSha: string }>("/github/push-mirror", { projectId, repositoryUrl, branch });
      setMessage(`Committed ${short(response.data.commitSha)} to ${branch}.`);
      await Promise.all([loadStatus(), loadActivity(), loadRepo(branch)]);
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to commit changes.");
    } finally { setBusy(false); }
  };

  const rerun = async (runId: number) => {
    try {
      setBusy(true); setError("");
      await api.post(`/github/actions/${runId}/rerun`, { repositoryUrl });
      setMessage("GitHub Actions rerun queued.");
      await loadActions();
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to rerun workflow.");
    } finally { setBusy(false); }
  };

  const workspaceTabs = [
    { id: "editor" as const, label: "Code editor", icon: Code2 },
    { id: "activity" as const, label: "Activity", icon: Activity },
    { id: "ci" as const, label: "CI/CD", icon: Workflow },
  ];

  if (!repositoryUrl) {
    return <Layout active="GitHub"><div className="p-8 text-sm text-red-400">A repository URL is required.</div></Layout>;
  }

  return (
    <Layout active="GitHub">
      <div className="border-b border-white/10 px-5 py-5 sm:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link to="/github" className="inline-flex items-center gap-2 text-xs text-zinc-500 hover:text-white">← Back to GitHub</Link>
            <div className="mt-3 flex items-center gap-3"><GitBranch size={18} /><div><p className="text-xs uppercase tracking-[0.2em] text-zinc-600">Developer workspace</p><h1 className="mt-1 text-xl font-semibold">{repoName}</h1></div></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="rounded-xl border border-white/10 bg-[#101014] px-3 py-2.5 text-sm outline-none"><option value="">Project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
            <select value={branch} onChange={(e) => { setBranch(e.target.value); void Promise.all([loadStatus(), loadActivity(), loadActions()]); }} className="rounded-xl border border-white/10 bg-[#101014] px-3 py-2.5 text-sm outline-none"><option value="">Branch</option>{branches.map((item) => <option key={item.name} value={item.name}>{item.name}{item.protected ? " · protected" : ""}</option>)}</select>
            <a href={repositoryUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/[0.04]">GitHub <ExternalLink size={14} /></a>
            <button onClick={() => void refresh()} disabled={loading || busy} className="rounded-xl border border-white/10 p-2.5 text-zinc-400 hover:bg-white/[0.04]"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {workspaceTabs.map((tab) => { const Icon = tab.icon; return <button key={tab.id} onClick={() => setView(tab.id)} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${view === tab.id ? "bg-white text-black" : "border border-white/10 text-zinc-400 hover:bg-white/[0.04]"}`}><Icon size={15} />{tab.label}</button>; })}
          {status && <span className={`ml-auto inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${status.clean ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border-amber-500/20 bg-amber-500/10 text-amber-300"}`}>{status.clean ? <Check size={13} /> : <CircleAlert size={13} />}{status.clean ? "Working tree clean" : `${status.changes.length} change${status.changes.length === 1 ? "" : "s"}`}</span>}
        </div>
      </div>

      <section className="p-5 sm:p-8">
        {error && <div className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div>}
        {message && <div className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{message}</div>}

        {view === "editor" && (
          <div className="grid min-h-[650px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0e] xl:grid-cols-[250px_1fr_290px]">
            <aside className="border-b border-white/10 xl:border-b-0 xl:border-r">
              <div className="flex items-center justify-between px-4 py-3"><span className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-600">Explorer</span><span className="text-xs text-zinc-700">{files.length}</span></div>
              <div className="border-y border-white/5 p-2"><div className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/20 px-2.5 py-2"><Search size={13} className="text-zinc-600" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-zinc-700" /></div></div>
              <div className="max-h-[560px] overflow-auto p-2">{filteredFiles.map((file) => <button key={file.id} onClick={() => chooseFile(file)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs ${selectedFileId === file.id ? "bg-white/10 text-white" : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"}`}><FileCode2 size={13} /><span className="truncate">{file.path}</span>{file.id === selectedFileId && dirty && <span className="ml-auto text-amber-300">●</span>}</button>)}</div>
            </aside>

            <main className="min-w-0 border-b border-white/10 xl:border-b-0 xl:border-r">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5"><div className="min-w-0 flex items-center gap-2">{selectedFile ? <><FileCode2 size={14} className="text-zinc-600" /><span className="truncate text-xs text-zinc-300">{selectedFile.path}</span>{dirty && <span className="text-amber-300">●</span>}</> : <span className="text-xs text-zinc-600">Select a file</span>}</div><div className="flex items-center gap-2"><button onClick={() => setPreview(false)} className={`rounded-lg px-2.5 py-1.5 text-xs ${!preview ? "bg-white/10 text-white" : "text-zinc-600"}`}>Edit</button><button onClick={() => setPreview(true)} className={`rounded-lg px-2.5 py-1.5 text-xs ${preview ? "bg-white/10 text-white" : "text-zinc-600"}`}>Highlight</button><button onClick={() => void saveFile()} disabled={!selectedFile || !dirty || saving} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-black disabled:opacity-30">{saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}Save</button></div></div>
              {selectedFile ? (preview ? <pre className="h-[575px] overflow-auto p-5 font-mono text-[13px] leading-6" dangerouslySetInnerHTML={{ __html: highlightCode(draft, selectedFile.language) }} /> : <div className="flex h-[575px] bg-[#09090c] font-mono text-[13px] leading-6"><div className="select-none border-r border-white/5 px-3 py-4 text-right text-zinc-700">{draft.split("\n").map((_, index) => <div key={index}>{index + 1}</div>)}</div><textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} className="min-w-0 flex-1 resize-none bg-transparent px-4 py-4 text-zinc-300 outline-none" /></div>) : <div className="flex h-[575px] items-center justify-center text-sm text-zinc-600">Select a file from Explorer.</div>}
            </main>

            <aside className="min-w-0">
              <div className="border-b border-white/10 px-4 py-3 text-xs font-medium uppercase tracking-[0.16em] text-zinc-600">Git panel</div>
              <div className="space-y-4 p-4">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex items-center justify-between"><span className="text-xs text-zinc-500">Changes</span><span className="text-xs text-zinc-700">{status?.changes.length || 0}</span></div><div className="mt-3 space-y-2">{status?.changes.slice(0, 8).map((change) => <div key={change.path} className="flex items-center justify-between gap-2 text-xs"><span className="truncate font-mono text-zinc-400">{change.path}</span><span className={`shrink-0 ${change.status === "added" ? "text-emerald-400" : change.status === "deleted" ? "text-red-400" : "text-amber-300"}`}>{change.status[0].toUpperCase()}</span></div>)}{!status?.changes.length && <p className="text-xs text-zinc-700">No changes.</p>}</div></div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex items-center gap-2"><GitCommitHorizontal size={14} /><span className="text-xs font-medium text-zinc-300">Commit snapshot</span></div><p className="mt-1 text-xs text-zinc-600">Save your file, review the status, then create one atomic commit.</p><button onClick={() => void commit()} disabled={busy || !projectId || !branch || Boolean(status?.clean) || dirty} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-medium text-black disabled:opacity-30">{busy ? <Loader2 size={15} className="animate-spin" /> : <GitCommitHorizontal size={15} />}Commit to GitHub</button></div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs text-zinc-500">Remote</p><p className="mt-2 text-xs text-zinc-300">{branch || "No branch"}</p><p className="mt-1 font-mono text-[11px] text-zinc-700">{short(status?.headSha || null)}</p></div>
              </div>
            </aside>
          </div>
        )}

        {view === "activity" && (
          <div className="grid gap-4 xl:grid-cols-[1.8fr_1fr]">
            <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5"><div className="flex items-center justify-between"><div><p className="text-sm font-medium">Repository activity</p><p className="mt-1 text-xs text-zinc-500">Commits and pull requests across the repository.</p></div><button onClick={() => void loadActivity()} className="rounded-lg border border-white/10 p-2 text-zinc-400"><RefreshCw size={14} /></button></div><div className="mt-5 space-y-2">{activity.map((item) => <a key={`${item.type}-${item.id}`} href={item.url} target="_blank" rel="noreferrer" className="flex gap-3 rounded-xl border border-white/5 bg-black/20 p-4 hover:border-white/10"><div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-white/5">{item.type === "commit" ? <GitCommitHorizontal size={15} /> : <ChevronRight size={15} />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm text-zinc-300">{item.type === "pull_request" ? `#${item.number} ${item.title}` : item.title}</p><p className="mt-1 text-xs text-zinc-600">{item.actor}{item.date ? ` · ${new Date(item.date).toLocaleString()}` : ""}{item.type === "pull_request" ? ` · ${item.merged ? "merged" : item.state}` : ""}</p></div><ExternalLink size={14} className="mt-1 text-zinc-700" /></a>)}{!activity.length && <div className="p-8 text-center text-sm text-zinc-600">No activity found.</div>}</div></div>
            <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5"><div className="flex items-center gap-2"><GitBranch size={15} /><p className="text-sm font-medium">Branches</p></div><div className="mt-4 space-y-2">{branches.map((item) => <div key={item.name} className="flex items-center justify-between rounded-xl border border-white/5 px-3 py-2.5"><span className="truncate font-mono text-xs text-zinc-300">{item.name}</span>{item.protected && <span className="text-[10px] text-amber-300">protected</span>}</div>)}</div></div>
          </div>
        )}

        {view === "ci" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5"><div className="flex items-center justify-between"><div><p className="text-sm font-medium">GitHub Actions</p><p className="mt-1 text-xs text-zinc-500">See workflows, build status, tests, and deployment runs without leaving Devora.</p></div><button onClick={() => void loadActions()} className="rounded-lg border border-white/10 p-2 text-zinc-400"><RefreshCw size={14} /></button></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{workflows.map((workflow) => <a key={workflow.id} href={workflow.htmlUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-white/5 bg-black/20 p-4 hover:border-white/10"><div className="flex items-center gap-2"><Workflow size={15} /><span className="truncate text-sm text-zinc-300">{workflow.name}</span></div><p className="mt-2 truncate font-mono text-[11px] text-zinc-700">{workflow.path}</p><p className="mt-2 text-xs text-zinc-600">State: {workflow.state}</p></a>)}{!workflows.length && <div className="rounded-xl border border-dashed border-white/10 p-8 text-sm text-zinc-600">No GitHub Actions workflows found.</div>}</div></div>
            <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5"><div className="flex items-center gap-2"><Workflow size={15} /><p className="text-sm font-medium">Recent runs</p></div><div className="mt-4 space-y-2">{runs.map((run) => { const success = run.conclusion === "success"; const failed = run.conclusion === "failure" || run.conclusion === "cancelled"; return <div key={run.id} className="flex flex-col gap-3 rounded-xl border border-white/5 bg-black/20 p-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex min-w-0 items-start gap-3">{success ? <CircleCheck className="mt-0.5 text-emerald-400" size={17} /> : failed ? <CircleX className="mt-0.5 text-red-400" size={17} /> : <Loader2 className="mt-0.5 animate-spin text-amber-300" size={17} />}<div className="min-w-0"><p className="truncate text-sm text-zinc-300">{run.name} #{run.runNumber}</p><p className="mt-1 text-xs text-zinc-600">{run.branch || "unknown branch"} · {run.event} · {new Date(run.updatedAt).toLocaleString()}</p><p className="mt-1 text-[11px] text-zinc-700">{run.status}{run.conclusion ? ` · ${run.conclusion}` : ""} · {short(run.sha)}</p></div></div><div className="flex items-center gap-2"><a href={run.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-xs text-zinc-400">Open <ExternalLink size={12} /></a>{failed && <button onClick={() => void rerun(run.id)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-xs text-zinc-400"><RotateCcw size={12} />Rerun</button>}<button onClick={() => setMessage(`Run ${run.runNumber} is ${run.conclusion || run.status}.`)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-xs text-zinc-400"><Play size={12} />Inspect</button></div></div>; })}{!runs.length && <div className="p-8 text-center text-sm text-zinc-600">No workflow runs found.</div>}</div></div>
          </div>
        )}
      </section>
    </Layout>
  );
}
