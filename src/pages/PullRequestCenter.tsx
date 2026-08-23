import { useEffect, useMemo, useState } from "react";
import { GitPullRequest, GitMerge, MessageSquare, RefreshCw, ExternalLink, Plus, X, Loader2 } from "lucide-react";
import Layout from "./Layout";
import api from "../services/api";

type Repo = { name: string; url: string };
type PR = { number: number; title: string; body: string; state: string; draft: boolean; merged: boolean; head: string; base: string; author: string; avatarUrl: string | null; createdAt: string; updatedAt: string; url: string };
type PRDetail = PR & { mergeable: boolean | null; mergeableState: string | null; files: Array<{ path: string; status: string; additions: number; deletions: number; changes: number; patch: string | null }>; comments: Array<{ id: number; author: string; body: string; createdAt: string }> };

export default function PullRequestCenter() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [state, setState] = useState("open");
  const [prs, setPrs] = useState<PR[]>([]);
  const [selected, setSelected] = useState<PRDetail | null>(null);
  const [comment, setComment] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [head, setHead] = useState("");
  const [base, setBase] = useState("main");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const repoName = useMemo(() => {
    try { const u = new URL(repositoryUrl); return u.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, ""); } catch { return "GitHub"; }
  }, [repositoryUrl]);

  const load = async () => {
    if (!repositoryUrl) return;
    try {
      setError("");
      const response = await api.get<PR[]>("/github/prs", { params: { repositoryUrl, state } });
      setPrs(response.data);
    } catch (err: any) { setError(err.response?.data?.message || "Unable to load pull requests."); }
  };

  const loadRepos = async () => {
    try {
      const response = await api.get<any[]>("/github/repos");
      const mapped = response.data.map((r) => ({ name: r.full_name || r.name, url: r.html_url || r.url })).filter((r) => r.url);
      setRepos(mapped);
      if (!repositoryUrl && mapped[0]) setRepositoryUrl(mapped[0].url);
    } catch { setRepos([]); }
  };

  useEffect(() => { void loadRepos(); }, []);
  useEffect(() => { void load(); }, [repositoryUrl, state]);

  const openPR = async (number: number) => {
    try {
      setBusy(true); setError("");
      const response = await api.get<PRDetail>(`/github/prs/${number}`, { params: { repositoryUrl } });
      setSelected(response.data);
    } catch (err: any) { setError(err.response?.data?.message || "Unable to load pull request."); }
    finally { setBusy(false); }
  };

  const createPR = async () => {
    if (!title || !head || !base) return setError("Title, head, and base are required.");
    try {
      setBusy(true); setError("");
      const response = await api.post<PR>("/github/prs", { repositoryUrl, title, body, head, base, draft: false });
      setShowCreate(false); setTitle(""); setBody(""); setHead(""); setBase("main");
      await load(); await openPR(response.data.number);
    } catch (err: any) { setError(err.response?.data?.message || "Unable to create pull request."); }
    finally { setBusy(false); }
  };

  const addComment = async () => {
    if (!selected || !comment.trim()) return;
    try {
      setBusy(true); setError("");
      await api.post(`/github/prs/${selected.number}/comments`, { repositoryUrl, body: comment });
      setComment(""); await openPR(selected.number);
    } catch (err: any) { setError(err.response?.data?.message || "Unable to add comment."); }
    finally { setBusy(false); }
  };

  const merge = async (method: "merge" | "squash" | "rebase") => {
    if (!selected) return;
    try {
      setBusy(true); setError("");
      await api.post(`/github/prs/${selected.number}/merge`, { repositoryUrl, method });
      await load(); await openPR(selected.number);
    } catch (err: any) { setError(err.response?.data?.message || "Unable to merge pull request."); }
    finally { setBusy(false); }
  };

  return <Layout active="GitHub">
    <div className="border-b border-white/10 px-5 py-6 sm:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">Git workflow</p>
      <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><h1 className="text-2xl font-semibold">Pull Request Center</h1><p className="mt-1 text-sm text-zinc-500">Create, review, comment on, and merge GitHub pull requests without leaving Devora.</p></div>
        <div className="flex flex-wrap gap-2"><select value={repositoryUrl} onChange={(e) => setRepositoryUrl(e.target.value)} className="rounded-xl border border-white/10 bg-[#101014] px-3 py-2.5 text-sm outline-none">{repos.map((repo) => <option key={repo.url} value={repo.url}>{repo.name}</option>)}</select><select value={state} onChange={(e) => setState(e.target.value)} className="rounded-xl border border-white/10 bg-[#101014] px-3 py-2.5 text-sm outline-none"><option value="open">Open</option><option value="closed">Closed</option><option value="all">All</option></select><button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black"><Plus size={15}/> New PR</button><button onClick={() => void load()} className="rounded-xl border border-white/10 p-2.5 text-zinc-400"><RefreshCw size={16}/></button></div>
      </div>
    </div>
    <section className="p-5 sm:p-8">
      {error && <div className="mb-5 flex justify-between rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"><span>{error}</span><button onClick={() => setError("")}><X size={15}/></button></div>}
      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <div className="space-y-3">
          {prs.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 bg-[#0f0f12] p-10 text-center text-sm text-zinc-600">No pull requests found for {repoName || "this repository"}.</div> : prs.map((pr) => <button key={pr.number} onClick={() => void openPR(pr.number)} className={`w-full rounded-2xl border p-5 text-left hover:border-white/20 ${selected?.number === pr.number ? "border-white/20 bg-white/[0.04]" : "border-white/10 bg-[#0f0f12]"}`}><div className="flex items-start gap-3"><GitPullRequest size={18} className="mt-0.5 text-emerald-400"/><div className="min-w-0 flex-1"><p className="font-medium">#{pr.number} {pr.title}</p><p className="mt-2 text-xs text-zinc-500">{pr.author} · {pr.head} → {pr.base}</p><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase text-zinc-500">{pr.state}</span>{pr.draft && <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300">draft</span>}{pr.merged && <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[10px] text-violet-300">merged</span>}</div></div></div></button>)}
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0f0f12] min-h-[650px] overflow-hidden">
          {!selected ? <div className="flex min-h-[650px] items-center justify-center text-sm text-zinc-600">Select a pull request to review its files and discussion.</div> : <div><div className="border-b border-white/10 p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs text-zinc-600">#{selected.number}</p><h2 className="mt-1 text-xl font-semibold">{selected.title}</h2><p className="mt-2 text-sm text-zinc-500">{selected.head} → {selected.base} · {selected.author}</p></div><a href={selected.url} target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 p-2.5 text-zinc-400"><ExternalLink size={16}/></a></div>{selected.body && <p className="mt-5 whitespace-pre-wrap text-sm text-zinc-300">{selected.body}</p>}<div className="mt-5 flex flex-wrap gap-2"><button disabled={busy || selected.merged} onClick={() => void merge("merge")} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black disabled:opacity-40"><GitMerge size={15}/> Merge</button><button disabled={busy || selected.merged} onClick={() => void merge("squash")} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-300 disabled:opacity-40">Squash</button><button disabled={busy || selected.merged} onClick={() => void merge("rebase")} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-300 disabled:opacity-40">Rebase</button></div></div>
          <div className="grid gap-5 p-6 xl:grid-cols-[1fr_320px]"><div><div className="flex items-center gap-2 text-sm font-medium"><GitPullRequest size={15}/> Changed files ({selected.files.length})</div><div className="mt-3 space-y-3">{selected.files.map((file) => <details key={file.path} className="rounded-xl border border-white/10"><summary className="cursor-pointer list-none px-4 py-3"><div className="flex items-center justify-between gap-3"><span className="truncate font-mono text-xs">{file.path}</span><span className="text-[10px] text-zinc-600">+{file.additions} / -{file.deletions}</span></div></summary>{file.patch && <pre className="max-h-72 overflow-auto border-t border-white/10 p-4 text-xs leading-5 text-zinc-400">{file.patch}</pre>}</details>)}</div></div><div><div className="flex items-center gap-2 text-sm font-medium"><MessageSquare size={15}/> Discussion</div><div className="mt-3 space-y-3 max-h-[380px] overflow-auto">{selected.comments.map((item) => <div key={item.id} className="rounded-xl border border-white/10 p-3"><p className="text-xs font-medium">{item.author}</p><p className="mt-2 whitespace-pre-wrap text-xs text-zinc-500">{item.body}</p></div>)}{selected.comments.length === 0 && <p className="text-xs text-zinc-600">No comments yet.</p>}</div><div className="mt-3 flex gap-2"><textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a review comment..." className="min-h-24 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs outline-none"/><button disabled={busy || !comment.trim()} onClick={() => void addComment()} className="self-end rounded-xl bg-white p-3 text-black disabled:opacity-40"><MessageSquare size={14}/></button></div></div></div></div>}
        </div>
      </div>
      {showCreate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5"><div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#111116] p-6"><div className="flex items-center justify-between"><h2 className="font-semibold">Create pull request</h2><button onClick={() => setShowCreate(false)}><X size={16}/></button></div><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="mt-5 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/><div className="mt-3 grid gap-3 sm:grid-cols-2"><input value={head} onChange={(e) => setHead(e.target.value)} placeholder="Head branch" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/><input value={base} onChange={(e) => setBase(e.target.value)} placeholder="Base branch" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/></div><textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Description" className="mt-3 min-h-32 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/><button disabled={busy} onClick={() => void createPR()} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-black disabled:opacity-40">{busy ? <Loader2 size={15} className="animate-spin"/> : <GitPullRequest size={15}/>} Create PR</button></div></div>}
    </section>
  </Layout>;
}
