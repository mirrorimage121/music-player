import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Download,
  FastForward,
  FileText,
  ListPlus,
  MessageSquareQuote,
  MoreHorizontal,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Rewind,
  Shuffle,
  Sliders,
  Star,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Playlist, RepeatMode, ThemeMode, Track } from '../types/music';
import { formatRemainingTime, formatTime } from '../utils/lrcParser';

interface TransportPlayerCardProps {
  track: Track;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  repeatMode: RepeatMode;
  shuffle: boolean;
  showLyrics: boolean;
  eqEnabled: boolean;
  playlists: Playlist[];
  isCachingOffline: boolean;
  theme: ThemeMode;
  accentColor: string;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (val: number) => void;
  onToggleMute: () => void;
  onToggleFavorite: (trackId: string) => void;
  onToggleRepeat: () => void;
  onToggleShuffle: () => void;
  onToggleShowLyrics: () => void;
  onOpenEqualizer: () => void;
  onOpenLyricSync: () => void;
  onToggleOfflineCache: (track: Track) => void;
  onAddTrackToPlaylist: (playlistId: string, trackId: string) => void;
  onDeleteTrackFromLibrary: (trackId: string) => void;
}

export const TransportPlayerCard: React.FC<TransportPlayerCardProps> = ({
  track,
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  repeatMode,
  shuffle,
  showLyrics,
  eqEnabled,
  playlists,
  isCachingOffline,
  theme,
  accentColor,
  onTogglePlay,
  onPrev,
  onNext,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleFavorite,
  onToggleRepeat,
  onToggleShuffle,
  onToggleShowLyrics,
  onOpenEqualizer,
  onOpenLyricSync,
  onToggleOfflineCache,
  onAddTrackToPlaylist,
  onDeleteTrackFromLibrary,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const moreBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const baseDuration =
    track.duration > 35 && duration < track.duration * 0.85
      ? track.duration
      : duration > 0
      ? duration
      : track.duration || 1;
  const effectiveDuration = Math.max(baseDuration, currentTime, 1);
  const progressPercent = Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100));
  const effectiveVolume = isMuted ? 0 : volume;

  const userPlaylists = playlists.filter((p) => !p.isSystem);
  const hasCustomAccent = accentColor !== 'default';
  const fillPrimary = hasCustomAccent
    ? accentColor
    : theme === 'dark'
    ? '#ffffff'
    : '#0f172a';
  const trackRemainder =
    theme === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.16)';

  const toggleMenu = () => {
    if (!menuOpen && moreBtnRef.current) {
      const rect = moreBtnRef.current.getBoundingClientRect();
      const menuWidth = 264;
      const computedLeft = Math.min(
        window.innerWidth - menuWidth - 12,
        Math.max(12, rect.right - menuWidth)
      );
      setMenuPos({
        top: rect.bottom + 8,
        left: computedLeft,
      });
    }
    setMenuOpen((v) => !v);
  };

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        moreBtnRef.current &&
        !moreBtnRef.current.contains(target)
      ) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };

    const handleReposition = () => {
      if (!moreBtnRef.current) return;
      const rect = moreBtnRef.current.getBoundingClientRect();
      const menuWidth = 264;
      const computedLeft = Math.min(
        window.innerWidth - menuWidth - 12,
        Math.max(12, rect.right - menuWidth)
      );
      setMenuPos({ top: rect.bottom + 8, left: computedLeft });
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [menuOpen]);

  return (
    <section
      aria-label="Управление воспроизведением"
      className="glass-panel relative z-20 rounded-[28px] px-5 py-4.5 select-none"
    >
      {/* Top Row: Track Title + [E] + Artist | Star + More (...) */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white truncate">
              {track.title}
            </h1>
            {track.explicit && (
              <span
                title="Explicit"
                className="inline-flex items-center justify-center w-4 h-4 rounded-[4px] bg-slate-900/12 dark:bg-white/20 text-[10px] font-bold text-slate-700 dark:text-zinc-200 shrink-0"
              >
                E
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-slate-500 dark:text-zinc-400 truncate mt-0.5">
            {track.artist}
          </p>
        </div>

        <div className="relative flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onToggleFavorite(track.id)}
            aria-label={track.isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
            aria-pressed={track.isFavorite}
            className="w-9 h-9 rounded-full bg-slate-900/[0.06] hover:bg-slate-900/[0.13] dark:bg-white/[0.08] dark:hover:bg-white/[0.16] border border-slate-900/10 dark:border-white/10 flex items-center justify-center text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer"
          >
            <Star
              className={`w-4 h-4 ${
                track.isFavorite
                  ? 'fill-current text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-zinc-300'
              }`}
              style={
                track.isFavorite && hasCustomAccent
                  ? { color: accentColor, fill: accentColor }
                  : undefined
              }
            />
          </button>

          <button
            ref={moreBtnRef}
            type="button"
            onClick={toggleMenu}
            aria-label="Дополнительные действия с треком"
            aria-expanded={menuOpen}
            className="w-9 h-9 rounded-full bg-slate-900/[0.06] hover:bg-slate-900/[0.13] dark:bg-white/[0.08] dark:hover:bg-white/[0.16] border border-slate-900/10 dark:border-white/10 flex items-center justify-center text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {menuOpen &&
            createPortal(
              <div
                ref={menuRef}
                role="menu"
                style={{ top: `${menuPos.top}px`, left: `${menuPos.left}px` }}
                className="fixed z-[80] w-66 rounded-2xl glass-panel-elevated p-2 text-xs text-slate-800 dark:text-zinc-200 shadow-2xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={isCachingOffline}
                  onClick={() => {
                    onToggleOfflineCache(track);
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 hover:bg-slate-900/8 dark:hover:bg-white/10 text-left transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    {track.isOfflineCached ? (
                      <Trash2 className="w-4 h-4 text-rose-500 dark:text-rose-300" />
                    ) : (
                      <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-300" />
                    )}
                    <span>
                      {track.isOfflineCached
                        ? 'Удалить из офлайн-кэша'
                        : 'Скачать для офлайн-режима'}
                    </span>
                  </span>
                  {track.isOfflineCached && (
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  )}
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onOpenLyricSync();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-slate-900/8 dark:hover:bg-white/10 text-left transition-colors cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-slate-500 dark:text-zinc-300" />
                  <span>Синхронизировать текст (LRC)</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onOpenEqualizer();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-slate-900/8 dark:hover:bg-white/10 text-left transition-colors cursor-pointer"
                >
                  <Sliders className="w-4 h-4 text-slate-500 dark:text-zinc-300" />
                  <span>Настроить эквалайзер</span>
                </button>

                {userPlaylists.length > 0 && (
                  <div className="mt-1 pt-1.5 border-t border-slate-900/10 dark:border-white/10">
                    <div className="px-3 py-1 text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                      <ListPlus className="w-3.5 h-3.5" />
                      <span>Добавить в плейлист:</span>
                    </div>
                    {userPlaylists.slice(0, 4).map((pl) => {
                      const alreadyIn = pl.trackIds.includes(track.id);
                      return (
                        <button
                          key={pl.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onAddTrackToPlaylist(pl.id, track.id);
                            setMenuOpen(false);
                          }}
                          className="w-full flex items-center justify-between rounded-xl px-3 py-2 hover:bg-slate-900/8 dark:hover:bg-white/10 text-left transition-colors cursor-pointer"
                        >
                          <span className="truncate">{pl.name}</span>
                          {alreadyIn && (
                            <Check className="w-3.5 h-3.5 text-slate-600 dark:text-zinc-300 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-1 pt-1.5 border-t border-slate-900/10 dark:border-white/10">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onDeleteTrackFromLibrary(track.id);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-rose-500/12 text-rose-600 dark:text-rose-400 text-left font-medium transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Удалить трек из библиотеки</span>
                  </button>
                </div>
              </div>,
              document.body
            )}
        </div>
      </div>

      {/* Middle Row: Progress Bar with compact oval thumb & tabular timestamps */}
      <div className="mt-4 flex items-center gap-3">
        <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 tabular-nums w-9 shrink-0">
          {formatTime(currentTime)}
        </span>

        <div className="relative flex-1 flex items-center">
          <input
            type="range"
            min={0}
            max={effectiveDuration}
            step={0.1}
            value={Math.min(currentTime, effectiveDuration)}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            aria-label="Позиция трека"
            className="pulse-range w-full z-10"
            style={{
              background: `linear-gradient(to right, ${fillPrimary} ${progressPercent}%, ${trackRemainder} ${progressPercent}%)`,
              borderRadius: '9999px',
              height: '4px',
            }}
          />
        </div>

        <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 tabular-nums w-10 text-right shrink-0">
          {formatRemainingTime(currentTime, effectiveDuration)}
        </span>
      </div>

      {/* Bottom Row: Volume left | Rewind / Play-Pause / Forward center | Lyrics/Library + EQ + Repeat right */}
      <div className="mt-4 flex items-center justify-between gap-2">
        {/* Volume control with compact oval thumb */}
        <div className="flex items-center gap-2 w-24 sm:w-28 shrink-0">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={isMuted ? 'Включить звук' : 'Выключить звук'}
            className="text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition-colors p-1 cursor-pointer"
          >
            {effectiveVolume === 0 ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={effectiveVolume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            aria-label="Громкость"
            className="pulse-range pulse-range-sm w-full"
            style={{
              background: `linear-gradient(to right, ${fillPrimary} ${
                effectiveVolume * 100
              }%, ${trackRemainder} ${effectiveVolume * 100}%)`,
              borderRadius: '9999px',
              height: '3.5px',
            }}
          />
        </div>

        {/* Primary Transport Buttons */}
        <div className="flex items-center gap-3 sm:gap-5">
          <button
            type="button"
            onClick={onPrev}
            aria-label="Предыдущий трек"
            className="w-10 h-10 rounded-full hover:bg-slate-900/8 dark:hover:bg-white/10 flex items-center justify-center text-slate-900 dark:text-white transition-transform active:scale-95 cursor-pointer"
          >
            <Rewind className="w-5 h-5 fill-current" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
            style={
              hasCustomAccent && isPlaying
                ? { backgroundColor: accentColor, color: '#ffffff' }
                : undefined
            }
            className="w-11 h-11 rounded-full bg-slate-900/10 hover:bg-slate-900/18 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-slate-900 dark:text-white transition-transform active:scale-95 cursor-pointer"
          >
            {isPlaying ? (
              <Pause className="w-6 h-6 fill-current" />
            ) : (
              <Play className="w-6 h-6 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onNext}
            aria-label="Следующий трек"
            className="w-10 h-10 rounded-full hover:bg-slate-900/8 dark:hover:bg-white/10 flex items-center justify-center text-slate-900 dark:text-white transition-transform active:scale-95 cursor-pointer"
          >
            <FastForward className="w-5 h-5 fill-current" />
          </button>
        </div>

        {/* Right Action Toggles (Lyrics <-> Track Library toggle, EQ, Shuffle, Repeat) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            data-testid="toggle-lyrics-library-btn"
            onClick={onToggleShowLyrics}
            aria-label={showLyrics ? 'Скрыть текст и открыть библиотеку треков' : 'Показать живой текст песни'}
            title={showLyrics ? 'Скрыть текст (открыть библиотеку треков)' : 'Показать текст песни'}
            aria-pressed={showLyrics}
            style={
              showLyrics && hasCustomAccent
                ? { backgroundColor: accentColor, color: '#ffffff' }
                : undefined
            }
            className={`w-8 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
              showLyrics
                ? hasCustomAccent
                  ? 'shadow-sm'
                  : 'bg-slate-900 text-white dark:bg-white dark:text-zinc-950 shadow-sm'
                : 'bg-slate-900/10 text-slate-700 hover:bg-slate-900/16 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15'
            }`}
          >
            <MessageSquareQuote className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onOpenEqualizer}
            aria-label="Эквалайзер и аудиовыход"
            className={`w-8 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
              eqEnabled
                ? 'bg-slate-900/15 text-slate-900 dark:bg-white/15 dark:text-white'
                : 'bg-slate-900/5 text-slate-500 hover:text-slate-800 dark:bg-white/5 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onToggleShuffle}
            aria-label="Перемешать очередь"
            aria-pressed={shuffle}
            className={`hidden sm:flex w-8 h-7 rounded-lg items-center justify-center transition-colors cursor-pointer ${
              shuffle
                ? 'bg-slate-900/16 text-slate-900 dark:bg-white/20 dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onToggleRepeat}
            aria-label="Повтор очереди"
            className={`hidden sm:flex w-8 h-7 rounded-lg items-center justify-center transition-colors cursor-pointer ${
              repeatMode !== RepeatMode.OFF
                ? 'bg-slate-900/16 text-slate-900 dark:bg-white/20 dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {repeatMode === RepeatMode.ONE ? (
              <Repeat1 className="w-3.5 h-3.5" />
            ) : (
              <Repeat className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </section>
  );
};
