import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  CloudDownload,
  Download,
  Heart,
  Library,
  MessageSquareQuote,
  Music,
  Pause,
  Play,
  Search,
  Trash2,
} from 'lucide-react';
import { Track, TrackSource } from '../types/music';
import { formatTime } from '../utils/lrcParser';

interface TrackLibraryPanelProps {
  tracks: Track[];
  currentTrackId: string;
  isPlaying: boolean;
  offlineOnly: boolean;
  accentColor: string;
  onPlayTrack: (trackId: string) => void;
  onTogglePlay: () => void;
  onToggleFavorite: (trackId: string) => void;
  onToggleOfflineCache: (track: Track) => void;
  onDeleteTrack: (trackId: string) => void;
  onShowLyrics: () => void;
  onOpenImport: () => void;
}

const SOURCE_LABELS: Record<TrackSource, string> = {
  [TrackSource.BUILTIN]: 'Студия',
  [TrackSource.LOCAL]: 'Файл',
  [TrackSource.CLOUD]: 'Облако',
  [TrackSource.SPOTIFY]: 'Spotify',
  [TrackSource.SOUNDCLOUD]: 'SoundCloud',
};

export const TrackLibraryPanel: React.FC<TrackLibraryPanelProps> = ({
  tracks,
  currentTrackId,
  isPlaying,
  offlineOnly,
  accentColor,
  onPlayTrack,
  onTogglePlay,
  onToggleFavorite,
  onToggleOfflineCache,
  onDeleteTrack,
  onShowLyrics,
  onOpenImport,
}) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'fav' | 'soundcloud' | 'spotify' | 'files'>('all');

  const filteredTracks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tracks.filter((t) => {
      if (offlineOnly && !t.isOfflineCached) return false;
      if (filter === 'fav' && !t.isFavorite) return false;
      if (filter === 'soundcloud' && t.source !== TrackSource.SOUNDCLOUD) return false;
      if (filter === 'spotify' && t.source !== TrackSource.SPOTIFY) return false;
      if (
        filter === 'files' &&
        t.source !== TrackSource.LOCAL &&
        t.source !== TrackSource.CLOUD &&
        t.source !== TrackSource.BUILTIN
      ) {
        return false;
      }
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        (t.album || '').toLowerCase().includes(q)
      );
    });
  }, [tracks, query, filter, offlineOnly]);

  const hasCustomAccent = accentColor !== 'default';

  return (
    <section
      aria-label="Библиотека треков"
      data-testid="track-library-panel"
      className="glass-panel rounded-[28px] p-5 sm:p-6 h-[480px] lg:h-[calc(100vh-86px)] lg:max-h-[760px] flex flex-col select-none"
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-900/10 dark:border-white/10">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Library className="w-4 h-4 text-slate-700 dark:text-zinc-300 shrink-0" />
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white truncate">
              Библиотека треков
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 tabular-nums">
            Всего в библиотеке: {tracks.length} · Показано: {filteredTracks.length}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenImport}
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/[0.07] hover:bg-slate-900/[0.13] dark:bg-white/[0.09] dark:hover:bg-white/[0.16] border border-slate-900/10 dark:border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-zinc-200 transition-colors whitespace-nowrap cursor-pointer"
          >
            <CloudDownload className="w-3.5 h-3.5" />
            <span>Добавить треки</span>
          </button>

          <button
            type="button"
            onClick={onShowLyrics}
            style={
              hasCustomAccent
                ? { backgroundColor: accentColor, color: '#ffffff' }
                : undefined
            }
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              hasCustomAccent
                ? 'hover:opacity-90'
                : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200'
            }`}
          >
            <MessageSquareQuote className="w-3.5 h-3.5" />
            <span>Текст песни</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Поиск в библиотеке треков"
            placeholder="Поиск по песням и артистам..."
            className="w-full rounded-xl bg-slate-900/[0.05] dark:bg-white/[0.06] border border-slate-900/10 dark:border-white/10 pl-8.5 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-slate-900/30 dark:focus:border-white/35"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-900/[0.05] dark:bg-white/[0.05] p-1 rounded-xl overflow-x-auto no-scrollbar">
          {[
            { id: 'all' as const, label: 'Все' },
            { id: 'fav' as const, label: 'Избранные' },
            { id: 'soundcloud' as const, label: 'SoundCloud' },
            { id: 'spotify' as const, label: 'Spotify' },
            { id: 'files' as const, label: 'Файлы' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === tab.id
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-zinc-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable Library Rows */}
      <div className="mt-3.5 flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
        {filteredTracks.length === 0 ? (
          <div className="py-16 text-center max-w-sm mx-auto">
            <Music className="w-10 h-10 text-slate-400 dark:text-zinc-600 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-800 dark:text-zinc-200">
              {tracks.length === 0
                ? 'Библиотека треков пуста'
                : 'Треки по запросу не найдены'}
            </p>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              Добавьте MP3-файлы, треки или плейлисты из SoundCloud и Spotify.
            </p>
            <button
              type="button"
              onClick={onOpenImport}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-slate-900 text-white dark:bg-white dark:text-zinc-950 px-4 py-2 text-xs font-semibold cursor-pointer"
            >
              <CloudDownload className="w-3.5 h-3.5" />
              <span>Импортировать музыку</span>
            </button>
          </div>
        ) : (
          filteredTracks.map((t, idx) => {
            const active = t.id === currentTrackId;
            return (
              <div
                key={t.id}
                data-testid={`library-track-row-${t.id}`}
                className={`group flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5 transition-colors ${
                  active
                    ? 'bg-slate-900/[0.09] dark:bg-white/[0.14] border border-slate-900/15 dark:border-white/20'
                    : 'hover:bg-slate-900/[0.05] dark:hover:bg-white/[0.06] border border-transparent'
                }`}
              >
                <button
                  type="button"
                  onClick={() => (active ? onTogglePlay() : onPlayTrack(t.id))}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                >
                  <span className="w-5 text-center text-xs font-mono-tabular text-slate-400 dark:text-zinc-500 shrink-0">
                    {active && isPlaying ? (
                      <Pause className="w-3.5 h-3.5 mx-auto text-slate-900 dark:text-white fill-current" />
                    ) : active ? (
                      <Play className="w-3.5 h-3.5 mx-auto text-slate-900 dark:text-white fill-current" />
                    ) : (
                      idx + 1
                    )}
                  </span>

                  <img
                    src={t.coverUrl}
                    alt={t.title}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-xl object-cover border border-slate-900/10 dark:border-white/10 shrink-0"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {t.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                      <span>{t.artist}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{SOURCE_LABELS[t.source]}</span>
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onToggleOfflineCache(t)}
                    aria-label={
                      t.isOfflineCached
                        ? `Удалить ${t.title} из офлайн-кэша`
                        : `Скачать ${t.title} офлайн`
                    }
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      t.isOfflineCached
                        ? 'text-emerald-600 dark:text-emerald-300 bg-emerald-500/10'
                        : 'text-slate-400 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-900/8 dark:hover:bg-white/10'
                    }`}
                  >
                    {t.isOfflineCached ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggleFavorite(t.id)}
                    aria-label={`Избранное: ${t.title}`}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-900/8 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <Heart
                      className={`w-4 h-4 ${
                        t.isFavorite ? 'fill-rose-500 text-rose-500' : ''
                      }`}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteTrack(t.id)}
                    data-testid={`delete-track-${t.id}`}
                    aria-label={`Удалить трек ${t.title} из библиотеки`}
                    title="Удалить трек из библиотеки"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <span className="text-xs font-mono-tabular text-slate-500 dark:text-zinc-400 w-10 text-right">
                    {formatTime(t.duration)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
