import { type FormEvent, type ReactNode, useState } from "react";
import { Bot, Check, Copy, Send, Sparkles, User, Wand2 } from "lucide-react";
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

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];

    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`strong-${match.index}`} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <code
          key={`code-${match.index}`}
          className="rounded-md border border-white/10 bg-black/30 px-1.5 py-0.5 font-mono text-[0.9em] text-zinc-200"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function AIResponseContent({ text }: { text: string }) {
  const parts = text.split(/```([\w.+-]*)\n?([\s\S]*?)```/g);
  const blocks: ReactNode[] = [];

  for (let index = 0; index < parts.length; index += 3) {
    const prose = parts[index] || "";
    const language = parts[index + 1] || "";
    const code = parts[index + 2];

    const proseLines = prose.split(/\n{2,}/g).map((paragraph) => paragraph.trim()).filter(Boolean);

    proseLines.forEach((paragraph, paragraphIndex) => {
      const lines = paragraph.split("\n");
      if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
        blocks.push(
          <ul key={`list-${index}-${paragraphIndex}`} className="list-disc space-y-1.5 pl-5 text-zinc-300">
            {lines.map((line, lineIndex) => (
              <li key={lineIndex}>{renderInline(line.replace(/^\s*[-*]\s+/, ""))}</li>
            ))}
          </ul>,
        );
      } else if (/^#{1,3}\s+/.test(paragraph)) {
        const heading = paragraph.replace(/^#{1,3}\s+/, "");
        blocks.push(
          <h3 key={`heading-${index}-${paragraphIndex}`} className="text-sm font-semibold text-white">
            {renderInline(heading)}
          </h3>,
        );
      } else {
        blocks.push(
          <p key={`paragraph-${index}-${paragraphIndex}`} className="whitespace-pre-wrap text-zinc-300">
            {renderInline(paragraph)}
          </p>,
        );
      }
    });

    if (typeof code === "string") {
      blocks.push(
        <CodeBlock key={`code-${index}`} language={language} code={code.trim()} />,
      );
    }
  }

  return <div className="space-y-3">{blocks}</div>;
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#09090c] shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-zinc-500" />
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
            {language || "code"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-zinc-400 transition hover:bg-white/[0.05] hover:text-white"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-[420px] overflow-auto p-4 text-[12px] leading-6 text-zinc-200">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}

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
          {model && (
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-500">
              {model}
            </span>
          )}
        </div>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">Chat with Gemini from inside your developer workspace.</p>
      </div>

      <section className="p-5 sm:p-8">
        <div className="mx-auto flex min-h-[680px] max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0e] shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
          <div className="border-b border-white/10 px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06]">
                <Bot size={18} />
              </div>
              <div>
                <p className="font-medium">Devora AI</p>
                <p className="text-xs text-zinc-600">Gemini-powered developer assistant</p>
              </div>
              <div className="ml-auto hidden rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-600 sm:block">
                Developer mode
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {message.role === "assistant" && (
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
                    <Bot size={14} />
                  </div>
                )}
                <div
                  className={
                    message.role === "user"
                      ? "max-w-[82%] rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-black shadow-[0_8px_24px_rgba(255,255,255,0.06)]"
                      : "max-w-[88%] rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-sm leading-6 text-zinc-300"
                  }
                >
                  {message.role === "assistant" ? <AIResponseContent text={message.text} /> : message.text}
                </div>
                {message.role === "user" && (
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white">
                    <User size={14} className="text-black" />
                  </div>
                )}
              </div>
            ))}

            {busy && (
              <div className="flex items-center gap-3 text-sm text-zinc-500">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06]">
                  <Sparkles size={14} className="animate-pulse" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span>Thinking</span>
                  <span className="animate-pulse">...</span>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-white/10 bg-[#0c0c10] p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap gap-2">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setInput(prompt)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-300"
                >
                  <Wand2 size={12} />
                  {prompt}
                </button>
              ))}
            </div>
            <form onSubmit={send} className="flex gap-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask Devora anything about your code…"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-zinc-700 focus:border-white/20"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send size={15} />
                Send
              </button>
            </form>
          </div>
        </div>
      </section>
    </Layout>
  );
}
