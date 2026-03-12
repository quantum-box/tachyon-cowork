import { useEffect, useRef, useState } from 'react';

type Props = {
  chart: string;
  isDark?: boolean;
};

export function MermaidDiagram({ chart, isDark }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const idRef = useRef(`mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    let cancelled = false;

    async function renderChart() {
      try {
        setLoading(true);
        setError(null);

        const mermaid = (await import('mermaid')).default;

        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'loose',
          fontFamily: 'inherit',
        });

        const { svg } = await mermaid.render(idRef.current, chart);

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to render diagram');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    renderChart();
    return () => {
      cancelled = true;
    };
  }, [chart, isDark]);

  if (error) {
    return (
      <div className="my-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
        <p className="text-xs text-red-600 dark:text-red-400 mb-2">
          Mermaid diagram rendering failed
        </p>
        <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap">
          {chart}
        </pre>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-4">
      {loading && (
        <div className="flex items-center justify-center py-4">
          <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      )}
      <div
        ref={containerRef}
        className={`overflow-x-auto flex justify-center ${loading ? 'hidden' : ''}`}
      />
    </div>
  );
}
