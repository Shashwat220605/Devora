import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, ChevronRight, Command, FileCode2, Folder, FolderOpen, GitBranch, Loader2, MoreHorizontal, Plus, RefreshCw, Save, Search, Trash2, Upload, X } from "lucide-react";
import Editor from "@monaco-editor/react";
import api from "../services/api";

interface FileItem { id: string; path: string; content: string; language: string | null; createdAt: string; updatedAt: string; }
interface Project { id: string; name: string; description: string | null; language: string | null; }
interface GitHubStatus { connected: boolean; username: string | null; }

const languageMap: Record<string,string> = { ts:"typescript",tsx:"typescript",js:"javascript",jsx:"javascript",json:"json",css:"css",html:"html",py:"python",java:"java",cpp:"cpp",cc:"cpp",cxx:"cpp",c:"c",cs:"csharp",go:"go",rs:"rust",sql:"sql",md:"markdown",xml:"xml",sh:"shell" };
function languageFor(path: string) { return languageMap[path.split(".").pop()?.toLowerCase() || ""] || "plaintext"; }
function fileName(path: string) { return path.split("/").pop() || path; }
function folderOf(path: string) { const parts = path.split("/"); return parts.length > 1 ? parts[0] : "root"; }

export default function ProjectWorkspaceFinal() {
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
  const [search,setSearch] = useState("");
  const [palette,setPalette] = useState(false);
  const [createOpen,setCreateOpen] = useState(false);
  const [newPath,setNewPath] = useState("");
  const [renameOpen,setRenameOpen] = useState<FileItem|null>(null);
  const [renamePath,setRenamePath] = useState("");
  const [expanded,setExpanded] = useState<Record<string,boolean>>({root:true});
  const [error,setError] = useState("");
  const [status,setStatus] = useState("");
  const [githubOpen,setGithubOpen] = useState(false);
  const [githubUrl,setGithubUrl] = useState("");
  const [githubToken,setGithubToken] = useState("");
  const [githubBusy,setGithubBusy] = useState(false);
  const [githubStatus,setGithubStatus] = useState<GitHubStatus>({connected:false,username:null});

  const activeFile = useMemo(() => files.find((file) => file.id === activeId) || null,[files,activeId]);
  const dirty = Boolean(activeFile) && code !== savedCode;
  const folders = useMemo(() => Array.from(new Set(files.map((file) => folderOf(file.path)))).sort(),[files]);
  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? files.filter((file) => file.path.toLowerCase().includes(q)) : files;
  },[files,search]);

  const flash = (value: string) => { setStatus(value); window.setTimeout(() => setStatus(""),1800); };

  const load = async () => {
    if (!id) return;
    try {
      setLoading(true); setError("");
      const [projectResponse,filesResponse] = await Promise.all([api.get<Project>(`/projects/${id}`),api.get<FileItem[]>(`/projects/${id}/files`)]);
      setProject(projectResponse.data);
      const loaded = filesResponse.data;
      setFiles(loaded);
      const first = loaded[0];
      if (first) { setActiveId(first.id); setOpenIds([first.id]); setCode(first.content); setSavedCode(first.content); }
      const github = await api.get<GitHubStatus>("/github/status").catch(() => null);
      if (github) setGithubStatus(github.data);
    } catch (err:any) { setError(err.response?.data?.message || "Unable to load project."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); },[id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPalette((value) => !value); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void saveFile(); }
      if (event.key === "Escape") { setPalette(false); setCreateOpen(false); setRenameOpen(null); setGithubOpen(false); }
    };
    window.addEventListener("keydown",onKeyDown);
    return () => window.removeEventListener("keydown",onKeyDown);
  });

  const openFile = (file: FileItem) => {
    setActiveId(file.id); setCode(file.content); setSavedCode(file.content);
    setOpenIds((current) => current.includes(file.id) ? current : [...current,file.id]);
  };
  const closeTab = (fileId: string) => {
    const next = openIds.filter((idValue) => idValue !== fileId);
    setOpenIds(next);
    if (activeId === fileId) {
      const nextFile = files.find((file) => file.id === next[next.length - 1]);
      setActiveId(nextFile?.id || null); setCode(nextFile?.content || ""); setSavedCode(nextFile?.content || "");
    }
  };
  async function saveFile() {
    if (!id || !activeFile || !dirty) return;
    try {
      setSaving(true); setError("");
      const response = await api.put<FileItem>(`/projects/${id}/files/${activeFile.id}`,{content:code});
      setFiles((current) => current.map((file) => file.id === response.data.id ? response.data : file));
      setSavedCode(code); flash("Saved");
    } catch (err:any) { setError(err.response?.data?.message || "Unable to save file."); }
    finally { setSaving(false); }
  }
  const createFile = async () => {
    if (!id || !newPath.trim()) return;
    try {
      const response = await api.post<FileItem>(`/projects/${id}/files`,{path:newPath.trim(),content:""});
      setFiles((current) => [...current,response.data].sort((a,b) => a.path.localeCompare(b.path)));
      openFile(response.data); setNewPath(""); setCreateOpen(false); flash("File created");
    } catch (err:any) { setError(err.response?.data?.message || "Unable to create file."); }
  };
  const deleteFile = async (file: FileItem) => {
    if (!window.confirm(`Delete ${file.path}? This cannot be undone.`)) return;
    try { await api.delete(`/projects/${id}/files/${file.id}`); setFiles((current) => current.filter((item) => item.id !== file.id)); closeTab(file.id); flash("File deleted"); }
    catch (err:any) { setError(err.response?.data?.message || "Unable to delete file."); }
  };
  const renameFile = async () => {
    if (!id || !renameOpen || !renamePath.trim() || renamePath.trim() === renameOpen.path) { setRenameOpen(null); return; }
    try {
      const created = await api.post<FileItem>(`/projects/${id}/files`,{path:renamePath.trim(),content:renameOpen.content});
      await api.delete(`/projects/${id}/files/${renameOpen.id}`);
      setFiles((current) => [...current.filter((item) => item.id !== renameOpen.id),created.data].sort((a,b) => a.path.localeCompare(b.path)));
      closeTab(renameOpen.id); setRenameOpen(null); openFile(created.data); flash("File moved");
    } catch (err:any) { setError(err.response?.data?.message || "Unable to move file."); }
  };
  const connectGithub = async () => {
    if (!githubToken.trim()) return;
    try { setGithubBusy(true); setError(""); const response = await api.post<GitHubStatus>("/github/connect",{token:githubToken.trim()}); setGithubStatus(response.data); setGithubToken(""); flash(`Connected as ${response.data.username}`); }
    catch (err:any) { setError(err.response?.data?.message || "Unable to connect GitHub."); }
    finally { setGithubBusy(false); }
  };
  const importGithub = async () => {
    if (!id || !githubUrl.trim()) return;
    try { setGithubBusy(true); setError(""); const response = await api.post<{filesImported:number}>("/github/import",{projectId:id,repositoryUrl:githubUrl.trim()}); setGithubUrl(""); await load(); flash(`Imported ${response.data.filesImported} files`); }
    catch (err:any) { setError(err.response?.data?.message || "GitHub import failed."); }
    finally { setGithubBusy(false); }
  };
  const pushGithub = async () => {
    if (!id || !githubUrl.trim()) { setError("Enter a GitHub repository URL first."); return; }
    try { setGithubBusy(true); setError(""); await api.post("/github/push",{projectId:id,repositoryUrl:githubUrl.trim()}); flash("Pushed to GitHub"); }
    catch (err:any) { setError(err.response?.data?.message || "GitHub push failed."); }
    finally { setGithubBusy(false); }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#09090b] text-zinc-500">Loading workspace...</div>;
  if (!project) return <div className="flex min-h-screen items-center justify-center bg-[#09090b] text-red-400">{error || "Project not found"}</div>;

  return <div className="flex h-screen flex-col overflow-hidden bg-[#09090b] text-white">
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#0f0f12] px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2"><button onClick={() => navigate("/dashboard")} className="rounded-lg p-2 text-zinc-500 hover:bg-white/[0.05] hover:text-white"><ArrowLeft size={17}/></button><div className="min-w-0"><p className="truncate text-sm font-medium">{project.name}</p><p className="text-[10px] text-zinc-600">{project.language || "Project workspace"}</p></div></div>
      <div className="flex items-center gap-2">{status && <span className="hidden text-xs text-emerald-400 sm:block">{status}</span>}<button onClick={() => setPalette(true)} className="hidden items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400 hover:bg-white/[0.04] md:flex"><Command size={13}/> Ctrl K</button><button onClick={() => void saveFile()} disabled={!dirty || saving || !activeFile} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-medium text-black disabled:opacity-40">{saving ? <Loader2 size={13} className="animate-spin"/> : <Save size={13}/>} Save</button><button onClick={() => setGithubOpen(true)} className="rounded-lg border border-white/10 p-2 text-zinc-400 hover:bg-white/[0.04] hover:text-white"><GitBranch size={15}/></button></div>
    </header>

    {error && <div className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-400">{error}</div>}

    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-[#0c0c0f] md:flex md:flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div><p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Explorer</p><p className="mt-1 text-[10px] text-zinc-700">{files.length} files</p></div><button onClick={() => setCreateOpen(true)} className="rounded-md p-1.5 text-zinc-500 hover:bg-white/[0.05] hover:text-white"><Plus size={15}/></button></div>
        <div className="border-b border-white/10 p-3"><div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2"><Search size={13} className="text-zinc-600"/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-zinc-700"/></div></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">{folders.map((folder) => <div key={folder} className="mb-2"><button onClick={() => setExpanded((current) => ({...current,[folder]:!current[folder]}))} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-zinc-400 hover:bg-white/[0.04]">{expanded[folder] ? <ChevronDown size={13}/> : <ChevronRight size={13}/>} {expanded[folder] ? <FolderOpen size={14}/> : <Folder size={14}/>} <span className="truncate">{folder === "root" ? project.name : folder}</span></button>{expanded[folder] && <div className="ml-3 border-l border-white/10 pl-2">{filteredFiles.filter((file) => folderOf(file.path) === folder).map((file) => <div key={file.id} className={`group flex items-center rounded-md ${activeId===file.id ? "bg-white/[0.08]" : ""}`}><button onClick={() => openFile(file)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-xs text-zinc-400 hover:text-white"><FileCode2 size={13} className="shrink-0"/><span className="truncate">{folder === "root" ? file.path : file.path.slice(folder.length+1)}</span>{openIds.includes(file.id) && <span className="ml-auto text-zinc-700">●</span>}</button><button onClick={() => {setRenameOpen(file);setRenamePath(file.path);}} className="mr-1 rounded p-1 text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-white"><MoreHorizontal size={12}/></button></div>)}</div>}</div>)}</div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 overflow-x-auto border-b border-white/10 bg-[#101014]">{openIds.map((fileId) => { const file=files.find((item)=>item.id===fileId); if(!file) return null; return <div key={file.id} className={`flex min-w-[150px] items-center border-r border-white/10 ${activeId===file.id ? "bg-[#09090b]" : ""}`}><button onClick={() => openFile(file)} className="min-w-0 flex-1 truncate px-3 text-left text-xs text-zinc-400">{fileName(file.path)}{activeId===file.id && dirty ? " •" : ""}</button><button onClick={() => closeTab(file.id)} className="px-2 text-zinc-700 hover:text-white"><X size={12}/></button></div>;})}</div>
        <div className="min-h-0 flex-1">{activeFile ? <Editor height="100%" theme="vs-dark" language={languageFor(activeFile.path)} value={code} onChange={(value)=>setCode(value ?? "")} options={{minimap:{enabled:false},fontSize:14,padding:{top:16},automaticLayout:true,wordWrap:"on",scrollBeyondLastLine:false,smoothScrolling:true,renderWhitespace:"selection",tabSize:2}} /> : <div className="flex h-full items-center justify-center text-sm text-zinc-600">Select a file to begin.</div>}</div>
        <footer className="flex h-7 shrink-0 items-center justify-between border-t border-white/10 bg-[#0f0f12] px-3 text-[10px] text-zinc-600"><span className="truncate">{activeFile?.path || "No file selected"}</span><span>{activeFile ? languageFor(activeFile.path) : "plaintext"}</span></footer>
      </main>
    </div>

    {createOpen && <Modal title="Create file" onClose={() => setCreateOpen(false)}><p className="text-sm text-zinc-500">Use folders in the path, e.g. <span className="text-zinc-300">src/components/Button.tsx</span>.</p><input autoFocus value={newPath} onChange={(e)=>setNewPath(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter") void createFile();}} placeholder="src/example.ts" className="mt-4 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/><div className="mt-4 flex gap-2"><button onClick={()=>setCreateOpen(false)} className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-400">Cancel</button><button onClick={()=>void createFile()} className="flex-1 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black">Create</button></div></Modal>}
    {renameOpen && <Modal title="Rename / move file" onClose={() => setRenameOpen(null)}><p className="text-sm text-zinc-500">Creates the new path with the existing content, then removes the old file.</p><input autoFocus value={renamePath} onChange={(e)=>setRenamePath(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter") void renameFile();}} className="mt-4 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/><div className="mt-4 flex gap-2"><button onClick={()=>void deleteFile(renameOpen)} className="rounded-xl border border-red-500/20 px-4 py-2.5 text-sm text-red-400"><Trash2 size={14}/></button><button onClick={()=>setRenameOpen(null)} className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-400">Cancel</button><button onClick={()=>void renameFile()} className="flex-1 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black">Move</button></div></Modal>}
    {palette && <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onMouseDown={()=>setPalette(false)}><div className="mx-auto mt-24 w-[min(700px,calc(100%-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#111116] shadow-2xl" onMouseDown={(event)=>event.stopPropagation()}><div className="flex items-center gap-3 border-b border-white/10 px-4 py-3"><Command size={16} className="text-zinc-500"/><input autoFocus value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search files..." className="flex-1 bg-transparent text-sm outline-none"/></div><div className="max-h-[430px] overflow-y-auto p-2"><button onClick={()=>{setCreateOpen(true);setPalette(false);}} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-white/[0.05]"><Plus size={15}/> New file</button><button onClick={()=>{void load();setPalette(false);}} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-white/[0.05]"><RefreshCw size={15}/> Refresh workspace</button><button onClick={()=>{setGithubOpen(true);setPalette(false);}} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-white/[0.05]"><GitBranch size={15}/> GitHub controls</button>{filteredFiles.map((file)=><button key={file.id} onClick={()=>{openFile(file);setPalette(false);}} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-white/[0.05]"><FileCode2 size={15} className="text-zinc-600"/><span className="truncate">{file.path}</span></button>)}</div></div></div>}
    {githubOpen && <Modal title="GitHub controls" onClose={()=>setGithubOpen(false)}><div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-sm font-medium">{githubStatus.connected ? `Connected as ${githubStatus.username}` : "GitHub not connected"}</p>{!githubStatus.connected && <><input type="password" value={githubToken} onChange={(e)=>setGithubToken(e.target.value)} placeholder="GitHub token" className="mt-3 w-full rounded-xl border border-white/10 bg-transparent px-4 py-3 text-sm outline-none"/><button onClick={()=>void connectGithub()} disabled={githubBusy || !githubToken.trim()} className="mt-2 w-full rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black disabled:opacity-40">Connect</button></>}</div><input value={githubUrl} onChange={(e)=>setGithubUrl(e.target.value)} placeholder="https://github.com/owner/repository" className="mt-4 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"/><div className="mt-3 grid gap-2 sm:grid-cols-3"><button onClick={()=>void importGithub()} disabled={githubBusy || !githubUrl.trim()} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm disabled:opacity-40"><Upload size={14}/> Import</button><button onClick={()=>void pushGithub()} disabled={githubBusy || !githubUrl.trim()} className="flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-medium text-black disabled:opacity-40"><Upload size={14}/> Push</button><button onClick={()=>navigate(`/projects/${id}/changes`)} className="rounded-xl border border-white/10 px-3 py-2.5 text-sm">View changes</button></div></Modal>}
  </div>;
}

function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){ return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" onMouseDown={onClose}><div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#101014] p-6 shadow-2xl" onMouseDown={(event)=>event.stopPropagation()}><div className="flex items-center justify-between"><h3 className="text-lg font-semibold">{title}</h3><button onClick={onClose} className="rounded-lg p-2 text-zinc-500 hover:bg-white/[0.05] hover:text-white"><X size={17}/></button></div>{children}</div></div>; }
