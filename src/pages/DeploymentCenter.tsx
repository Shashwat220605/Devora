import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDot, Cloud, ExternalLink, Loader2, RefreshCw, ShieldCheck, Terminal, XCircle } from "lucide-react";
import Layout from "./Layout";
import api from "../services/api";

type Project = { id: string; name: string };
type Check = { name: string; status: "pass" | "warn" | "fail"; detail: string };
type Preflight = { project: Project; productionUrl: string; checks: Check[]; ready: boolean; failed: number; warnings: number; recommendedCommand: string };

const statusIcon = (status: Check["status"]) => {
  if (status === "pass") return <CheckCircle2 size={16} className="text-emerald-400" />;
  if (status === "fail") return <XCircle size={16} className="text-red-400" />;
  return <AlertTriangle size={16} className="text-amber-300" />;
};

export default function DeploymentCenter() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState<Preflight | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void api.get<Project[]>("/projects").then((response) => {
      setProjects(response.data);
      if (response.data[0]) setProjectId(response.data[0].id);
    }).catch(() => setError("Unable to load projects."));
  }, []);

  const runPreflight = async () => {
    if (!projectId) return;
    try {
      setBusy(true);
      setError("");
      const response = await api.get<Preflight>("/deployments/preflight", { params: { projectId } });
      setData(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || "Unable to run deployment preflight.");
      setData(null);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void runPreflight(); }, [projectId]);

  return (
    <Layout active="Deployments">
      <div className="border-b border-white/10 px-5 py-6 sm:px-8">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">Release workflow</p>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Deployment Center</h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-500">Run a release preflight, inspect production readiness, and keep the deployment handoff clear before shipping.</p>
          </div>
          <div className="flex gap-2">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="rounded-xl border border-white/10 bg-[#101014] px-3 py-2.5 text-sm outline-none">
              <option value="">Select project</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <button onClick={() => void runPreflight()} disabled={busy || !projectId} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm text-zinc-400 hover:bg-white/[0.04] hover:text-white disabled:opacity-40">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Recheck
            </button>
          </div>
        </div>
      </div>

      <section className="p-5 sm:p-8">
        {error && <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

        {data && (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5 md:col-span-2">
                <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06]"><Cloud size={18} /></div><div><p className="text-sm font-medium">Production</p><p className="text-xs text-zinc-600">{data.productionUrl}</p></div></div>
                <div className="mt-5 flex items-center gap-3"><div className={`flex h-9 w-9 items-center justify-center rounded-full ${data.ready ? "bg-emerald-500/10" : "bg-red-500/10"}`}>{data.ready ? <CheckCircle2 size={18} className="text-emerald-400" /> : <XCircle size={18} className="text-red-400" />}</div><div><p className="font-medium">{data.ready ? "Ready to ship" : "Blocked by preflight"}</p><p className="text-xs text-zinc-600">{data.failed} failed · {data.warnings} warning{data.warnings === 1 ? "" : "s"}</p></div></div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5"><p className="text-xs text-zinc-600">Checks passed</p><p className="mt-2 text-3xl font-semibold">{data.checks.filter((check) => check.status === "pass").length}</p></div>
              <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5"><p className="text-xs text-zinc-600">Warnings</p><p className="mt-2 text-3xl font-semibold">{data.warnings}</p></div>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-white/10 bg-[#0f0f12]">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck size={16} /> Preflight checks</div><span className="text-xs text-zinc-600">{data.project.name}</span></div>
                <div className="divide-y divide-white/5">
                  {data.checks.map((check) => <div key={check.name} className="flex gap-3 px-5 py-4"><div className="mt-0.5">{statusIcon(check.status)}</div><div className="min-w-0"><p className="text-sm text-zinc-200">{check.name}</p><p className="mt-1 text-xs leading-5 text-zinc-500">{check.detail}</p></div></div>)}
                </div>
              </div>

              <div className="space-y-5">
                <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5"><p className="text-sm font-medium">Release steps</p><div className="mt-4 space-y-3 text-sm text-zinc-400"><div className="flex items-center gap-3"><CircleDot size={15} /> Review source-control changes</div><div className="flex items-center gap-3"><CircleDot size={15} /> Run local production build</div><div className="flex items-center gap-3"><CircleDot size={15} /> Push to GitHub</div><div className="flex items-center gap-3"><CircleDot size={15} /> Vercel production deployment</div></div></div>
                <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5"><p className="text-sm font-medium">Build command</p><div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-3 font-mono text-xs text-zinc-300"><Terminal size={14} className="text-zinc-600" /> {data.recommendedCommand}</div><a href={data.productionUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-xs text-zinc-500 hover:text-white"><ExternalLink size={13} /> Open production</a></div>
              </div>
            </div>
          </>
        )}
      </section>
    </Layout>
  );
}
