import { useEffect, useMemo, useState } from "react";
import { Brain, Check, FolderCode, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import Layout from "./Layout";
import api from "../services/api";

type Project = { id: string; name: string; language: string | null };
type Category = "architecture" | "stack" | "conventions" | "decision" | "bug" | "deployment" | "note";
type Memory = { id: string; projectId: string; category: Category; title: string; content: string; createdAt?: string; updatedAt?: string };

const categories: Array<{ id: Category; label: string; description: string }> = [
  { id: "architecture", label: "Architecture", description: "System structure and boundaries" },
  { id: "stack", label: "Tech stack", description: "Frameworks, services, databases" },
  { id: "conventions", label: "Conventions", description: "Coding and team patterns" },
  { id: "decision", label: "Decisions", description: "Why important choices were made" },
  { id: "bug", label: "Known bugs", description: "Issues worth remembering" },
  { id: "deployment", label: "Deployment", description: "Hosting and release notes" },
  { id: "note", label: "Notes", description: "Anything else worth keeping" },
];

export default function ProjectMemory() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [memories, setMemories] = useState<Memory[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>("architecture");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedProject = projects.find((project) => project.id === projectId);
  const grouped = useMemo(
    () => categories.map((item) => ({ ...item, items: memories.filter((memory) => memory.category === item.id) })).filter((item) => item.items.length),
    [memories],
  );

  const loadProjects = async () => {
    const response = await api.get<Project[]>("/projects");
    setProjects(response.data);
    if (!projectId && response.data[0]) setProjectId(response.data[0].id);
  };

  const loadMemory = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError("");
      const response = await api.get<Memory[]>(`/projects/${projectId}/memory`);
      setMemories(response.data);
      setSelectedId(response.data[0]?.id || null);
      const first = response.data[0];
      if (first) {
        setCategory(first.category);
        setTitle(first.title);
        setContent(first.content);
      } else {
        clearForm();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to load project memory.");
      setMemories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadProjects().catch(() => setError("Unable to load projects.")); }, []);
  useEffect(() => { void loadMemory(); }, [projectId]);

  const clearForm = () => {
    setSelectedId(null);
    setCategory("architecture");
    setTitle("");
    setContent("");
  };

  const selectMemory = (memory: Memory) => {
    setSelectedId(memory.id);
    setCategory(memory.category);
    setTitle(memory.title);
    setContent(memory.content);
    setNotice("");
  };

  const save = async () => {
    if (!projectId || !title.trim() || !content.trim()) return;
    try {
      setSaving(true);
      setError("");
      setNotice("");
      if (selectedId) {
        const response = await api.put<Memory>(`/projects/${projectId}/memory/${selectedId}`, { category, title, content });
        setMemories((items) => items.map((item) => item.id === response.data.id ? { ...item, ...response.data } : item));
        setNotice("Memory updated");
      } else {
        const response = await api.post<Memory>(`/projects/${projectId}/memory`, { category, title, content });
        setMemories((items) => [response.data, ...items]);
        setSelectedId(response.data.id);
        setNotice("Memory saved");
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to save memory.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!projectId || !selectedId) return;
    try {
      setSaving(true);
      setError("");
      await api.delete(`/projects/${projectId}/memory/${selectedId}`);
      const remaining = memories.filter((item) => item.id !== selectedId);
      setMemories(remaining);
      const next = remaining[0];
      if (next) selectMemory(next); else clearForm();
      setNotice("Memory deleted");
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to delete memory.");
    } finally {
      setSaving(false);
    }
  };

  const projectName = selectedProject?.name || "your project";

  return (
    <Layout active="Project Memory">
      <div className="border-b border-white/10 px-5 py-6 sm:px-8">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">Devora Intelligence</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Project Memory</h1>
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-400">Persistent context</span>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">Keep architecture, conventions, decisions, bugs, and deployment notes close to the AI instead of explaining the same things twice.</p>
      </div>

      <section className="p-5 sm:p-8">
        {error && <div className="mb-5 flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"><span>{error}</span><button onClick={() => setError("")}><X size={15}/></button></div>}
        {notice && <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400"><Check size={15}/>{notice}</div>}

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex max-w-md items-center gap-2 text-xs text-zinc-500"><FolderCode size={14}/><span>Project</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="min-w-[210px] rounded-xl border border-white/10 bg-[#101014] px-3 py-2.5 text-sm text-zinc-200 outline-none"><option value="">Select project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}{project.language ? ` · ${project.language}` : ""}</option>)}</select></label>
          <button onClick={clearForm} disabled={!projectId} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-400 hover:bg-white/[0.04] hover:text-white disabled:opacity-40"><Plus size={15}/> New memory</button>
        </div>

        <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
          <aside className="rounded-2xl border border-white/10 bg-[#0f0f12] p-4">
            <div className="flex items-center gap-2"><Brain size={17}/><span className="font-medium">Memory bank</span><span className="ml-auto text-xs text-zinc-600">{memories.length}</span></div>
            <div className="mt-4 space-y-4">
              {grouped.length === 0 && <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-zinc-600">No memory yet. Add the first piece of project context.</div>}
              {grouped.map((group) => <div key={group.id}><p className="px-1 text-[10px] uppercase tracking-[0.18em] text-zinc-600">{group.label}</p><div className="mt-2 space-y-1">{group.items.map((memory) => <button key={memory.id} onClick={() => selectMemory(memory)} className={`w-full rounded-xl px-3 py-3 text-left ${selectedId === memory.id ? "bg-white text-black" : "text-zinc-400 hover:bg-white/[0.04] hover:text-white"}`}><p className="truncate text-sm font-medium">{memory.title}</p><p className={`mt-1 line-clamp-2 text-[11px] ${selectedId === memory.id ? "text-zinc-600" : "text-zinc-600"}`}>{memory.content}</p></button>)}</div></div>)}
            </div>
          </aside>

          <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.16em] text-zinc-600">{selectedId ? "Edit memory" : "New memory"}</p><h2 className="mt-2 text-lg font-semibold">Teach Devora about {projectName}</h2></div>{selectedId && <button onClick={remove} disabled={saving} className="inline-flex items-center gap-2 rounded-lg border border-red-500/20 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-40"><Trash2 size={13}/> Delete</button>}</div>

            <div className="mt-5 grid gap-4 sm:grid-cols-[190px_1fr]">
              <div><p className="text-xs text-zinc-500">Category</p><div className="mt-2 space-y-1">{categories.map((item) => <button key={item.id} onClick={() => setCategory(item.id)} className={`w-full rounded-xl border px-3 py-3 text-left ${category === item.id ? "border-white/20 bg-white text-black" : "border-white/10 text-zinc-400 hover:bg-white/[0.04]"}`}><p className="text-xs font-medium">{item.label}</p><p className={`mt-1 text-[10px] ${category === item.id ? "text-zinc-600" : "text-zinc-700"}`}>{item.description}</p></button>)}</div></div>
              <div><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Example: Backend architecture" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-zinc-700"/><textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write the durable fact Devora should remember..." className="mt-3 min-h-[360px] w-full resize-y rounded-xl border border-white/10 bg-black/20 px-4 py-4 text-sm leading-6 text-zinc-200 outline-none placeholder:text-zinc-700"/><div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-[11px] text-zinc-600">Memory is scoped to this project and protected by your account.</p><button onClick={() => void save()} disabled={saving || !projectId || !title.trim() || !content.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black disabled:opacity-40">{saving ? <Sparkles size={14} className="animate-pulse"/> : <Save size={14}/>} {selectedId ? "Update memory" : "Save memory"}</button></div></div>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-[#0f0f12] p-5">
          <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06]"><Sparkles size={16}/></div><div><p className="text-sm font-medium">How this helps</p><p className="text-xs text-zinc-600">Memory becomes the durable layer for future project-aware AI features.</p></div></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-white/5 bg-black/20 p-3"><p className="text-xs font-medium">Less repetition</p><p className="mt-1 text-[11px] text-zinc-600">Capture architectural facts once.</p></div><div className="rounded-xl border border-white/5 bg-black/20 p-3"><p className="text-xs font-medium">Better reviews</p><p className="mt-1 text-[11px] text-zinc-600">AI can judge changes against project intent.</p></div><div className="rounded-xl border border-white/5 bg-black/20 p-3"><p className="text-xs font-medium">Safer shipping</p><p className="mt-1 text-[11px] text-zinc-600">Keep deployment assumptions visible.</p></div></div>
        </div>
      </section>
    </Layout>
  );
}
