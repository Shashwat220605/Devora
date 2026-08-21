import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ProjectWorkspace from "./pages/ProjectWorkspace";
import ProjectChanges from "./pages/ProjectChanges";
import Dashboard from "./pages/Dashboard";
import { ActivityPage, AssistantPage, GitHubPage, ProjectsPage, SettingsPage, TerminalPage } from "./pages/ToolPages";

function Protected({ children }: { children: ReactNode }) {
  return localStorage.getItem("devora_token") ? <>{children}</> : <Navigate to="/login" replace />;
}

function ProtectedWorkspace() { return <Protected><ProjectWorkspace /></Protected>; }
function ProtectedChanges() { return <Protected><ProjectChanges /></Protected>; }

export default function App() {
  return <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/signup" element={<Signup />} />
    <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
    <Route path="/projects" element={<Protected><ProjectsPage /></Protected>} />
    <Route path="/ai" element={<Protected><AssistantPage /></Protected>} />
    <Route path="/github" element={<Protected><GitHubPage /></Protected>} />
    <Route path="/terminal" element={<Protected><TerminalPage /></Protected>} />
    <Route path="/activity" element={<Protected><ActivityPage /></Protected>} />
    <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
    <Route path="/projects/:id" element={<ProtectedWorkspace />} />
    <Route path="/projects/:id/changes" element={<ProtectedChanges />} />
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>;
}
