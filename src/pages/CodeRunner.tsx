import { useEffect, useMemo, useRef, useState } from "react";
import { Code2, Play, RotateCcw, SquareTerminal, Trash2 } from "lucide-react";
import Layout from "./Layout";

type Language = "javascript" | "html" | "css";
type LogType = "log" | "error" | "result";
type LogItem = { type: LogType; text: string };

const starterCode: Record<Language, string> = {
  javascript: `const name = "Devora";
console.log("Hello from", name);

const numbers = [1, 2, 3, 4, 5];
const total = numbers.reduce((sum, value) => sum + value, 0);
console.log("Total:", total);
total;
`,
  html: `<main class="card">
  <h1>Hello Devora</h1>
  <p>Edit this HTML and press Run.</p>
</main>
`,
  css: `.card {
  font-family: system-ui, sans-serif;
  padding: 32px;
  border-radius: 18px;
  background: #18181b;
  color: white;
}

.card h1 {
  margin: 0 0 8px;
}
`,
};

function buildPreview(language: Exclude<Language, "javascript">, code: string) {
  const common =
    "body{margin:0;padding:24px;background:#09090b;color:#fff;font-family:system-ui,sans-serif}*{box-sizing:border-box}";

  if (language === "html") {
    return `<!doctype html><html><head><meta charset="UTF-8"><style>${common}</style></head><body>${code}</body></html>`;
  }

  return `<!doctype html><html><head><meta charset="UTF-8"><style>${common}${code}</style></head><body><main class="card"><h1>CSS Preview</h1><p>Edit the CSS and press Run.</p></main></body></html>`;
}

function buildJavaScriptSandbox(code: string) {
  const safeCode = code.replace(/<\/script/gi, "<\\/script");

  return `<!doctype html><html><body style="margin:0;background:#09090b;color:#fff;font-family:monospace"><script>
(() => {
  const send = (type, value) => parent.postMessage({ source: "devora-runner", type, value }, "*");
  const stringify = (value) => {
    if (typeof value === "string") return value;
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  };
  const originalLog = console.log.bind(console);
  const originalInfo = console.info.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.log = (...args) => { send("log", args.map(stringify).join(" ")); originalLog(...args); };
  console.info = (...args) => { send("log", args.map(stringify).join(" ")); originalInfo(...args); };
  console.warn = (...args) => { send("error", args.map(stringify).join(" ")); originalWarn(...args); };
  console.error = (...args) => { send("error", args.map(stringify).join(" ")); originalError(...args); };

  window.onerror = (message, _source, line, column) => {
    send("error", String(message) + " (line " + line + ", column " + column + ")");
  };

  window.onunhandledrejection = (event) => send("error", String(event.reason));

  try {
    const result = (async () => {
${safeCode}
    })();

    Promise.resolve(result).then((value) => {
      if (typeof value !== "undefined") send("result", stringify(value));
    });
  } catch (error) {
    send("error", error instanceof Error ? error.stack || error.message : String(error));
  }
})();
</script></body></html>`;
}

export default function CodeRunner() {
  const storedLanguage = localStorage.getItem("devora_runner_language") as Language | null;
  const initialLanguage: Language = storedLanguage === "html" || storedLanguage === "css" ? storedLanguage : "javascript";

  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [code, setCode] = useState<string>(starterCode[initialLanguage]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState("");

  const frameRef = useRef<HTMLIFrameElement>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.source !== "devora-runner") return;

      setLogs((current) => [
        ...current,
        {
          type: event.data.type as LogType,
          text: String(event.data.value ?? ""),
        },
      ]);

      if (event.data.type === "result" || event.data.type === "error") {
        if (timeoutRef.current !== null) {
          window.clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setRunning(false);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const languageLabel = useMemo(
    () => ({ javascript: "JavaScript", html: "HTML", css: "CSS" })[language],
    [language],
  );

  const changeLanguage = (next: Language) => {
    setLanguage(next);
    localStorage.setItem("devora_runner_language", next);
    setCode(starterCode[next]);
    setLogs([]);
    setPreview("");
    setRunning(false);

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (frameRef.current) frameRef.current.srcdoc = "";
  };

  const clear = () => {
    setLogs([]);
    setPreview("");
  };

  const stop = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setRunning(false);
    if (frameRef.current) frameRef.current.srcdoc = "";
    setLogs((current) => [...current, { type: "error", text: "Execution stopped." }]);
  };

  const run = () => {
    clear();

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (language === "html" || language === "css") {
      setPreview(buildPreview(language, code));
      return;
    }

    setRunning(true);
    timeoutRef.current = window.setTimeout(() => {
      setRunning(false);
      setLogs((current) => [
        ...current,
        { type: "error", text: "Execution timed out after 5 seconds." },
      ]);
      if (frameRef.current) frameRef.current.srcdoc = "";
      timeoutRef.current = null;
    }, 5000);

    if (!frameRef.current) {
      setRunning(false);
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setLogs((current) => [
        ...current,
        { type: "error", text: "Execution sandbox is not ready. Refresh and try again." },
      ]);
      return;
    }

    frameRef.current.srcdoc = buildJavaScriptSandbox(code);
  };

  return (
    <Layout active="Code Runner">
      <div className="border-b border-white/10 px-5 py-6 sm:px-8">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">Devora</p>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Code Runner</h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-500">
              Run basic code directly in a browser sandbox without adding execution load to the Cloudflare Worker.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={language}
              onChange={(event) => changeLanguage(event.target.value as Language)}
              className="rounded-xl border border-white/10 bg-[#101014] px-3 py-2.5 text-sm outline-none"
            >
              <option value="javascript">JavaScript</option>
              <option value="html">HTML</option>
              <option value="css">CSS</option>
            </select>

            {running ? (
              <button
                onClick={stop}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10"
              >
                <SquareTerminal size={15} /> Stop
              </button>
            ) : (
              <button
                onClick={run}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-zinc-200"
              >
                <Play size={15} /> Run
              </button>
            )}
          </div>
        </div>
      </div>

      <section className="grid gap-4 p-5 sm:p-8 xl:grid-cols-[1.45fr_1fr]">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0e]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="flex items-center gap-2 text-xs text-zinc-400">
              <Code2 size={14} /> {languageLabel}
            </span>
            <button
              onClick={() => setCode(starterCode[language])}
              className="inline-flex items-center gap-2 text-xs text-zinc-500 hover:text-white"
            >
              <RotateCcw size={13} /> Reset
            </button>
          </div>

          <textarea
            value={code}
            onChange={(event) => setCode(event.target.value)}
            spellCheck={false}
            className="min-h-[560px] w-full resize-none bg-transparent p-5 font-mono text-sm leading-6 text-zinc-200 outline-none"
          />
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-4">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-medium">
                <SquareTerminal size={15} /> Console
              </p>
              <button
                onClick={clear}
                className="inline-flex items-center gap-2 text-xs text-zinc-500 hover:text-white"
              >
                <Trash2 size={13} /> Clear
              </button>
            </div>

            <div className="mt-4 min-h-[230px] max-h-[330px] overflow-auto rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-xs leading-6">
              {logs.length === 0 ? (
                <p className="text-zinc-700">Output will appear here...</p>
              ) : (
                logs.map((item, index) => {
                  const textClass =
                    item.type === "error"
                      ? "text-red-400"
                      : item.type === "result"
                        ? "text-amber-300"
                        : "text-zinc-300";
                  return (
                    <div key={`${item.type}-${index}`} className={textClass}>
                      {item.type === "result" ? `↳ ${item.text}` : item.text}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {(language === "html" || language === "css") && (
            <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-4">
              <p className="text-sm font-medium">Preview</p>
              <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-white">
                <iframe
                  title="Code preview"
                  srcDoc={preview}
                  sandbox="allow-scripts"
                  className="h-[280px] w-full border-0"
                />
              </div>
            </div>
          )}

          <iframe
            ref={frameRef}
            title="JavaScript execution sandbox"
            sandbox="allow-scripts"
            className="hidden"
            aria-hidden="true"
          />

          <div className="rounded-2xl border border-white/10 bg-[#0f0f12] p-4 text-xs leading-5 text-zinc-500">
            JavaScript runs inside a sandboxed iframe with a 5-second timeout. HTML and CSS are local previews. Server-side code execution is not enabled yet.
          </div>
        </div>
      </section>
    </Layout>
  );
}
