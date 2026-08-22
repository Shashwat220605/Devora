import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ExternalLink, GitBranch, Loader2, LogOut, RefreshCw, Upload } from "lucide-react";
import Layout from "./Layout";
import api from "../services/api";

interface Project { id: string; name: string; description: string | null; }
interface GitHubRepo {
  id: number; name: string; full_name: string; html_url: string; private: boolean;
  default_branch: string; description: string | null; language: string | null;
}

const CONNECTED_KEY = "devora_github_connected";

export default function GitHubHubFinal() {
  const navigate = useNavigate();
  const [connected, setConnected] = useState(() => localStorage.getItem(CONNECTED_KEY) === "true");
  const [projects, setProjects] = useState<Project[]>([]);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadRepos = async () => {
    try {
      setLoading(true); setError("");
      const response = await api.get<GitHubRepo[]>("/github/repos");
      setRepos(response.data);
      setConnected(true);
      localStorage.setItem(CONNECTED_KEY, "true");
    } catch (err: any) {
      if (err.response?.status === 401) {
        setConnected(false);
        localStorage.removeItem(CONNECTED_KEY);
      }
      setError(err.response?.data?.message || "Unable to load GitHub repositories.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthState = params.get("oauth");
    const oauthMessage = params.get("message");

    if (oauthState === "connected") {
      setConnected(true);
      localStorage.setItem(CONNECTED_KEY, "true");
      setMessage("GitHub connected successfully.");
      void loadRepos();
      window.history.replaceState({}, "", "/github");
    } else if (oauthState === "error") {
      setError(oauthMessage || "GitHub authorization failed.");
      window.history.replaceState({}, "", "/github");
    } else if (connected) {
      void loadRepos();
    }

    api.get<Project[]>("/projects")
      .then((response) => {
        setProjects(response.data);
        if (response.data[0]) setProjectId(response.data[0].id);
      })
      .catch((err) => setError(err.response?.data?.message || "Unable to load projects."));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? repos.filter((repo) => `${repo.name} ${repo.full_name} ${repo.language || ""}`.toLowerCase().includes(q))
      : repos;
  }, [repos, search]);

  const connect = async () => {
    try {
      setBusy(true); setError("");
      const response = await api.post<{ url: string }>("/github/oauth/begin");
      window.location.href = response.data.url;
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to start GitHub authorization.");
      setBusy(false);
    }
  };

  const disconnect = async () => {
    try {
      setBusy(true); setError("");
      await api.post("/github/disconnect");
      setConnected(false); setRepos([]); localStorage.removeItem(CONNECTED_KEY);
      setMessage("GitHub disconnected.");
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to disconnect GitHub.");
    } finally { setBusy(false); }
  };

  const importRepo = async (repo: GitHubRepo) => {
    if (!projectId) { setError("Select a Devora project first."); return; }
    try {
      setBusy(true); setError("");
      const response = await api.post<{ filesImported: number }>("/github/import", {
        projectId, repositoryUrl: repo.html_url,
      });
      setMessage(`Imported ${response.data.filesImported} files from ${repo.full_name}.`);
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to import repository.");
    } finally { setBusy(false); }
  };

  return (
    <Layout active="GitHub">
      <div className="border-b border-white/10 px-5 py-6 sm:px-8">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">Devora</p>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">GitHub</h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-500">Securely connect GitHub, browse repositories, import code, and manage repository workflows from Devora.</p>
          </div>
          {connected && <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400"><Check size={13} /> Connected to GitHub</span>}
        </div>
      </div>

      <section className="p-5 sm:p-8">
        {error && <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
        {message && <div className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{message}</div>}

        {!connected ? (
          <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-[#0f0f12] p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-black"><GitBranch size={24} /></div>
              <div><h2 className="font-semibold">Connect GitHub</h2><p className="mt-1 text-sm text-zinc-500">Authorize Devora through GitHub. No personal access token needs to be copied into Devora.</p></div>
            </div>
            <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-400"><p className="font-medium text-zinc-200">Secure OAuth connection</p><p className="mt-2 leading-6">GitHub handles the sign-in and permission screen. Devora keeps the resulting credentials encrypted on the backend.</p></div>
            <button onClick={() => void connect()} disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-40">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <GitBranch size={16} />} Continue with GitHub
            </button>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div><p className="text-sm font-medium">Repository manager</p><p className="mt-1 text-sm text-zinc-500">Choose the Devora project that will receive imported files.</p></div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="rounded-xl border border-white/10 bg-[#101014] px-3 py-2.5 text-sm outline-none"><option value="">Select project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
                  <button onClick={() => void loadRepos()} disabled={loading} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/[0.04]">{loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Refresh</button>
                  <button onClick={() => void disconnect()} disabled={busy} className="flex items-center justify-center gap-2 rounded-xl border border-red-500/20 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10"><LogOut size={15} /> Disconnect</button>
                </div>
              </div>
              <div className="mt-5 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5"><GitBranch size={15} className="text-zinc-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search repositories..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-700" /><span className="text-xs text-zinc-600">{filtered.length}</span></div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {filtered.map((repo) => (
                <div key={repo.id} className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5 hover:border-white/20">
                  <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex items-center gap-2"><GitBranch size={16} /><h3 className="truncate font-medium">{repo.name}</h3>{repo.private && <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-zinc-500">Private</span>}</div><p className="mt-1 truncate text-xs text-zinc-600">{repo.full_name}</p></div><a href={repo.html_url} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-zinc-500 hover:bg-white/[0.05] hover:text-white"><ExternalLink size={15} /></a></div>
                  <p className="mt-4 min-h-10 text-sm text-zinc-500">{repo.description || "No description provided."}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-zinc-500"><span className="rounded-full border border-white/10 px-2 py-1">{repo.language || "Unknown"}</span><span className="flex items-center gap-1 rounded-full border border-white/10 px-2 py-1"><GitBranch size={11} /> {repo.default_branch}</span></div>
                  <div className="mt-5 flex gap-2"><button onClick={() => void importRepo(repo)} disabled={busy || !projectId} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-40"><Upload size={15} /> Import</button><button onClick={() => projectId && navigate(`/projects/${projectId}`)} disabled={!projectId} className="flex-1 rounded-xl border border-white/10 px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/[0.04] disabled:opacity-40">Open workspace</button></div>
                </div>
              ))}
            </div>
            {!loading && filtered.length === 0 && <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-[#0f0f12] p-10 text-center text-sm text-zinc-500">No repositories found. Click Refresh to try again.</div>}
          </>
        )}
      </section>
    </Layout>
  );
}
