import { useEffect, useMemo, useState } from "react";
import { Activity, Code2, FolderGit2, GitBranch, GitCompareArrows, Play, Workflow } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Layout from "./Layout";
import api from "../services/api";

type Project = { id: string; name: string; description: string | null; language: string | null; createdAt?: string; updatedAt?: string };

type Repo = { name: string; url: string };

export default function ProjectCommandCenter() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [projectId, setProjectId] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([api.get<Project[]>("/projects"), api.get<Repo[]>("/github/repos").catch(() => ({ data: [] as Repo[] }))])
      .then(([projectResponse, repoResponse]) => {
        setProjects(projectResponse.data);
        setRepos(repoResponse.data);
        setProjectId(projectResponse.data[0]?.id || "");
        setRepoUrl(repoResponse.data[0]?.url || "");
      })
      .catch((err: any) => setError(err.response?.data?.message || "Unable to load projects."));
  }, []);

  const selected = useMemo(() => projects.find((item) => item.id === projectId) || projects[0] || null, [projects, projectId]);

  const openWorkspace = () => { if (selected) navigate(`/projects/${selected.id}`); };
  const openDiff = () => {
    if (!selected) return;
    const query = new URLSearchParams({ projectId: selected.id });
    if (repoUrl) query.set("url", repoUrl);
    navigate(`/github/diff?${query.toString()}`);
  };

  return <Layout active="Projects">
    <div className="border-b border-white/10 px-5 py-6 sm:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">Devora</p>
      <h1 className="mt-2 text-2xl font-semibold">Project Command Center</h1>
      <p className="mt-1 max-w-2xl text-sm text-zinc-500">One place to open code, inspect Git changes, run code, and jump into project activity.</p>
    </div>
    <section className="p-5 sm:p-8">
      {error && <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
        <aside className="rounded-2xl border border-white/10 bg-[#0f0f12] p-4">
          <div className="flex items-center justify-between"><div><p className="font-medium">Projects</p><p className="mt-1 text-xs text-zinc-600">{projects.length} available</p></div><FolderGit2 size={17} className="text-zinc-600"/></div>
          <div className="mt-4 space-y-2">{projects.map((project) => <button key={project.id} onClick={() => setProjectId(project.id)} className={`w-full rounded-xl border px-4 py-3 text-left ${project.id === projectId ? "border-white/20 bg-white/[0.06]" : "border-white/5 hover:border-white/10"}`}><div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-medium">{project.name}</span><span className="text-[10px] text-zinc-600">{project.language || "code"}</span></div><p className="mt-1 truncate text-xs text-zinc-600">{project.description || "No description"}</p></button>)}</div>
        </aside>
        <div className="space-y-5">
          {!selected ? <div className="rounded-2xl border border-dashed border-white/10 bg-[#0f0f12] p-10 text-center text-sm text-zinc-500">Create a project to open its command center.</div> : <>
            <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-xs uppercase tracking-[0.16em] text-zinc-600">Selected project</p><h2 className="mt-2 text-2xl font-semibold">{selected.name}</h2><p className="mt-2 max-w-2xl text-sm text-zinc-500">{selected.description || "A Devora project workspace."}</p></div><button onClick={openWorkspace} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black"><Code2 size={15}/> Open editor</button></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-white/10 p-4"><p className="text-[10px] uppercase text-zinc-600">Language</p><p className="mt-1 font-medium">{selected.language || "Unspecified"}</p></div><div className="rounded-xl border border-white/10 p-4"><p className="text-[10px] uppercase text-zinc-600">Created</p><p className="mt-1 text-sm text-zinc-300">{selected.createdAt ? new Date(selected.createdAt).toLocaleDateString() : "-"}</p></div><div className="rounded-xl border border-white/10 p-4"><p className="text-[10px] uppercase text-zinc-600">Updated</p><p className="mt-1 text-sm text-zinc-300">{selected.updatedAt ? new Date(selected.updatedAt).toLocaleString() : "-"}</p></div></div></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <button onClick={openWorkspace} className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5 text-left hover:border-white/20"><Code2 size={18}/><p className="mt-3 font-medium">Code workspace</p><p className="mt-1 text-xs text-zinc-600">Explorer, tabs, Monaco editor, create, rename, delete.</p></button>
              <button onClick={() => navigate("/runner")} className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5 text-left hover:border-white/20"><Play size={18}/><p className="mt-3 font-medium">Code runner</p><p className="mt-1 text-xs text-zinc-600">Run JavaScript or preview HTML and CSS.</p></button>
              <button onClick={openDiff} className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5 text-left hover:border-white/20"><GitCompareArrows size={18}/><p className="mt-3 font-medium">Git diff</p><p className="mt-1 text-xs text-zinc-600">Inspect added, modified, and deleted code.</p></button>
              <button onClick={() => navigate("/activity")} className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5 text-left hover:border-white/20"><Activity size={18}/><p className="mt-3 font-medium">Activity</p><p className="mt-1 text-xs text-zinc-600">Recent workspace events and project activity.</p></button>
              <button onClick={() => navigate("/github")} className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5 text-left hover:border-white/20"><GitBranch size={18}/><p className="mt-3 font-medium">GitHub</p><p className="mt-1 text-xs text-zinc-600">Repositories, branches, commits, and CI.</p></button>
              <button onClick={() => navigate(`/github/repo${repoUrl ? `?url=${encodeURIComponent(repoUrl)}` : ""}`)} className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5 text-left hover:border-white/20"><Workflow size={18}/><p className="mt-3 font-medium">Developer workspace</p><p className="mt-1 text-xs text-zinc-600">Editor, activity, and CI/CD for a connected repository.</p></button>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">Default repository for Git tools</p><p className="mt-1 text-xs text-zinc-600">Choose one connected GitHub repository for quick diff access.</p></div><select value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} className="rounded-xl border border-white/10 bg-[#101014] px-3 py-2.5 text-sm outline-none"><option value="">No repository selected</option>{repos.map((repo) => <option key={repo.url} value={repo.url}>{repo.name}</option>)}</select></div></div>
          </>}
        </div>
      </div>
    </section>
  </Layout>;
}
