import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SEED_PLAYLISTS, SEED_TRACKS } from './data/seedLibrary';
import {
  EQPreset,
  LyricLine,
  PlayerCustomization,
  Playlist,
  RepeatMode,
  Track,
  TrackSource,
} from './types/music';
import { BUILTIN_EQ_PRESETS } from './utils/equalizerMath';
import { getNextTrackId, getPreviousTrackId } from './utils/playlistLogic';
import { audioEngine } from './services/audioEngine';
import {
  getOfflineAudioBlob,
  listOfflineAudioMeta,
  loadPersistedData,
  removeOfflineAudioBlob,
  saveOfflineAudioBlob,
  savePersistedData,
} from './services/offlineStorage';
import { DynamicIslandBar } from './components/DynamicIslandBar';
import { ArtworkStageCard } from './components/ArtworkStageCard';
import { TransportPlayerCard } from './components/TransportPlayerCard';
import { WidgetDock } from './components/WidgetDock';
import { LiveLyricsStage } from './components/LiveLyricsStage';
import { TrackLibraryPanel } from './components/TrackLibraryPanel';
import { PlaylistDrawer } from './components/PlaylistDrawer';
import { EqualizerModal } from './components/EqualizerModal';
import { CloudAndStreamingModal } from './components/CloudAndStreamingModal';
import { LyricSyncModal } from './components/LyricSyncModal';
import { CustomizationModal } from './components/CustomizationModal';
import { OfflineIndicator } from './components/PWAStatusControls';
import { useOnlineStatus } from './hooks/usePWAInstall';
import {
  buildUnsyncedLines,
  hasOnlyPlaceholderLyrics,
  parseLRC,
} from './utils/lrcParser';

interface PersistedEQState {
  enabled: boolean;
  gains: number[];
  preamp: number;
  bassBoost: number;
  activePresetId: string;
  customPresets: EQPreset[];
}

const DEFAULT_CUSTOMIZATION: PlayerCustomization = {
  theme: 'dark',
  accentColor: 'default',
  glowIntensity: 0.55,
};

const EMPTY_LIBRARY_TRACK: Track = {
  id: 'empty-library',
  title: 'Библиотека пуста',
  artist: 'Добавьте MP3, SoundCloud или Spotify',
  duration: 0,
  audioUrl: '',
  coverUrl: '/covers/cover-1.svg',
  bpm: 96,
  source: TrackSource.BUILTIN,
  isFavorite: false,
  isOfflineCached: false,
  lyrics: [],
  lyricsSynced: true,
  addedAt: 0,
};

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return `rgba(148, 163, 184, ${alpha.toFixed(2)})`;
  }
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
}

export default function App() {
  const isOnline = useOnlineStatus();

  const [tracks, setTracks] = useState<Track[]>(SEED_TRACKS);
  const [playlists, setPlaylists] = useState<Playlist[]>(SEED_PLAYLISTS);
  const [activePlaylistId, setActivePlaylistId] = useState<string>('pl-all');
  const [currentTrackId, setCurrentTrackId] = useState<string>(SEED_TRACKS[0].id);

  // Theme & Global Customization state
  const [customization, setCustomization] =
    useState<PlayerCustomization>(DEFAULT_CUSTOMIZATION);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(5.0);
  const [duration, setDuration] = useState(SEED_TRACKS[0].duration);
  const [volume, setVolume] = useState(0.82);
  const [isMuted, setIsMuted] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(RepeatMode.ALL);
  const [shuffle, setShuffle] = useState(false);
  const [showLyrics, setShowLyrics] = useState(true);
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);
  const [lyricsRetryTick, setLyricsRetryTick] = useState(0);

  // Offline & Sleep Timer state
  const [offlineOnly, setOfflineOnly] = useState(false);
  const [isCachingOffline, setIsCachingOffline] = useState(false);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);

  // Equalizer DSP state
  const [eqEnabled, setEqEnabled] = useState(true);
  const [eqGains, setEqGains] = useState<number[]>(BUILTIN_EQ_PRESETS[0].gains);
  const [eqPreamp, setEqPreamp] = useState(0);
  const [bassBoost, setBassBoost] = useState(0);
  const [activePresetId, setActivePresetId] = useState('flat');
  const [customPresets, setCustomPresets] = useState<EQPreset[]>([]);

  // Active modals
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [equalizerOpen, setEqualizerOpen] = useState(false);
  const [cloudModalOpen, setCloudModalOpen] = useState(false);
  const [lyricSyncOpen, setLyricSyncOpen] = useState(false);
  const [customizationOpen, setCustomizationOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const toastTimerRef = useRef<number | null>(null);
  const attemptedLyricsIdsRef = useRef<Set<string>>(new Set());

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 3200);
  }, []);

  const allPresets = useMemo(
    () => [...BUILTIN_EQ_PRESETS, ...customPresets],
    [customPresets]
  );

  const currentTrack = useMemo(
    () => tracks.find((t) => t.id === currentTrackId) || tracks[0] || EMPTY_LIBRARY_TRACK,
    [tracks, currentTrackId]
  );

  const currentTrackRef = useRef<Track>(currentTrack);
  currentTrackRef.current = currentTrack;

  const activePlaylist = useMemo(
    () => playlists.find((p) => p.id === activePlaylistId) || null,
    [playlists, activePlaylistId]
  );

  const queueIds = useMemo(() => {
    let baseIds =
      activePlaylist && activePlaylist.id !== 'pl-all'
        ? activePlaylist.trackIds
        : tracks.map((t) => t.id);
    if (offlineOnly || !isOnline) {
      const offlineSet = new Set(tracks.filter((t) => t.isOfflineCached).map((t) => t.id));
      const filtered = baseIds.filter((id) => offlineSet.has(id));
      if (filtered.length > 0) baseIds = filtered;
    }
    return baseIds;
  }, [activePlaylist, tracks, offlineOnly, isOnline]);

  // --- Sync <html> dark class and custom slider thumb color ---
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', customization.theme === 'dark');
    if (customization.accentColor !== 'default') {
      root.style.setProperty('--pulse-custom-thumb', customization.accentColor);
    } else {
      root.style.removeProperty('--pulse-custom-thumb');
    }
  }, [customization.theme, customization.accentColor]);

  // --- Hydrate persisted playlists, tracks, EQ, customization, and IndexedDB offline blobs ---
  const isHydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [savedTracks, savedPlaylists, savedEQ, savedCustom, offlineMap] =
        await Promise.all([
          loadPersistedData<Track[]>('tracks_v1'),
          loadPersistedData<Playlist[]>('playlists_v1'),
          loadPersistedData<PersistedEQState>('eq_v1'),
          loadPersistedData<PlayerCustomization>('customization_v1'),
          listOfflineAudioMeta(),
        ]);

      if (cancelled) return;

      let baseTracks = savedTracks && savedTracks.length > 0 ? savedTracks : SEED_TRACKS;

      // Auto-cache primary showcase track so Offline Mode works immediately out of the box
      if (!offlineMap['track-bolen']) {
        try {
          const resp = await fetch('/audio/track-1.wav');
          if (resp.ok) {
            const blob = await resp.blob();
            const entry = await saveOfflineAudioBlob('track-bolen', blob);
            offlineMap['track-bolen'] = {
              sizeBytes: entry.sizeBytes,
              cachedAt: entry.cachedAt,
            };
          }
        } catch {
          // Ignore background pre-cache error
        }
      }

      baseTracks = baseTracks.map((t) => {
        const freshSeed = SEED_TRACKS.find((s) => s.id === t.id);
        const meta = offlineMap[t.id];
        const hydrated =
          freshSeed && t.id === 'track-bolen' ? { ...t, lyrics: freshSeed.lyrics } : t;

        // Upgrade legacy placeholder lyrics ("Плейлист: ...", "Альбом: ...") so auto-search replaces them
        if (hasOnlyPlaceholderLyrics(hydrated.lyrics, hydrated.title)) {
          return {
            ...hydrated,
            lyrics: [],
            lyricsSynced: false,
            isOfflineCached: Boolean(meta),
            offlineSizeBytes: meta?.sizeBytes || 0,
          };
        }

        return {
          ...hydrated,
          isOfflineCached: Boolean(meta),
          offlineSizeBytes: meta?.sizeBytes || 0,
        };
      });

      setTracks(baseTracks);

      if (savedPlaylists && savedPlaylists.length > 0) {
        // Strip legacy "Сеты дня" scheduleSlot playlists
        const cleanedPlaylists = savedPlaylists.filter((p) => !p.scheduleSlot);
        setPlaylists(cleanedPlaylists.length > 0 ? cleanedPlaylists : SEED_PLAYLISTS);
      }

      if (savedEQ) {
        setEqEnabled(savedEQ.enabled);
        setEqGains(savedEQ.gains);
        setEqPreamp(savedEQ.preamp);
        setBassBoost(savedEQ.bassBoost);
        setActivePresetId(savedEQ.activePresetId);
        setCustomPresets(savedEQ.customPresets || []);
      }

      if (savedCustom) {
        setCustomization({
          theme: savedCustom.theme === 'light' ? 'light' : 'dark',
          accentColor: savedCustom.accentColor || 'default',
          glowIntensity:
            typeof savedCustom.glowIntensity === 'number'
              ? savedCustom.glowIntensity
              : DEFAULT_CUSTOMIZATION.glowIntensity,
        });
      }

      isHydratedRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist user changes to IndexedDB only after initial hydration completes
  useEffect(() => {
    if (!isHydratedRef.current) return;
    const serializableTracks = tracks.map((t) => ({
      ...t,
      audioUrl: t.audioUrl.startsWith('blob:') ? '/audio/track-1.wav' : t.audioUrl,
    }));
    savePersistedData('tracks_v1', serializableTracks);
  }, [tracks]);

  useEffect(() => {
    if (!isHydratedRef.current) return;
    savePersistedData('playlists_v1', playlists);
  }, [playlists]);

  useEffect(() => {
    if (!isHydratedRef.current) return;
    savePersistedData('customization_v1', customization);
  }, [customization]);

  useEffect(() => {
    if (isHydratedRef.current) {
      savePersistedData<PersistedEQState>('eq_v1', {
        enabled: eqEnabled,
        gains: eqGains,
        preamp: eqPreamp,
        bassBoost,
        activePresetId,
        customPresets,
      });
    }
    audioEngine.setEqualizer({
      enabled: eqEnabled,
      gains: eqGains,
      preamp: eqPreamp,
      bassBoost,
    });
  }, [eqEnabled, eqGains, eqPreamp, bassBoost, activePresetId, customPresets]);

  useEffect(() => {
    audioEngine.setVolume(isMuted ? 0 : volume);
  }, [volume, isMuted]);

  // Load current track audio source (preferring IndexedDB offline Blob when cached!)
  const loadTrackIntoEngine = useCallback(
    async (track: Track, autoPlay: boolean, initialSeek?: number) => {
      if (!track.audioUrl) {
        audioEngine.pause();
        setIsPlaying(false);
        setDuration(0);
        setCurrentTime(0);
        return;
      }

      const offlineEntry = await getOfflineAudioBlob(track.id);
      if (offlineEntry && offlineEntry.blob.size > 0) {
        const objUrl = URL.createObjectURL(offlineEntry.blob);
        audioEngine.setSource(objUrl, true);
      } else {
        let srcUrl = track.audioUrl;
        const isServerStream =
          srcUrl.startsWith('/api/stream/sc-full') ||
          srcUrl.startsWith('/api/stream/by-query');
        if (isServerStream && !srcUrl.includes('v=2')) {
          srcUrl = srcUrl.includes('?') ? `${srcUrl}&v=2` : `${srcUrl}?v=2`;
        }
        audioEngine.setSource(srcUrl, srcUrl.startsWith('blob:'));
      }

      const safeInitialDuration =
        (track.audioUrl.startsWith('/api/stream/sc-full') ||
          track.audioUrl.startsWith('/api/stream/by-query')) &&
        (!track.duration || track.duration <= 15)
          ? 180
          : track.duration || 22;
      setDuration(safeInitialDuration);
      if (typeof initialSeek === 'number') {
        audioEngine.seek(initialSeek);
        setCurrentTime(initialSeek);
      } else {
        setCurrentTime(0);
      }

      if (autoPlay) {
        try {
          await audioEngine.play();
          setIsPlaying(true);
        } catch {
          setIsPlaying(false);
        }
      }
    },
    []
  );

  // Initialize first track at 0:05 matching the reference screenshot ("0:05" / "-0:17")
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    loadTrackIntoEngine(SEED_TRACKS[0], false, 5.0);
  }, [loadTrackIntoEngine]);

  // Wire HTMLAudioElement events
  const handleNext = useCallback(() => {
    const nextId = getNextTrackId(queueIds, currentTrack.id, repeatMode, shuffle);
    if (!nextId) {
      setIsPlaying(false);
      return;
    }
    const target = tracks.find((t) => t.id === nextId);
    if (target) {
      setCurrentTrackId(target.id);
      loadTrackIntoEngine(target, true, 0);
    }
  }, [queueIds, currentTrack.id, repeatMode, shuffle, tracks, loadTrackIntoEngine]);

  const handlePrev = useCallback(() => {
    if (currentTime > 3.5) {
      audioEngine.seek(0);
      setCurrentTime(0);
      return;
    }
    const prevId = getPreviousTrackId(queueIds, currentTrack.id, repeatMode);
    if (!prevId) return;
    const target = tracks.find((t) => t.id === prevId);
    if (target) {
      setCurrentTrackId(target.id);
      loadTrackIntoEngine(target, isPlaying, 0);
    }
  }, [currentTime, queueIds, currentTrack.id, repeatMode, tracks, isPlaying, loadTrackIntoEngine]);

  useEffect(() => {
    const audio = audioEngine.getAudioElement();

    const onTimeUpdate = () => {
      const ct = audio.currentTime;
      setCurrentTime(ct);
      setDuration((prev) => (ct > prev ? Math.ceil(ct + 1) : prev));
    };

    const syncAudioDuration = () => {
      const rawDur = audio.duration;
      if (!Number.isFinite(rawDur) || rawDur <= 0) return;

      const activeTrack = currentTrackRef.current;
      const knownDur = activeTrack.duration || 0;

      if (knownDur > 35 && rawDur < knownDur * 0.85) {
        setDuration(knownDur);
        return;
      }

      setDuration(rawDur);
      const rounded = Math.round(rawDur);
      if (rounded > 15 || (knownDur <= 35 && rounded > 1)) {
        const targetId = activeTrack.id;
        setTracks((prev) =>
          prev.map((t) =>
            t.id === targetId && Math.abs(t.duration - rounded) > 1
              ? { ...t, duration: rounded }
              : t
          )
        );
      }
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => handleNext();

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', syncAudioDuration);
    audio.addEventListener('durationchange', syncAudioDuration);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', syncAudioDuration);
      audio.removeEventListener('durationchange', syncAudioDuration);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [handleNext, currentTrack.id]);

  // OS MediaSession Widget Integration (macOS, Windows, iOS, Android lockscreen / Control Center widget)
  useEffect(() => {
    if (!('mediaSession' in navigator) || currentTrack.id === 'empty-library') return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album || 'Pulse OS',
        artwork: [{ src: currentTrack.coverUrl, sizes: '512x512', type: 'image/svg+xml' }],
      });
      navigator.mediaSession.setActionHandler('play', () => {
        audioEngine.play().catch(() => {});
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        audioEngine.pause();
      });
      navigator.mediaSession.setActionHandler('previoustrack', handlePrev);
      navigator.mediaSession.setActionHandler('nexttrack', handleNext);
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (typeof details.seekTime === 'number') {
          audioEngine.seek(details.seekTime);
          setCurrentTime(details.seekTime);
        }
      });
    } catch {
      // Ignore unsupported MediaSession handlers
    }
  }, [currentTrack, handleNext, handlePrev]);

  // Sleep Timer countdown
  useEffect(() => {
    if (!sleepTimerMinutes) return;
    const ms = sleepTimerMinutes * 60 * 1000;
    const timer = window.setTimeout(() => {
      audioEngine.pause();
      setSleepTimerMinutes(null);
      showToast('Таймер сна сработал — воспроизведение остановлено.');
    }, ms);
    return () => window.clearTimeout(timer);
  }, [sleepTimerMinutes, showToast]);

  const handleTogglePlay = async () => {
    if (!currentTrack.audioUrl) return;
    if (isPlaying) {
      audioEngine.pause();
    } else {
      try {
        await audioEngine.play();
      } catch {
        showToast('Не удалось запустить аудиопоток для этого трека.');
      }
    }
  };

  const handleSeek = (sec: number) => {
    audioEngine.seek(sec);
    setCurrentTime(sec);
  };

  const handlePlaySpecificTrack = (trackId: string, playlistId?: string) => {
    if (playlistId) setActivePlaylistId(playlistId);
    const target = tracks.find((t) => t.id === trackId);
    if (!target) return;
    setCurrentTrackId(target.id);
    loadTrackIntoEngine(target, true, 0);
  };

  const handleToggleFavorite = (trackId: string) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, isFavorite: !t.isFavorite } : t))
    );
  };

  const handleDeleteTrackFromLibrary = useCallback(
    (trackId: string) => {
      const target = tracks.find((t) => t.id === trackId);
      if (!target) return;

      const remaining = tracks.filter((t) => t.id !== trackId);
      setTracks(remaining);

      setPlaylists((prev) =>
        prev.map((pl) => ({
          ...pl,
          trackIds: pl.trackIds.filter((id) => id !== trackId),
        }))
      );

      removeOfflineAudioBlob(trackId).catch(() => {});

      if (currentTrack.id === trackId) {
        if (remaining.length > 0) {
          const nextCandidateId = getNextTrackId(
            queueIds,
            trackId,
            RepeatMode.ALL,
            false
          );
          const nextTrack =
            (nextCandidateId && nextCandidateId !== trackId
              ? remaining.find((t) => t.id === nextCandidateId)
              : undefined) || remaining[0];
          setCurrentTrackId(nextTrack.id);
          loadTrackIntoEngine(nextTrack, isPlaying, 0);
        } else {
          setCurrentTrackId('empty-library');
          audioEngine.pause();
          setIsPlaying(false);
          setCurrentTime(0);
          setDuration(0);
        }
      }

      showToast(`Трек «${target.title}» удалён из библиотеки`);
    },
    [tracks, currentTrack.id, queueIds, isPlaying, loadTrackIntoEngine, showToast]
  );

  const handleToggleTheme = useCallback(() => {
    setCustomization((prev) => ({
      ...prev,
      theme: prev.theme === 'dark' ? 'light' : 'dark',
    }));
  }, []);

  const handleChangeCustomization = useCallback(
    (patch: Partial<PlayerCustomization>) => {
      setCustomization((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  const handleResetDefaults = useCallback(() => {
    setCustomization(DEFAULT_CUSTOMIZATION);
    const flat = BUILTIN_EQ_PRESETS[0];
    setEqEnabled(true);
    setActivePresetId(flat.id);
    setEqGains([...flat.gains]);
    setEqPreamp(0);
    setBassBoost(0);
    showToast('Параметры оформления и звука возвращены к стандартным');
  }, [showToast]);

  const handleToggleOfflineCache = async (track: Track) => {
    if (!track.audioUrl) return;
    setIsCachingOffline(true);
    try {
      if (track.isOfflineCached) {
        await removeOfflineAudioBlob(track.id);
        setTracks((prev) =>
          prev.map((t) =>
            t.id === track.id ? { ...t, isOfflineCached: false, offlineSizeBytes: 0 } : t
          )
        );
        showToast(`«${track.title}» удалён из офлайн-памяти.`);
      } else {
        const res = await fetch(track.audioUrl);
        if (!res.ok) throw new Error('Download failed');
        const blob = await res.blob();
        const saved = await saveOfflineAudioBlob(track.id, blob);
        setTracks((prev) =>
          prev.map((t) =>
            t.id === track.id
              ? { ...t, isOfflineCached: true, offlineSizeBytes: saved.sizeBytes }
              : t
          )
        );
        showToast(`«${track.title}» сохранён для прослушивания офлайн!`);
      }
    } catch {
      showToast('Не удалось скачать аудиофайл в офлайн-кэш.');
    } finally {
      setIsCachingOffline(false);
    }
  };

  const handleCacheListOffline = async (list: Track[]) => {
    const uncached = list.filter((t) => !t.isOfflineCached && Boolean(t.audioUrl));
    if (uncached.length === 0) {
      showToast('Все треки этого плейлиста уже доступны офлайн.');
      return;
    }
    setIsCachingOffline(true);
    let count = 0;
    for (const t of uncached) {
      try {
        const res = await fetch(t.audioUrl);
        if (res.ok) {
          const blob = await res.blob();
          const saved = await saveOfflineAudioBlob(t.id, blob);
          count++;
          setTracks((prev) =>
            prev.map((item) =>
              item.id === t.id
                ? { ...item, isOfflineCached: true, offlineSizeBytes: saved.sizeBytes }
                : item
            )
          );
        }
      } catch {
        // Continue remaining tracks
      }
    }
    setIsCachingOffline(false);
    showToast(`Сохранено офлайн треков: ${count}`);
  };

  const handleCreatePlaylist = (name: string, description: string) => {
    const initialIds =
      currentTrack.id !== 'empty-library' ? [currentTrack.id] : [];
    const newPl: Playlist = {
      id: `pl-${Date.now()}`,
      name,
      description,
      trackIds: initialIds,
      createdAt: Date.now(),
    };
    setPlaylists((prev) => [...prev, newPl]);
    setActivePlaylistId(newPl.id);
    showToast(`Плейлист «${name}» создан!`);
  };

  const handleDeletePlaylist = (playlistId: string) => {
    setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
    if (activePlaylistId === playlistId) {
      setActivePlaylistId('pl-all');
    }
    showToast('Плейлист удалён.');
  };

  const handleAddTrackToPlaylist = (playlistId: string, trackId: string) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId) return pl;
        if (pl.trackIds.includes(trackId)) return pl;
        return { ...pl, trackIds: [...pl.trackIds, trackId] };
      })
    );
    const targetPl = playlists.find((p) => p.id === playlistId);
    if (targetPl) {
      showToast(`Добавлено в плейлист «${targetPl.name}»`);
    }
  };

  const handleRemoveTrackFromPlaylist = (playlistId: string, trackId: string) => {
    setPlaylists((prev) =>
      prev.map((pl) =>
        pl.id === playlistId
          ? { ...pl, trackIds: pl.trackIds.filter((id) => id !== trackId) }
          : pl
      )
    );
  };

  const handleAddImportedTrack = (newTrack: Track) => {
    attemptedLyricsIdsRef.current.delete(newTrack.id);
    setTracks((prev) => {
      const exists = prev.some((t) => t.id === newTrack.id);
      return exists ? prev : [newTrack, ...prev];
    });
    setPlaylists((prev) =>
      prev.map((pl) =>
        pl.id === 'pl-all' || (activePlaylistId === pl.id && !pl.isSystem)
          ? {
              ...pl,
              trackIds: pl.trackIds.includes(newTrack.id)
                ? pl.trackIds
                : [newTrack.id, ...pl.trackIds],
            }
          : pl
      )
    );
    setCurrentTrackId(newTrack.id);
    loadTrackIntoEngine(newTrack, false, 0);
  };

  // Auto-fetch lyrics from LRCLIB / Genius.com / Search Engines whenever a track lacks real lyrics
  useEffect(() => {
    if (currentTrack.id === 'empty-library') {
      setIsLoadingLyrics(false);
      return;
    }

    const placeholderOnly = hasOnlyPlaceholderLyrics(
      currentTrack.lyrics,
      currentTrack.title
    );
    const needsLookup = currentTrack.lyricsSynced === false || placeholderOnly;
    if (!needsLookup) {
      setIsLoadingLyrics(false);
      return;
    }

    if (attemptedLyricsIdsRef.current.has(currentTrack.id)) {
      return;
    }
    attemptedLyricsIdsRef.current.add(currentTrack.id);

    let cancelled = false;
    const targetId = currentTrack.id;
    const title = currentTrack.title.trim();
    const artist = currentTrack.artist.trim();
    if (!title) return;

    if (placeholderOnly) {
      setTracks((prev) =>
        prev.map((t) => (t.id === targetId ? { ...t, lyrics: [] } : t))
      );
    }

    setIsLoadingLyrics(true);

    (async () => {
      try {
        const res = await fetch(
          `/api/lyrics/auto?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;

        setTracks((prev) =>
          prev.map((t) => {
            if (t.id !== targetId) return t;
            const dur = t.duration || 180;
            if (data.found && typeof data.syncedLyrics === 'string' && data.syncedLyrics.trim()) {
              return {
                ...t,
                lyrics: parseLRC(data.syncedLyrics, dur),
                lyricsSynced: true,
                lyricsSource: data.source || 'LRCLIB Sync',
              };
            }
            if (data.found && typeof data.plainLyrics === 'string' && data.plainLyrics.trim()) {
              return {
                ...t,
                lyrics: buildUnsyncedLines(data.plainLyrics, dur),
                lyricsSynced: true,
                lyricsSource: data.source || 'Genius / Автопоиск',
              };
            }
            return {
              ...t,
              lyricsSynced: true,
            };
          })
        );
      } catch {
        // Ignore transient network errors
      } finally {
        if (!cancelled) {
          setIsLoadingLyrics(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    currentTrack.id,
    currentTrack.lyricsSynced,
    currentTrack.title,
    currentTrack.artist,
    lyricsRetryTick,
  ]);

  const handleRetryAutoLyrics = useCallback(() => {
    if (currentTrack.id === 'empty-library') return;
    attemptedLyricsIdsRef.current.delete(currentTrack.id);
    setTracks((prev) =>
      prev.map((t) =>
        t.id === currentTrack.id ? { ...t, lyrics: [], lyricsSynced: false } : t
      )
    );
    setLyricsRetryTick((n) => n + 1);
  }, [currentTrack.id]);

  const handleImportPlaylist = (
    playlistName: string,
    importedTracks: Track[],
    meta?: { source?: 'spotify' | 'soundcloud'; externalUrl?: string }
  ) => {
    if (importedTracks.length === 0) return;

    const normKey = (t: Track) =>
      `${t.source}::${t.artist.trim().toLowerCase()}::${t.title.trim().toLowerCase()}`;

    const existingByKey = new Map<string, Track>();
    const existingByUrl = new Map<string, Track>();
    for (const existing of tracks) {
      existingByKey.set(normKey(existing), existing);
      if (
        existing.externalUrl &&
        !existing.externalUrl.includes('/sets/') &&
        !existing.externalUrl.includes('/playlist/') &&
        !existing.externalUrl.includes('/album/')
      ) {
        existingByUrl.set(existing.externalUrl, existing);
      }
    }

    const newTracksToAdd: Track[] = [];
    const orderedPlaylistIds: string[] = [];
    const seenInPlaylist = new Set<string>();

    for (const candidate of importedTracks) {
      const hasUniqueTrackUrl =
        candidate.externalUrl &&
        !candidate.externalUrl.includes('/sets/') &&
        !candidate.externalUrl.includes('/playlist/') &&
        !candidate.externalUrl.includes('/album/');

      const matched =
        (hasUniqueTrackUrl ? existingByUrl.get(candidate.externalUrl!) : undefined) ||
        existingByKey.get(normKey(candidate));

      const finalTrack = matched || candidate;
      if (!matched) {
        newTracksToAdd.push(candidate);
        existingByKey.set(normKey(candidate), candidate);
        if (hasUniqueTrackUrl && candidate.externalUrl) {
          existingByUrl.set(candidate.externalUrl, candidate);
        }
      }
      if (!seenInPlaylist.has(finalTrack.id)) {
        seenInPlaylist.add(finalTrack.id);
        orderedPlaylistIds.push(finalTrack.id);
      }
    }

    if (newTracksToAdd.length > 0) {
      setTracks((prev) => {
        const existingIds = new Set(prev.map((t) => t.id));
        const fresh = newTracksToAdd.filter((t) => !existingIds.has(t.id));
        return [...fresh, ...prev];
      });
    }

    const existingSamePlaylist = meta?.externalUrl
      ? playlists.find((p) => !p.isSystem && p.externalUrl === meta.externalUrl)
      : undefined;

    const targetPlaylistId = existingSamePlaylist?.id || `pl-stream-${Date.now()}`;
    const sourceLabel =
      meta?.source === 'soundcloud'
        ? 'SoundCloud'
        : meta?.source === 'spotify'
          ? 'Spotify'
          : 'Импортировано';

    setPlaylists((prev) => {
      const updated = prev.map((pl) => {
        if (pl.id === 'pl-all') {
          const freshForAll = orderedPlaylistIds.filter((id) => !pl.trackIds.includes(id));
          return {
            ...pl,
            trackIds: [...freshForAll, ...pl.trackIds],
          };
        }
        if (existingSamePlaylist && pl.id === existingSamePlaylist.id) {
          return {
            ...pl,
            name: playlistName,
            description: `${sourceLabel} · треков: ${orderedPlaylistIds.length}`,
            trackIds: orderedPlaylistIds,
          };
        }
        return pl;
      });

      if (existingSamePlaylist) return updated;

      const createdPl: Playlist = {
        id: targetPlaylistId,
        name: playlistName,
        description: `${sourceLabel} · треков: ${orderedPlaylistIds.length}`,
        trackIds: orderedPlaylistIds,
        source: meta?.source,
        externalUrl: meta?.externalUrl,
        createdAt: Date.now(),
      };
      return [...updated, createdPl];
    });

    setActivePlaylistId(targetPlaylistId);
    const firstId = orderedPlaylistIds[0];
    const firstTrack =
      newTracksToAdd.find((t) => t.id === firstId) ||
      tracks.find((t) => t.id === firstId) ||
      importedTracks[0];

    if (firstTrack) {
      setCurrentTrackId(firstTrack.id);
      loadTrackIntoEngine(firstTrack, false, 0);
    }

    showToast(
      `Плейлист «${playlistName}» добавлен (${orderedPlaylistIds.length} треков в плейлистах и медиатеке)`
    );
  };

  const handleSaveLyrics = (trackId: string, updatedLyrics: LyricLine[]) => {
    setTracks((prev) =>
      prev.map((t) =>
        t.id === trackId
          ? { ...t, lyrics: updatedLyrics, lyricsSynced: true, lyricsSource: 'Редактор LRC' }
          : t
      )
    );
    showToast('Синхронизированный текст песни обновлён!');
  };

  const handleUpdateTrackBpm = useCallback((trackId: string, bpm: number) => {
    const clamped = Math.max(45, Math.min(220, Math.round(bpm)));
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, bpm: clamped } : t))
    );
  }, []);

  const offlineStats = useMemo(() => {
    const cached = tracks.filter((t) => t.isOfflineCached);
    const bytes = cached.reduce((acc, t) => acc + (t.offlineSizeBytes || 980000), 0);
    return { count: cached.length, bytes };
  }, [tracks]);

  const ambientBackdropStyle = useMemo(() => {
    const { theme, accentColor, glowIntensity } = customization;
    const clampedGlow = Math.max(0, Math.min(1, glowIntensity));
    const hasCustom = accentColor !== 'default';

    if (theme === 'light') {
      const primaryGlow = hasCustom
        ? hexToRgba(accentColor, 0.28 * clampedGlow)
        : `rgba(99, 102, 241, ${(0.18 * clampedGlow).toFixed(2)})`;
      const secondaryGlow = hasCustom
        ? hexToRgba(accentColor, 0.14 * clampedGlow)
        : `rgba(14, 165, 233, ${(0.14 * clampedGlow).toFixed(2)})`;
      return {
        background: `
          radial-gradient(circle at 22% 26%, ${primaryGlow}, transparent 54%),
          radial-gradient(circle at 78% 64%, ${secondaryGlow}, transparent 60%),
          linear-gradient(180deg, #f4f6fb 0%, #e7ebf4 100%)
        `,
      };
    }

    const primaryDarkGlow = hasCustom
      ? hexToRgba(accentColor, 0.34 * clampedGlow)
      : currentTrack.accentGlow || `rgba(220, 220, 230, ${(0.22 * clampedGlow).toFixed(2)})`;
    const secondaryDarkGlow = hasCustom
      ? hexToRgba(accentColor, 0.16 * clampedGlow)
      : `rgba(38, 38, 48, ${(0.55 * clampedGlow).toFixed(2)})`;

    return {
      background: `
        radial-gradient(circle at 22% 28%, ${primaryDarkGlow}, transparent 52%),
        radial-gradient(circle at 78% 62%, ${secondaryDarkGlow}, transparent 60%),
        linear-gradient(180deg, #0b0b10 0%, #07070a 100%)
      `,
    };
  }, [customization, currentTrack.accentGlow]);

  return (
    <div className="relative min-h-screen bg-[#eef1f7] dark:bg-[#08080c] text-slate-900 dark:text-zinc-100 flex flex-col overflow-hidden transition-colors duration-300">
      {/* Ambient Light/Dark backdrop + custom palette glow */}
      <div
        className="pointer-events-none fixed inset-0 z-0 transition-all duration-500"
        style={ambientBackdropStyle}
        aria-hidden="true"
      />

      {/* Top System + Dynamic Island Bar */}
      <DynamicIslandBar
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        eqEnabled={eqEnabled}
        offlineOnly={offlineOnly}
        offlineCount={offlineStats.count}
        activePlaylist={activePlaylist}
        theme={customization.theme}
        accentColor={customization.accentColor}
        onToggleTheme={handleToggleTheme}
        onOpenCustomization={() => setCustomizationOpen(true)}
        onTogglePlay={handleTogglePlay}
        onPrev={handlePrev}
        onNext={handleNext}
        onOpenPlaylists={() => setPlaylistOpen(true)}
        onOpenEqualizer={() => setEqualizerOpen(true)}
        onOpenCloudSync={() => setCloudModalOpen(true)}
        onToggleOfflineOnly={() => setOfflineOnly((v) => !v)}
      />

      {/* Main Split Stage */}
      <main className="relative z-10 flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-7 pt-2 pb-6 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-start">
        {/* LEFT COLUMN (5/12): Wide Cover Card + Glass Player Card + Full-Width Pulse Rhythm Widget */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <ArtworkStageCard
            track={currentTrack}
            currentTime={currentTime}
            isPlaying={isPlaying}
            onOpenPlaylists={() => setPlaylistOpen(true)}
          />

          <TransportPlayerCard
            track={currentTrack}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            volume={volume}
            isMuted={isMuted}
            repeatMode={repeatMode}
            shuffle={shuffle}
            showLyrics={showLyrics}
            eqEnabled={eqEnabled}
            playlists={playlists}
            isCachingOffline={isCachingOffline}
            theme={customization.theme}
            accentColor={customization.accentColor}
            onTogglePlay={handleTogglePlay}
            onPrev={handlePrev}
            onNext={handleNext}
            onSeek={handleSeek}
            onVolumeChange={(val) => {
              setIsMuted(false);
              setVolume(val);
            }}
            onToggleMute={() => setIsMuted((m) => !m)}
            onToggleFavorite={handleToggleFavorite}
            onToggleRepeat={() => {
              const order = [RepeatMode.OFF, RepeatMode.ALL, RepeatMode.ONE];
              setRepeatMode(order[(order.indexOf(repeatMode) + 1) % order.length]);
            }}
            onToggleShuffle={() => setShuffle((s) => !s)}
            onToggleShowLyrics={() => setShowLyrics((s) => !s)}
            onOpenEqualizer={() => setEqualizerOpen(true)}
            onOpenLyricSync={() => setLyricSyncOpen(true)}
            onToggleOfflineCache={handleToggleOfflineCache}
            onAddTrackToPlaylist={handleAddTrackToPlaylist}
            onDeleteTrackFromLibrary={handleDeleteTrackFromLibrary}
          />

          <WidgetDock
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            eqGains={eqGains}
            activePresetId={activePresetId}
            presets={allPresets}
            bassBoost={bassBoost}
            offlineCachedCount={offlineStats.count}
            sleepTimerMinutes={sleepTimerMinutes}
            theme={customization.theme}
            accentColor={customization.accentColor}
            onChangeBandGain={(idx, gain) => {
              setEqEnabled(true);
              setActivePresetId('custom');
              setEqGains((prev) => prev.map((g, i) => (i === idx ? gain : g)));
            }}
            onSelectPreset={(preset) => {
              setEqEnabled(true);
              setActivePresetId(preset.id);
              setEqGains([...preset.gains]);
              setEqPreamp(preset.preamp);
              setBassBoost(preset.bassBoost);
            }}
            onToggleBassBoost={() => {
              setEqEnabled(true);
              setBassBoost((b) => (b > 0 ? 0 : 6));
            }}
            onOpenFullEqualizer={() => setEqualizerOpen(true)}
            onToggleOfflineCacheTrack={handleToggleOfflineCache}
            onSetSleepTimer={(mins) => {
              setSleepTimerMinutes(mins);
              if (mins) showToast(`Таймер сна установлен на ${mins} мин.`);
            }}
            onUpdateTrackBpm={handleUpdateTrackBpm}
          />
        </div>

        {/* RIGHT COLUMN (7/12): Live Real-Time Synced Lyrics OR Full Track Library Panel when lyrics are hidden */}
        <div className="lg:col-span-7 flex flex-col justify-center">
          {showLyrics ? (
            <LiveLyricsStage
              trackTitle={currentTrack.title}
              lyrics={currentTrack.lyrics}
              currentTime={currentTime}
              theme={customization.theme}
              accentColor={customization.accentColor}
              lyricsSource={currentTrack.lyricsSource}
              isLoadingLyrics={isLoadingLyrics}
              onSeekToLine={(time) => {
                handleSeek(time);
                if (!isPlaying) {
                  audioEngine.play().catch(() => {});
                }
              }}
              onOpenSyncStudio={() => setLyricSyncOpen(true)}
              onRetryAutoLyrics={handleRetryAutoLyrics}
            />
          ) : (
            <TrackLibraryPanel
              tracks={tracks}
              currentTrackId={currentTrack.id}
              isPlaying={isPlaying}
              offlineOnly={offlineOnly}
              accentColor={customization.accentColor}
              onPlayTrack={(tId) => handlePlaySpecificTrack(tId)}
              onTogglePlay={handleTogglePlay}
              onToggleFavorite={handleToggleFavorite}
              onToggleOfflineCache={handleToggleOfflineCache}
              onDeleteTrack={handleDeleteTrackFromLibrary}
              onShowLyrics={() => setShowLyrics(true)}
              onOpenImport={() => setCloudModalOpen(true)}
            />
          )}
        </div>
      </main>

      {/* Modals & Drawers */}
      <PlaylistDrawer
        isOpen={playlistOpen}
        tracks={tracks}
        playlists={playlists}
        activePlaylistId={activePlaylistId}
        currentTrackId={currentTrack.id}
        isPlaying={isPlaying}
        offlineOnly={offlineOnly}
        onClose={() => setPlaylistOpen(false)}
        onSelectPlaylist={(id) => setActivePlaylistId(id)}
        onPlayTrack={(tId, plId) => handlePlaySpecificTrack(tId, plId)}
        onCreatePlaylist={handleCreatePlaylist}
        onDeletePlaylist={handleDeletePlaylist}
        onToggleFavorite={handleToggleFavorite}
        onToggleOfflineCache={handleToggleOfflineCache}
        onCacheAllInPlaylist={handleCacheListOffline}
        onRemoveTrackFromPlaylist={handleRemoveTrackFromPlaylist}
        onDeleteTrackFromLibrary={handleDeleteTrackFromLibrary}
        onOpenCloudImport={() => setCloudModalOpen(true)}
        onImportPlaylist={handleImportPlaylist}
        onAddImportedTrack={(t) => {
          handleAddImportedTrack(t);
          showToast(`Добавлен трек «${t.title}»`);
        }}
      />

      <EqualizerModal
        isOpen={equalizerOpen}
        isPlaying={isPlaying}
        enabled={eqEnabled}
        gains={eqGains}
        preamp={eqPreamp}
        bassBoost={bassBoost}
        presets={allPresets}
        activePresetId={activePresetId}
        onClose={() => setEqualizerOpen(false)}
        onToggleEnabled={() => setEqEnabled((e) => !e)}
        onChangeGain={(idx, db) => {
          setActivePresetId('custom');
          setEqGains((prev) => prev.map((g, i) => (i === idx ? db : g)));
        }}
        onChangePreamp={setEqPreamp}
        onChangeBassBoost={setBassBoost}
        onSelectPreset={(preset) => {
          setEqEnabled(true);
          setActivePresetId(preset.id);
          setEqGains([...preset.gains]);
          setEqPreamp(preset.preamp);
          setBassBoost(preset.bassBoost);
        }}
        onSaveCustomPreset={(name) => {
          const custom: EQPreset = {
            id: `custom-${Date.now()}`,
            name,
            gains: [...eqGains],
            preamp: eqPreamp,
            bassBoost,
          };
          setCustomPresets((prev) => [...prev, custom]);
          setActivePresetId(custom.id);
          showToast(`Пресет «${name}» сохранён!`);
        }}
        onResetFlat={() => {
          const flat = BUILTIN_EQ_PRESETS[0];
          setActivePresetId(flat.id);
          setEqGains([...flat.gains]);
          setEqPreamp(0);
          setBassBoost(0);
        }}
      />

      <CloudAndStreamingModal
        isOpen={cloudModalOpen}
        onClose={() => setCloudModalOpen(false)}
        onAddImportedTrack={(t) => {
          handleAddImportedTrack(t);
          showToast(`Добавлен трек «${t.title}»`);
        }}
        onImportPlaylist={handleImportPlaylist}
        onOpenPlaylists={() => {
          setCloudModalOpen(false);
          setPlaylistOpen(true);
        }}
      />

      <LyricSyncModal
        isOpen={lyricSyncOpen}
        track={currentTrack}
        currentTime={currentTime}
        isPlaying={isPlaying}
        onClose={() => setLyricSyncOpen(false)}
        onTogglePlay={handleTogglePlay}
        onSeek={handleSeek}
        onSaveLyrics={handleSaveLyrics}
      />

      <CustomizationModal
        isOpen={customizationOpen}
        customization={customization}
        onClose={() => setCustomizationOpen(false)}
        onChangeCustomization={handleChangeCustomization}
        onResetDefaults={handleResetDefaults}
      />

      <OfflineIndicator
        offlineModeForced={offlineOnly}
        onToggleOfflineMode={() => setOfflineOnly(false)}
      />

      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 rounded-2xl bg-slate-900/95 dark:bg-zinc-900/95 border border-white/15 px-4 py-2.5 text-xs font-medium text-white shadow-2xl backdrop-blur-xl"
        >
          {toastMsg}
        </div>
      )}
    </div>
  );
}
