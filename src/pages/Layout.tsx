import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  Bell,
  Bot,
  Check,
  FolderGit2,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Settings,
  Sparkles,
  Terminal,
  UserRound,
} from "lucide-react";
import {
  clearNotifications,
  getNotifications,
  markAllNotificationsRead,
  type NotificationItem,
} from "../services/notifications";

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

const mobileItems = items.slice(0, 6);

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Now";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function Layout({ children, active }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => getNotifications());
  const [notificationOpen, setNotificationOpen] = useState(false);
  const currentUser = JSON.parse(
    localStorage.getItem("devora_user") || "null",
  ) as { name?: string; email?: string } | null;

  useEffect(() => {
    const sync = () => setNotifications(getNotifications());
    window.addEventListener("devora:notifications", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("devora:notifications", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const logout = () => {
    localStorage.removeItem("devora_token");
    localStorage.removeItem("devora_user");
    navigate("/login", { replace: true });
  };

  const unreadCount = notifications.filter((item) => !item.read).length;

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-[#0f0f12] p-4 lg:flex">
          <button
            onClick={() => navigate("/dashboard")}
            className="mb-7 flex items-center gap-3 rounded-xl p-2 text-left hover:bg-white/[0.04]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black">
              <Sparkles size={19} />
            </div>
            <div>
              <p className="font-semibold">Devora</p>
              <p className="text-xs text-zinc-500">AI Developer Workspace</p>
            </div>
          </button>

          <nav className="space-y-1">
            {items.map(({ label, path, icon: Icon }) => {
              const isActive =
                active === label || (!active && location.pathname === path);
              return (
                <button
                  key={label}
                  onClick={() => navigate(path)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                    isActive
                      ? "bg-white text-black"
                      : "text-zinc-400 hover:bg-white/[0.05] hover:text-white"
                  }`}
                >
                  <Icon size={17} />
                  {label}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-white/10 pt-4">
            <div className="relative mb-3">
              <button
                onClick={() => setNotificationOpen((value) => !value)}
                className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-left hover:bg-black/30"
              >
                <span className="flex items-center gap-3 text-sm text-zinc-300">
                  <Bell size={16} />
                  Notifications
                </span>
                {unreadCount > 0 ? (
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-black">{unreadCount}</span>
                ) : (
                  <Check size={15} className="text-zinc-700" />
                )}
              </button>
              {notificationOpen && (
                <NotificationPopover
                  notifications={notifications}
                  onRead={() => { markAllNotificationsRead(); setNotifications(getNotifications()); }}
                  onClear={() => { clearNotifications(); setNotifications([]); }}
                />
              )}
            </div>

            <button
              onClick={() => navigate("/profile")}
              className="mb-3 flex w-full items-center gap-3 rounded-xl bg-black/20 p-3 text-left hover:bg-black/30"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-sm font-semibold text-black">
                {(currentUser?.name || currentUser?.email || "D")
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0]?.toUpperCase())
                  .join("")}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {currentUser?.name || "Developer"}
                </p>
                <p className="truncate text-xs text-zinc-600">
                  {currentUser?.email || ""}
                </p>
              </div>
              <UserRound size={14} className="ml-auto shrink-0 text-zinc-600" />
            </button>

            <button
              onClick={logout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-500 hover:bg-white/[0.05] hover:text-white"
            >
              <LogOut size={17} />
              Sign out
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-16 lg:pb-0">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0f0f12]/95 px-2 py-2 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-1 overflow-x-auto">
          {mobileItems.map(({ label, path, icon: Icon }) => {
            const isActive =
              active === label || (!active && location.pathname === path);
            return (
              <button
                key={label}
                onClick={() => navigate(path)}
                className={`flex min-w-[74px] shrink-0 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] transition ${
                  isActive
                    ? "bg-white text-black"
                    : "text-zinc-500 hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function NotificationPopover({
  notifications,
  onRead,
  onClear,
}: {
  notifications: NotificationItem[];
  onRead: () => void;
  onClear: () => void;
}) {
  return (
    <div className="absolute bottom-12 left-0 z-50 w-[310px] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-[#111116] p-3 shadow-2xl">
      <div className="flex items-center justify-between px-1 pb-2">
        <div>
          <p className="text-sm font-semibold">Recent notifications</p>
          <p className="text-[11px] text-zinc-600">Workspace activity from this browser</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onRead} className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-zinc-400 hover:text-white">Read all</button>
          <button onClick={onClear} className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-zinc-400 hover:text-white">Clear</button>
        </div>
      </div>
      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {notifications.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-zinc-600">No notifications yet.</div>
        ) : notifications.slice(0, 12).map((item) => (
          <div key={item.id} className={`rounded-xl border p-3 ${item.read ? "border-white/5 bg-black/10" : "border-white/10 bg-white/[0.03]"}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-zinc-200">{item.title}</p>
              <span className="text-[10px] text-zinc-700">{formatTime(item.createdAt)}</span>
            </div>
            <p className="mt-1 break-words text-[11px] text-zinc-500">{item.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
