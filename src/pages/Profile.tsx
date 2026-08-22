import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, UserRound } from "lucide-react";
import Layout from "./Layout";

interface StoredUser {
  id?: string;
  name?: string | null;
  email?: string;
}

export default function Profile() {
  const navigate = useNavigate();
  const stored = JSON.parse(localStorage.getItem("devora_user") || "null") as StoredUser | null;
  const [name, setName] = useState(stored?.name || "");
  const [saved, setSaved] = useState(false);

  const initials = (name || stored?.email || "D")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const save = () => {
    const next = {
      ...(stored || {}),
      name: name.trim() || null,
    };
    localStorage.setItem("devora_user", JSON.stringify(next));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <Layout active="Settings">
      <div className="border-b border-white/10 px-5 py-6 sm:px-8">
        <button
          onClick={() => navigate("/settings")}
          className="mb-4 flex items-center gap-2 text-sm text-zinc-500 hover:text-white"
        >
          <ArrowLeft size={15} /> Back to Settings
        </button>
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">Devora</p>
        <h1 className="mt-2 text-2xl font-semibold">Profile</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">Manage the local profile details shown around your workspace.</p>
      </div>

      <section className="p-5 sm:p-8">
        <div className="grid max-w-4xl gap-5 lg:grid-cols-[220px_1fr]">
          <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-6 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-white text-2xl font-semibold text-black">
              {initials || <UserRound size={28} />}
            </div>
            <p className="mt-4 font-medium">{name || "Developer"}</p>
            <p className="mt-1 break-all text-xs text-zinc-600">{stored?.email || ""}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-6">
            <h2 className="font-semibold">Profile information</h2>
            <p className="mt-1 text-sm text-zinc-500">Your account email is read-only here.</p>

            <div className="mt-6 space-y-5">
              <div>
                <label className="mb-2 block text-sm text-zinc-400">Display name</label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={60}
                  placeholder="Your name"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-zinc-700 focus:border-white/20"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">Email</label>
                <input
                  value={stored?.email || ""}
                  readOnly
                  className="w-full cursor-not-allowed rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-500 outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={save}
                  className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-zinc-200"
                >
                  <Check size={15} /> Save profile
                </button>
                {saved && <span className="text-xs text-emerald-400">Saved locally.</span>}
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-500">
                Password changes and server-side profile persistence are intentionally kept out of this frontend-only update so the production authentication and database setup remain untouched.
              </div>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
