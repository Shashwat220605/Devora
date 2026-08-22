import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Bot, Check, Circle, GitBranch, LayoutDashboard, Monitor, RotateCcw, Settings as SettingsIcon, UserRound, Trash2 } from "lucide-react";
import Layout from "./Layout";
import TerminalWorkspace from "./TerminalPage";
import api from "../services/api";
import { clearNotifications, getNotifications, markAllNotificationsRead, type NotificationItem } from "../services/notifications";

interface Project { id: string; name: string; description: string | null; language: string | null; createdAt?: string; updatedAt?: string; }

function ToolHeader({ title, description }: { title: string; description: string }) {
  return <div className="border-b border-white/10 px-5 py-6 sm:px-8"><p className="text-xs uppercase tracking-[0.2em] text-zinc-600">Devora</p><h1 className="mt-2 text-2xl font-semibold">{title}</h1><p className="mt-1 max-w-2xl text-sm text-zinc-500">{description}</p></div>;
}

function relativeTime(value?: string) {
  if (!value) return "Now";
  const diff = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (diff < 1) return "Just now";
  if (diff < 60) return `${diff}m ago`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { void api.get<Project[]>("/projects").then((response) => setProjects(response.data)).catch((err) => setError(err.response?.data?.message || "Unable to load projects.")); }, []);
  return <Layout active="Projects"><ToolHeader title="Projects" description="Choose a project and jump directly into its workspace." /><section className="p-5 sm:p-8">{error && <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{projects.map((project) => <button key={project.id} onClick={() => navigate(`/projects/${project.id}`)} className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5 text-left hover:border-white/20"><div className="flex items-center justify-between"><span className="font-medium">{project.name}</span><GitBranch size={15} className="text-zinc-600" /></div><p className="mt-2 text-sm text-zinc-500">{project.description || "No description."}</p><div className="mt-5 flex items-center justify-between text-xs text-zinc-600"><span>{project.language || "Unspecified"}</span><span>{relativeTime(project.updatedAt)}</span></div><span className="mt-4 inline-block text-sm text-zinc-300">Open workspace →</span></button>)}</div>{projects.length === 0 && !error && <div className="rounded-2xl border border-dashed border-white/10 bg-[#0f0f12] p-10 text-center text-sm text-zinc-500">No projects found. Create one from Dashboard.</div>}</section></Layout>;
}

export function AssistantPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([{ role: "assistant", text: "I'm ready. Ask me about a project, a bug, or a refactor." }]);
  const send = () => { const text = input.trim(); if (!text) return; setMessages((current) => [...current, { role: "user", text }, { role: "assistant", text: `For now I'm running in workspace mode. I would analyze: “${text}”. Live AI stays reserved for the final integration pass.` }]); setInput(""); };
  return <Layout active="AI Assistant"><ToolHeader title="AI Assistant" description="A working conversation surface for the final Devora AI integration." /><section className="p-5 sm:p-8"><div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-[#0f0f12] p-5"><div className="mb-4 flex items-center gap-2 text-xs text-zinc-600"><Bot size={14}/> AI integration is intentionally parked for last.</div><div className="space-y-4">{messages.map((message, index) => <div key={index} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${message.role === "user" ? "bg-white text-black" : "bg-white/[0.05] text-zinc-300"}`}>{message.role === "assistant" && <Bot size={14} className="mb-2" />}{message.text}</div></div>)}</div><div className="mt-5 flex gap-2"><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") send(); }} placeholder="Ask Devora..." className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none" /><button onClick={send} className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-black">Send</button></div></div></section></Layout>;
}

export function GitHubPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => { void api.get<Project[]>("/projects").then((response) => setProjects(response.data)).catch(() => setProjects([])); }, []);
  return <Layout active="GitHub"><ToolHeader title="GitHub" description="Connect and manage repository work from a project workspace when you are ready." /><section className="p-5 sm:p-8"><div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-6"><div className="flex items-start gap-4"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.06]"><GitBranch size={20} /></div><div><h2 className="font-semibold">GitHub controls</h2><p className="mt-1 text-sm text-zinc-500">GitHub connection is available from your project workspace. The integration itself is parked for later.</p></div></div><div className="mt-6 grid gap-3">{projects.map((project) => <button key={project.id} onClick={() => navigate(`/projects/${project.id}`)} className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-left hover:bg-white/[0.04]"><span>{project.name}</span><span className="text-sm text-zinc-500">Open controls →</span></button>)}</div></div></section></Layout>;
}

export function TerminalPage() { return <TerminalWorkspace />; }

export function ActivityPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [events, setEvents] = useState<NotificationItem[]>(() => getNotifications());

  useEffect(() => {
    void api.get<Project[]>("/projects").then((response) => setProjects(response.data)).catch(() => setProjects([]));
    const sync = () => setEvents(getNotifications());
    window.addEventListener("devora:notifications", sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("devora:notifications", sync); window.removeEventListener("storage", sync); };
  }, []);

  const timeline = useMemo(() => {
    const projectEvents = projects.flatMap((project) => {
      const items: NotificationItem[] = [];
      if (project.createdAt) items.push({ id: `${project.id}-created`, title: "Project created", message: project.name, createdAt: project.createdAt, read: true });
      if (project.updatedAt && project.updatedAt !== project.createdAt) items.push({ id: `${project.id}-updated`, title: "Project updated", message: project.name, createdAt: project.updatedAt, read: true });
      return items;
    });
    return [...events, ...projectEvents].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 50);
  }, [events, projects]);

  return <Layout active="Activity"><ToolHeader title="Activity" description="A developer-focused timeline of workspace changes and recent project state." /><section className="p-5 sm:p-8"><div className="mb-5 flex items-center justify-between rounded-2xl border border-white/10 bg-[#0f0f12] p-5"><div><p className="font-medium">Workspace timeline</p><p className="mt-1 text-sm text-zinc-500">Mutations from this browser are recorded locally; project timestamps come from Devora.</p></div><div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400">{timeline.length} events</div></div><div className="relative space-y-3">{timeline.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 bg-[#0f0f12] p-10 text-center text-sm text-zinc-500">No activity yet. Create a project to start the timeline.</div> : timeline.map((event) => <div key={event.id} className="flex gap-4 rounded-2xl border border-white/10 bg-[#0f0f12] p-4"><div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06]"><Circle size={10} className={event.read ? "text-zinc-600" : "fill-white text-white"} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{event.title}</p><span className="text-[11px] text-zinc-600">{relativeTime(event.createdAt)}</span></div><p className="mt-1 break-words text-sm text-zinc-500">{event.message}</p></div></div>)}</div></section></Layout>;
}

export function SettingsPage() {
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const [compact, setCompact] = useState(localStorage.getItem("devora_compact") === "1");
  const [autoSave, setAutoSave] = useState(localStorage.getItem("devora_autosave") !== "0");
  const [editorWrap, setEditorWrap] = useState(localStorage.getItem("devora_wrap") !== "0");
  const [fontSize, setFontSize] = useState(localStorage.getItem("devora_font_size") || "14");
  const [tabSize, setTabSize] = useState(localStorage.getItem("devora_tab_size") || "2");
  const [confirmDelete, setConfirmDelete] = useState(localStorage.getItem("devora_confirm_delete") !== "0");
  const [defaultLanguage, setDefaultLanguage] = useState(localStorage.getItem("devora_default_language") || "TypeScript");
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => getNotifications());

  const flash = () => { setSaved(true); window.setTimeout(() => setSaved(false), 1400); };
  const saveValue = (key: string, value: string) => { localStorage.setItem(key, value); flash(); };
  const resetPreferences = () => {
    ["devora_compact", "devora_autosave", "devora_wrap", "devora_font_size", "devora_tab_size", "devora_confirm_delete", "devora_default_language"].forEach((key) => localStorage.removeItem(key));
    setCompact(false); setAutoSave(true); setEditorWrap(true); setFontSize("14"); setTabSize("2"); setConfirmDelete(true); setDefaultLanguage("TypeScript"); flash();
  };
  const logout = () => { localStorage.removeItem("devora_token"); localStorage.removeItem("devora_user"); navigate("/login", { replace: true }); };

  return <Layout active="Settings"><ToolHeader title="Settings" description="Tune your workspace, editor behavior, notifications, and session without changing the production backend." /><section className="p-5 sm:p-8"><div className="grid max-w-5xl gap-5 lg:grid-cols-2">
    <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5 lg:col-span-2"><div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06]"><UserRound size={18} /></div><div><p className="font-medium">Profile</p><p className="text-sm text-zinc-500">Update the name shown around your workspace.</p></div></div><button onClick={() => navigate("/profile")} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/[0.05] hover:text-white">Open profile</button></div></div>

    <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5"><div className="flex items-center gap-3"><Monitor size={18} /><div><p className="font-medium">Workspace</p><p className="text-sm text-zinc-500">Keep the interface comfortable for your machine and screen.</p></div></div><button onClick={() => { const next = !compact; setCompact(next); saveValue("devora_compact", next ? "1" : "0"); }} className="mt-5 flex w-full items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-sm hover:bg-white/[0.04]"><span>{compact ? "Compact mode enabled" : "Compact mode disabled"}</span>{compact ? <Check size={16}/> : <RotateCcw size={16} className="text-zinc-600"/>}</button><button onClick={() => { const next = !autoSave; setAutoSave(next); saveValue("devora_autosave", next ? "1" : "0"); }} className="mt-2 flex w-full items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-sm hover:bg-white/[0.04]"><span>{autoSave ? "Auto-save enabled" : "Auto-save disabled"}</span>{autoSave && <Check size={16}/>}</button><button onClick={() => { const next = !confirmDelete; setConfirmDelete(next); saveValue("devora_confirm_delete", next ? "1" : "0"); }} className="mt-2 flex w-full items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-sm hover:bg-white/[0.04]"><span>{confirmDelete ? "Confirm deletes" : "Delete without confirmation"}</span>{confirmDelete && <Check size={16}/>}</button></div>

    <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5"><div className="flex items-center gap-3"><LayoutDashboard size={18}/><div><p className="font-medium">Editor</p><p className="text-sm text-zinc-500">Preferences ready for the enhanced workspace editor.</p></div></div><div className="mt-5 grid grid-cols-2 gap-3"><label className="text-xs text-zinc-500">Font size<select value={fontSize} onChange={(e) => { setFontSize(e.target.value); saveValue("devora_font_size", e.target.value); }} className="mt-2 w-full rounded-xl border border-white/10 bg-[#101014] px-3 py-2.5 text-sm text-white outline-none">{["12","13","14","15","16","18"].map((value)=><option key={value} value={value}>{value}px</option>)}</select></label><label className="text-xs text-zinc-500">Tab size<select value={tabSize} onChange={(e) => { setTabSize(e.target.value); saveValue("devora_tab_size", e.target.value); }} className="mt-2 w-full rounded-xl border border-white/10 bg-[#101014] px-3 py-2.5 text-sm text-white outline-none">{["2","4","8"].map((value)=><option key={value} value={value}>{value} spaces</option>)}</select></label></div><button onClick={() => { const next=!editorWrap; setEditorWrap(next); saveValue("devora_wrap", next ? "1":"0"); }} className="mt-3 flex w-full items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-sm hover:bg-white/[0.04]"><span>{editorWrap ? "Word wrap enabled" : "Word wrap disabled"}</span>{editorWrap && <Check size={16}/>}</button><label className="mt-3 block text-xs text-zinc-500">Default project language<select value={defaultLanguage} onChange={(e) => { setDefaultLanguage(e.target.value); saveValue("devora_default_language", e.target.value); }} className="mt-2 w-full rounded-xl border border-white/10 bg-[#101014] px-3 py-2.5 text-sm text-white outline-none">{["TypeScript","JavaScript","Python","Java","C++","C","C#","Go","Rust","HTML"].map((value)=><option key={value} value={value}>{value}</option>)}</select></label></div>

    <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5"><div className="flex items-center gap-3"><Bell size={18}/><div><p className="font-medium">Notifications</p><p className="text-sm text-zinc-500">Manage the local activity stream used by this browser.</p></div></div><div className="mt-5 flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3"><span className="text-sm text-zinc-400">Stored events</span><span className="text-sm font-medium">{notifications.length}</span></div><button onClick={() => { markAllNotificationsRead(); setNotifications(getNotifications()); flash(); }} className="mt-3 w-full rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-400 hover:text-white">Mark all as read</button><button onClick={() => { clearNotifications(); setNotifications([]); flash(); }} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10"><Trash2 size={15}/> Clear notification history</button></div>

    <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5"><div className="flex items-center gap-3"><SettingsIcon size={18}/><div><p className="font-medium">Reset preferences</p><p className="text-sm text-zinc-500">Return all local workspace settings to defaults.</p></div></div><button onClick={resetPreferences} className="mt-5 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-400 hover:bg-white/[0.05] hover:text-white">Reset preferences</button>{saved && <p className="mt-3 text-xs text-emerald-400">Saved locally.</p>}</div>

    <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5"><p className="font-medium">Session</p><p className="mt-1 text-sm text-zinc-500">Sign out from this browser.</p><button onClick={logout} className="mt-5 rounded-xl border border-red-500/20 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10">Sign out</button></div>
  </div></section></Layout>;
}
