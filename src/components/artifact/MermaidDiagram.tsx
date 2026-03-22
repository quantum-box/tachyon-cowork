import { useEffect, useRef, useState, useCallback } from 'react';
import { Maximize2, Minimize2, Download, Image } from 'lucide-react';

type Props = {
  chart: string;
  isDark?: boolean;
};

export function MermaidDiagram({ chart, isDark }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [svgContent, setSvgContent] = useState<string>('');
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
          setSvgContent(svg);
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

  const exportSvg = useCallback(() => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [svgContent]);

  const exportPng = useCallback(() => {
    if (!svgContent) return;
    const svgEl = containerRef.current?.querySelector('svg');
    if (!svgEl) return;

    const bbox = svgEl.getBoundingClientRect();
    const scale = 2; // retina
    const canvas = document.createElement('canvas');
    canvas.width = bbox.width * scale;
    canvas.height = bbox.height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(scale, scale);

    const img = new window.Image();
    const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.drawImage(img, 0, 0, bbox.width, bbox.height);
      URL.revokeObjectURL(url);
      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = 'diagram.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
    img.src = url;
  }, [svgContent]);

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

  const diagram = (
    <div className={`rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 ${fullscreen ? '' : 'my-2'}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-1 px-3 py-1.5 border-b border-gray-200 dark:border-slate-600">
        <button
          onClick={exportPng}
          disabled={!svgContent}
          className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors disabled:opacity-30"
          title="PNG出力"
        >
          <Image size={12} />
          <span>PNG</span>
        </button>
        <button
          onClick={exportSvg}
          disabled={!svgContent}
          className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors disabled:opacity-30"
          title="SVG出力"
        >
          <Download size={12} />
          <span>SVG</span>
        </button>
        <button
          onClick={() => setFullscreen(!fullscreen)}
          className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors ml-1"
          title={fullscreen ? '縮小' : '拡大'}
        >
          {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
      </div>
      {/* Diagram */}
      <div className={`p-4 ${fullscreen ? 'overflow-auto max-h-[calc(100vh-8rem)]' : ''}`}>
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
    </div>
  );

  if (fullscreen) {
    return (
      <div
        className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-8"
        onClick={(e) => {
          if (e.target === e.currentTarget) setFullscreen(false);
        }}
      >
        <div className="w-full max-w-5xl max-h-full">{diagram}</div>
      </div>
    );
  }

  return diagram;
}
