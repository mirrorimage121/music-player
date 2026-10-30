import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Download,
  FolderPlus,
  Heart,
  Link2,
  ListMusic,
  Loader2,
  Music,
  Pause,
  Play,
  Search,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import { Playlist, Track, TrackSource } from '../types/music';
import { filterTracks } from '../utils/playlistLogic';
import { formatTime } from '../utils/lrcParser';
import { importStreamingUrl } from '../services/playlistImporter';

interface PlaylistDrawerProps {
  isOpen: boolean;
  tracks: Track[];
  playlists: Playlist[];
  activePlaylistId: string;
  currentTrackId: string;
  isPlaying: boolean;
  offlineOnly: boolean;
  onClose: () => void;
  onSelectPlaylist: (playlistId: string) => void;
  onPlayTrack: (trackId: string, playlistId?: string) => void;
  onCreatePlaylist: (name: string, description: string) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onToggleFavorite: (trackId: string) => void;
  onToggleOfflineCache: (track: Track) => void;
  onCacheAllInPlaylist: (tracksToCache: Track[]) => void;
  onRemoveTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  onDeleteTrackFromLibrary: (trackId: string) => void;
  onOpenCloudImport: () => void;
  onImportPlaylist: (
    playlistName: string,
    tracks: Track[],
    meta?: { source?: 'spotify' | 'soundcloud'; externalUrl?: string }
  ) => void;
  onAddImportedTrack: (track: Track) => void;
}

const SOURCE_LABELS: Record<TrackSource, string> = {
  [TrackSource.BUILTIN]: 'Студия',
  [TrackSource.LOCAL]: 'Файл',
  [TrackSource.CLOUD]: 'Облако',
  [TrackSource.SPOTIFY]: 'Spotify',
  [TrackSource.SOUNDCLOUD]: 'SoundCloud',
};

export const PlaylistDrawer: React.FC<PlaylistDrawerProps> = ({
  isOpen,
  tracks,
  playlists,
  activePlaylistId,
  currentTrackId,
  isPlaying,
  offlineOnly,
  onClose,
  onSelectPlaylist,
  onPlayTrack,
  onCreatePlaylist,
  onDeletePlaylist,
  onToggleFavorite,
  onToggleOfflineCache,
  onCacheAllInPlaylist,
  onRemoveTrackFromPlaylist,
  onDeleteTrackFromLibrary,
  onOpenCloudImport,
  onImportPlaylist,
  onAddImportedTrack,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [formError, setFormError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Direct Spotify / SoundCloud Playlist URL import state inside Playlists tab
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [importingUrl, setImportingUrl] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const urlInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const activePlaylist =
    activePlaylistId === 'pl-all'
      ? null
      : playlists.find((p) => p.id === activePlaylistId) || null;

  const visibleTracks = filterTracks(tracks, {
    playlist: activePlaylist,
    query: searchQuery,
    onlyOffline: offlineOnly,
    onlyFavorites,
    sourceFilter,
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      setFormError('Введите название нового плейлиста.');
      return;
    }
    onCreatePlaylist(trimmed, newDesc.trim() || 'Пользовательский плейлист');
    setNewName('');
    setNewDesc('');
    setFormError('');
    setShowCreateForm(false);
  };

  const handlePlaylistUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportError('');
    setImportSuccess('');

    const trimmed = playlistUrl.trim();
    if (!trimmed) {
      setImportError('Вставьте ссылку на плейлист из SoundCloud или Spotify.');
      return;
    }

    setImportingUrl(true);
    try {
      const result = await importStreamingUrl(trimmed);
      if (result.kind === 'playlist') {
        onImportPlaylist(result.playlistName, result.tracks, {
          source: result.source,
          externalUrl: result.externalUrl,
        });
        setPlaylistUrl('');
        setSearchQuery('');
        setSourceFilter('all');
        setImportSuccess(
          `Плейлист «${result.playlistName}» добавлен! Все ${result.tracks.length} треков добавлены в плейлист и во «Всю медиатеку».`
        );
      } else {
        onAddImportedTrack(result.track);
        setPlaylistUrl('');
        setImportSuccess(
          `Трек «${result.track.title} — ${result.track.artist}» добавлен в медиатеку.`
        );
      }
    } catch (err) {
      setImportError(
        err instanceof Error
          ? err.message
          : 'Не удалось импортировать плейлист по этой ссылке.'
      );
    } finally {
      setImportingUrl(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Плейлисты и медиатека"
      className="dark fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm"
    >
      <div className="glass-panel-elevated w-full max-w-3xl h-full flex flex-col sm:flex-row overflow-hidden text-zinc-100">
        {/* Left Sidebar: Playlists List */}
        <aside className="w-full sm:w-64 border-b sm:border-b-0 sm:border-r border-white/10 p-4 flex flex-col gap-3 shrink-0 bg-black/25">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold tracking-tight flex items-center gap-2">
              <ListMusic className="w-4 h-4 text-zinc-300" />
              <span>Плейлисты</span>
            </h2>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm((v) => !v);
                setFormError('');
              }}
              aria-label="Создать плейлист"
              className="inline-flex items-center gap-1 rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1 text-xs font-medium text-white transition-colors cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>Новый</span>
            </button>
          </div>

          {showCreateForm && (
            <form onSubmit={handleCreateSubmit} className="rounded-2xl bg-white/[0.06] border border-white/10 p-3 space-y-2">
              <div>
                <label htmlFor="new-playlist-name" className="block text-[11px] text-zinc-400 mb-1">
                  Название плейлиста
                </label>
                <input
                  id="new-playlist-name"
                  type="text"
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    if (formError) setFormError('');
                  }}
                  placeholder="Например: Ночной микс"
                  className="w-full rounded-xl bg-black/50 border border-white/15 px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/40"
                />
              </div>
              <div>
                <label htmlFor="new-playlist-desc" className="block text-[11px] text-zinc-400 mb-1">
                  Описание (необязательно)
                </label>
                <input
                  id="new-playlist-desc"
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Атмосферные треки в дорогу"
                  className="w-full rounded-xl bg-black/50 border border-white/15 px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/40"
                />
              </div>
              {formError && <p className="text-[11px] text-rose-400">{formError}</p>}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-white text-zinc-950 py-1.5 text-xs font-semibold hover:bg-zinc-200 cursor-pointer"
                >
                  Создать
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="rounded-xl bg-white/10 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/15 cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            </form>
          )}

          <div className="flex sm:flex-col gap-1.5 overflow-x-auto sm:overflow-y-auto no-scrollbar">
            {playlists.map((pl) => {
              const selected = activePlaylistId === pl.id;
              const count = pl.id === 'pl-all' ? tracks.length : pl.trackIds.length;
              return (
                <div
                  key={pl.id}
                  className={`group flex items-center justify-between gap-1 rounded-xl px-3 py-2 text-xs transition-colors shrink-0 ${
                    selected
                      ? 'bg-white text-zinc-950 font-semibold'
                      : 'text-zinc-300 hover:bg-white/10'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectPlaylist(pl.id)}
                    className="flex-1 text-left truncate cursor-pointer"
                  >
                    <span>{pl.name}</span>
                    <span
                      className={`ml-1.5 text-[11px] tabular-nums ${
                        selected ? 'text-zinc-600' : 'text-zinc-500'
                      }`}
                    >
                      {count}
                    </span>
                  </button>

                  {!pl.isSystem && !pl.scheduleSlot && (
                    confirmDeleteId === pl.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          onDeletePlaylist(pl.id);
                          setConfirmDeleteId(null);
                        }}
                        className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[10px] font-semibold cursor-pointer"
                      >
                        Удалить?
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(pl.id)}
                        aria-label={`Удалить плейлист ${pl.name}`}
                        className={`opacity-70 hover:opacity-100 p-0.5 rounded cursor-pointer ${
                          selected ? 'text-zinc-700' : 'text-zinc-400'
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Right Main Area: Tracks in Selected Playlist */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className="flex items-start justify-between gap-3 p-5 border-b border-white/10">
            <div className="min-w-0">
              <h3 className="text-lg font-extrabold tracking-tight text-white truncate">
                {activePlaylist ? activePlaylist.name : 'Вся медиатека'}
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5 truncate">
                {activePlaylist
                  ? activePlaylist.description
                  : `Все песни библиотеки плеера (${tracks.length}) — локальные, облачные, Spotify и SoundCloud`}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {visibleTracks.length > 0 && (
                <button
                  type="button"
                  onClick={() => onCacheAllInPlaylist(visibleTracks)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs font-medium text-white transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Скачать всё офлайн</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть панель плейлистов"
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-zinc-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Direct Playlist URL Import Bar (Spotify / SoundCloud) */}
          <form
            onSubmit={handlePlaylistUrlSubmit}
            className="px-5 py-3 border-b border-white/10 bg-white/[0.03] space-y-2"
          >
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Link2 className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={urlInputRef}
                  type="text"
                  value={playlistUrl}
                  onChange={(e) => {
                    setPlaylistUrl(e.target.value);
                    if (importError) setImportError('');
                  }}
                  aria-label="Ссылка на плейлист из SoundCloud или Spotify"
                  placeholder="Ссылка на плейлист Spotify или SoundCloud..."
                  className="w-full rounded-xl bg-black/50 border border-white/15 pl-8.5 pr-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/40"
                />
              </div>

              <button
                type="submit"
                disabled={importingUrl}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white text-zinc-950 px-4 py-2 text-xs font-semibold hover:bg-zinc-200 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {importingUrl ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Импорт треков...</span>
                  </>
                ) : (
                  <span>Добавить плейлист</span>
                )}
              </button>
            </div>

            {importError && <p className="text-[11px] text-rose-400">{importError}</p>}
            {importSuccess && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-emerald-300">
                <span className="flex items-start gap-1.5 min-w-0">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="break-words">{importSuccess}</span>
                </span>
                {activePlaylistId !== 'pl-all' && (
                  <button
                    type="button"
                    onClick={() => onSelectPlaylist('pl-all')}
                    className="underline underline-offset-2 text-zinc-200 hover:text-white shrink-0 cursor-pointer"
                  >
                    Вся медиатека ({tracks.length})
                  </button>
                )}
              </div>
            )}
          </form>

          {/* Search & Source Filters */}
          <div className="px-5 py-3 border-b border-white/10 flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Поиск по трекам и исполнителям"
                placeholder="Поиск по названию или артисту..."
                className="w-full rounded-xl bg-white/[0.06] border border-white/10 pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
              />
            </div>

            <div className="flex items-center gap-1 bg-white/[0.05] p-1 rounded-xl">
              {[
                { id: 'all', label: 'Все' },
                { id: TrackSource.SPOTIFY, label: 'Spotify' },
                { id: TrackSource.SOUNDCLOUD, label: 'SoundCloud' },
                { id: TrackSource.CLOUD, label: 'Облако' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSourceFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    sourceFilter === tab.id
                      ? 'bg-white text-zinc-950'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setOnlyFavorites((v) => !v)}
              aria-pressed={onlyFavorites}
              className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-medium border transition-colors cursor-pointer ${
                onlyFavorites
                  ? 'bg-rose-500/20 border-rose-400/40 text-rose-200'
                  : 'bg-white/[0.05] border-white/10 text-zinc-400 hover:text-white'
              }`}
            >
              <Heart className="w-3 h-3" />
              <span>Избранные</span>
            </button>
          </div>

          {/* Track Rows */}
          <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
            {visibleTracks.length === 0 ? (
              <div className="py-16 text-center max-w-sm mx-auto">
                <Music className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                <p className="text-sm font-semibold text-zinc-200">
                  {offlineOnly
                    ? 'Нет скачанных треков для офлайн-прослушивания'
                    : 'Треки по выбранному фильтру не найдены'}
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  Импортируйте MP3 из облачного хранилища, синхронизируйте трек из Spotify / SoundCloud или сохраните песни в офлайн-кэш.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenCloudImport();
                  }}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white text-zinc-950 px-4 py-2 text-xs font-semibold hover:bg-zinc-200 cursor-pointer"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Импортировать треки</span>
                </button>
              </div>
            ) : (
              visibleTracks.map((t, index) => {
                const isCurrent = t.id === currentTrackId;
                return (
                  <div
                    key={t.id}
                    className={`flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5 transition-colors ${
                      isCurrent ? 'bg-white/[0.13] border border-white/15' : 'hover:bg-white/[0.06]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onPlayTrack(t.id, activePlaylistId)}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <span className="w-5 text-center text-xs font-mono-tabular text-zinc-500 shrink-0">
                        {isCurrent && isPlaying ? (
                          <Pause className="w-3.5 h-3.5 mx-auto text-white fill-current" />
                        ) : isCurrent ? (
                          <Play className="w-3.5 h-3.5 mx-auto text-white fill-current" />
                        ) : (
                          index + 1
                        )}
                      </span>
                      <img
                        src={t.coverUrl}
                        alt={t.title}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-xl object-cover border border-white/10 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-white truncate">
                          {t.title}
                        </div>
                        <div className="text-xs text-zinc-400 truncate">
                          <span>{t.artist}</span>
                          <span aria-hidden="true"> · </span>
                          <span>{SOURCE_LABELS[t.source]}</span>
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleOfflineCache(t)}
                        aria-label={
                          t.isOfflineCached
                            ? `Удалить ${t.title} из офлайн-кэша`
                            : `Скачать ${t.title} для офлайн-прослушивания`
                        }
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          t.isOfflineCached
                            ? 'text-emerald-300 bg-emerald-400/10'
                            : 'text-zinc-400 hover:text-white hover:bg-white/10'
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
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer"
                      >
                        <Heart
                          className={`w-4 h-4 ${
                            t.isFavorite ? 'fill-rose-500 text-rose-500' : ''
                          }`}
                        />
                      </button>

                      {activePlaylist && !activePlaylist.isSystem && (
                        <button
                          type="button"
                          onClick={() => onRemoveTrackFromPlaylist(activePlaylist.id, t.id)}
                          aria-label={`Убрать ${t.title} из плейлиста`}
                          title="Убрать из плейлиста"
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-amber-300 hover:bg-white/10 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onDeleteTrackFromLibrary(t.id)}
                        aria-label={`Удалить ${t.title} из библиотеки`}
                        title="Удалить трек из библиотеки"
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <span className="text-xs text-zinc-400 font-mono-tabular w-10 text-right">
                        {formatTime(t.duration)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {offlineOnly && (
            <div className="px-5 py-2.5 bg-amber-500/10 border-t border-amber-400/20 flex items-center gap-2 text-xs text-amber-200">
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              <span>Включён фильтр офлайн-режима: отображаются только треки из локального кэша.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
