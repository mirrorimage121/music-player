import { Track, TrackSource } from '../types/music';
import { parseStreamingUrl } from '../utils/cloudUrlResolver';
import { parseLRC } from '../utils/lrcParser';

export type ImportedStreamingEntity =
  | {
      kind: 'playlist';
      playlistName: string;
      source: 'spotify' | 'soundcloud';
      externalUrl: string;
      tracks: Track[];
    }
  | {
      kind: 'track';
      track: Track;
    };

interface ServerResolvedTrackItem {
  title: string;
  artist: string;
  album?: string;
  coverUrl: string;
  audioUrl: string;
  duration?: number;
  bpm?: number;
  explicit?: boolean;
  source?: 'spotify' | 'soundcloud';
  externalUrl?: string;
  syncedLrc?: string;
}

/**
 * Resolves a public Spotify or SoundCloud playlist/album/track link via `/api/streaming/resolve`
 * and converts all returned songs into ready-to-play `Track` entries.
 */
export async function importStreamingUrl(
  rawInput: string,
  providerFallback: 'spotify' | 'soundcloud' = 'spotify'
): Promise<ImportedStreamingEntity> {
  const parsed = parseStreamingUrl(rawInput);
  if (!parsed.valid) {
    throw new Error(
      parsed.error || 'Вставьте корректную ссылку на плейлист или трек Spotify / SoundCloud.'
    );
  }

  const res = await fetch('/api/streaming/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: parsed.url,
      provider: parsed.provider || providerFallback,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Не удалось загрузить плейлист по указанной ссылке.');
  }

  // Case 1: Playlist or Album with multiple tracks
  if (Array.isArray(data.tracks) && data.tracks.length > 0) {
    const playlistName: string = data.playlistName || 'Импортированный плейлист';
    const plSource: 'spotify' | 'soundcloud' =
      data.source === 'soundcloud' || parsed.provider === 'soundcloud'
        ? 'soundcloud'
        : 'spotify';
    const canonicalUrl: string = data.externalUrl || parsed.url;
    const baseNow = Date.now();

    const importedTracks: Track[] = (data.tracks as ServerResolvedTrackItem[]).map(
      (t, idx) => {
        const dur = t.duration && t.duration > 0 ? t.duration : 180;
        const hasSynced = Boolean(t.syncedLrc);
        const lyrics = t.syncedLrc ? parseLRC(t.syncedLrc, dur) : [];

        const itemSource = t.source || plSource;
        return {
          id: `pl-item-${baseNow}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          title: t.title,
          artist: t.artist,
          album: t.album || playlistName,
          duration: dur,
          audioUrl: t.audioUrl,
          coverUrl: t.coverUrl,
          explicit: Boolean(t.explicit),
          bpm: t.bpm || (itemSource === 'soundcloud' ? 126 : 120),
          source:
            itemSource === 'soundcloud' ? TrackSource.SOUNDCLOUD : TrackSource.SPOTIFY,
          externalUrl: t.externalUrl,
          isFavorite: false,
          isOfflineCached: false,
          lyricsSynced: hasSynced,
          lyricsSource: hasSynced ? 'LRCLIB' : undefined,
          lyrics,
          addedAt: baseNow + idx,
        };
      }
    );

    return {
      kind: 'playlist',
      playlistName,
      source: plSource,
      externalUrl: canonicalUrl,
      tracks: importedTracks,
    };
  }

  // Case 2: Single Track
  if (!data.track) {
    throw new Error('По этой ссылке не найдено доступных треков.');
  }

  const t = data.track as ServerResolvedTrackItem;
  const dur = t.duration && t.duration > 0 ? t.duration : 180;
  const hasSynced = Boolean(t.syncedLrc);
  const itemSource = t.source || parsed.provider || providerFallback;
  const lyrics = t.syncedLrc ? parseLRC(t.syncedLrc, dur) : [];

  return {
    kind: 'track',
    track: {
      id: `stream-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: t.title,
      artist: t.artist,
      album: t.album,
      duration: dur,
      audioUrl: t.audioUrl,
      coverUrl: t.coverUrl,
      explicit: Boolean(t.explicit),
      bpm: t.bpm || (itemSource === 'spotify' ? 120 : 126),
      source:
        itemSource === 'soundcloud' ? TrackSource.SOUNDCLOUD : TrackSource.SPOTIFY,
      externalUrl: t.externalUrl || parsed.url,
      isFavorite: false,
      isOfflineCached: false,
      lyricsSynced: hasSynced,
      lyricsSource: hasSynced ? 'LRCLIB' : undefined,
      lyrics,
      addedAt: Date.now(),
    },
  };
}
