import { CloudProvider } from '../types/music';

export interface ResolvedCloudUrl {
  valid: boolean;
  provider: CloudProvider;
  directUrl: string;
  needsServerResolve: boolean;
  error?: string;
}

export interface StreamingLinkInfo {
  valid: boolean;
  provider: 'spotify' | 'soundcloud' | null;
  url: string;
  kind: 'track' | 'playlist' | 'unknown';
  error?: string;
}

/**
 * Validates and normalizes cloud storage URLs (Google Drive, Dropbox, Yandex Disk, or direct MP3/WAV/OGG/FLAC/M4A links).
 */
export function resolveCloudInput(rawUrl: string): ResolvedCloudUrl {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return {
      valid: false,
      provider: CloudProvider.DIRECT_URL,
      directUrl: '',
      needsServerResolve: false,
      error: 'Введите корректную ссылку на аудиофайл в облачном хранилище.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      provider: CloudProvider.DIRECT_URL,
      directUrl: '',
      needsServerResolve: false,
      error: 'Некорректный формат URL. Ссылка должна начинаться с https:// или http://',
    };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      valid: false,
      provider: CloudProvider.DIRECT_URL,
      directUrl: '',
      needsServerResolve: false,
      error: 'Поддерживаются только протоколы HTTP и HTTPS.',
    };
  }

  const host = parsed.hostname.toLowerCase();

  // Google Drive shared file URL: https://drive.google.com/file/d/<ID>/view... or ?id=<ID>
  if (host.includes('drive.google.com') || host.includes('docs.google.com')) {
    const fileMatch = parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    const idParam = parsed.searchParams.get('id');
    const fileId = fileMatch?.[1] || idParam;
    if (!fileId) {
      return {
        valid: false,
        provider: CloudProvider.GOOGLE_DRIVE,
        directUrl: '',
        needsServerResolve: false,
        error: 'Не удалось извлечь ID файла из ссылки Google Drive. Откройте доступ к файлу по ссылке.',
      };
    }
    return {
      valid: true,
      provider: CloudProvider.GOOGLE_DRIVE,
      directUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
      needsServerResolve: false,
    };
  }

  // Dropbox shared link: convert www.dropbox.com -> dl.dropboxusercontent.com
  if (host.includes('dropbox.com') || host.includes('dropboxusercontent.com')) {
    const direct = new URL(trimmed);
    direct.hostname = 'dl.dropboxusercontent.com';
    direct.searchParams.delete('dl');
    direct.searchParams.set('raw', '1');
    return {
      valid: true,
      provider: CloudProvider.DROPBOX,
      directUrl: direct.toString(),
      needsServerResolve: false,
    };
  }

  // Yandex Disk public link: disk.yandex.ru / yadi.sk
  if (host.includes('disk.yandex.') || host === 'yadi.sk') {
    return {
      valid: true,
      provider: CloudProvider.YANDEX_DISK,
      directUrl: trimmed,
      needsServerResolve: true,
    };
  }

  // Generic S3 / WebDAV / Direct audio link
  return {
    valid: true,
    provider: CloudProvider.DIRECT_URL,
    directUrl: trimmed,
    needsServerResolve: false,
  };
}

/**
 * Validates and detects Spotify or SoundCloud track/playlist/shortened URLs.
 * Also extracts the URL cleanly if pasted from mobile share text.
 */
export function parseStreamingUrl(rawInput: string): StreamingLinkInfo {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      valid: false,
      provider: null,
      url: '',
      kind: 'unknown',
      error: 'Вставьте ссылку на плейлист или трек из Spotify или SoundCloud.',
    };
  }

  const urlMatch = trimmed.match(/https?:\/\/[^\s<>"']+/i);
  const candidate = urlMatch ? urlMatch[0] : trimmed;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return {
      valid: false,
      provider: null,
      url: '',
      kind: 'unknown',
      error:
        'Некорректный адрес ссылки. Пример: https://open.spotify.com/playlist/... или https://soundcloud.com/.../sets/...',
    };
  }

  const host = parsed.hostname.toLowerCase();

  if (host.includes('spotify.com') || host === 'spotify.link' || host === 'spoti.fi') {
    const isShort = host === 'spotify.link' || host === 'spoti.fi';
    const isPlaylist =
      parsed.pathname.includes('/playlist/') || parsed.pathname.includes('/album/');
    return {
      valid: true,
      provider: 'spotify',
      url: candidate,
      kind: isShort ? 'unknown' : isPlaylist ? 'playlist' : 'track',
    };
  }

  if (
    host.includes('soundcloud.com') ||
    host === 'snd.sc' ||
    host === 'soundcloud.app.goo.gl'
  ) {
    const isShort =
      host === 'on.soundcloud.com' ||
      host === 'snd.sc' ||
      host === 'soundcloud.app.goo.gl';
    const isPlaylist = parsed.pathname.includes('/sets/');
    return {
      valid: true,
      provider: 'soundcloud',
      url: candidate,
      kind: isShort ? 'unknown' : isPlaylist ? 'playlist' : 'track',
    };
  }

  return {
    valid: false,
    provider: null,
    url: '',
    kind: 'unknown',
    error: 'Поддерживаются ссылки Spotify (open.spotify.com, spotify.link) и SoundCloud (soundcloud.com, on.soundcloud.com).',
  };
}

/**
 * Extracts Spotify entity type and ID from open.spotify.com URLs (supports /intl-xx/ prefixes).
 */
export function extractSpotifyEntityFromUrl(
  rawUrl: string
): { kind: 'track' | 'playlist' | 'album'; id: string } | null {
  try {
    const parsed = new URL(rawUrl.trim());
    if (!parsed.hostname.toLowerCase().includes('spotify.com')) return null;
    const match = parsed.pathname.match(/\/(track|playlist|album)\/([a-zA-Z0-9]+)/);
    if (!match) return null;
    const kind = match[1] as 'track' | 'playlist' | 'album';
    return { kind, id: match[2] };
  } catch {
    return null;
  }
}
