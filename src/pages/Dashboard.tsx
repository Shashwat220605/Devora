import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { FormEvent } from "react";
import { ChevronRight, FolderGit2, GitBranch, Plus, Sparkles, Trash2 } from "lucide-react";
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

type Template = {
  label: string;
  description: string;
  language: string;
  files: Array<{ path: string; content: string }>;
};

const templates: Template[] = [
  { label: "Blank", description: "A clean workspace with no starter files.", language: "", files: [] },
  { label: "React + Vite", description: "A lightweight React starter with Vite-style files.", language: "TypeScript", files: [
    { path: "src/App.tsx", content: "export default function App() {\n  return <main>Hello from Devora</main>;\n}\n" },
    { path: "src/main.tsx", content: "import React from \"react\";\nimport { createRoot } from \"react-dom/client\";\nimport App from \"./App\";\nimport \"./index.css\";\n\ncreateRoot(document.getElementById(\"root\")!).render(<React.StrictMode><App /></React.StrictMode>);\n" },
    { path: "src/index.css", content: "body { margin: 0; font-family: system-ui, sans-serif; }\n" },
    { path: "package.json", content: "{\n  \"scripts\": { \"dev\": \"vite\", \"build\": \"vite build\" },\n  \"dependencies\": { \"react\": \"latest\", \"react-dom\": \"latest\", \"vite\": \"latest\" }\n}\n" },
  ] },
  { label: "Node + Express", description: "A small API starter for backend work.", language: "JavaScript", files: [
    { path: "src/index.js", content: "import express from \"express\";\n\nconst app = express();\napp.use(express.json());\napp.get(\"/\", (_req, res) => res.json({ ok: true }));\napp.listen(3000, () => console.log(\"API running on 3000\"));\n" },
    { path: "package.json", content: "{\n  \"type\": \"module\",\n  \"scripts\": { \"dev\": \"node src/index.js\" },\n  \"dependencies\": { \"express\": \"latest\" }\n}\n" },
    { path: "README.md", content: "# Node + Express starter\n\nRun `npm install` then `npm run dev`.\n" },
  ] },
  { label: "Python", description: "A simple Python application starter.", language: "Python", files: [
    { path: "main.py", content: "def main():\n    print(\"Hello from Devora\")\n\nif __name__ == \"__main__\":\n    main()\n" },
    { path: "requirements.txt", content: "\n" },
    { path: "README.md", content: "# Python starter\n" },
  ] },
  { label: "Java", description: "A minimal Java console project.", language: "Java", files: [
    { path: "src/Main.java", content: "public class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Hello from Devora\");\n    }\n}\n" },
    { path: "README.md", content: "# Java starter\n" },
  ] },
  { label: "C++", description: "A minimal C++ console project.", language: "C++", files: [
    { path: "main.cpp", content: "#include <iostream>\n\nint main() {\n    std::cout << \"Hello from Devora\\n\";\n    return 0;\n}\n" },
    { path: "README.md", content: "# C++ starter\n" },
  ] },
  { label: "Portfolio", description: "A simple HTML/CSS/JS portfolio starter.", language: "HTML", files: [
    { path: "index.html", content: "<!doctype html>\n<html><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Portfolio</title><link rel=\"stylesheet\" href=\"style.css\"></head><body><main><h1>Your Name</h1><p>Developer portfolio.</p></main><script src=\"script.js\"></script></body></html>\n" },
    { path: "style.css", content: "body { margin: 0; font-family: system-ui, sans-serif; background: #09090b; color: white; padding: 4rem; }\n" },
    { path: "script.js", content: "console.log(\"Portfolio ready\");\n" },
  ] },
];

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
  const [language, setLanguage] = useState(localStorage.getItem("devora_default_language") || "");
  const [templateLabel, setTemplateLabel] = useState("Blank");
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

  const selectedTemplate = templates.find((item) => item.label === templateLabel) || templates[0];
  const recentProject = useMemo(() => [...projects].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))[0], [projects]);
  const languageBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    projects.forEach((project) => counts.set(project.language || "Unspecified", (counts.get(project.language || "Unspecified") || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [projects]);

  const createProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      setCreating(true); setError("");
      const response = await api.post<Project>("/projects", {
        name: name.trim(),
        description: description.trim(),
        language: language.trim() || selectedTemplate.language,
      });
      let createdFiles = 0;
      for (const file of selectedTemplate.files) {
        try {
          await api.post(`/projects/${response.data.id}/files`, file);
          createdFiles += 1;
        } catch {
          // Keep the project usable even if a starter file fails.
        }
      }
      setProjects((current) => [response.data, ...current]);
      setName(""); setDescription(""); setLanguage(localStorage.getItem("devora_default_language") || ""); setTemplateLabel("Blank"); setShowModal(false);
      if (createdFiles) setError("");
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to create project.");
    } finally {
      setCreating(false);
    }
  };

  const selectTemplate = (label: string) => {
    setTemplateLabel(label);
    const next = templates.find((item) => item.label === label);
    if (next?.language) setLanguage(next.language);
  };

  const deleteProject = async (id: string) => {
    if (localStorage.getItem("devora_confirm_delete") !== "0" && !window.confirm("Delete this project? This cannot be undone.")) return;
    try {
      setDeletingId(id);
      setError("");
      await api.delete(`/projects/${id}`);
      setProjects((current) => current.filter((project) => project.id !== id));
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to delete project.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Layout active="Dashboard">
      <div className="border-b border-white/10 px-5 py-5 sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm text-zinc-500">Devora Workspace</p><h1 className="mt-1 text-2xl font-semibold">Welcome, {user?.name || "Developer"}</h1><p className="mt-1 text-xs text-zinc-600">Build, inspect, and organize your projects in one place.</p></div>
          <button onClick={() => setShowModal(true)} className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-zinc-200"><Plus size={16} /> New Project</button>
        </div>
      </div>

      <section className="p-5 sm:p-8">
        {error && <div className="mb-6 break-words rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <button onClick={() => navigate("/projects")} className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5 text-left hover:border-white/20"><span className="text-sm text-zinc-400">Projects</span><p className="mt-3 text-3xl font-semibold">{projects.length}</p><span className="text-xs text-zinc-500">Open project manager</span></button>
          <button onClick={() => navigate("/activity")} className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5 text-left hover:border-white/20"><span className="text-sm text-zinc-400">Workspace events</span><p className="mt-3 text-3xl font-semibold">Live</p><span className="text-xs text-zinc-500">See recent changes</span></button>
          <button onClick={() => navigate("/github")} className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5 text-left hover:border-white/20"><span className="text-sm text-zinc-400">GitHub</span><p className="mt-3 text-3xl font-semibold">→</p><span className="text-xs text-zinc-500">Connect later</span></button>
          <button onClick={() => navigate("/terminal")} className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5 text-left hover:border-white/20"><span className="text-sm text-zinc-400">Terminal</span><p className="mt-3 text-3xl font-semibold">Safe</p><span className="text-xs text-zinc-500">Run workspace previews</span></button>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[1.4fr_0.6fr]">
          <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm text-zinc-500">Recent project</p><h2 className="mt-1 text-xl font-semibold">{recentProject?.name || "No project yet"}</h2><p className="mt-2 text-sm text-zinc-500">{recentProject?.description || "Create a project from a template to get started."}</p></div>{recentProject && <button onClick={() => navigate(`/projects/${recentProject.id}`)} className="flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-sm font-medium text-black">Open <ChevronRight size={14}/></button>}</div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3"><span className="text-[11px] text-zinc-600">Last updated</span><p className="mt-1 text-sm text-zinc-300">{recentProject ? new Date(recentProject.updatedAt).toLocaleString() : "—"}</p></div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3"><span className="text-[11px] text-zinc-600">Language</span><p className="mt-1 text-sm text-zinc-300">{recentProject?.language || "—"}</p></div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3"><span className="text-[11px] text-zinc-600">Workspace state</span><p className="mt-1 text-sm text-emerald-400">Ready</p></div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-6">
            <div className="flex items-center gap-2"><Sparkles size={16}/><p className="font-medium">Languages</p></div>
            <div className="mt-5 space-y-4">
              {languageBreakdown.length === 0 ? <p className="text-sm text-zinc-600">No project languages yet.</p> : languageBreakdown.map(([label, count]) => <div key={label}><div className="flex justify-between text-xs"><span className="text-zinc-400">{label}</span><span className="text-zinc-600">{count}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-white" style={{ width: `${Math.max(12, (count / Math.max(projects.length, 1)) * 100)}%` }} /></div></div>)}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-lg font-semibold">AI Developer Assistant</p><p className="mt-1 max-w-2xl text-sm text-zinc-500">The interface is ready. We are keeping live AI for the final integration pass.</p></div><button onClick={() => navigate("/ai")} className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-zinc-200">Open Assistant</button></div></div>

        <div className="mt-8"><div className="mb-4 flex items-end justify-between gap-4"><div><h2 className="text-lg font-semibold">Your Projects</h2><p className="mt-1 text-sm text-zinc-500">Projects stored in your Devora workspace.</p></div><button onClick={() => navigate("/projects")} className="text-sm text-zinc-400 hover:text-white">View all</button></div>
          {loading ? <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-10 text-center text-sm text-zinc-500">Loading projects...</div> : projects.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 bg-[#0f0f12] p-10 text-center"><FolderGit2 className="mx-auto text-zinc-500" size={28} /><h3 className="mt-4 font-medium">No projects yet</h3><p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">Create your first project from a blank workspace or a starter template.</p><button onClick={() => setShowModal(true)} className="mt-5 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black">Create project</button></div> : <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{projects.map((project) => <div key={project.id} className="group rounded-2xl border border-white/10 bg-[#0f0f12] p-5 hover:border-white/20"><div className="flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06]"><FolderGit2 size={18} /></div><button onClick={() => void deleteProject(project.id)} disabled={deletingId === project.id} className="rounded-lg p-2 text-zinc-600 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"><Trash2 size={15} /></button></div><h3 className="mt-5 font-medium">{project.name}</h3><p className="mt-2 min-h-10 text-sm text-zinc-500">{project.description || "No description provided."}</p><div className="mt-5 flex items-center justify-between text-xs text-zinc-500"><span>{project.language || "Not specified"}</span><span><GitBranch size={12} className="mr-1 inline" />Workspace</span></div><button onClick={() => navigate(`/projects/${project.id}`)} className="mt-5 flex items-center gap-1 text-sm text-zinc-400 hover:text-white">Open project <ChevronRight size={14} /></button></div>)}</div>}
        </div>
      </section>

      {showModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#101014] p-6"><div className="flex items-center justify-between"><div><h3 className="text-xl font-semibold">Create Project</h3><p className="mt-1 text-sm text-zinc-500">Choose a starter and Devora will create the first files automatically.</p></div><button onClick={() => setShowModal(false)} className="rounded-lg p-2 text-zinc-500 hover:bg-white/[0.05] hover:text-white">×</button></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {templates.map((template) => <button key={template.label} type="button" onClick={() => selectTemplate(template.label)} className={`rounded-xl border p-4 text-left transition ${templateLabel === template.label ? "border-white/30 bg-white/[0.08]" : "border-white/10 hover:bg-white/[0.04]"}`}><div className="flex items-center justify-between gap-3"><span className="font-medium">{template.label}</span>{templateLabel === template.label && <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-black">Selected</span>}</div><p className="mt-1 text-xs text-zinc-500">{template.description}</p><p className="mt-3 text-[10px] text-zinc-700">{template.files.length} starter files</p></button>)}
        </div>
        <form onSubmit={createProject} className="mt-6 space-y-4"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" required className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none" /><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={3} className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none" /><select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#101014] px-4 py-3 text-sm outline-none"><option value="">Use template/default language</option>{["TypeScript","JavaScript","Python","Java","C++","C","C#","Go","Rust","HTML"].map((item) => <option key={item} value={item}>{item}</option>)}</select><div className="flex gap-3 pt-2"><button type="button" onClick={() => setShowModal(false)} className="flex-1 rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-400 hover:text-white">Cancel</button><button type="submit" disabled={creating} className="flex-1 rounded-xl bg-white px-4 py-3 text-sm font-medium text-black disabled:opacity-50">{creating ? "Creating workspace..." : `Create ${selectedTemplate.label}`}</button></div></form>
      </div></div>}
    </Layout>
  );
}
