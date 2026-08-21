import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";

import {
  Activity,
  Bot,
  ChevronRight,
  Code2,
  FolderGit2,
  GitBranch,
  LayoutDashboard,
  Plus,
  Settings,
  Sparkles,
  Terminal,
  Trash2,
  X,
} from "lucide-react";

import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ProjectWorkspace from "./pages/ProjectWorkspace";
import api from "./services/api";

interface Project {
  id: string;
  name: string;
  description: string | null;
  language: string | null;
  createdAt: string;
  updatedAt: string;
}

interface User {
  id: string;
  name: string | null;
  email: string;
}

/* =========================================================
   DASHBOARD
========================================================= */

function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState("");

  const [error, setError] = useState("");

  const user: User | null = JSON.parse(
    localStorage.getItem("devora_user") || "null",
  );

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get<Project[]>("/projects");

      setProjects(response.data);
    } catch (err: any) {
      console.error("Failed to load projects:", err);

      setError(
        err.response?.data?.message ||
          "Failed to load your projects.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleCreateProject = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!name.trim()) {
      return;
    }

    try {
      setCreating(true);
      setError("");

      const response = await api.post<Project>("/projects", {
        name: name.trim(),
        description: description.trim(),
        language: language.trim(),
      });

      setProjects((currentProjects) => [
        response.data,
        ...currentProjects,
      ]);

      setName("");
      setDescription("");
      setLanguage("");

      setShowModal(false);
    } catch (err: any) {
      console.error("Failed to create project:", err);

      setError(
        err.response?.data?.message ||
          "Failed to create project.",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    const confirmed = window.confirm(
      "Delete this project? This cannot be undone.",
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(id);
      setError("");

      await api.delete(`/projects/${id}`);

      setProjects((currentProjects) =>
        currentProjects.filter(
          (project) => project.id !== id,
        ),
      );
    } catch (err: any) {
      console.error("Failed to delete project:", err);

      setError(
        err.response?.data?.message ||
          "Failed to delete project.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const logout = () => {
    localStorage.removeItem("devora_token");
    localStorage.removeItem("devora_user");

    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="flex min-h-screen">
        {/* SIDEBAR */}
        <aside className="hidden w-64 border-r border-white/10 bg-[#0f0f12] p-5 lg:block">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black">
              <Sparkles size={20} />
            </div>

            <div>
              <h1 className="font-semibold">Devora</h1>

              <p className="text-xs text-zinc-500">
                AI Developer Workspace
              </p>
            </div>
          </div>

          <nav className="space-y-2">
            <NavItem
              icon={<LayoutDashboard size={18} />}
              label="Dashboard"
              active
            />

            <NavItem
              icon={<FolderGit2 size={18} />}
              label="Projects"
            />

            <NavItem
              icon={<Bot size={18} />}
              label="AI Assistant"
            />

            <NavItem
              icon={<GitBranch size={18} />}
              label="GitHub"
            />

            <NavItem
              icon={<Terminal size={18} />}
              label="Terminal"
            />

            <NavItem
              icon={<Activity size={18} />}
              label="Activity"
            />
          </nav>

          <div className="my-6 border-t border-white/10" />

          <NavItem
            icon={<Settings size={18} />}
            label="Settings"
          />
        </aside>

        {/* MAIN */}
        <main className="min-w-0 flex-1">
          {/* HEADER */}
          <header className="border-b border-white/10 px-5 py-5 sm:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-zinc-500">
                  Devora Workspace
                </p>

                <h2 className="mt-1 text-2xl font-semibold">
                  Welcome, {user?.name || "Developer"}
                </h2>
              </div>

              <button
                onClick={() => setShowModal(true)}
                className="flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-zinc-200"
              >
                <Plus size={17} />
                New Project
              </button>
            </div>
          </header>

          <section className="p-5 sm:p-8">
            {/* ERROR */}
            {error && (
              <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* STATS */}
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard
                icon={<FolderGit2 size={20} />}
                label="Projects"
                value={String(projects.length)}
                subtitle="Your workspace projects"
              />

              <StatCard
                icon={<GitBranch size={20} />}
                label="Repositories"
                value="0"
                subtitle="Connect GitHub to sync"
              />

              <StatCard
                icon={<Bot size={20} />}
                label="AI Requests"
                value="0"
                subtitle="AI usage this month"
              />
            </div>

            {/* AI ASSISTANT */}
            <div className="mt-8 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-6">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles size={18} />

                    <p className="font-medium">
                      AI Developer Assistant
                    </p>
                  </div>

                  <p className="mt-2 max-w-2xl text-sm text-zinc-400">
                    Ask Devora to explain code, find bugs,
                    generate tests, refactor files, or
                    understand a project.
                  </p>
                </div>

                <Bot
                  size={28}
                  className="hidden text-zinc-500 sm:block"
                />
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  placeholder="Ask something about your project..."
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-zinc-600 focus:border-white/20"
                />

                <button
                  disabled
                  className="rounded-xl bg-white px-5 py-3 text-sm font-medium text-black opacity-50"
                >
                  Ask AI
                </button>
              </div>

              <p className="mt-3 text-xs text-zinc-600">
                AI Assistant will be connected after the project
                system is complete.
              </p>
            </div>

            {/* PROJECTS */}
            <div className="mt-8">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">
                    Your Projects
                  </h3>

                  <p className="mt-1 text-sm text-zinc-500">
                    Projects stored in your Devora workspace
                  </p>
                </div>
              </div>

              {loading ? (
                <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-10 text-center text-sm text-zinc-500">
                  Loading projects...
                </div>
              ) : projects.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-[#0f0f12] p-10 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.05]">
                    <FolderGit2 size={20} />
                  </div>

                  <h4 className="mt-4 font-medium">
                    No projects yet
                  </h4>

                  <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
                    Create your first Devora project and
                    start building your developer workspace.
                  </p>

                  <button
                    onClick={() => setShowModal(true)}
                    className="mt-5 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-zinc-200"
                  >
                    Create your first project
                  </button>
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                  {projects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      deleting={
                        deletingId === project.id
                      }
                      onDelete={() =>
                        handleDeleteProject(project.id)
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ACTIVITY */}
            <div className="mt-8">
              <h3 className="text-lg font-semibold">
                Recent Activity
              </h3>

              <div className="mt-4 rounded-2xl border border-white/10 bg-[#0f0f12]">
                <ActivityRow
                  title="Devora workspace opened"
                  subtitle="Your workspace is ready"
                  time="Now"
                />

                <ActivityRow
                  title="Database connected"
                  subtitle="Projects are stored in Neon"
                  time="Today"
                />

                <ActivityRow
                  title="Authentication enabled"
                  subtitle="Your account is protected"
                  time="Today"
                />
              </div>
            </div>

            {/* LOGOUT */}
            <div className="mt-8 flex justify-end">
              <button
                onClick={logout}
                className="text-sm text-zinc-500 transition hover:text-white"
              >
                Sign out
              </button>
            </div>
          </section>
        </main>
      </div>

      {/* CREATE PROJECT MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#101014] p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold">
                  Create Project
                </h3>

                <p className="mt-1 text-sm text-zinc-500">
                  Add a project to your Devora workspace.
                </p>
              </div>

              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg p-2 text-zinc-500 hover:bg-white/[0.05] hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={handleCreateProject}
              className="mt-6 space-y-5"
            >
              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Project name
                </label>

                <input
                  value={name}
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                  placeholder="e.g. AI Code Assistant"
                  required
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-zinc-700 focus:border-white/20"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Description
                </label>

                <textarea
                  value={description}
                  onChange={(event) =>
                    setDescription(event.target.value)
                  }
                  placeholder="What are you building?"
                  rows={3}
                  className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-zinc-700 focus:border-white/20"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Primary language
                </label>

                <select
                  value={language}
                  onChange={(event) =>
                    setLanguage(event.target.value)
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#101014] px-4 py-3 text-sm outline-none focus:border-white/20"
                >
                  <option value="">
                    Select language
                  </option>

                  <option value="TypeScript">
                    TypeScript
                  </option>

                  <option value="JavaScript">
                    JavaScript
                  </option>

                  <option value="Python">Python</option>

                  <option value="Java">Java</option>

                  <option value="C++">C++</option>

                  <option value="C">C</option>

                  <option value="C#">C#</option>

                  <option value="Go">Go</option>

                  <option value="Rust">Rust</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-400 hover:bg-white/[0.05] hover:text-white"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 rounded-xl bg-white px-4 py-3 text-sm font-medium text-black hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creating
                    ? "Creating..."
                    : "Create Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   PROJECT CARD
========================================================= */

function ProjectCard({
  project,
  deleting,
  onDelete,
}: {
  project: Project;
  deleting: boolean;
  onDelete: () => void;
}) {
  const navigate = useNavigate();

  const updatedDate = new Date(
    project.updatedAt,
  ).toLocaleDateString();

  return (
    <div className="group rounded-2xl border border-white/10 bg-[#0f0f12] p-5 transition hover:-translate-y-1 hover:border-white/20">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06]">
          <Code2 size={18} />
        </div>

        <button
          onClick={onDelete}
          disabled={deleting}
          title="Delete project"
          className="rounded-lg p-2 text-zinc-600 opacity-0 transition hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100 disabled:opacity-50"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <h4 className="mt-5 font-medium">
        {project.name}
      </h4>

      <p className="mt-2 min-h-10 text-sm text-zinc-500">
        {project.description ||
          "No description provided."}
      </p>

      <div className="mt-5 flex items-center justify-between text-xs text-zinc-500">
        <span>
          {project.language || "Not specified"}
        </span>

        <span>Updated {updatedDate}</span>
      </div>

      <button
        onClick={() =>
          navigate(`/projects/${project.id}`)
        }
        className="mt-5 flex items-center gap-1 text-sm text-zinc-400 transition hover:text-white"
      >
        Open project
        <ChevronRight size={15} />
      </button>
    </div>
  );
}

/* =========================================================
   NAV ITEM
========================================================= */

function NavItem({
  icon,
  label,
  active = false,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
        active
          ? "bg-white text-black"
          : "text-zinc-400 hover:bg-white/[0.05] hover:text-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/* =========================================================
   STAT CARD
========================================================= */

function StatCard({
  icon,
  label,
  value,
  subtitle,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-5">
      <div className="flex items-center justify-between">
        <span className="text-zinc-400">
          {label}
        </span>

        <span className="text-zinc-500">
          {icon}
        </span>
      </div>

      <p className="mt-4 text-3xl font-semibold">
        {value}
      </p>

      <p className="mt-1 text-xs text-zinc-500">
        {subtitle}
      </p>
    </div>
  );
}

/* =========================================================
   ACTIVITY ROW
========================================================= */

function ActivityRow({
  title,
  subtitle,
  time,
}: {
  title: string;
  subtitle: string;
  time: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 last:border-b-0">
      <div>
        <p className="text-sm font-medium">
          {title}
        </p>

        <p className="mt-1 text-xs text-zinc-500">
          {subtitle}
        </p>
      </div>

      <span className="whitespace-nowrap text-xs text-zinc-600">
        {time}
      </span>
    </div>
  );
}

/* =========================================================
   PROTECTED DASHBOARD
========================================================= */

function ProtectedDashboard() {
  const token = localStorage.getItem("devora_token");

  return token ? (
    <Dashboard />
  ) : (
    <Navigate to="/login" replace />
  );
}

/* =========================================================
   PROTECTED PROJECT WORKSPACE
========================================================= */

function ProtectedProjectWorkspace() {
  const token = localStorage.getItem("devora_token");

  return token ? (
    <ProjectWorkspace />
  ) : (
    <Navigate to="/login" replace />
  );
}

/* =========================================================
   APP ROUTES
========================================================= */

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={<Login />}
      />

      <Route
        path="/signup"
        element={<Signup />}
      />

      <Route
        path="/dashboard"
        element={<ProtectedDashboard />}
      />

      <Route
        path="/projects/:id"
        element={<ProtectedProjectWorkspace />}
      />

      <Route
        path="*"
        element={
          <Navigate
            to="/dashboard"
            replace
          />
        }
      />
    </Routes>
  );
}