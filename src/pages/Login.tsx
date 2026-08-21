import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Sparkles } from "lucide-react";
import api from "../services/api";

function validateLogin(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return "Email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return "Enter a valid email address.";
  if (!password) return "Password is required.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (/\s/.test(password)) return "Password cannot contain spaces.";
  return "";
}

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validateLogin(email, password);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setLoading(true);

    try {
      const response = await api.post("/auth/login", {
        email: email.trim().toLowerCase(),
        password,
      });
      localStorage.setItem("devora_token", response.data.token);
      localStorage.setItem("devora_user", JSON.stringify(response.data.user));
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message || "Login failed. Check your credentials and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#09090b] px-4 text-white">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-black"><Sparkles size={22} /></div>
          <h1 className="text-3xl font-semibold">Welcome to Devora</h1>
          <p className="mt-2 text-sm text-zinc-500">Sign in to your developer workspace</p>
        </div>

        <form onSubmit={handleLogin} noValidate className="rounded-2xl border border-white/10 bg-[#0f0f12] p-6">
          {error && <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

          <label className="mb-2 block text-sm text-zinc-400">Email</label>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" className="mb-5 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none placeholder:text-zinc-700 focus:border-white/20" />

          <label className="mb-2 block text-sm text-zinc-400">Password</label>
          <div className="relative mb-6">
            <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="At least 8 characters" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 pr-12 outline-none placeholder:text-zinc-700 focus:border-white/20" />
            <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-zinc-600 hover:bg-white/[0.05] hover:text-white">
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <button type="submit" disabled={loading} className="w-full rounded-xl bg-white px-4 py-3 font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50">{loading ? "Signing in..." : "Sign in"}</button>

          <p className="mt-4 text-center text-xs text-zinc-600">Rules: valid email, password 8+ characters, no spaces.</p>
          <p className="mt-5 text-center text-sm text-zinc-500">Don't have an account? <Link to="/signup" className="text-white hover:underline">Create one</Link></p>
        </form>
      </div>
    </div>
  );
}
