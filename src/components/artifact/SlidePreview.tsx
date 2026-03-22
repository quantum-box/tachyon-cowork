import { useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, Presentation } from "lucide-react";
import type { PptxMetadata } from "../../lib/types";

type Props = {
  data: PptxMetadata;
};

export function SlidePreview({ data }: Props) {
  const [currentSlide, setCurrentSlide] = useState(0);

  const goToPrev = useCallback(() => {
    setCurrentSlide((prev) => Math.max(0, prev - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentSlide((prev) => Math.min(data.slides.length - 1, prev + 1));
  }, [data.slides.length]);

  if (data.slides.length === 0) {
    return (
      <div className="p-4 text-gray-500 dark:text-slate-400 text-sm">
        スライドが見つかりません
      </div>
    );
  }

  const slide = data.slides[currentSlide];

  return (
    <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Presentation size={16} className="text-orange-500 dark:text-orange-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {data.title || "PPTX"}
          </span>
        </div>
        <span className="text-xs text-gray-500 dark:text-slate-400">
          {data.slide_count} スライド
        </span>
      </div>

      {/* Slide view */}
      <div className="p-4">
        <div className="relative mx-auto max-w-lg aspect-[16/9] bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-md shadow-sm overflow-hidden">
          {/* Slide content */}
          <div className="absolute inset-0 flex flex-col p-6">
            {slide.title && (
              <h3 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-3 leading-tight">
                {slide.title}
              </h3>
            )}
            <div className="flex-1 overflow-y-auto">
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">
                {slide.text_content || "(テキストなし)"}
              </p>
            </div>
          </div>

          {/* Slide number badge */}
          <div className="absolute bottom-2 right-3 text-[10px] text-gray-400 dark:text-slate-500">
            {slide.index}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-center gap-4 px-3 py-2 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
        <button
          onClick={goToPrev}
          disabled={currentSlide === 0}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="前のスライド"
        >
          <ChevronLeft size={18} className="text-gray-600 dark:text-gray-400" />
        </button>
        <span className="text-xs text-gray-600 dark:text-gray-400 tabular-nums min-w-[80px] text-center">
          スライド {currentSlide + 1} / {data.slides.length}
        </span>
        <button
          onClick={goToNext}
          disabled={currentSlide === data.slides.length - 1}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="次のスライド"
        >
          <ChevronRight size={18} className="text-gray-600 dark:text-gray-400" />
        </button>
      </div>
    </div>
  );
}
