import { type FormEvent, useState } from "react";
import { Bot, Send, Sparkles, User, Wand2 } from "lucide-react";
import Layout from "./Layout";
import api from "../services/api";

type Message = { role: "user" | "assistant"; text: string };

type ChatResponse = {
  model: string;
  reply: string;
};

const starterPrompts = [
  "Explain my current project architecture",
  "Help me fix a bug",
  "Suggest a refactor",
  "Write tests for my code",
];

export default function AIChat() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "I'm Devora AI. Ask me about your project, code, bugs, refactors, tests, or architecture.",
    },
  ]);

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    const history = [...messages, { role: "user" as const, text }];
    setMessages(history);
    setInput("");
    setBusy(true);

    try {
      const response = await api.post<ChatResponse>("/ai/chat", {
        message: text,
        history: history.slice(-12),
      });
      setModel(response.data.model);
      setMessages((current) => [...current, { role: "assistant", text: response.data.reply }]);
    } catch (error: any) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: error.response?.data?.message || "I couldn't reach Gemini right now. Check the Devora API deployment and try again.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout active="AI Assistant">
      <div className="border-b border-white/10 px-5 py-6 sm:px-8">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">Devora AI</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">AI Assistant</h1>
          {model && <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-500">{model}</span>}
        </div>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">Chat with Gemini from inside your developer workspace.</p>
      </div>

      <section className="p-5 sm:p-8">
        <div className="mx-auto flex min-h-[680px] max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0e]">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06]"><Bot size={18} /></div>
              <div>
                <p className="font-medium">Devora AI</p>
                <p className="text-xs text-zinc-600">Gemini-powered developer assistant</p>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                {message.role === "assistant" && <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]"><Bot size={14} /></div>}
                <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-white text-black" : "border border-white/10 bg-white/[0.04] text-zinc-300"}`}>
                  {message.text}
                </div>
                {message.role === "user" && <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white"><User size={14} className="text-black" /></div>}
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-3 text-sm text-zinc-500"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06]"><Sparkles size={14} className="animate-pulse" /></div>Thinking…</div>
            )}
          </div>

          <div className="border-t border-white/10 p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap gap-2">
              {starterPrompts.map((prompt) => (
                <button key={prompt} type="button" onClick={() => setInput(prompt)} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"><Wand2 size={12} />{prompt}</button>
              ))}
            </div>
            <form onSubmit={send} className="flex gap-2">
              <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask Devora anything about your code…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-zinc-700" />
              <button type="submit" disabled={busy || !input.trim()} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40"><Send size={15} /> Send</button>
            </form>
          </div>
        </div>
      </section>
    </Layout>
  );
}
