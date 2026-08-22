import axios from "axios";
import { addNotification } from "./notifications";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("devora_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    const method = response.config.method?.toLowerCase();
    const url = response.config.url || "";
    const shouldNotify =
      method &&
      ["post", "put", "patch", "delete"].includes(method) &&
      !url.startsWith("/auth") &&
      !url.includes("/files");

    if (shouldNotify) {
      const action = method === "post" ? "Created" : method === "delete" ? "Deleted" : "Updated";
      const cleanPath = url.replace(/^\//, "").replace(/\//g, " ").trim();
      addNotification(`${action} successfully`, cleanPath || "Workspace changed");
    }

    return response;
  },
  (error) => Promise.reject(error),
);

export default api;
