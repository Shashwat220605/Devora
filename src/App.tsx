import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ProjectWorkspaceFinal from "./pages/ProjectWorkspaceFinal";
import ProjectChanges from "./pages/ProjectChanges";
import Dashboard from "./pages/Dashboard";
import GitHubPhase2 from "./pages/GitHubPhase2";
import Profile from "./pages/Profile";
import { ActivityPage, AssistantPage, ProjectsPage, SettingsPage, TerminalPage } from "./pages/ToolPages";

function Protected({ children }: { children: ReactNode }) {
  return localStorage.getItem("devora_token") ? <>{children}</> : <Navigate to="/login" replace />;
}
function ProtectedWorkspace() { return <Protected><ProjectWorkspaceFinal /></Protected>; }
function ProtectedChanges() { return <Protected><ProjectChanges /></Protected>; }

export default function App() {
  return <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/signup" element={<Signup />} />
    <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
    <Route path="/projects" element={<Protected><ProjectsPage /></Protected>} />
    <Route path="/ai" element={<Protected><AssistantPage /></Protected>} />
    <Route path="/github" element={<Protected><GitHubPhase2 /></Protected>} />
    <Route path="/terminal" element={<Protected><TerminalPage /></Protected>} />
    <Route path="/activity" element={<Protected><ActivityPage /></Protected>} />
    <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
    <Route path="/profile" element={<Protected><Profile /></Protected>} />
    <Route path="/projects/:id" element={<ProtectedWorkspace />} />
    <Route path="/projects/:id/changes" element={<ProtectedChanges />} />
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>;
}
