import { useEffect, useRef, useState } from "react";
import { Trash2, Copy, RotateCcw, Terminal as TerminalIcon } from "lucide-react";
import Layout from "./Layout";

type Line = { text: string; tone?: "command" | "error" | "muted" };
type CommandResult = { clear: boolean; lines: Line[] };

const INITIAL_LINES: Line[] = [
  { text: "Devora Terminal v1.0", tone: "muted" },
  { text: "Safe workspace mode enabled.", tone: "muted" },
  { text: "Type 'help' to see available commands.", tone: "muted" },
];

const COMMANDS = [
  "help",
  "clear",
  "pwd",
  "ls",
  "cd projects",
  "git status",
  "git branch",
  "git log",
  "npm run build",
  "npm test",
  "echo hello",
];

function executeCommand(raw: string): CommandResult {
  const value = raw.trim();
  if (!value) return { clear: false, lines: [] };
  const [command, ...args] = value.split(/\s+/);
  const rest = args.join(" ");

  switch (command.toLowerCase()) {
    case "help":
      return {
        clear: false,
        lines: [
          { text: "Available safe workspace commands:", tone: "muted" },
          { text: "  help        Show available commands" },
          { text: "  clear       Clear the terminal" },
          { text: "  pwd         Show workspace path" },
          { text: "  ls          List workspace entries" },
          { text: "  cd <dir>    Change displayed directory" },
          { text: "  git status  Show repository state" },
          { text: "  git branch  Show branches" },
          { text: "  git log     Show recent commits" },
          { text: "  npm run build  Preview build command" },
          { text: "  npm test    Preview test command" },
          { text: "  echo <text> Print text" },
        ],
      };
    case "clear":
      return { clear: true, lines: [] };
    case "pwd":
      return { clear: false, lines: [{ text: "/devora/workspace" }] };
    case "ls":
      return {
        clear: false,
        lines: [
          { text: "projects/", tone: "muted" },
          { text: "README.md", tone: "muted" },
          { text: "package.json", tone: "muted" },
        ],
      };
    case "cd":
      return {
        clear: false,
        lines: [
          {
            text: rest
              ? `Directory changed to /devora/workspace/${rest.replace(/^\/+/, "")}`
              : "Usage: cd <directory>",
            tone: rest ? undefined : "error",
          },
        ],
      };
    case "git":
      if (args[0] === "status") {
        return {
          clear: false,
          lines: [
            { text: "On branch main" },
            { text: "Your working tree is ready for changes.", tone: "muted" },
          ],
        };
      }
      if (args[0] === "branch") {
        return {
          clear: false,
          lines: [
            { text: "* main" },
            { text: "  develop", tone: "muted" },
          ],
        };
      }
      if (args[0] === "log") {
        return {
          clear: false,
          lines: [
            { text: "a4164ac  update production workspace" },
            { text: "c59fc88  sync database schema", tone: "muted" },
            { text: "80d6177  add dashboard tools", tone: "muted" },
          ],
        };
      }
      return {
        clear: false,
        lines: [{ text: "Supported git commands: status, branch, log", tone: "error" }],
      };
    case "npm":
      if (args[0] === "run" && args[1] === "build") {
        return {
          clear: false,
          lines: [
            { text: "> npm run build" },
            { text: "Build command queued in safe preview mode.", tone: "muted" },
            { text: "Real execution will be enabled with the secured terminal backend.", tone: "muted" },
          ],
        };
      }
      if (args[0] === "test") {
        return {
          clear: false,
          lines: [
            { text: "> npm test" },
            { text: "Test command queued in safe preview mode.", tone: "muted" },
            { text: "Real execution will be enabled with the secured terminal backend.", tone: "muted" },
          ],
        };
      }
      return {
        clear: false,
        lines: [{ text: "Supported npm commands: npm run build, npm test", tone: "error" }],
      };
    case "echo":
      return { clear: false, lines: [{ text: rest }] };
    default:
      return {
        clear: false,
        lines: [{ text: `Command not available in safe mode: ${value}`, tone: "error" }],
      };
  }
}

export default function TerminalPage() {
  const [command, setCommand] = useState("");
  const [lines, setLines] = useState<Line[]>(INITIAL_LINES);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
        event.preventDefault();
        setLines([]);
        setSuggestions(false);
      }
    };

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, []);

  const run = (input = command) => {
    const value = input.trim();
    if (!value) return;
    const result = executeCommand(value);

    if (result.clear) {
      setLines([]);
    } else {
      setLines((current) => [
        ...current,
        { text: `$ ${value}`, tone: "command" },
        ...result.lines,
      ]);
    }

    setHistory((current) => [value, ...current.filter((item) => item !== value)].slice(0, 30));
    setHistoryIndex(-1);
    setCommand("");
    setSuggestions(false);
  };

  const copyOutput = async () => {
    try {
      await navigator.clipboard.writeText(lines.map((line) => line.text).join("\n"));
    } catch {
      // Clipboard may be unavailable in restricted browser contexts.
    }
  };

  const clear = () => setLines([]);
  const reset = () => setLines(INITIAL_LINES);

  const moveHistory = (direction: "up" | "down") => {
    if (!history.length) return;
    const nextIndex =
      direction === "up"
        ? Math.min(historyIndex + 1, history.length - 1)
        : Math.max(historyIndex - 1, -1);
    setHistoryIndex(nextIndex);
    setCommand(nextIndex === -1 ? "" : history[nextIndex]);
  };

  return (
    <Layout active="Terminal">
      <div className="flex min-h-screen flex-col">
        <div className="border-b border-white/10 px-5 py-5 sm:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">Devora</p>
              <h1 className="mt-2 text-2xl font-semibold">Terminal</h1>
              <p className="mt-1 max-w-2xl text-sm text-zinc-500">A developer terminal for workspace navigation, Git inspection, build previews, and test previews.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a href="/runner" className="rounded-xl bg-white px-3 py-2 text-xs font-medium text-black hover:bg-zinc-200">Open Code Runner</a>
              <button onClick={reset} title="Reset terminal" className="rounded-lg border border-white/10 p-2 text-zinc-500 hover:bg-white/[0.04] hover:text-white"><RotateCcw size={15} /></button>
              <button onClick={() => void copyOutput()} title="Copy output" className="rounded-lg border border-white/10 p-2 text-zinc-500 hover:bg-white/[0.04] hover:text-white"><Copy size={15} /></button>
              <button onClick={clear} title="Clear terminal" className="rounded-lg border border-white/10 p-2 text-zinc-500 hover:bg-white/[0.04] hover:text-white"><Trash2 size={15} /></button>
            </div>
          </div>
        </div>

        <section className="flex-1 p-4 sm:p-8">
          <div className="mx-auto flex h-[calc(100vh-220px)] max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 bg-[#101014] px-4 py-3 text-xs text-zinc-500">
              <div className="flex items-center gap-2"><TerminalIcon size={14} /> devora-terminal</div>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-400">SAFE MODE</span>
            </div>

            <div ref={outputRef} className="min-h-0 flex-1 overflow-y-auto p-4 font-mono text-xs sm:text-sm">
              {lines.map((line, index) => (
                <div key={`${line.text}-${index}`} className={`whitespace-pre-wrap leading-6 ${line.tone === "command" ? "text-white" : line.tone === "error" ? "text-red-400" : line.tone === "muted" ? "text-zinc-600" : "text-zinc-400"}`}>{line.text}</div>
              ))}
            </div>

            <div className="border-t border-white/10 p-3">
              {suggestions && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {COMMANDS.filter((item) => !command || item.startsWith(command.toLowerCase())).slice(0, 6).map((item) => (
                    <button key={item} onClick={() => { setCommand(item); setSuggestions(false); }} className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 font-mono text-[11px] text-zinc-400 hover:border-white/20 hover:text-white">{item}</button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 py-2.5">
                <span className="font-mono text-sm text-emerald-400">$</span>
                <input
                  value={command}
                  onChange={(event) => { setCommand(event.target.value); setSuggestions(true); }}
                  onFocus={() => setSuggestions(true)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") run();
                    if (event.key === "Escape") setSuggestions(false);
                    if (event.key === "ArrowUp") { event.preventDefault(); moveHistory("up"); }
                    if (event.key === "ArrowDown") { event.preventDefault(); moveHistory("down"); }
                  }}
                  placeholder="Type a command..."
                  className="min-w-0 flex-1 bg-transparent font-mono text-sm text-white outline-none placeholder:text-zinc-700"
                  autoComplete="off"
                />
                <button onClick={() => run()} disabled={!command.trim()} className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-black disabled:cursor-not-allowed disabled:opacity-30">Run</button>
              </div>
              <p className="mt-2 text-[10px] text-zinc-700">Enter to run • ↑/↓ history • Esc suggestions • Ctrl/Cmd + L clears</p>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
