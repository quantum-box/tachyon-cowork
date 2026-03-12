import { useState, useCallback, useEffect, useRef } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import type { AgentChunk } from '../../lib/types';

type Props = {
  chunks: AgentChunk[];
  onClose: () => void;
};

export function ChatSearch({ chunks, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Find matching chunk indices
  const matchIndices = query.trim()
    ? chunks
        .map((chunk, i) => {
          const text =
            chunk.text ||
            chunk.content ||
            chunk.tool_result ||
            chunk.result ||
            chunk.thinking ||
            '';
          return text.toLowerCase().includes(query.toLowerCase()) ? i : -1;
        })
        .filter((i) => i !== -1)
    : [];

  const totalMatches = matchIndices.length;

  // Highlight current match by scrolling to it
  useEffect(() => {
    if (totalMatches === 0) return;
    const chunkIndex = matchIndices[currentIndex];
    if (chunkIndex === undefined) return;

    // Try to find and scroll to the matching message element
    const messageElements = document.querySelectorAll('[data-chunk-index]');
    const target = Array.from(messageElements).find(
      (el) => el.getAttribute('data-chunk-index') === String(chunkIndex),
    );
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentIndex, totalMatches, matchIndices]);

  const goNext = useCallback(() => {
    if (totalMatches === 0) return;
    setCurrentIndex((prev) => (prev + 1) % totalMatches);
  }, [totalMatches]);

  const goPrev = useCallback(() => {
    if (totalMatches === 0) return;
    setCurrentIndex((prev) => (prev - 1 + totalMatches) % totalMatches);
  }, [totalMatches]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keyboard shortcuts within search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        if (e.shiftKey) {
          goPrev();
        } else {
          goNext();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, goNext, goPrev]);

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 animate-fade-in">
      <Search size={14} className="text-gray-400 dark:text-slate-500 shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setCurrentIndex(0);
        }}
        placeholder="メッセージを検索..."
        className="flex-1 text-sm bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-slate-500"
      />
      {query && (
        <span className="text-xs text-gray-500 dark:text-slate-400 shrink-0">
          {totalMatches > 0
            ? `${currentIndex + 1}/${totalMatches}件`
            : '0件'}
        </span>
      )}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={goPrev}
          disabled={totalMatches === 0}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 disabled:opacity-30 transition-colors"
        >
          <ChevronUp size={14} />
        </button>
        <button
          onClick={goNext}
          disabled={totalMatches === 0}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 disabled:opacity-30 transition-colors"
        >
          <ChevronDown size={14} />
        </button>
      </div>
      <button
        onClick={onClose}
        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/**
 * Utility: highlight search query in text.
 * Returns JSX with matching segments wrapped in <mark>.
 */
export function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const parts = text.split(new RegExp(`(${escapeRegex(query)})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark
        key={i}
        className="bg-yellow-200 dark:bg-yellow-700 text-inherit rounded-sm px-0.5"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
