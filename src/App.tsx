import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ProjectWorkspaceFinal from "./pages/ProjectWorkspaceFinal";
import ProjectChanges from "./pages/ProjectChanges";
import Dashboard from "./pages/Dashboard";
import GitHubHubFinal from "./pages/GitHubHubFinal";
import GitHubDevWorkspace from "./pages/GitHubDevWorkspace";
import GitHubDiffViewer from "./pages/GitHubDiffViewer";
import PullRequestCenter from "./pages/PullRequestCenter";
import ProjectCommandCenter from "./pages/ProjectCommandCenter";
import AICodeActions from "./pages/AICodeActions";
import CodeRunner from "./pages/CodeRunner";
import Profile from "./pages/Profile";
import { ActivityPage, AssistantPage, SettingsPage, TerminalPage } from "./pages/ToolPages";

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
    <Route path="/projects" element={<Protected><ProjectCommandCenter /></Protected>} />
    <Route path="/ai" element={<Protected><AssistantPage /></Protected>} />
    <Route path="/ai/code" element={<Protected><AICodeActions /></Protected>} />
    <Route path="/github" element={<Protected><GitHubHubFinal /></Protected>} />
    <Route path="/github/repo" element={<Protected><GitHubDevWorkspace /></Protected>} />
    <Route path="/github/diff" element={<Protected><GitHubDiffViewer /></Protected>} />
    <Route path="/github/prs" element={<Protected><PullRequestCenter /></Protected>} />
    <Route path="/runner" element={<Protected><CodeRunner /></Protected>} />
    <Route path="/terminal" element={<Protected><TerminalPage /></Protected>} />
    <Route path="/activity" element={<Protected><ActivityPage /></Protected>} />
    <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
    <Route path="/profile" element={<Protected><Profile /></Protected>} />
    <Route path="/projects/:id" element={<ProtectedWorkspace />} />
    <Route path="/projects/:id/changes" element={<ProtectedChanges />} />
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>;
}
