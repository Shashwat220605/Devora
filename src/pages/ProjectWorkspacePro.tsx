import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, ChevronDown, ChevronRight, Command, FileCode2, Folder, FolderOpen, GitBranch, Loader2, MoreHorizontal, Plus, RefreshCw, Save, Search, Trash2, Upload, X } from "lucide-react";
import Editor from "@monaco-editor/react";
import api from "../services/api";

interface FileItem { id: string; path: string; content: string; language: string | null; createdAt: string; updatedAt: string; }
interface Repo { id: string; name: string; url: string; provider: string; }
interface Project { id: string; name: string; description: string | null; language: string | null; repositories?: Repo[]; }
interface GitHubStatus { connected: boolean; username: string | null; }
interface DiffResponse { branch: string; repository: string; totalChanges: number; changes: { path: string; status: string; additions: number; deletions: number; preview: string }[]; }

function languageFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string,string> = { ts:"typescript",tsx:"typescript",js:"javascript",jsx:"javascript",json:"json",css:"css",html:"html",py:"python",java:"java",cpp:"cpp",c:"c",cs:"csharp",go:"go",rs:"rust",sql:"sql",md:"markdown",xml:"xml",sh:"shell" };
  return map[ext || ""] || "plaintext";
}
function nameOf(path: string) { return path.split("/").pop() || path; }
function topFolder(path: string) { const parts = path.split("/"); return parts.length > 1 ? parts[0] : "root"; }

export default function ProjectWorkspacePro() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project,setProject] = useState<Project|null>(null);
  const [files,setFiles] = useState<FileItem[]>([]);
  const [openIds,setOpenIds] = useState<string[]>([]);
  const [activeId,setActiveId] = useState<string|null>(null);
  const [code,setCode] = useState("");
  const [savedCode,setSavedCode] = useState("");
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [query,setQuery] = useState("");
  const [palette,setPalette] = useState(false);
  const [createOpen,setCreateOpen] = useState(false);
  const [newPath,setNewPath] = useState("");
  const [renameOpen,setRenameOpen] = useState<FileItem|null>(null);
  const [renamePath,setRenamePath] = useState("");
  const [expanded,setExpanded] = useState<Record<string,boolean>>({ root:true });
  const [status,setStatus] = useState("");
  const [error,setError] = useState("");
  const [githubOpen,setGithubOpen] = useState(false);
  const [githubUrl,setGithubUrl] = useState("");
  const [githubBusy,setGithubBusy] = useState(false);
  const [githubToken,setGithubToken] = useState("");
  const [githubStatus,setGithubStatus] = useState<GitHubStatus>({connected:false,username:null});

  const activeFile = useMemo(() => files.find((f) => f.id === activeId) || null, [files,activeId]);
  const dirty = code !== savedCode;
  const folders = useMemo(() => Array.from(new Set(files.map((f) => topFolder(f.path)))).sort(), [files]);
  const visibleFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? files.filter((f) => f.path.toLowerCase().includes(q)) : files;
  }, [files,query]);

  const load = async () => {
    if (!id) return;
    try {
      setLoading(true); setError("");
      const [p,f] = await Promise.all([api.get<Project>(`/projects/${id}`),api.get<FileItem[]>(`/projects/${id}/files`)]);
      setProject(p.data); setFiles(f.data);
      const first = f.data[0];
      if (first) { setOpenIds([first.id]); setActiveId(first.id); setCode(first.content); setSavedCode(first.content); }
      const s = await api.get<GitHubStatus>("/github/status").catch(() => null);
      if (s) setGithubStatus(s.data);
    } catch (e:any) { setError(e.response?.data?.message || "Unable to load project."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((v) => !v); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); }
      if (e.key === "Escape") { setPalette(false); setGithubOpen(false); setCreateOpen(false); setRenameOpen(null); }
    };
    window.addEventListener("keydown",onKey); return () => window.removeEventListener("keydown",onKey);
  });

  const openFile = (file: FileItem) => {
    if (activeId === file.id) return;
    setActiveId(file.id); setCode(file.content); setSavedCode(file.content);
    setOpenIds((ids) => ids.includes(file.id) ? ids : [...ids,file.id]);
  };
  const closeTab = (idToClose: string) => {
    const next = openIds.filter((idv) => idv !== idToClose);
    setOpenIds(next);
    if (activeId === idToClose) {
      const nextFile = files.find((f) => f.id === next[next.length - 1]);
      setActiveId(nextFile?.id || null); setCode(nextFile?.content || ""); setSavedCode(nextFile?.content || "");
    }
  };
  async function save() {
    if (!id || !activeFile || !dirty) return;
    try {
      setSaving(true); setError("");
      const r = await api.put<FileItem>(`/projects/${id}/files/${activeFile.id}`,{content:code});
      setFiles((current) => current.map((f) => f.id === r.data.id ? r.data : f));
      setSavedCode(code); setStatus("Saved"); setTimeout(() => setStatus(""),1800);
    } catch (e:any) { setError(e.response?.data?.message || "Unable to save file."); }
    finally { setSaving(false); }
  }
  const createFile = async () => {
    if (!id || !newPath.trim()) return;
    try {
      const r = await api.post<FileItem>(`/projects/${id}/files`,{path:newPath.trim(),content:""});
      setFiles((f) => [...f,r.data].sort((a,b) => a.path.localeCompare(b.path)));
      openFile(r.data); setNewPath(""); setCreateOpen(false); setStatus("File created");
    } catch (e:any) { setError(e.response?.data?.message || "Unable to create file."); }
  };
  const deleteFile = async (file: FileItem) => {
    if (!window.confirm(`Delete ${file.path}?`)) return;
    try { await api.delete(`/projects/${id}/files/${file.id}`); setFiles((f) => f.filter((x) => x.id !== file.id)); closeTab(file.id); }
    catch (e:any) { setError(e.response?.data?.message || "Unable to delete file."); }
  };
  const renameFile = async () => {
    if (!id || !renameOpen || !renamePath.trim() || renamePath.trim() === renameOpen.path) { setRenameOpen(null); return; }
    try {
      const created = await api.post<FileItem>(`/projects/${id}/files`,{path:renamePath.trim(),content:renameOpen.content});
      await api.delete(`/projects/${id}/files/${renameOpen.id}`);
      setFiles((f) => [...f.filter((x) => x.id !== renameOpen.id),created.data].sort((a,b) => a.path.localeCompare(b.path)));
      closeTab(renameOpen.id); openFile(created.data); setRenameOpen(null); setStatus("File renamed");
    } catch (e:any) { setError(e.response?.data?.message || "Unable to rename file."); }
  };
  const importGitHub = async () => {
    if (!id || !githubUrl.trim()) return;
    try {
      setGithubBusy(true); setError("");
      const r = await api.post<{filesImported:number}>("/github/import",{projectId:id,repositoryUrl:githubUrl.trim()});
      setStatus(`Imported ${r.data.filesImported} files`); setGithubUrl(""); await load();
    } catch (e:any) { setError(e.response?.data?.message || "GitHub import failed."); }
    finally { setGithubBusy(false); }
  };
  const pushGitHub = async () => {
    if (!id || !githubUrl.trim()) { setError("Enter a GitHub repository URL first."); return; }
    try {
      setGithubBusy(true); setError("");
      await api.post("/github/push",{projectId:id,repositoryUrl:githubUrl.trim()});
      setStatus("Pushed to GitHub");
    } catch (e:any) { setError(e.response?.data?.message || "GitHub push failed."); }
    finally { setGithubBusy(false); }
  };
  const connectGithub = async () => {
    if (!githubToken.trim()) return;
    try {
      setGithubBusy(true); setError("");
      const r = await api.post<GitHubStatus>("/github/connect",{token:githubToken.trim()});
      setGithubStatus(r.data); setGithubToken(""); setStatus(`Connected as ${r.data.username}`);
    } catch (e:any) { setError(e.response?.data?.message || "GitHub connection failed."); }
    finally { setGithubBusy(false); }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#09090b] text-zinc-500">Loading workspace...</div>;
  if (!project) return <div className="flex min-h-screen items-center justify-center bg-[#09090b] text-red-400">{error || "Project not found"}</div>;

  return <div className="flex h-screen flex-col overflow-hidden bg-[#09090b] text-white">
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#0f0f12] px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <button onClick={() => navigate("/dashboard")} className="rounded-lg p-2 text-zinc-500 hover:bg-white/[0.05] hover:text-white"><ArrowLeft size={17}/></button>
        <div className="min-w-0"><p className="truncate text-sm font-medium">{project.name}</p><p className="text-[10px] text-zinc-600">{project.language || "Project workspace"}</p></div>
      </div>
      <div className="flex items-center gap-2">
        {status && <span className="hidden text-xs text-emerald-400 sm:block">{status}</span>}
        <button onClick={() => setPalette(true)} className="hidden items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400 hover:bg-white/[0.04] md:flex"><Command size={13}/> Command <span className="text-zinc-700">Ctrl K</span></button>
        <button onClick={() => void save()} disabled={!dirty || saving || !activeFile} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-medium text-black disabled:opacity-40">{saving ? <Loader2 size={13} className="animate-spin"/> : <Save size={13}/>} Save</button>
        <button onClick={() => setGithubOpen(true)} className="rounded-lg border border-white/10 p-2 text-zinc-400 hover:bg-white/[0.04] hover:text-white"><GitBranch size={15}/></button>
      </div>
    </header>

    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-[#0c0c0f] md:flex md:flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div><p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Explorer</p><p className="mt-1 text-[10px] text-zinc-700">{files.length} files</p></div><button onClick={() => setCreateOpen(true)} className="rounded-md p-1.5 text-zinc-500 hover:bg-white/[0.05] hover:text-white"><Plus size={15}/></button></div>
        <div className="border-b border-white/10 p-3"><div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2"><Search size={13} className="text-zinc-600"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-zinc-700"/></div></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {folders.map((folder) => <div key={folder} className="mb-2">
            <button onClick={() => setExpanded((e) => ({...e,[folder]:!e[folder]}))} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-zinc-400 hover:bg-white/[0.04]">{expanded[folder] ? <ChevronDown size={13}/> : <ChevronRight size={13}/>} {expanded[folder] ? <FolderOpen size={14}/> : <Folder size={14}/>} <span className="truncate">{folder === "root" ? project.name : folder}</span></button>
            {expanded[folder] && <div className="ml-3 border-l border-white/10 pl-2">{visibleFiles.filter((f) => topFolder(f.path) === folder).map((file) => <div key={file.id} className={`group flex items-center rounded-md ${activeId===file.id ? "bg-white/[0.08]" : ""}`}><button onClick={() => openFile(file)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-xs text-zinc-400 hover:text-white"><FileCode2 size={13} className="shrink-0"/><span className="truncate">{folder === "root" ? file.path : file.path.slice(folder.length+1)}</span>{openIds.includes(file.id) && <span className="ml-auto text-zinc-700">●</span>}</button><button onClick={() => { setRenameOpen(file); setRenamePath(file.path); }} className="mr-1 rounded p-1 text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-white"><MoreHorizontal size={12}/></button></div>)}</div>}
          </div>)}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 overflow-x-auto border-b border-white/10 bg-[#101014]">
          {openIds.map((fileId) => { const f=files.find((x)=>x.id===fileId); if(!f) return null; return <div key={f.id} className={`flex min-w-[150px] items-center border-r border-white/10 ${activeId===f.id ? "bg-[#09090b]" : ""}`}><button onClick={() => openFile(f)} className="min-w-0 flex-1 truncate px-3 text-left text-xs text-zinc-400">{nameOf(f.path)} {activeId===f.id && dirty ? "•" : ""}</button><button onClick={() => closeTab(f.id)} className="px-2 text-zinc-700 hover:text-white"><X size={12}/></button></div>; })}
        </div>
        <div className="min-h-0 flex-1">
          {activeFile ? <Editor height="100%" theme="vs-dark" language={languageFor(activeFile.path)} value={code} onChange={(v)=>setCode(v ?? "")} options={{ minimap:{enabled:false}, fontSize:14, padding:{top:16}, automaticLayout:true, wordWrap:"on", scrollBeyondLastLine:false, smoothScrolling:true, renderWhitespace:"selection", tabSize:2 }} /> : <div className="flex h-full items-center justify-center text-sm text-zinc-600">Select a file to start editing.</div>}
        </div>
        <footer className="flex h-7 shrink-0 items-center justify-between border-t border-white/10 bg-[#0f0f12] px-3 text-[10px] text-zinc-600"><span>{activeFile?.path || "No file selected"}</span><span>{activeFile ? languageFor(activeFile.path) : "plaintext"}</span></footer>
      </main>
    </div>

    {createOpen && <Modal title="Create file" onClose={() => setCreateOpen(false)}><p className="text-sm text-zinc-500">Use folders in the path, for example <span className="text-zinc-300">src/components/Button.tsx</span>.</p><input autoFocus value={newPath} onChange={(e)=>setNewPath(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter") void createFile();}} placeholder="src/example.ts" className="mt-4 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/><div className="mt-4 flex gap-2"><button onClick={()=>setCreateOpen(false)} className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-400">Cancel</button><button onClick={()=>void createFile()} className="flex-1 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black">Create</button></div></Modal>}
    {renameOpen && <Modal title="Rename / move file" onClose={() => setRenameOpen(null)}><p className="text-sm text-zinc-500">This preserves the current content and creates the new path.</p><input autoFocus value={renamePath} onChange={(e)=>setRenamePath(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter") void renameFile();}} className="mt-4 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/><div className="mt-4 flex gap-2"><button onClick={()=>void deleteFile(renameOpen)} className="flex items-center justify-center gap-2 rounded-xl border border-red-500/20 px-4 py-2.5 text-sm text-red-400"><Trash2 size={14}/> Delete</button><button onClick={()=>setRenameOpen(null)} className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-400">Cancel</button><button onClick={()=>void renameFile()} className="flex-1 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black">Rename</button></div></Modal>}
    {palette && <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onMouseDown={()=>setPalette(false)}><div className="mx-auto mt-24 w-[min(680px,calc(100%-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#111116] shadow-2xl" onMouseDown={(e)=>e.stopPropagation()}><div className="flex items-center gap-3 border-b border-white/10 px-4 py-3"><Command size={16} className="text-zinc-500"/><input autoFocus value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search files or commands..." className="flex-1 bg-transparent text-sm outline-none"/></div><div className="max-h-[420px] overflow-y-auto p-2"><button onClick={()=>{setCreateOpen(true);setPalette(false);}} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-white/[0.05]"><Plus size={15}/> New file <span className="ml-auto text-xs text-zinc-600">Create</span></button><button onClick={()=>{setGithubOpen(true);setPalette(false);}} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-white/[0.05]"><GitBranch size={15}/> GitHub controls <span className="ml-auto text-xs text-zinc-600">Open</span></button><button onClick={()=>{void load();setPalette(false);}} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-white/[0.05]"><RefreshCw size={15}/> Refresh workspace</button>{visibleFiles.map((f)=><button key={f.id} onClick={()=>{openFile(f);setPalette(false);}} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-white/[0.05]"><FileCode2 size={15} className="text-zinc-600"/><span className="truncate">{f.path}</span></button>)}</div></div></div>}
    {githubOpen && <Modal title="GitHub controls" onClose={()=>setGithubOpen(false)}><div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-sm font-medium">{githubStatus.connected ? `Connected as ${githubStatus.username}` : "GitHub not connected"}</p>{!githubStatus.connected && <><input type="password" value={githubToken} onChange={(e)=>setGithubToken(e.target.value)} placeholder="GitHub token" className="mt-3 w-full rounded-xl border border-white/10 bg-transparent px-4 py-3 text-sm outline-none"/><button onClick={()=>void connectGithub()} disabled={githubBusy || !githubToken.trim()} className="mt-2 w-full rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black disabled:opacity-40">Connect</button></>}</div><input value={githubUrl} onChange={(e)=>setGithubUrl(e.target.value)} placeholder="https://github.com/owner/repository" className="mt-4 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/><div className="mt-3 grid gap-2 sm:grid-cols-3"><button onClick={()=>void importGitHub()} disabled={githubBusy || !githubUrl.trim()} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm disabled:opacity-40"><Upload size={14}/> Import</button><button onClick={()=>void pushGitHub()} disabled={githubBusy || !githubUrl.trim()} className="flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-medium text-black disabled:opacity-40"><Upload size={14}/> Push</button><button onClick={()=>navigate(`/projects/${id}/changes`)} className="rounded-xl border border-white/10 px-3 py-2.5 text-sm">View changes</button></div><p className="mt-3 text-xs text-zinc-600">Import and push use your existing Devora GitHub backend. No new infrastructure is required.</p></Modal>}
  </div>;
}

function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){ return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" onMouseDown={onClose}><div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#101014] p-6 shadow-2xl" onMouseDown={(e)=>e.stopPropagation()}><div className="flex items-center justify-between"><h3 className="text-lg font-semibold">{title}</h3><button onClick={onClose} className="rounded-lg p-2 text-zinc-500 hover:bg-white/[0.05] hover:text-white"><X size={17}/></button></div>{children}</div></div>; }
