import { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';

type Props = {
  code: string;
  language?: string;
};

export function CodeBlock({ code, language }: Props) {
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

  const displayLang = language || 'text';

  return (
    <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-slate-600 my-2">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-gray-800 dark:bg-slate-800 border-b border-gray-700 dark:border-slate-600">
        <span className="text-xs text-gray-400 dark:text-slate-400 font-mono">
          {displayLang}
        </span>
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
      {/* Code content */}
      <div className="bg-[#1e1e1e] dark:bg-[#0d1117] overflow-x-auto">
        <pre className="p-4 text-sm leading-relaxed font-mono">
          <code>
            <SyntaxHighlight code={code} language={displayLang} />
          </code>
        </pre>
      </div>
    </div>
  );
}

// Simple keyword-based syntax highlighting
function SyntaxHighlight({ code, language }: { code: string; language: string }) {
  const lines = code.split('\n');

  return (
    <>
      {lines.map((line, i) => (
        <div key={i} className="table-row">
          <span className="table-cell pr-4 text-right text-gray-600 dark:text-gray-700 select-none text-xs w-8">
            {i + 1}
          </span>
          <span className="table-cell">
            <HighlightLine line={line} language={language} />
          </span>
        </div>
      ))}
    </>
  );
}

function HighlightLine({ line, language }: { line: string; language: string }) {
  // Do not highlight plain text
  if (language === 'text' || language === 'txt') {
    return <span className="text-gray-200">{line}</span>;
  }

  const tokens = tokenizeLine(line);
  return (
    <>
      {tokens.map((token, i) => (
        <span key={i} className={tokenColor(token.type)}>
          {token.value}
        </span>
      ))}
    </>
  );
}

type TokenType = 'keyword' | 'string' | 'comment' | 'number' | 'plain';
type Token = { type: TokenType; value: string };

const KEYWORDS = new Set([
  'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while',
  'import', 'export', 'class', 'def', 'fn', 'pub', 'use', 'mod', 'async',
  'await', 'new', 'this', 'self', 'true', 'false', 'null', 'undefined',
  'from', 'default', 'type', 'interface', 'struct', 'enum', 'match',
  'try', 'catch', 'finally', 'throw', 'switch', 'case', 'break', 'continue',
  'do', 'in', 'of', 'extends', 'implements', 'static', 'readonly', 'abstract',
  'private', 'protected', 'public', 'void', 'string', 'number', 'boolean',
  'int', 'float', 'double', 'char', 'bool', 'println', 'print', 'fmt',
  'None', 'True', 'False', 'elif', 'lambda', 'yield', 'with', 'as', 'not',
  'and', 'or', 'is', 'pass', 'raise', 'except',
]);

function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < line.length) {
    // Comments: // or #
    if (
      (line[i] === '/' && line[i + 1] === '/') ||
      (line[i] === '#' && (i === 0 || /\s/.test(line[i - 1] ?? '')))
    ) {
      tokens.push({ type: 'comment', value: line.slice(i) });
      break;
    }

    // Strings
    if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
      const quote = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== quote) {
        if (line[j] === '\\') j++; // skip escaped
        j++;
      }
      tokens.push({ type: 'string', value: line.slice(i, j + 1) });
      i = j + 1;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(line[i]!) && (i === 0 || /[\s,;([\]{}<>=+\-*/]/.test(line[i - 1] ?? ''))) {
      let j = i;
      while (j < line.length && /[0-9.xXa-fA-F_]/.test(line[j]!)) j++;
      tokens.push({ type: 'number', value: line.slice(i, j) });
      i = j;
      continue;
    }

    // Words (potential keywords)
    if (/[a-zA-Z_]/.test(line[i]!)) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_]/.test(line[j]!)) j++;
      const word = line.slice(i, j);
      tokens.push({
        type: KEYWORDS.has(word) ? 'keyword' : 'plain',
        value: word,
      });
      i = j;
      continue;
    }

    // Other characters
    tokens.push({ type: 'plain', value: line[i]! });
    i++;
  }

  return tokens;
}

function tokenColor(type: TokenType): string {
  switch (type) {
    case 'keyword':
      return 'text-blue-400';
    case 'string':
      return 'text-green-400';
    case 'comment':
      return 'text-gray-500 italic';
    case 'number':
      return 'text-orange-400';
    case 'plain':
    default:
      return 'text-gray-200';
  }
}
