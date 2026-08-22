import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Check, GitBranch, RotateCcw, Settings } from "lucide-react";
import Layout from "./Layout";
import TerminalWorkspace from "./TerminalPage";
import api from "../services/api";

interface Project { id: string; name: string; description: string | null; }

function ToolHeader({ title, description }: { title: string; description: string }) {
  return <div className="border-b border-white/10 px-5 py-6 sm:px-8"><p className="text-xs uppercase tracking-[0.2em] text-zinc-600">Devora</p><h1 className="mt-2 text-2xl font-semibold">{title}</h1><p className="mt-1 max-w-2xl text-sm text-zinc-500">{description}</p></div>;
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => { void api.get<Project[]>("/projects").then((response) => setProjects(response.data)).catch(() => setProjects([])); }, []);
  return <Layout active="Projects"><ToolHeader title="Projects" description="Choose a project and jump directly into its workspace." /><section className="p-5 sm:p-8"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{projects.map((project) => <button key={project.id} onClick={() => navigate(`/projects/${project.id}`)} className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5 text-left hover:border-white/20"><div className="flex items-center justify-between"><span className="font-medium">{project.name}</span><GitBranch size={15} className="text-zinc-600" /></div><p className="mt-2 text-sm text-zinc-500">{project.description || "No description."}</p><span className="mt-5 inline-block text-sm text-zinc-300">Open workspace →</span></button>)}</div>{projects.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 bg-[#0f0f12] p-10 text-center text-sm text-zinc-500">No projects found. Create one from Dashboard.</div>}</section></Layout>;
}

export function AssistantPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([{ role: "assistant", text: "I'm ready. Ask me about a project, a bug, or a refactor." }]);
  const send = () => { const text = input.trim(); if (!text) return; setMessages((current) => [...current, { role: "user", text }, { role: "assistant", text: `For now I'm running in workspace mode. I would analyze: “${text}”. Connect the AI provider later to make this response live.` }]); setInput(""); };
  return <Layout active="AI Assistant"><ToolHeader title="AI Assistant" description="A working conversation surface for future Devora AI integrations." /><section className="p-5 sm:p-8"><div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-[#0f0f12] p-5"><div className="space-y-4">{messages.map((message, index) => <div key={index} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${message.role === "user" ? "bg-white text-black" : "bg-white/[0.05] text-zinc-300"}`}>{message.role === "assistant" && <Bot size={14} className="mb-2" />}{message.text}</div></div>)}</div><div className="mt-5 flex gap-2"><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") send(); }} placeholder="Ask Devora..." className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none" /><button onClick={send} className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-black">Send</button></div></div></section></Layout>;
}

export function GitHubPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => { void api.get<Project[]>("/projects").then((response) => setProjects(response.data)).catch(() => setProjects([])); }, []);
  return <Layout active="GitHub"><ToolHeader title="GitHub" description="Repository actions are available inside each project workspace. No extra backend setup is required for these navigation tools." /><section className="p-5 sm:p-8"><div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-6"><div className="flex items-start gap-4"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.06]"><GitBranch size={20} /></div><div><h2 className="font-semibold">Project GitHub controls</h2><p className="mt-1 text-sm text-zinc-500">Open a project to connect GitHub, import repositories, compare changes, or push updates.</p></div></div><div className="mt-6 grid gap-3">{projects.map((project) => <button key={project.id} onClick={() => navigate(`/projects/${project.id}`)} className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-left hover:bg-white/[0.04]"><span>{project.name}</span><span className="text-sm text-zinc-500">Open GitHub controls →</span></button>)}</div></div></section></Layout>;
}

export function TerminalPage() {
  return <TerminalWorkspace />;
}

export function ActivityPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => { void api.get<Project[]>("/projects").then((response) => setProjects(response.data)).catch(() => setProjects([])); }, []);
  return <Layout active="Activity"><ToolHeader title="Activity" description="A lightweight workspace timeline based on your current project state." /><section className="p-5 sm:p-8"><div className="rounded-2xl border border-white/10 bg-[#0f0f12]">{projects.map((project, index) => <div key={project.id} className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 last:border-b-0"><div><p className="text-sm font-medium">{project.name}</p><p className="mt-1 text-xs text-zinc-500">Project available in your workspace</p></div><span className="text-xs text-zinc-600">{index === 0 ? "Latest" : "Saved"}</span></div>)}{projects.length === 0 && <div className="p-8 text-center text-sm text-zinc-500">No project activity yet.</div>}</div></section></Layout>;
}

export function SettingsPage() {
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const [compact, setCompact] = useState(localStorage.getItem("devora_compact") === "1");
  const toggleCompact = () => { const next = !compact; setCompact(next); localStorage.setItem("devora_compact", next ? "1" : "0"); setSaved(true); };
  const logout = () => { localStorage.removeItem("devora_token"); localStorage.removeItem("devora_user"); navigate("/login", { replace: true }); };
  return <Layout active="Settings"><ToolHeader title="Settings" description="Manage local workspace preferences and your session." /><section className="p-5 sm:p-8"><div className="max-w-2xl space-y-4"><div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5"><div className="flex items-center gap-3"><Settings size={18} /><div><p className="font-medium">Workspace density</p><p className="text-sm text-zinc-500">Keep compact UI spacing for smaller screens.</p></div></div><button onClick={toggleCompact} className={`mt-5 flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm ${compact ? "border-white/20 bg-white/[0.06]" : "border-white/10"}`}><span>{compact ? "Compact mode enabled" : "Compact mode disabled"}</span>{compact ? <Check size={16} /> : <RotateCcw size={16} className="text-zinc-600" />}</button>{saved && <p className="mt-2 text-xs text-emerald-400">Saved locally.</p>}</div><div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5"><p className="font-medium">Session</p><p className="mt-1 text-sm text-zinc-500">Sign out from this browser.</p><button onClick={logout} className="mt-5 rounded-xl border border-red-500/20 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10">Sign out</button></div></div></section></Layout>;
}
