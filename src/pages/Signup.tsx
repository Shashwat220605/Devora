import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Eye, EyeOff, Sparkles, X } from "lucide-react";
import api from "../services/api";

function getPasswordRules(password: string) {
  return {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /\d/.test(password),
    space: !/\s/.test(password),
  };
}

export default function Signup() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const rules = useMemo(() => getPasswordRules(password), [password]);
  const strongPassword = Object.values(rules).every(Boolean);

  const handleSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const normalizedEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    if (cleanName.length < 2) return setError("Name must be at least 2 characters.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return setError("Enter a valid email address.");
    if (!strongPassword) return setError("Password must pass every rule below.");
    if (password !== confirmPassword) return setError("Passwords do not match.");

    setLoading(true);
    try {
      const response = await api.post("/auth/signup", {
        name: cleanName,
        email: normalizedEmail,
        password,
      });
      localStorage.setItem("devora_token", response.data.token);
      localStorage.setItem("devora_user", JSON.stringify(response.data.user));
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message || "Signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const Rule = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
    <div className={`flex items-center gap-2 text-xs ${ok ? "text-emerald-400" : "text-zinc-600"}`}>
      {ok ? <Check size={13} /> : <X size={13} />}
      {children}
    </div>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#09090b] px-4 py-8 text-white">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-black"><Sparkles size={22} /></div>
          <h1 className="text-3xl font-semibold">Create your Devora account</h1>
          <p className="mt-2 text-sm text-zinc-500">A safer account setup for your developer workspace</p>
        </div>

        <form onSubmit={handleSignup} noValidate className="rounded-2xl border border-white/10 bg-[#0f0f12] p-6">
          {error && <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

          <label className="mb-2 block text-sm text-zinc-400">Name</label>
          <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Your name" className="mb-5 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none placeholder:text-zinc-700 focus:border-white/20" />

          <label className="mb-2 block text-sm text-zinc-400">Email</label>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" className="mb-5 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none placeholder:text-zinc-700 focus:border-white/20" />

          <label className="mb-2 block text-sm text-zinc-400">Password</label>
          <div className="relative">
            <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="Create a strong password" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 pr-12 outline-none placeholder:text-zinc-700 focus:border-white/20" />
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-zinc-600 hover:bg-white/[0.05] hover:text-white">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>

          <div className="mt-3 grid gap-1.5 rounded-xl border border-white/10 bg-black/10 p-3">
            <Rule ok={rules.length}>At least 8 characters</Rule>
            <Rule ok={rules.upper}>One uppercase letter</Rule>
            <Rule ok={rules.lower}>One lowercase letter</Rule>
            <Rule ok={rules.number}>One number</Rule>
            <Rule ok={rules.space}>No spaces</Rule>
          </div>

          <label className="mb-2 mt-5 block text-sm text-zinc-400">Confirm password</label>
          <div className="relative mb-6">
            <input type={showConfirm ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder="Repeat your password" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 pr-12 outline-none placeholder:text-zinc-700 focus:border-white/20" />
            <button type="button" onClick={() => setShowConfirm((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-zinc-600 hover:bg-white/[0.05] hover:text-white">{showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>

          <button type="submit" disabled={loading} className="w-full rounded-xl bg-white px-4 py-3 font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50">{loading ? "Creating account..." : "Create account"}</button>
          <p className="mt-5 text-center text-sm text-zinc-500">Already have an account? <Link to="/login" className="text-white hover:underline">Sign in</Link></p>
        </form>
      </div>
    </div>
  );
}
