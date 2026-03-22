import { useState, useRef, useCallback, useEffect } from 'react';
import { Eye, Code, RefreshCw, ExternalLink } from 'lucide-react';

type Props = {
  content: string;
  title: string;
};

type ViewMode = 'preview' | 'code';

export function HtmlPreview({ content, title }: Props) {
  const [mode, setMode] = useState<ViewMode>('preview');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [key, setKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setKey((k) => k + 1);
  }, []);

  const handleOpenExternal = useCallback(() => {
    const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    // Clean up after a short delay
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [content]);

  // Auto-refresh preview when content changes
  useEffect(() => {
    setKey((k) => k + 1);
  }, [content]);

  return (
    <div className="flex flex-col h-full min-h-[400px]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800/50 rounded-t-lg">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMode('preview')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
              mode === 'preview'
                ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
            }`}
          >
            <Eye size={12} />
            プレビュー
          </button>
          <button
            onClick={() => setMode('code')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
              mode === 'code'
                ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
            }`}
          >
            <Code size={12} />
            コード
          </button>
        </div>
        <div className="flex items-center gap-1">
          {mode === 'preview' && (
            <>
              <button
                onClick={handleRefresh}
                className="p-1 rounded text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-200 transition-colors"
                title="リフレッシュ"
              >
                <RefreshCw size={12} />
              </button>
              <button
                onClick={handleOpenExternal}
                className="p-1 rounded text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-200 transition-colors"
                title="新しいタブで開く"
              >
                <ExternalLink size={12} />
              </button>
            </>
          )}
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 min-h-0">
        {mode === 'preview' ? (
          <iframe
            key={key}
            ref={iframeRef}
            srcDoc={content}
            sandbox="allow-scripts allow-same-origin"
            title={title}
            className="w-full h-full border-0 bg-white rounded-b-lg"
            style={{ minHeight: '400px' }}
          />
        ) : (
          <div className="h-full overflow-auto">
            <pre className="p-4 text-xs font-mono text-gray-700 dark:text-gray-300 bg-[#1e1e1e] dark:bg-[#0d1117] whitespace-pre-wrap rounded-b-lg">
              {content}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
