import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import api from "../services/api";

export default function Signup() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await api.post("/auth/signup", {
        name,
        email,
        password,
      });

      localStorage.setItem("devora_token", response.data.token);
      localStorage.setItem(
        "devora_user",
        JSON.stringify(response.data.user),
      );

      navigate("/dashboard");
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Signup failed",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#09090b] px-4 text-white">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-black">
            <Sparkles size={22} />
          </div>

          <h1 className="text-3xl font-semibold">
            Create your Devora account
          </h1>

          <p className="mt-2 text-sm text-zinc-500">
            Your AI-powered developer workspace
          </p>
        </div>

        <form
          onSubmit={handleSignup}
          className="rounded-2xl border border-white/10 bg-[#0f0f12] p-6"
        >
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <label className="mb-2 block text-sm text-zinc-400">
            Name
          </label>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="mb-5 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none placeholder:text-zinc-700 focus:border-white/20"
          />

          <label className="mb-2 block text-sm text-zinc-400">
            Email
          </label>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="mb-5 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none placeholder:text-zinc-700 focus:border-white/20"
          />

          <label className="mb-2 block text-sm text-zinc-400">
            Password
          </label>

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            minLength={8}
            className="mb-6 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none placeholder:text-zinc-700 focus:border-white/20"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-white px-4 py-3 font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>

          <p className="mt-5 text-center text-sm text-zinc-500">
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-white hover:underline"
            >
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}