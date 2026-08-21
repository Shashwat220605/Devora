import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "./index.css";
import App from "./App";
import ProjectChanges from "./pages/ProjectChanges";

const isChangesPage = /^\/projects\/[^/]+\/changes$/.test(
  window.location.pathname,
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      {isChangesPage ? <ProjectChanges /> : <App />}
    </BrowserRouter>
  </StrictMode>,
);
