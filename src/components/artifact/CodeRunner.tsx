import { useState } from "react";
import { Play, Square, Clock, AlertTriangle } from "lucide-react";
import { useTauriCommands } from "../../hooks/useTauriCommands";
import type { ExecuteCodeResult } from "../../lib/types";

type CodeRunnerProps = {
  code: string;
  language: string;
};

const SUPPORTED_LANGUAGES = ["python", "javascript", "shell"];

export function CodeRunner({ code, language }: CodeRunnerProps) {
  const [result, setResult] = useState<ExecuteCodeResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { executeCode } = useTauriCommands();

  const normalizedLang = language === "js" ? "javascript" : language === "sh" || language === "bash" ? "shell" : language;
  const isSupported = SUPPORTED_LANGUAGES.includes(normalizedLang);

  if (!isSupported) return null;

  const handleRun = async () => {
    setIsRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await executeCode({
        language: normalizedLang,
        code,
        timeout_secs: 30,
      });
      if (res) {
        setResult(res);
      } else {
        setError("Sandbox is not available (Tauri environment required)");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="mt-3 border-t border-gray-200 dark:border-slate-700 pt-3">
      {/* Run button */}
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={handleRun}
          disabled={isRunning}
          className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          {isRunning ? (
            <>
              <Square size={12} />
              実行中...
            </>
          ) : (
            <>
              <Play size={12} />
              実行 ({normalizedLang})
            </>
          )}
        </button>
        {result && (
          <span className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-slate-400">
            <Clock size={10} />
            {result.duration_ms}ms
            {result.timed_out && (
              <span className="flex items-center gap-0.5 text-amber-500">
                <AlertTriangle size={10} />
                timeout
              </span>
            )}
            <span className={result.exit_code === 0 ? "text-green-500" : "text-red-500"}>
              exit: {result.exit_code}
            </span>
          </span>
        )}
      </div>

      {/* Output */}
      {(result || error) && (
        <div className="rounded-lg bg-gray-900 dark:bg-black p-3 font-mono text-xs max-h-[200px] overflow-auto">
          {error && <div className="text-red-400">{error}</div>}
          {result?.stdout && (
            <pre className="text-green-300 whitespace-pre-wrap">{result.stdout}</pre>
          )}
          {result?.stderr && (
            <pre className="text-red-400 whitespace-pre-wrap">{result.stderr}</pre>
          )}
          {result && !result.stdout && !result.stderr && !error && (
            <span className="text-gray-500">(no output)</span>
          )}
        </div>
      )}
    </div>
  );
}
