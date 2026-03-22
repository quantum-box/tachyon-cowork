import { useState, useCallback, useMemo } from 'react';
import { Copy, Check, Download } from 'lucide-react';
import hljs from 'highlight.js/lib/core';

// Register commonly used languages
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import cpp from 'highlight.js/lib/languages/cpp';
import c from 'highlight.js/lib/languages/c';
import csharp from 'highlight.js/lib/languages/csharp';
import ruby from 'highlight.js/lib/languages/ruby';
import php from 'highlight.js/lib/languages/php';
import swift from 'highlight.js/lib/languages/swift';
import kotlin from 'highlight.js/lib/languages/kotlin';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';
import shell from 'highlight.js/lib/languages/shell';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import scss from 'highlight.js/lib/languages/scss';
import yaml from 'highlight.js/lib/languages/yaml';
import markdownLang from 'highlight.js/lib/languages/markdown';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import plaintext from 'highlight.js/lib/languages/plaintext';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('jsx', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('tsx', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('rs', rust);
hljs.registerLanguage('go', go);
hljs.registerLanguage('java', java);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('c', c);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('cs', csharp);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('rb', ruby);
hljs.registerLanguage('php', php);
hljs.registerLanguage('swift', swift);
hljs.registerLanguage('kotlin', kotlin);
hljs.registerLanguage('kt', kotlin);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('zsh', bash);
hljs.registerLanguage('shell', shell);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('svg', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('scss', scss);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('markdown', markdownLang);
hljs.registerLanguage('md', markdownLang);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('docker', dockerfile);
hljs.registerLanguage('plaintext', plaintext);
hljs.registerLanguage('text', plaintext);
hljs.registerLanguage('txt', plaintext);

type Props = {
  code: string;
  language?: string;
  showDownload?: boolean;
  filename?: string;
};

export function CodeBlock({ code, language, showDownload, filename }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments without clipboard API
    }
  }, [code]);

  const handleDownload = useCallback(() => {
    const ext = language && !['text', 'txt', 'plaintext'].includes(language) ? language : 'txt';
    const name = filename || `code.${ext}`;
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [code, language, filename]);

  const displayLang = language || 'text';

  const highlightedHtml = useMemo(() => {
    try {
      const lang = hljs.getLanguage(displayLang) ? displayLang : undefined;
      const result = lang
        ? hljs.highlight(code, { language: lang })
        : hljs.highlightAuto(code);
      return result.value;
    } catch {
      // Escape HTML for safe display
      return code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
  }, [code, displayLang]);

  const lineCount = code.split('\n').length;

  return (
    <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-slate-600 my-2">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-gray-800 dark:bg-slate-800 border-b border-gray-700 dark:border-slate-600">
        <span className="text-xs text-gray-400 dark:text-slate-400 font-mono">
          {displayLang}
        </span>
        <div className="flex items-center gap-2">
          {showDownload && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-400 hover:text-gray-200 dark:hover:text-slate-200 transition-colors"
              title="ダウンロード"
            >
              <Download size={12} />
              <span className="hidden sm:inline">保存</span>
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-400 hover:text-gray-200 dark:hover:text-slate-200 transition-colors"
          >
            {copied ? (
              <>
                <Check size={12} />
                <span>コピー済み!</span>
              </>
            ) : (
              <>
                <Copy size={12} />
                <span>コピー</span>
              </>
            )}
          </button>
        </div>
      </div>
      {/* Code content */}
      <div className="bg-[#1e1e1e] dark:bg-[#0d1117] overflow-x-auto">
        <div className="flex text-sm leading-relaxed font-mono">
          {/* Line numbers */}
          <div className="shrink-0 py-4 pl-4 pr-3 text-right select-none" aria-hidden>
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i} className="text-gray-600 dark:text-gray-700 text-xs leading-relaxed">
                {i + 1}
              </div>
            ))}
          </div>
          {/* Highlighted code */}
          <pre className="flex-1 py-4 pr-4 overflow-x-auto">
            <code
              className="hljs text-gray-200"
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          </pre>
        </div>
      </div>
    </div>
  );
}
