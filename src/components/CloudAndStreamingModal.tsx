import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cloud,
  Copy,
  ExternalLink,
  FolderUp,
  HelpCircle,
  Link2,
  ListPlus,
  Loader2,
  Music2,
  Plus,
  Radio,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import {
  CloudProvider,
  StreamingConnectionStatus,
  Track,
  TrackSource,
} from '../types/music';
import { resolveCloudInput } from '../utils/cloudUrlResolver';
import { buildUnsyncedLines, formatTime, parseLRC } from '../utils/lrcParser';
import { saveOfflineAudioBlob } from '../services/offlineStorage';
import { importStreamingUrl } from '../services/playlistImporter';

interface CatalogSearchResult {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  audioUrl: string;
  duration: number;
  bpm?: number;
  explicit: boolean;
  isFullTrack?: boolean;
  source: 'spotify' | 'soundcloud';
}

interface CloudAndStreamingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddImportedTrack: (track: Track) => void;
  onImportPlaylist?: (
    playlistName: string,
    tracks: Track[],
    meta?: { source?: 'spotify' | 'soundcloud'; externalUrl?: string }
  ) => void;
  onOpenPlaylists?: () => void;
}

const QUICK_SEARCH_PRESETS = ['До скорой встречи', 'Скриптонит', 'Miyagi', 'DVRST'];

export const CloudAndStreamingModal: React.FC<CloudAndStreamingModalProps> = ({
  isOpen,
  onClose,
  onAddImportedTrack,
  onImportPlaylist,
  onOpenPlaylists,
}) => {
  const [activeTab, setActiveTab] = useState<'cloud' | 'streaming'>('streaming');

  // Cloud & Local state
  const [cloudUrl, setCloudUrl] = useState('');
  const [cloudTitle, setCloudTitle] = useState('');
  const [cloudArtist, setCloudArtist] = useState('');
  const [autoSaveOffline, setAutoSaveOffline] = useState(true);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState('');
  const [cloudSuccess, setCloudSuccess] = useState('');

  // Streaming state (Zero-key primary + optional OAuth)
  const [streamStatus, setStreamStatus] = useState<StreamingConnectionStatus>({
    spotifyConnected: false,
    soundcloudConnected: false,
    dropboxConnected: false,
    spotifyConfigured: false,
    soundcloudConfigured: false,
    dropboxConfigured: false,
  });
  const [callbackUrl, setCallbackUrl] = useState('');
  const [copiedCallback, setCopiedCallback] = useState(false);

  // Zero-Key Catalog Search state
  const [catalogQuery, setCatalogQuery] = useState('');
  const [streamProvider, setStreamProvider] = useState<'spotify' | 'soundcloud'>('spotify');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogResults, setCatalogResults] = useState<CatalogSearchResult[]>([]);
  const [addingResultId, setAddingResultId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});

  // Zero-Key Public Link / Playlist state
  const [streamUrl, setStreamUrl] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);

  // Optional OAuth Accordion state
  const [showOAuthSection, setShowOAuthSection] = useState(false);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamMessage, setStreamMessage] = useState('');
  const [streamError, setStreamError] = useState('');

  const fetchAuthStatus = async () => {
    try {
      const res = await fetch(
        `/api/auth/status?origin=${encodeURIComponent(window.location.origin)}`
      );
      if (res.ok) {
        const data = await res.json();
        setStreamStatus(data);
        if (data.callbackUrl) setCallbackUrl(data.callbackUrl);
        if (data.spotifyConnected || data.soundcloudConnected) {
          setShowOAuthSection(true);
        }
      }
    } catch {
      // Ignore offline fetch error
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchAuthStatus();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        fetchAuthStatus();
        setShowOAuthSection(true);
        setStreamMessage(`Аккаунт ${event.data.provider || ''} успешно подключён!`);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyCallbackUrl = async () => {
    if (!callbackUrl) return;
    try {
      await navigator.clipboard.writeText(callbackUrl);
      setCopiedCallback(true);
      window.setTimeout(() => setCopiedCallback(false), 2000);
    } catch {
      // Clipboard API fallback ignored
    }
  };

  // --- Local MP3 + optional LRC upload ---
  const handleLocalFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setCloudError('');
    setCloudSuccess('');
    setCloudLoading(true);

    try {
      const fileArray = Array.from(files);
      const lrcFile = fileArray.find((f) => f.name.toLowerCase().endsWith('.lrc'));
      const lrcText = lrcFile ? await lrcFile.text() : '';
      const audioFiles = fileArray.filter(
        (f) =>
          /\.(mp3|wav|ogg|m4a|flac|aac|webm)$/i.test(f.name) || f.type.startsWith('audio/')
      );

      if (audioFiles.length === 0) {
        setCloudError('Выберите аудиофайл формата MP3, WAV, OGG, FLAC или M4A.');
        setCloudLoading(false);
        return;
      }

      for (const file of audioFiles) {
        const trackId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const objectUrl = URL.createObjectURL(file);

        const duration = await new Promise<number>((resolve) => {
          const tempAudio = new Audio();
          tempAudio.preload = 'metadata';
          const timeout = window.setTimeout(() => resolve(180), 2500);
          tempAudio.onloadedmetadata = () => {
            window.clearTimeout(timeout);
            resolve(
              Number.isFinite(tempAudio.duration) ? Math.round(tempAudio.duration) : 180
            );
          };
          tempAudio.onerror = () => {
            window.clearTimeout(timeout);
            resolve(180);
          };
          tempAudio.src = objectUrl;
        });

        const baseName = file.name.replace(/\.[^/.]+$/, '');
        const parts = baseName.includes(' - ') ? baseName.split(' - ') : ['', baseName];
        const artist = parts[0]?.trim() || 'Локальная медиатека';
        const title = parts.slice(1).join(' - ').trim() || baseName;

        await saveOfflineAudioBlob(trackId, file);

        const parsedLyrics = lrcText ? parseLRC(lrcText, duration) : [];

        const newTrack: Track = {
          id: trackId,
          title,
          artist,
          duration,
          audioUrl: objectUrl,
          coverUrl: '/covers/cover-6.svg',
          bpm: 112,
          source: TrackSource.LOCAL,
          isFavorite: false,
          isOfflineCached: true,
          offlineSizeBytes: file.size,
          lyrics: parsedLyrics,
          lyricsSynced: Boolean(lrcText),
          addedAt: Date.now(),
        };

        onAddImportedTrack(newTrack);
      }

      setCloudSuccess(
        `Импортировано файлов: ${audioFiles.length} (сохранены для офлайн-прослушивания).`
      );
    } catch {
      setCloudError('Ошибка чтения локального аудиофайла.');
    } finally {
      setCloudLoading(false);
    }
  };

  // --- Cloud Storage Import (Google Drive / Dropbox / Yandex Disk / Direct S3/WebDAV URL — NO Client ID needed) ---
  const handleCloudUrlImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setCloudError('');
    setCloudSuccess('');

    const resolved = resolveCloudInput(cloudUrl);
    if (!resolved.valid) {
      setCloudError(resolved.error || 'Некорректная ссылка.');
      return;
    }

    setCloudLoading(true);
    try {
      let streamableUrl = `/api/cloud/proxy?url=${encodeURIComponent(resolved.directUrl)}`;
      let guessedTitle = cloudTitle.trim();

      if (resolved.needsServerResolve || resolved.provider === CloudProvider.YANDEX_DISK) {
        const apiRes = await fetch('/api/cloud/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: resolved.directUrl }),
        });
        const data = await apiRes.json();
        if (!apiRes.ok) {
          setCloudError(data.error || 'Не удалось получить файл из облачного хранилища.');
          setCloudLoading(false);
          return;
        }
        streamableUrl = data.proxyUrl;
        if (!guessedTitle && data.fileName) {
          guessedTitle = String(data.fileName).replace(/\.[^/.]+$/, '');
        }
      }

      if (!guessedTitle) {
        const rawSegment = decodeURIComponent(
          resolved.directUrl.split('/').pop()?.split('?')[0] || ''
        ).replace(/\.[^/.]+$/, '');
        guessedTitle = rawSegment && rawSegment !== 'uc' ? rawSegment : 'Облачный трек';
      }

      const trackId = `cloud-${Date.now()}`;
      let isCached = false;
      let sizeBytes = 0;

      if (autoSaveOffline) {
        try {
          const blobRes = await fetch(streamableUrl);
          if (blobRes.ok) {
            const blob = await blobRes.blob();
            if (blob.size > 0) {
              await saveOfflineAudioBlob(trackId, blob);
              isCached = true;
              sizeBytes = blob.size;
            }
          }
        } catch {
          // Stream online if pre-caching fails
        }
      }

      const providerNames: Record<CloudProvider, string> = {
        [CloudProvider.GOOGLE_DRIVE]: 'Google Drive',
        [CloudProvider.DROPBOX]: 'Dropbox',
        [CloudProvider.YANDEX_DISK]: 'Яндекс Диск',
        [CloudProvider.DIRECT_URL]: 'Облачное хранилище',
      };

      const probedDuration = await new Promise<number>((resolve) => {
        const probe = new Audio();
        probe.preload = 'metadata';
        const timer = window.setTimeout(() => resolve(180), 3000);
        probe.onloadedmetadata = () => {
          window.clearTimeout(timer);
          resolve(Number.isFinite(probe.duration) && probe.duration > 1 ? Math.round(probe.duration) : 180);
        };
        probe.onerror = () => {
          window.clearTimeout(timer);
          resolve(180);
        };
        probe.src = streamableUrl;
      });

      const artist = cloudArtist.trim() || providerNames[resolved.provider];
      const newTrack: Track = {
        id: trackId,
        title: guessedTitle,
        artist,
        duration: probedDuration,
        audioUrl: streamableUrl,
        coverUrl: '/covers/cover-4.svg',
        bpm: 105,
        source: TrackSource.CLOUD,
        cloudProvider: resolved.provider,
        externalUrl: cloudUrl.trim(),
        isFavorite: false,
        isOfflineCached: isCached,
        offlineSizeBytes: sizeBytes,
        lyricsSynced: false,
        lyrics: [],
        addedAt: Date.now(),
      };

      onAddImportedTrack(newTrack);
      setCloudUrl('');
      setCloudTitle('');
      setCloudArtist('');
      setCloudSuccess(`Трек «${newTrack.title}» успешно импортирован из облака!`);
    } catch {
      setCloudError('Не удалось подключиться к облачному файлу.');
    } finally {
      setCloudLoading(false);
    }
  };

  // --- Zero-Key Catalog Search ---
  const executeCatalogSearch = async (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed) {
      setStreamError('Введите имя исполнителя или название трека для поиска.');
      return;
    }
    setStreamError('');
    setStreamMessage('');
    setCatalogLoading(true);

    try {
      const res = await fetch(
        `/api/streaming/search?q=${encodeURIComponent(trimmed)}&provider=${streamProvider}`
      );
      const data = await res.json();
      if (!res.ok) {
        setStreamError(data.error || 'Не удалось выполнить поиск.');
        return;
      }
      const list = Array.isArray(data.results) ? data.results : [];
      setCatalogResults(list);
      if (list.length === 0) {
        setStreamError('По вашему запросу треки не найдены. Попробуйте другое название.');
      }
    } catch {
      setStreamError('Ошибка соединения с каталогом музыки.');
    } finally {
      setCatalogLoading(false);
    }
  };

  const handleCatalogFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeCatalogSearch(catalogQuery);
  };

  const buildTrackFromCatalogItem = async (
    item: CatalogSearchResult,
    fetchLrc: boolean
  ): Promise<Track> => {
    const duration = item.duration || 30;
    let lyrics: Track['lyrics'] = [];
    let lyricsSynced = false;
    let lyricsSource: string | undefined;

    if (fetchLrc) {
      try {
        const lrcRes = await fetch(
          `/api/lyrics/auto?title=${encodeURIComponent(item.title)}&artist=${encodeURIComponent(item.artist)}`
        );
        if (lrcRes.ok) {
          const lrcData = (await lrcRes.json()) as {
            found?: boolean;
            syncedLyrics?: string;
            plainLyrics?: string;
            source?: string;
          };
          if (lrcData.syncedLyrics) {
            lyrics = parseLRC(lrcData.syncedLyrics, duration);
            lyricsSynced = true;
            lyricsSource = lrcData.source || 'LRCLIB';
          } else if (lrcData.plainLyrics) {
            lyrics = buildUnsyncedLines(lrcData.plainLyrics, duration);
            lyricsSynced = true;
            lyricsSource = lrcData.source || 'Genius / Автопоиск';
          }
        }
      } catch {
        // Defer auto-search to player stage if offline
      }
    }

    return {
      id: `${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: item.title,
      artist: item.artist,
      album: item.album,
      duration,
      audioUrl: item.audioUrl,
      coverUrl: item.coverUrl,
      explicit: item.explicit,
      bpm: item.bpm || (item.source === 'spotify' ? 120 : 126),
      source: item.source === 'spotify' ? TrackSource.SPOTIFY : TrackSource.SOUNDCLOUD,
      isFavorite: false,
      isOfflineCached: false,
      lyricsSynced,
      lyricsSource,
      lyrics,
      addedAt: Date.now(),
    };
  };

  const handleAddSingleCatalogTrack = async (item: CatalogSearchResult) => {
    setAddingResultId(item.id);
    setStreamError('');
    try {
      const track = await buildTrackFromCatalogItem(item, true);
      onAddImportedTrack(track);
      setAddedIds((prev) => ({ ...prev, [item.id]: true }));
      setStreamMessage(`Трек «${track.title} — ${track.artist}» добавлен в плеер!`);
    } finally {
      setAddingResultId(null);
    }
  };

  const handleImportCatalogResultsAsPlaylist = async () => {
    if (catalogResults.length === 0) return;
    setCatalogLoading(true);
    try {
      const built: Track[] = [];
      for (let i = 0; i < catalogResults.length; i++) {
        // Fetch synced LRC for the first track immediately so playback has live lyrics right away
        const tr = await buildTrackFromCatalogItem(catalogResults[i], i === 0);
        built.push(tr);
      }
      const playlistTitle = catalogQuery.trim()
        ? `Микс: ${catalogQuery.trim()}`
        : 'Подборка из каталога';
      if (onImportPlaylist) {
        onImportPlaylist(playlistTitle, built);
      } else {
        for (const tr of built) onAddImportedTrack(tr);
      }
      setStreamMessage(
        `Создан плейлист «${playlistTitle}» (${built.length} треков) — без Client ID!`
      );
    } finally {
      setCatalogLoading(false);
    }
  };

  // --- Zero-Key Public Link / Playlist Sync (Spotify Track, Album, Playlist & SoundCloud Set) ---
  const handleResolveStreamingLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setStreamError('');
    setStreamMessage('');

    const raw = streamUrl.trim();
    if (!raw) {
      setStreamError(
        'Вставьте публичную ссылку на плейлист, альбом или трек Spotify / SoundCloud.'
      );
      return;
    }

    setLinkLoading(true);
    try {
      const result = await importStreamingUrl(raw, streamProvider);
      if (result.kind === 'playlist') {
        if (onImportPlaylist) {
          onImportPlaylist(result.playlistName, result.tracks, {
            source: result.source,
            externalUrl: result.externalUrl,
          });
        } else {
          for (const tr of result.tracks) onAddImportedTrack(tr);
        }
        setStreamUrl('');
        setStreamMessage(
          `Плейлист «${result.playlistName}» (${result.tracks.length} треков) добавлен во вкладку «Плейлисты» и во «Всю медиатеку»!`
        );
        return;
      }

      onAddImportedTrack(result.track);
      setStreamUrl('');
      setStreamMessage(
        `Трек «${result.track.title} — ${result.track.artist}» добавлен в медиатеку${
          result.track.lyricsSynced ? ' вместе с синхронным текстом LRC!' : '!'
        }`
      );
    } catch (err) {
      setStreamError(
        err instanceof Error
          ? err.message
          : 'Не удалось выполнить синхронизацию ссылки.'
      );
    } finally {
      setLinkLoading(false);
    }
  };

  // --- Optional OAuth Connect Popup (Spotify / SoundCloud / Dropbox) ---
  const handleOAuthConnect = async (provider: 'spotify' | 'soundcloud' | 'dropbox') => {
    setStreamError('');
    setStreamMessage('');
    try {
      const res = await fetch(
        `/api/auth/${provider}/url?origin=${encodeURIComponent(window.location.origin)}`
      );
      const data = await res.json();
      if (!data.configured || !data.url) {
        if (data.callbackUrl) setCallbackUrl(data.callbackUrl);
        setShowOAuthSection(true);
        setStreamMessage(
          'Client ID сейчас не задан — это необязательно! Вы можете искать любые песни и импортировать ссылки Spotify / SoundCloud выше без ключей, либо бесплатно создать Client ID по инструкции ниже.'
        );
        return;
      }

      window.open(data.url, `${provider}_oauth_popup`, 'width=580,height=700');
    } catch {
      setStreamError('Не удалось запросить адрес авторизации провайдера.');
    }
  };

  const handleSyncConnectedAccount = async (provider: 'spotify' | 'soundcloud') => {
    setStreamLoading(true);
    setStreamError('');
    setStreamMessage('');
    try {
      const res = await fetch(`/api/${provider}/library`);
      const data = await res.json();
      if (!res.ok) {
        setStreamError(data.error || 'Не удалось синхронизировать медиатеку.');
        return;
      }
      const list = Array.isArray(data.tracks) ? data.tracks : [];
      for (const item of list) {
        onAddImportedTrack({
          id: item.id,
          title: item.title,
          artist: item.artist,
          album: item.album,
          duration: item.duration || 28,
          audioUrl: item.audioUrl,
          coverUrl: item.coverUrl,
          explicit: item.explicit,
          bpm: 118,
          source: provider === 'spotify' ? TrackSource.SPOTIFY : TrackSource.SOUNDCLOUD,
          externalUrl: item.externalUrl,
          isFavorite: false,
          isOfflineCached: false,
          lyrics: [],
          lyricsSynced: false,
          addedAt: Date.now(),
        });
      }
      setStreamMessage(
        `Синхронизировано треков из ${provider === 'spotify' ? 'Spotify' : 'SoundCloud'}: ${list.length}`
      );
    } catch {
      setStreamError('Ошибка соединения со стриминговым сервисом.');
    } finally {
      setStreamLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Импорт из облака и синхронизация стримингов"
      className="dark fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
    >
      <div className="glass-panel-elevated w-full max-w-2xl rounded-[30px] p-5 sm:p-7 text-zinc-100 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-white">
              Импорт музыки и синхронизация без ключей
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Spotify, SoundCloud, Google Drive, Яндекс Диск, Dropbox и локальные MP3/LRC
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно импорта"
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-zinc-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switch Tabs */}
        <div className="mt-5 grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-white/[0.06] border border-white/10">
          <button
            type="button"
            onClick={() => setActiveTab('streaming')}
            className={`flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold cursor-pointer ${
              activeTab === 'streaming'
                ? 'bg-white text-zinc-950'
                : 'bg-transparent text-zinc-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>Spotify и SoundCloud</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cloud')}
            className={`flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold cursor-pointer ${
              activeTab === 'cloud'
                ? 'bg-white text-zinc-950'
                : 'bg-transparent text-zinc-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Cloud className="w-4 h-4" />
            <span>Облачные хранилища и MP3</span>
          </button>
        </div>

        {activeTab === 'cloud' ? (
          <div className="mt-5 space-y-5">
            {/* Local File + LRC Picker */}
            <div className="rounded-2xl border border-dashed border-white/20 bg-white/[0.03] p-5 text-center">
              <FolderUp className="w-7 h-7 text-zinc-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-white">
                Загрузить локальные аудиофайлы (.mp3, .wav, .flac, .m4a) и текст (.lrc)
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Работает сразу без аккаунтов и ключей — файлы кэшируются в браузере для офлайн-режима
              </p>
              <label className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white text-zinc-950 px-5 py-2 text-xs font-semibold hover:bg-zinc-200 cursor-pointer">
                <Music2 className="w-3.5 h-3.5" />
                <span>Выбрать файлы с устройства</span>
                <input
                  type="file"
                  accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.lrc"
                  multiple
                  onChange={(e) => handleLocalFiles(e.target.files)}
                  className="hidden"
                />
              </label>
            </div>

            {/* Cloud Storage Link Form */}
            <form onSubmit={handleCloudUrlImport} className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="cloud-url-input" className="text-xs font-semibold text-white">
                  Прямой импорт по публичной ссылке (Google Drive, Яндекс Диск, Dropbox, S3)
                </label>
                <span className="text-[11px] text-emerald-300 font-medium">
                  Без Client ID и регистрации
                </span>
              </div>

              <div className="relative">
                <Link2 className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="cloud-url-input"
                  type="text"
                  value={cloudUrl}
                  onChange={(e) => {
                    setCloudUrl(e.target.value);
                    if (cloudError) setCloudError('');
                  }}
                  placeholder="https://drive.google.com/file/d/... или https://disk.yandex.ru/d/..."
                  className="w-full rounded-xl bg-black/50 border border-white/15 pl-10 pr-3.5 py-2.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/40"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={cloudTitle}
                  onChange={(e) => setCloudTitle(e.target.value)}
                  aria-label="Название облачного трека"
                  placeholder="Название трека (необязательно)"
                  className="rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/40"
                />
                <input
                  type="text"
                  value={cloudArtist}
                  onChange={(e) => setCloudArtist(e.target.value)}
                  aria-label="Исполнитель облачного трека"
                  placeholder="Исполнитель (необязательно)"
                  className="rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/40"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSaveOffline}
                    onChange={(e) => setAutoSaveOffline(e.target.checked)}
                    className="rounded accent-white"
                  />
                  <span>Сразу сохранить копию для прослушивания офлайн</span>
                </label>

                <button
                  type="submit"
                  disabled={cloudLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-white text-zinc-950 px-5 py-2 text-xs font-semibold hover:bg-zinc-200 disabled:opacity-50 cursor-pointer"
                >
                  {cloudLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Импортировать из облака</span>
                </button>
              </div>

              {cloudError && <p className="text-xs text-rose-400">{cloudError}</p>}
              {cloudSuccess && (
                <p className="text-xs text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{cloudSuccess}</span>
                </p>
              )}
            </form>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {/* PRIMARY SECTION 1: Zero-Key Live Catalog Search + Auto LRC */}
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-white">
                    1. Поиск треков и авто-текстов LRC (работает сразу — без Client ID)
                  </h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Находит треки с обложками, аудиопотоком и синхронной караоке-лирикой
                  </p>
                </div>

                <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setStreamProvider('spotify')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                      streamProvider === 'spotify'
                        ? 'bg-white text-zinc-950'
                        : 'bg-transparent text-zinc-400 hover:text-white'
                    }`}
                  >
                    Spotify
                  </button>
                  <button
                    type="button"
                    onClick={() => setStreamProvider('soundcloud')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                      streamProvider === 'soundcloud'
                        ? 'bg-white text-zinc-950'
                        : 'bg-transparent text-zinc-400 hover:text-white'
                    }`}
                  >
                    SoundCloud
                  </button>
                </div>
              </div>

              <form onSubmit={handleCatalogFormSubmit} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={catalogQuery}
                    onChange={(e) => {
                      setCatalogQuery(e.target.value);
                      if (streamError) setStreamError('');
                    }}
                    aria-label="Поиск песни или исполнителя без Client ID"
                    placeholder="Введите трек или артиста (например: Скриптонит, Miyagi, The Weeknd)..."
                    className="w-full rounded-xl bg-black/50 border border-white/15 pl-9 pr-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/40"
                  />
                </div>
                <button
                  type="submit"
                  disabled={catalogLoading}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white text-zinc-950 px-4 py-2 text-xs font-semibold hover:bg-zinc-200 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                >
                  {catalogLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5" />
                  )}
                  <span>Найти</span>
                </button>
              </form>

              {/* Quick One-Click Search Suggestions */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-zinc-500 mr-1">Быстрый тест:</span>
                {QUICK_SEARCH_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setCatalogQuery(preset);
                      executeCatalogSearch(preset);
                    }}
                    className="rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 hover:text-white cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>

              {/* Search Results List */}
              {catalogResults.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-400">
                      Найдено треков: {catalogResults.length}
                    </span>
                    <button
                      type="button"
                      onClick={handleImportCatalogResultsAsPlaylist}
                      disabled={catalogLoading}
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300 hover:text-emerald-200 cursor-pointer"
                    >
                      <ListPlus className="w-3.5 h-3.5" />
                      <span>Сохранить все как новый плейлист</span>
                    </button>
                  </div>

                  <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                    {catalogResults.map((item) => {
                      const isAdding = addingResultId === item.id;
                      const isAdded = Boolean(addedIds[item.id]);
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-3 rounded-xl bg-black/40 border border-white/10 p-2 hover:border-white/20"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={item.coverUrl}
                              alt={item.title}
                              className="w-9 h-9 rounded-lg object-cover bg-zinc-800 shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-white truncate">
                                {item.title}
                              </p>
                              <p className="text-[11px] text-zinc-400 truncate tabular-nums">
                                {item.artist} · <span className="text-emerald-300 font-medium">{formatTime(item.duration)}</span> · {item.album}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleAddSingleCatalogTrack(item)}
                            disabled={isAdding || isAdded}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold shrink-0 cursor-pointer ${
                              isAdded
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                                : 'bg-white text-zinc-950 hover:bg-zinc-200'
                            }`}
                          >
                            {isAdding ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : isAdded ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <Plus className="w-3 h-3" />
                            )}
                            <span>{isAdded ? 'Добавлено' : 'В плеер + LRC'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* PRIMARY SECTION 2: Direct Public Link / Playlist Sync (Zero Client ID) */}
            <form
              onSubmit={handleResolveStreamingLink}
              className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-white">
                  2. Импорт плейлиста, альбома или трека по ссылке (Spotify и SoundCloud)
                </h3>
                <span className="text-[11px] text-zinc-400">
                  Добавляет в «Плейлисты» и «Всю медиатеку»
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  value={streamUrl}
                  onChange={(e) => {
                    setStreamUrl(e.target.value);
                    if (streamError) setStreamError('');
                  }}
                  aria-label="Ссылка на трек или плейлист в Spotify или SoundCloud"
                  placeholder="https://open.spotify.com/playlist/... или https://soundcloud.com/.../sets/..."
                  className="flex-1 rounded-xl bg-black/50 border border-white/15 px-3.5 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/40"
                />
                <button
                  type="submit"
                  disabled={linkLoading}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white text-zinc-950 px-4 py-2 text-xs font-semibold hover:bg-zinc-200 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                >
                  {linkLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Импортировать ссылку</span>
                </button>
              </div>
            </form>

            {streamError && <p className="text-xs text-rose-400 px-1">{streamError}</p>}
            {streamMessage && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-300 px-1">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{streamMessage}</span>
                </span>
                {onOpenPlaylists && streamMessage.includes('Плейлист') && (
                  <button
                    type="button"
                    onClick={onOpenPlaylists}
                    className="rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-white cursor-pointer"
                  >
                    Открыть Плейлисты
                  </button>
                )}
              </div>
            )}

            {/* OPTIONAL SECTION 3: Collapsible Personal Account OAuth 2.0 + Free Client ID Guide */}
            <div className="rounded-2xl bg-white/[0.02] border border-white/10 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowOAuthSection((prev) => !prev)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.04] cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <HelpCircle className="w-4 h-4 text-zinc-400 shrink-0" />
                  <span className="text-xs font-semibold text-zinc-300 truncate">
                    Дополнительно: вход через личный аккаунт OAuth 2.0 (необязательно, нужен Client ID)
                  </span>
                </div>
                {showOAuthSection ? (
                  <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                )}
              </button>

              {showOAuthSection && (
                <div className="px-4 pb-4 pt-1 space-y-3 border-t border-white/10">
                  <div className="rounded-xl bg-black/40 border border-white/10 p-3 text-[11px] text-zinc-300 space-y-1.5 leading-relaxed">
                    <p className="font-semibold text-white">
                      Что делать, если у вас нет Client ID?
                    </p>
                    <p>
                      • <strong className="text-white">Ничего настраивать не нужно</strong> — используйте поиск каталога (блок 1), публичные ссылки на треки и плейлисты Spotify / SoundCloud (блок 2) или вкладку «Облачные хранилища и MP3». Они работают сразу без ключей.
                    </p>
                    <p>
                      • Если вы хотите подключить закрытую медиатеку своего аккаунта через OAuth, вы можете бесплатно создать приложение на{' '}
                      <a
                        href="https://developer.spotify.com/dashboard"
                        target="_blank"
                        rel="noreferrer"
                        className="underline text-white hover:text-zinc-200"
                      >
                        developer.spotify.com/dashboard
                      </a>{' '}
                      или{' '}
                      <a
                        href="https://www.dropbox.com/developers/apps"
                        target="_blank"
                        rel="noreferrer"
                        className="underline text-white hover:text-zinc-200"
                      >
                        dropbox.com/developers/apps
                      </a>
                      , указать Redirect URI ниже и добавить <code className="text-zinc-200">SPOTIFY_CLIENT_ID</code> и <code className="text-zinc-200">SPOTIFY_CLIENT_SECRET</code> в панель <strong className="text-white">Secrets</strong> в AI Studio.
                    </p>

                    {callbackUrl && (
                      <div className="pt-1 flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] px-2.5 py-1.5 border border-white/10">
                        <span className="font-mono-tabular text-[10px] text-zinc-300 truncate">
                          Redirect URI: {callbackUrl}
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyCallbackUrl}
                          className="inline-flex items-center gap-1 rounded-md bg-white/10 hover:bg-white/20 px-2 py-1 text-[10px] font-semibold text-white shrink-0 cursor-pointer"
                        >
                          {copiedCallback ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-300" />
                              <span>Скопировано</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Копировать</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {streamStatus.spotifyConnected ? (
                      <button
                        type="button"
                        onClick={() => handleSyncConnectedAccount('spotify')}
                        disabled={streamLoading}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white text-zinc-950 py-2 px-3 text-xs font-semibold hover:bg-zinc-200 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Импорт лайков Spotify</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOAuthConnect('spotify')}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 py-2 px-3 text-xs font-semibold text-white cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Spotify OAuth</span>
                      </button>
                    )}

                    {streamStatus.soundcloudConnected ? (
                      <button
                        type="button"
                        onClick={() => handleSyncConnectedAccount('soundcloud')}
                        disabled={streamLoading}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white text-zinc-950 py-2 px-3 text-xs font-semibold hover:bg-zinc-200 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Импорт SoundCloud</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOAuthConnect('soundcloud')}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 py-2 px-3 text-xs font-semibold text-white cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>SoundCloud OAuth</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleOAuthConnect('dropbox')}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 py-2 px-3 text-xs font-semibold text-white cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>
                        {streamStatus.dropboxConnected ? 'Dropbox подключён' : 'Dropbox OAuth'}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
