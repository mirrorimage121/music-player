import { Playlist, RepeatMode, Track } from '../types/music';

/**
 * Computes the next track ID given the current queue, active track, repeat mode, and shuffle state.
 */
export function getNextTrackId(
  queueIds: string[],
  currentTrackId: string | null,
  repeatMode: RepeatMode,
  shuffle: boolean,
  randomFn: () => number = Math.random
): string | null {
  if (queueIds.length === 0) return null;
  if (!currentTrackId) return queueIds[0];

  if (repeatMode === RepeatMode.ONE) {
    return currentTrackId;
  }

  const currentIdx = queueIds.indexOf(currentTrackId);
  if (currentIdx === -1) return queueIds[0];

  if (shuffle && queueIds.length > 1) {
    const candidates = queueIds.filter((id) => id !== currentTrackId);
    const pick = Math.min(candidates.length - 1, Math.floor(randomFn() * candidates.length));
    return candidates[pick];
  }

  if (currentIdx < queueIds.length - 1) {
    return queueIds[currentIdx + 1];
  }

  if (repeatMode === RepeatMode.ALL) {
    return queueIds[0];
  }

  return null;
}

/**
 * Computes the previous track ID.
 */
export function getPreviousTrackId(
  queueIds: string[],
  currentTrackId: string | null,
  repeatMode: RepeatMode
): string | null {
  if (queueIds.length === 0) return null;
  if (!currentTrackId) return queueIds[0];

  const currentIdx = queueIds.indexOf(currentTrackId);
  if (currentIdx === -1) return queueIds[0];

  if (currentIdx > 0) {
    return queueIds[currentIdx - 1];
  }

  if (repeatMode === RepeatMode.ALL) {
    return queueIds[queueIds.length - 1];
  }

  return queueIds[0];
}

/**
 * Filters tracks by playlist, search query, offline-only mode, or source filter.
 */
export function filterTracks(
  tracks: Track[],
  options: {
    playlist?: Playlist | null;
    query?: string;
    onlyOffline?: boolean;
    onlyFavorites?: boolean;
    sourceFilter?: string;
  }
): Track[] {
  const { playlist, query = '', onlyOffline = false, onlyFavorites = false, sourceFilter = 'all' } = options;

  let list = tracks;
  if (playlist) {
    const set = new Set(playlist.trackIds);
    list = playlist.trackIds
      .map((id) => tracks.find((t) => t.id === id))
      .filter((t): t is Track => Boolean(t && set.has(t.id)));
  }

  if (onlyOffline) {
    list = list.filter((t) => Boolean(t.isOfflineCached));
  }

  if (onlyFavorites) {
    list = list.filter((t) => t.isFavorite);
  }

  if (sourceFilter !== 'all') {
    list = list.filter((t) => t.source === sourceFilter);
  }

  const trimmed = query.trim().toLowerCase();
  if (trimmed) {
    list = list.filter(
      (t) =>
        t.title.toLowerCase().includes(trimmed) ||
        t.artist.toLowerCase().includes(trimmed) ||
        (t.album && t.album.toLowerCase().includes(trimmed))
    );
  }

  return list;
}
