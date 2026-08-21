import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Activity, Bot, FolderGit2, GitBranch, LayoutDashboard, LogOut, Settings, Sparkles, Terminal } from "lucide-react";

interface LayoutProps {
  children: ReactNode;
  active?: string;
}

const items = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", path: "/projects", icon: FolderGit2 },
  { label: "AI Assistant", path: "/ai", icon: Bot },
  { label: "GitHub", path: "/github", icon: GitBranch },
  { label: "Terminal", path: "/terminal", icon: Terminal },
  { label: "Activity", path: "/activity", icon: Activity },
  { label: "Settings", path: "/settings", icon: Settings },
];

export default function Layout({ children, active }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentUser = JSON.parse(localStorage.getItem("devora_user") || "null") as { name?: string; email?: string } | null;

  const logout = () => {
    localStorage.removeItem("devora_token");
    localStorage.removeItem("devora_user");
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-[#0f0f12] p-4 lg:flex">
          <button onClick={() => navigate("/dashboard")} className="mb-7 flex items-center gap-3 rounded-xl p-2 text-left hover:bg-white/[0.04]">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black"><Sparkles size={19} /></div>
            <div><p className="font-semibold">Devora</p><p className="text-xs text-zinc-500">AI Developer Workspace</p></div>
          </button>

          <nav className="space-y-1">
            {items.map(({ label, path, icon: Icon }) => {
              const isActive = active === label || (!active && location.pathname === path);
              return (
                <button key={label} onClick={() => navigate(path)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${isActive ? "bg-white text-black" : "text-zinc-400 hover:bg-white/[0.05] hover:text-white"}`}>
                  <Icon size={17} />
                  {label}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-white/10 pt-4">
            <div className="mb-3 rounded-xl bg-black/20 p-3">
              <p className="truncate text-sm font-medium">{currentUser?.name || "Developer"}</p>
              <p className="truncate text-xs text-zinc-600">{currentUser?.email || ""}</p>
            </div>
            <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-500 hover:bg-white/[0.05] hover:text-white"><LogOut size={17} /> Sign out</button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
