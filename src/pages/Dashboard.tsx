import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, FolderGit2, GitBranch, Plus, Trash2 } from "lucide-react";
import Layout from "./Layout";
import api from "../services/api";

interface Project {
  id: string;
  name: string;
  description: string | null;
  language: string | null;
  createdAt: string;
  updatedAt: string;
}

interface User { name: string | null; }

export default function Dashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState("");
  const user = JSON.parse(localStorage.getItem("devora_user") || "null") as User | null;

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await api.get<Project[]>("/projects");
      setProjects(response.data);
    } catch (err: any) {
      const message = err.response?.data?.message || "Failed to load your projects.";
      const detail = err.response?.data?.detail;
      setError(detail ? `${message} ${detail}` : message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadProjects(); }, []);

  const createProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      setCreating(true); setError("");
      const response = await api.post<Project>("/projects", { name: name.trim(), description: description.trim(), language: language.trim() });
      setProjects((current) => [response.data, ...current]);
      setName(""); setDescription(""); setLanguage(""); setShowModal(false);
    } catch (err: any) { setError(err.response?.data?.message || "Failed to create project."); }
    finally { setCreating(false); }
  };

  const deleteProject = async (id: string) => {
    if (!window.confirm("Delete this project? This cannot be undone.")) return;
    try { setDeletingId(id); await api.delete(`/projects/${id}`); setProjects((current) => current.filter((project) => project.id !== id)); }
    catch (err: any) { setError(err.response?.data?.message || "Failed to delete project."); }
    finally { setDeletingId(null); }
  };

  return (
    <Layout active="Dashboard">
      <div className="border-b border-white/10 px-5 py-5 sm:px-8"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm text-zinc-500">Devora Workspace</p><h1 className="mt-1 text-2xl font-semibold">Welcome, {user?.name || "Developer"}</h1></div><button onClick={() => setShowModal(true)} className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-zinc-200"><Plus size={16} /> New Project</button></div></div>
      <section className="p-5 sm:p-8">
        {error && <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400 break-words">{error}</div>}
        <div className="grid gap-4 md:grid-cols-3">
          <button onClick={() => navigate("/projects")} className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5 text-left hover:border-white/20"><span className="text-sm text-zinc-400">Projects</span><p className="mt-3 text-3xl font-semibold">{projects.length}</p><span className="text-xs text-zinc-500">Open project manager</span></button>
          <button onClick={() => navigate("/github")} className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5 text-left hover:border-white/20"><span className="text-sm text-zinc-400">GitHub</span><p className="mt-3 text-3xl font-semibold">→</p><span className="text-xs text-zinc-500">Open GitHub tools</span></button>
          <button onClick={() => navigate("/activity")} className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5 text-left hover:border-white/20"><span className="text-sm text-zinc-400">Activity</span><p className="mt-3 text-3xl font-semibold">{projects.length}</p><span className="text-xs text-zinc-500">View workspace activity</span></button>
        </div>
        <div className="mt-8 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-lg font-semibold">AI Developer Assistant</p><p className="mt-1 max-w-2xl text-sm text-zinc-500">Ask Devora to explain code, plan a refactor, or help debug a project.</p></div><button onClick={() => navigate("/ai")} className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-zinc-200">Open Assistant</button></div></div>
        <div className="mt-8"><div className="mb-4 flex items-end justify-between gap-4"><div><h2 className="text-lg font-semibold">Your Projects</h2><p className="mt-1 text-sm text-zinc-500">Projects stored in your Devora workspace.</p></div><button onClick={() => navigate("/projects")} className="text-sm text-zinc-400 hover:text-white">View all</button></div>
          {loading ? <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-10 text-center text-sm text-zinc-500">Loading projects...</div> : projects.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 bg-[#0f0f12] p-10 text-center"><FolderGit2 className="mx-auto text-zinc-500" size={28} /><h3 className="mt-4 font-medium">No projects yet</h3><p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">Create your first project and start building.</p><button onClick={() => setShowModal(true)} className="mt-5 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black">Create project</button></div> : <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{projects.map((project) => <div key={project.id} className="group rounded-2xl border border-white/10 bg-[#0f0f12] p-5 hover:border-white/20"><div className="flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06]"><FolderGit2 size={18} /></div><button onClick={() => void deleteProject(project.id)} disabled={deletingId === project.id} className="rounded-lg p-2 text-zinc-600 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"><Trash2 size={15} /></button></div><h3 className="mt-5 font-medium">{project.name}</h3><p className="mt-2 min-h-10 text-sm text-zinc-500">{project.description || "No description provided."}</p><div className="mt-5 flex items-center justify-between text-xs text-zinc-500"><span>{project.language || "Not specified"}</span><span><GitBranch size={12} className="mr-1 inline" />Workspace</span></div><button onClick={() => navigate(`/projects/${project.id}`)} className="mt-5 flex items-center gap-1 text-sm text-zinc-400 hover:text-white">Open project <ChevronRight size={14} /></button></div>)}</div>}
        </div>
      </section>
      {showModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"><div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#101014] p-6"><div className="flex items-center justify-between"><div><h3 className="text-xl font-semibold">Create Project</h3><p className="mt-1 text-sm text-zinc-500">Add a project to your workspace.</p></div><button onClick={() => setShowModal(false)} className="rounded-lg p-2 text-zinc-500 hover:bg-white/[0.05] hover:text-white">×</button></div><form onSubmit={createProject} className="mt-6 space-y-4"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" required className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none" /><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={3} className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none" /><select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#101014] px-4 py-3 text-sm outline-none"><option value="">Select language</option>{["TypeScript","JavaScript","Python","Java","C++","C","C#","Go","Rust"].map((item) => <option key={item} value={item}>{item}</option>)}</select><div className="flex gap-3 pt-2"><button type="button" onClick={() => setShowModal(false)} className="flex-1 rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-400 hover:text-white">Cancel</button><button type="submit" disabled={creating} className="flex-1 rounded-xl bg-white px-4 py-3 text-sm font-medium text-black disabled:opacity-50">{creating ? "Creating..." : "Create Project"}</button></div></form></div></div>}
    </Layout>
  );
}
