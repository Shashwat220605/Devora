import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  GitBranch,
  GitCommitHorizontal,
  Loader2,
  RefreshCw,
  UploadCloud,
  DownloadCloud,
  ExternalLink,
} from "lucide-react";
import Layout from "./Layout";
import api from "../services/api";

interface Project {
  id: string;
  name: string;
}

interface Branch {
  name: string;
  protected: boolean;
  sha: string | null;
}

interface Commit {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string | null;
  url: string;
}

interface LocalStatus {
  project: string;
  branch: string;
  headSha: string | null;
  totalLocal: number;
  totalRemote: number;
  clean: boolean;
  counts: {
    changed: number;
    added: number;
    deleted: number;
    unchanged: number;
  };
  changes: Array<{ path: string; status: "added" | "modified" | "deleted" }>;
}

export default function GitHubRepoWorkspace() {
  const [params] = useSearchParams();
  const repositoryUrl = params.get("url") || "";
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branch, setBranch] = useState("");
  const [commits, setCommits] = useState<Commit[]>([]);
  const [status, setStatus] = useState<LocalStatus | null>(null);
  const [commitMessage, setCommitMessage] = useState("Update from Devora");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const repoName = useMemo(() => {
    try {
      const url = new URL(repositoryUrl);
      const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
      return parts.length >= 2 ? `${parts[0]}/${parts[1].replace(/\.git$/i, "")}` : "GitHub repository";
    } catch {
      return "GitHub repository";
    }
  }, [repositoryUrl]);

  const loadProjects = async () => {
    const response = await api.get<Project[]>("/projects");
    setProjects(response.data);
    if (!projectId && response.data[0]) setProjectId(response.data[0].id);
  };

  const loadRepository = async (selectedBranch?: string) => {
    if (!repositoryUrl) return;
    const branchParam = selectedBranch || branch;
    const [branchesResponse] = await Promise.all([
      api.get<Branch[]>("/github/branches", { params: { repositoryUrl } }),
    ]);
    setBranches(branchesResponse.data);

    const nextBranch = branchParam || branchesResponse.data[0]?.name || "main";
    setBranch(nextBranch);

    const commitsResponse = await api.get<Commit[]>("/github/commits", {
      params: { repositoryUrl, branch: nextBranch },
    });
    setCommits(commitsResponse.data);
  };

  const loadStatus = async () => {
    if (!repositoryUrl || !projectId || !branch) return;
    const response = await api.get<LocalStatus>("/github/local-status", {
      params: { repositoryUrl, projectId, branch },
    });
    setStatus(response.data);
  };

  const refresh = async () => {
    try {
      setLoading(true);
      setError("");
      await loadProjects();
      await loadRepository();
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to load repository workspace.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [repositoryUrl]);

  useEffect(() => {
    if (projectId && branch) void loadStatus().catch((err: any) => setError(err.response?.data?.message || "Unable to compare project with GitHub."));
  }, [projectId, branch]);

  const commit = async () => {
    if (!projectId || !branch) {
      setError("Select a project and branch first.");
      return;
    }
    if (!commitMessage.trim()) {
      setError("Enter a commit message.");
      return;
    }
    try {
      setBusy(true);
      setError("");
      const response = await api.post<{ commitUrl?: string; commitSha: string; message: string }>("/github/push-mirror", {
        projectId,
        repositoryUrl,
        branch,
        commitMessage: commitMessage.trim(),
      });
      setMessage(`Committed ${response.data.commitSha.slice(0, 7)} to ${branch}.`);
      await Promise.all([loadStatus(), loadRepository(branch)]);
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to commit changes to GitHub.");
    } finally {
      setBusy(false);
    }
  };

  const pull = async () => {
    if (!projectId || !branch) {
      setError("Select a project and branch first.");
      return;
    }
    try {
      setBusy(true);
      setError("");
      const response = await api.post<{ created: number; updated: number; removed: number }>("/github/sync", {
        projectId,
        repositoryUrl,
        branch,
      });
      setMessage(`Pulled ${response.data.created + response.data.updated} changed files from GitHub and removed ${response.data.removed}.`);
      await loadStatus();
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to pull GitHub changes.");
    } finally {
      setBusy(false);
    }
  };

  if (!repositoryUrl) {
    return (
      <Layout active="GitHub">
        <div className="p-8 text-sm text-red-400">A repository URL is required.</div>
      </Layout>
    );
  }

  return (
    <Layout active="GitHub">
      <div className="border-b border-white/10 px-5 py-6 sm:px-8">
        <Link to="/github" className="inline-flex items-center gap-2 text-xs text-zinc-500 hover:text-white">
          <ArrowLeft size={14} /> Back to GitHub
        </Link>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">Repository workspace</p>
            <h1 className="mt-2 text-2xl font-semibold">{repoName}</h1>
            <p className="mt-1 text-sm text-zinc-500">Remote Git status, branch history, pull, and atomic commits from Devora.</p>
          </div>
          <a href={repositoryUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/[0.04]">
            Open on GitHub <ExternalLink size={14} />
          </a>
        </div>
      </div>

      <section className="p-5 sm:p-8">
        {error && <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
        {message && <div className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{message}</div>}

        <div className="grid gap-4 xl:grid-cols-[1.1fr_1.9fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Workspace sync</p>
                  <p className="mt-1 text-xs text-zinc-500">Compare your Devora project against the selected GitHub branch.</p>
                </div>
                <button onClick={() => void refresh()} disabled={loading || busy} className="rounded-xl border border-white/10 p-2 text-zinc-400 hover:bg-white/[0.04]">
                  <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                </button>
              </div>

              <label className="mt-5 block text-xs text-zinc-500">Devora project</label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#101014] px-3 py-2.5 text-sm outline-none">
                <option value="">Select project</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>

              <label className="mt-4 block text-xs text-zinc-500">Branch</label>
              <select value={branch} onChange={(e) => { setBranch(e.target.value); void loadRepository(e.target.value); }} className="mt-2 w-full rounded-xl border border-white/10 bg-[#101014] px-3 py-2.5 text-sm outline-none">
                <option value="">Select branch</option>
                {branches.map((item) => <option key={item.name} value={item.name}>{item.name}{item.protected ? " · protected" : ""}</option>)}
              </select>

              {status && (
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-xs text-zinc-500">Modified</p><p className="mt-1 text-lg font-semibold">{status.counts.changed}</p></div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-xs text-zinc-500">Added</p><p className="mt-1 text-lg font-semibold">{status.counts.added}</p></div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-xs text-zinc-500">Deleted</p><p className="mt-1 text-lg font-semibold">{status.counts.deleted}</p></div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-xs text-zinc-500">Status</p><p className="mt-1 text-sm font-semibold">{status.clean ? "Clean" : "Changes ready"}</p></div>
                </div>
              )}

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button onClick={() => void pull()} disabled={busy || !projectId || !branch} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/[0.04] disabled:opacity-40">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <DownloadCloud size={15} />} Pull
                </button>
                <button onClick={() => void loadStatus()} disabled={loading || !projectId || !branch} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/[0.04] disabled:opacity-40">
                  <RefreshCw size={15} /> Check status
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5">
              <div className="flex items-center gap-2"><GitCommitHorizontal size={16} /><p className="text-sm font-medium">Commit changes</p></div>
              <p className="mt-1 text-xs text-zinc-500">Devora creates one atomic Git commit from the current project snapshot.</p>
              <input value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)} maxLength={120} placeholder="Commit message" className="mt-4 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none" />
              <button onClick={() => void commit()} disabled={busy || !projectId || !branch || Boolean(status?.clean)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-40">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />} Commit to GitHub
              </button>
              {status?.clean && <p className="mt-2 text-center text-xs text-zinc-600">No changes to commit.</p>}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Git status</p>
                  <p className="mt-1 text-xs text-zinc-500">Tracked differences between Devora and GitHub.</p>
                </div>
                {status?.clean && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400"><Check size={12} /> Clean</span>}
              </div>
              <div className="mt-4 max-h-[360px] overflow-auto rounded-xl border border-white/10">
                {status?.changes.length ? status.changes.map((change) => (
                  <div key={`${change.status}-${change.path}`} className="flex items-center justify-between gap-4 border-b border-white/5 px-4 py-3 last:border-b-0">
                    <span className="truncate font-mono text-xs text-zinc-300">{change.path}</span>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] uppercase ${change.status === "added" ? "border-emerald-500/20 text-emerald-400" : change.status === "deleted" ? "border-red-500/20 text-red-400" : "border-amber-500/20 text-amber-400"}`}>{change.status}</span>
                  </div>
                )) : <div className="p-8 text-center text-sm text-zinc-600">No file differences detected.</div>}
              </div>
              {status && <p className="mt-3 text-xs text-zinc-600">Local files: {status.totalLocal} · Remote files: {status.totalRemote} · Remote head: {status.headSha ? status.headSha.slice(0, 7) : "unknown"}</p>}
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5">
              <div className="flex items-center gap-2"><GitBranch size={16} /><p className="text-sm font-medium">Recent commits</p></div>
              <div className="mt-4 space-y-2">
                {commits.slice(0, 8).map((commit) => (
                  <a key={commit.sha} href={commit.url} target="_blank" rel="noreferrer" className="block rounded-xl border border-white/5 bg-black/20 px-4 py-3 hover:border-white/10">
                    <div className="flex items-start justify-between gap-3"><p className="truncate text-sm text-zinc-300">{commit.message}</p><span className="shrink-0 font-mono text-[10px] text-zinc-600">{commit.shortSha}</span></div>
                    <p className="mt-1 text-xs text-zinc-600">{commit.author}{commit.date ? ` · ${new Date(commit.date).toLocaleString()}` : ""}</p>
                  </a>
                ))}
                {!commits.length && <p className="text-sm text-zinc-600">No commits found.</p>}
              </div>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
