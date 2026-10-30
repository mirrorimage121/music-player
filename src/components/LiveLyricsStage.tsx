import React, { useEffect, useRef } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Edit3,
  Loader2,
  MessageSquare,
  Search,
} from 'lucide-react';
import { LyricLine, ThemeMode } from '../types/music';
import { getActiveLyricIndex, getWordProgress } from '../utils/lrcParser';

interface LiveLyricsStageProps {
  trackTitle: string;
  lyrics: LyricLine[];
  currentTime: number;
  theme: ThemeMode;
  accentColor: string;
  lyricsSource?: string;
  isLoadingLyrics?: boolean;
  onSeekToLine: (time: number) => void;
  onOpenSyncStudio: () => void;
  onRetryAutoLyrics?: () => void;
}

export const LiveLyricsStage: React.FC<LiveLyricsStageProps> = ({
  trackTitle,
  lyrics,
  currentTime,
  theme,
  accentColor,
  lyricsSource,
  isLoadingLyrics = false,
  onSeekToLine,
  onOpenSyncStudio,
  onRetryAutoLyrics,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIdx = getActiveLyricIndex(lyrics, currentTime);
  const hasCustomAccent = accentColor !== 'default';

  useEffect(() => {
    const targetIdx = activeIdx >= 0 ? activeIdx : 0;
    const el = lineRefs.current[targetIdx];
    const container = containerRef.current;
    if (el && container) {
      const targetScroll =
        el.offsetTop - container.clientHeight * 0.34 + el.clientHeight * 0.5;
      container.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: 'smooth',
      });
    }
  }, [activeIdx, trackTitle, lyrics.length]);

  const handleStepLine = (delta: number) => {
    if (lyrics.length === 0) return;
    const base = activeIdx < 0 ? 0 : activeIdx;
    const nextIdx = Math.max(0, Math.min(lyrics.length - 1, base + delta));
    onSeekToLine(lyrics[nextIdx].time);
  };

  return (
    <section
      aria-label="Синхронизированный текст песни в реальном времени"
      data-testid="live-lyrics-stage"
      className="relative flex flex-col h-[460px] lg:h-[calc(100vh-86px)] lg:max-h-[760px] select-none"
    >
      {/* Top Header matching "Текст песни LIVE" from reference screenshot */}
      <div className="flex items-center justify-between gap-4 pb-4 pl-1 pr-12">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-zinc-400 min-w-0">
          <MessageSquare className="w-3.5 h-3.5 fill-slate-500/80 text-slate-500 dark:fill-zinc-400/80 dark:text-zinc-400 shrink-0" />
          <span className="shrink-0">Текст песни</span>
          <span
            style={
              hasCustomAccent
                ? {
                    backgroundColor: `${accentColor}24`,
                    color: accentColor,
                  }
                : undefined
            }
            className="rounded bg-slate-900/10 dark:bg-white/12 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-slate-800 dark:text-zinc-200 shrink-0"
          >
            LIVE
          </span>
          {lyricsSource && (
            <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-500 truncate">
              · {lyricsSource}
            </span>
          )}
          {isLoadingLyrics && lyrics.length > 0 && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500 dark:text-zinc-400 shrink-0" />
          )}
        </div>

        <button
          type="button"
          onClick={onOpenSyncStudio}
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/[0.06] hover:bg-slate-900/[0.12] dark:bg-white/[0.06] dark:hover:bg-white/[0.14] border border-slate-900/12 dark:border-white/10 px-3 py-1 text-xs font-medium text-slate-700 hover:text-slate-950 dark:text-zinc-300 dark:hover:text-white transition-colors shrink-0 cursor-pointer"
        >
          <Edit3 className="w-3 h-3" />
          <span>Редактор синхронизации</span>
        </button>
      </div>

      {/* Lyrics Viewport with progressive Apple-Music depth-of-field blur */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-y-auto no-scrollbar pr-14 pl-1 py-16 space-y-7 sm:space-y-9"
        style={{
          maskImage:
            'linear-gradient(to bottom, transparent 0%, black 12%, black 86%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent 0%, black 12%, black 86%, transparent 100%)',
        }}
      >
        {lyrics.length === 0 ? (
          isLoadingLyrics ? (
            <div className="py-16 max-w-md flex flex-col items-start gap-3">
              <div className="inline-flex items-center gap-2.5 text-slate-700 dark:text-zinc-300">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm font-semibold">
                  Автоматический поиск текста песни...
                </span>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Ищем слова на Genius.com и в поисковиках
              </p>
              <p className="text-sm text-slate-600 dark:text-zinc-400">
                Проверяем синхронные таймкоды LRCLIB, каталог Genius и открытые текстовые базы для трека «{trackTitle}».
              </p>
            </div>
          ) : (
            <div className="py-16 max-w-md">
              <p className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-zinc-200 tracking-tight">
                Для этого трека пока не найден текст
              </p>
              <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
                Попробуйте запустить повторный автопоиск по Genius / поисковикам или откройте студию синхронизации, чтобы вставить свой текст.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                {onRetryAutoLyrics && (
                  <button
                    type="button"
                    onClick={onRetryAutoLyrics}
                    style={
                      hasCustomAccent
                        ? { backgroundColor: accentColor, color: '#ffffff' }
                        : undefined
                    }
                    className="inline-flex items-center gap-2 rounded-full bg-slate-900 text-white dark:bg-white dark:text-zinc-950 px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    <Search className="w-4 h-4" />
                    <span>Найти текст автоматически</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onOpenSyncStudio}
                  className="rounded-full bg-slate-900/10 hover:bg-slate-900/15 text-slate-800 dark:bg-white/10 dark:hover:bg-white/18 dark:text-zinc-200 px-5 py-2.5 text-sm font-semibold transition-colors cursor-pointer"
                >
                  Студия синхронизации
                </button>
              </div>
            </div>
          )
        ) : (
          lyrics.map((line, index) => {
            const isCurrent = index === activeIdx || (activeIdx === -1 && index === 0);
            const distance = Math.abs(index - (activeIdx === -1 ? 0 : activeIdx));

            let blurStyle = 'blur(0px)';
            let opacityClass = 'opacity-100';
            if (!isCurrent) {
              if (distance === 1) {
                blurStyle = 'blur(1.4px)';
                opacityClass = 'opacity-40 dark:opacity-35 hover:opacity-85';
              } else if (distance === 2) {
                blurStyle = 'blur(2.4px)';
                opacityClass = 'opacity-28 dark:opacity-25 hover:opacity-80';
              } else {
                blurStyle = 'blur(3.4px)';
                opacityClass = 'opacity-18 dark:opacity-15 hover:opacity-75';
              }
            }

            return (
              <button
                key={line.id}
                ref={(el) => {
                  lineRefs.current[index] = el;
                }}
                type="button"
                onClick={() => onSeekToLine(line.time)}
                style={{
                  filter: blurStyle,
                  transform: isCurrent ? 'scale(1)' : 'scale(0.96)',
                  transformOrigin: 'left center',
                }}
                className={`block max-w-[540px] text-left transition-all duration-300 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 dark:focus-visible:ring-white/40 rounded-xl group ${opacityClass}`}
              >
                <span className="block text-[30px] sm:text-[42px] xl:text-[50px] font-extrabold leading-[1.12] tracking-[-0.02em]">
                  {isCurrent && line.words && line.words.length > 0 ? (
                    line.words.map((w, wIdx) => {
                      const prog = getWordProgress(w, currentTime);
                      const isSung = prog >= 0.55;
                      const alpha =
                        activeIdx === -1 ? 0.95 : isSung ? 1.0 : 0.44 + prog * 0.56;
                      const wordColor =
                        theme === 'dark'
                          ? `rgba(255, 255, 255, ${alpha.toFixed(2)})`
                          : `rgba(15, 23, 42, ${alpha.toFixed(2)})`;
                      const wordShadow =
                        theme === 'dark'
                          ? hasCustomAccent && isSung
                            ? `0 0 30px ${accentColor}55`
                            : isSung
                              ? '0 0 32px rgba(255,255,255,0.28)'
                              : '0 0 18px rgba(255,255,255,0.12)'
                          : hasCustomAccent && isSung
                            ? `0 0 22px ${accentColor}38`
                            : 'none';

                      return (
                        <span
                          key={`${line.id}-w-${wIdx}`}
                          style={{
                            color: wordColor,
                            textShadow: wordShadow,
                          }}
                          className="transition-colors duration-100"
                        >
                          {w.text}
                          {wIdx < line.words!.length - 1 ? ' ' : ''}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-slate-900 dark:text-white group-hover:filter-none">
                      {line.text}
                    </span>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Right-edge floating circular up/down step controls */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-20">
        <button
          type="button"
          onClick={() => handleStepLine(-1)}
          aria-label="Предыдущая строка текста"
          className="w-11 h-11 rounded-full bg-slate-900/[0.08] hover:bg-slate-900/[0.16] dark:bg-white/[0.10] dark:hover:bg-white/[0.20] border border-slate-900/12 dark:border-white/10 backdrop-blur-xl flex items-center justify-center text-slate-800 dark:text-white transition-colors cursor-pointer"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => handleStepLine(1)}
          aria-label="Следующая строка текста"
          className="w-11 h-11 rounded-full bg-slate-900/[0.08] hover:bg-slate-900/[0.16] dark:bg-white/[0.10] dark:hover:bg-white/[0.20] border border-slate-900/12 dark:border-white/10 backdrop-blur-xl flex items-center justify-center text-slate-800 dark:text-white transition-colors cursor-pointer"
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      </div>
    </section>
  );
};
