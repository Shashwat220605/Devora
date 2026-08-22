import { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, GitBranch, Link2, Loader2, RefreshCw, GitCommit, GitCompare, LogOut } from "lucide-react";
import Layout from "./Layout";
import api from "../services/api";

interface Project { id: string; name: string; description: string | null; }
interface Status { connected: boolean; username: string | null; }
interface Repo { id: number; name: string; full_name: string; html_url: string; private: boolean; default_branch: string; description: string | null; language: string | null; }
interface Branch { name: string; protected: boolean; sha: string | null; }
interface Commit { sha: string; shortSha: string; message: string; author: string; date: string | null; url: string; }
interface CompareFile { filename: string; status: string; additions: number; deletions: number; changes: number; patch: string | null; }
interface CompareResult { status: string; aheadBy: number; behindBy: number; totalCommits: number; url: string | null; commits: Commit[]; files: CompareFile[]; }

export default function GitHubPhase2() {
  const [status, setStatus] = useState<Status>({ connected: false, username: null });
  const [token, setToken] = useState("");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branch, setBranch] = useState("");
  const [base, setBase] = useState("");
  const [head, setHead] = useState("");
  const [commits, setCommits] = useState<Commit[]>([]);
  const [compare, setCompare] = useState<CompareResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selectedRepoData = useMemo(() => repos.find((repo) => repo.html_url === selectedRepo) || null, [repos, selectedRepo]);

  const loadRepos = async () => {
    try {
      setLoading(true); setError("");
      const response = await api.get<Repo[]>("/github/repos");
      setRepos(response.data);
      if (!selectedRepo && response.data[0]) setSelectedRepo(response.data[0].html_url);
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to load repositories.");
    } finally { setLoading(false); }
  };

  const connect = async () => {
    if (!token.trim()) return;
    try {
      setBusy(true); setError("");
      const response = await api.post<Status>("/github/connect", { token: token.trim() });
      setStatus(response.data); setToken(""); setMessage(`Connected as ${response.data.username}.`);
      await loadRepos();
    } catch (err: any) { setError(err.response?.data?.message || "Unable to connect GitHub."); }
    finally { setBusy(false); }
  };

  const disconnect = async () => {
    try {
      setBusy(true); await api.post("/github/disconnect");
      setStatus({ connected: false, username: null }); setRepos([]); setBranches([]); setCommits([]); setCompare(null); setSelectedRepo("");
      setMessage("GitHub disconnected.");
    } catch (err: any) { setError(err.response?.data?.message || "Unable to disconnect GitHub."); }
    finally { setBusy(false); }
  };

  const loadRepoData = async (repoUrl: string) => {
    if (!repoUrl) return;
    try {
      setLoading(true); setError(""); setCompare(null);
      const branchesResponse = await api.get<Branch[]>("/github/branches", { params: { repositoryUrl: repoUrl } });
      setBranches(branchesResponse.data);
      const defaultBranch = branchesResponse.data[0]?.name || selectedRepoData?.default_branch || "main";
      const preferred = branchesResponse.data.find((item) => item.name === selectedRepoData?.default_branch)?.name || defaultBranch;
      setBranch(preferred); setBase(preferred); setHead(branchesResponse.data.find((item) => item.name !== preferred)?.name || preferred);
      const commitsResponse = await api.get<Commit[]>("/github/commits", { params: { repositoryUrl: repoUrl, branch: preferred } });
      setCommits(commitsResponse.data);
    } catch (err: any) { setError(err.response?.data?.message || "Unable to load repository data."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void api.get<Status>("/github/status").then((response) => { setStatus(response.data); if (response.data.connected) void loadRepos(); }).catch(() => undefined); void api.get<Project[]>("/projects").then((response) => setProjects(response.data)).catch(() => setProjects([])); }, []);
  useEffect(() => { if (selectedRepo) void loadRepoData(selectedRepo); }, [selectedRepo]);
  useEffect(() => { if (!selectedRepo || !branch) return; void api.get<Commit[]>("/github/commits", { params: { repositoryUrl: selectedRepo, branch } }).then((response) => setCommits(response.data)).catch(() => setCommits([])); }, [branch, selectedRepo]);

  const compareBranches = async () => {
    if (!selectedRepo || !base || !head) return;
    try {
      setBusy(true); setError("");
      const response = await api.get<CompareResult>("/github/compare", { params: { repositoryUrl: selectedRepo, base, head } });
      setCompare(response.data);
    } catch (err: any) { setError(err.response?.data?.message || "Unable to compare branches."); }
    finally { setBusy(false); }
  };

  const openProjectChanges = (projectId: string) => { window.location.href = `/projects/${projectId}/changes`; };

  return (
    <Layout active="GitHub">
      <div className="border-b border-white/10 px-5 py-6 sm:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-xs uppercase tracking-[0.2em] text-zinc-600">Phase 2</p><h1 className="mt-2 text-2xl font-semibold">GitHub Repository Control</h1><p className="mt-1 max-w-3xl text-sm text-zinc-500">Branches, commits, repository comparison, and workspace sync. OAuth can be swapped in later without changing these controls.</p></div>
          {status.connected && <div className="flex items-center gap-2"><span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400"><Check size={13}/> {status.username}</span><button onClick={() => void disconnect()} disabled={busy} className="rounded-lg border border-red-500/20 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10"><LogOut size={14}/></button></div>}
        </div>
      </div>

      <section className="p-5 sm:p-8">
        {error && <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
        {message && <div className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{message}</div>}

        {!status.connected ? (
          <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-[#0f0f12] p-6"><div className="flex items-start gap-4"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-black"><GitBranch size={22}/></div><div><h2 className="font-semibold">Connect GitHub</h2><p className="mt-1 text-sm text-zinc-500">Use your GitHub personal access token. The backend validates and encrypts it.</p></div></div><input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_..." className="mt-6 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-zinc-700"/><button onClick={() => void connect()} disabled={busy || !token.trim()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-black disabled:opacity-40">{busy ? <Loader2 size={16} className="animate-spin"/> : <Link2 size={16}/>} Connect GitHub</button></div>
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
              <section className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">Repository</p><p className="mt-1 text-xs text-zinc-600">Select a connected repository.</p></div><button onClick={() => void loadRepos()} disabled={loading} className="rounded-lg border border-white/10 p-2 text-zinc-500 hover:text-white"><RefreshCw size={14} className={loading ? "animate-spin" : ""}/></button></div><select value={selectedRepo} onChange={(e) => setSelectedRepo(e.target.value)} className="mt-4 w-full rounded-xl border border-white/10 bg-[#101014] px-3 py-3 text-sm outline-none"><option value="">Select repository</option>{repos.map((repo) => <option key={repo.id} value={repo.html_url}>{repo.full_name}{repo.private ? " · Private" : ""}</option>)}</select>{selectedRepoData && <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{selectedRepoData.full_name}</p><p className="truncate text-xs text-zinc-600">{selectedRepoData.description || "No description"}</p></div><a href={selectedRepoData.html_url} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-zinc-500 hover:text-white"><ExternalLink size={15}/></a></div>}</section>

              <section className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5"><div><p className="text-sm font-medium">Workspace sync</p><p className="mt-1 text-xs text-zinc-600">Run the existing import/diff workflow from a real project.</p></div><select className="mt-4 w-full rounded-xl border border-white/10 bg-[#101014] px-3 py-3 text-sm outline-none"><option value="">Select Devora project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><p className="mt-3 text-xs text-zinc-700">Open a project workspace to use Import, Diff, Pull and Push controls.</p></section>
            </div>

            {selectedRepo && <div className="mt-5 grid gap-4 lg:grid-cols-[.75fr_1.25fr]">
              <section className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5"><div className="flex items-center justify-between"><div><p className="text-sm font-medium">Branches</p><p className="mt-1 text-xs text-zinc-600">Protected branches are marked.</p></div><GitBranch size={16} className="text-zinc-600"/></div><div className="mt-4 space-y-1.5">{branches.map((item) => <button key={item.name} onClick={() => setBranch(item.name)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm ${branch === item.name ? "bg-white/[0.08] text-white" : "text-zinc-400 hover:bg-white/[0.04]"}`}><span className="flex min-w-0 items-center gap-2 truncate"><GitBranch size={13}/>{item.name}</span>{item.protected && <span className="text-[10px] text-amber-400">protected</span>}</button>)}</div></section>

              <section className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5"><div className="flex items-center justify-between"><div><p className="text-sm font-medium">Recent commits</p><p className="mt-1 text-xs text-zinc-600">Latest commits on {branch || "branch"}.</p></div><GitCommit size={16} className="text-zinc-600"/></div><div className="mt-4 divide-y divide-white/5">{commits.slice(0, 10).map((commit) => <a key={commit.sha} href={commit.url} target="_blank" rel="noreferrer" className="flex gap-3 py-3 hover:bg-white/[0.02]"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-zinc-600"/><div className="min-w-0"><p className="truncate text-sm text-zinc-300">{commit.message}</p><p className="mt-1 text-xs text-zinc-600">{commit.author} · {commit.shortSha}{commit.date ? ` · ${new Date(commit.date).toLocaleString()}` : ""}</p></div></a>)}{commits.length === 0 && <p className="py-8 text-center text-sm text-zinc-600">No commits found.</p>}</div></section>
              </div>}

            {selectedRepo && <section className="mt-5 rounded-2xl border border-white/10 bg-[#0f0f12] p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><p className="text-sm font-medium">Compare branches</p><p className="mt-1 text-xs text-zinc-600">Review GitHub's branch diff before syncing.</p></div><div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><select value={base} onChange={(e) => setBase(e.target.value)} className="rounded-xl border border-white/10 bg-[#101014] px-3 py-2.5 text-sm"><option value="">Base</option>{branches.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select><select value={head} onChange={(e) => setHead(e.target.value)} className="rounded-xl border border-white/10 bg-[#101014] px-3 py-2.5 text-sm"><option value="">Head</option>{branches.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select><button onClick={() => void compareBranches()} disabled={busy || !base || !head || base === head} className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black disabled:opacity-40">{busy ? <Loader2 size={15} className="animate-spin"/> : <GitCompare size={15}/>} Compare</button></div></div>{compare && <div className="mt-5"><div className="grid gap-3 sm:grid-cols-4"><Stat label="Status" value={compare.status}/><Stat label="Ahead" value={String(compare.aheadBy)}/><Stat label="Behind" value={String(compare.behindBy)}/><Stat label="Commits" value={String(compare.totalCommits)}/></div><div className="mt-4 rounded-xl border border-white/10 overflow-hidden"><div className="border-b border-white/10 px-4 py-3 text-xs uppercase tracking-wider text-zinc-600">Changed files</div><div className="max-h-[420px] overflow-y-auto">{compare.files.map((file) => <details key={file.filename} className="border-b border-white/5"><summary className="cursor-pointer list-none px-4 py-3 hover:bg-white/[0.03]"><div className="flex items-center justify-between gap-3"><span className="truncate font-mono text-xs text-zinc-300">{file.filename}</span><span className="shrink-0 text-[11px] text-zinc-600">+{file.additions} -{file.deletions}</span></div></summary><pre className="max-h-80 overflow-auto bg-black/30 p-4 font-mono text-[11px] leading-5 text-zinc-500 whitespace-pre-wrap">{file.patch || "No patch available."}</pre></details>)}{compare.files.length === 0 && <p className="p-8 text-center text-sm text-zinc-600">No file changes between these branches.</p>}</div></div></div>}</section>}
          </>
        )}
      </section>
    </Layout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3"><p className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</p><p className="mt-1 truncate text-sm font-semibold text-zinc-200">{value}</p></div>;
}
