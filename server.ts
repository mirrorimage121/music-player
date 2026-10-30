import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

interface TokenRecord {
  spotify?: string;
  soundcloud?: string;
  dropbox?: string;
}

const sessionStore = new Map<string, TokenRecord>();

function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = decodeURIComponent(part.slice(idx + 1).trim());
      out[k] = v;
    }
  }
  return out;
}

function getOrCreateSessionId(req: Request, res: Response): string {
  const cookies = parseCookies(req.headers.cookie);
  let sid = cookies['pulse_sid'];
  if (!sid) {
    sid = crypto.randomBytes(16).toString('hex');
    const isHttps =
      (process.env.APP_URL && process.env.APP_URL.startsWith('https://')) ||
      req.secure ||
      req.headers['x-forwarded-proto'] === 'https';
    const cookieFlags = isHttps
      ? 'Path=/; HttpOnly; SameSite=None; Secure; Max-Age=604800'
      : 'Path=/; HttpOnly; SameSite=Lax; Max-Age=604800';
    res.setHeader('Set-Cookie', `pulse_sid=${encodeURIComponent(sid)}; ${cookieFlags}`);
  }
  if (!sessionStore.has(sid)) {
    sessionStore.set(sid, {});
  }
  return sid;
}

function getBaseAppUrl(req: Request): string {
  const envUrl = process.env.APP_URL;
  if (envUrl && envUrl !== 'MY_APP_URL' && envUrl.startsWith('http')) {
    return envUrl.replace(/\/+$/, '');
  }
  const originParam = typeof req.query.origin === 'string' ? req.query.origin : '';
  if (originParam && originParam.startsWith('http')) {
    return originParam.replace(/\/+$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function isSafeExternalUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    if (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '0.0.0.0' ||
      h === '::1' ||
      h.startsWith('169.254.') ||
      h.startsWith('10.') ||
      h.startsWith('192.168.')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // --- 1. OAuth Status & Popup URL Endpoints ---
  app.get('/api/auth/status', (req: Request, res: Response) => {
    const sid = getOrCreateSessionId(req, res);
    const tokens = sessionStore.get(sid) || {};
    const baseUrl = getBaseAppUrl(req);
    res.json({
      spotifyConnected: Boolean(tokens.spotify),
      soundcloudConnected: Boolean(tokens.soundcloud),
      dropboxConnected: Boolean(tokens.dropbox),
      spotifyConfigured: Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
      soundcloudConfigured: Boolean(process.env.SOUNDCLOUD_CLIENT_ID && process.env.SOUNDCLOUD_CLIENT_SECRET),
      dropboxConfigured: Boolean(process.env.DROPBOX_CLIENT_ID && process.env.DROPBOX_CLIENT_SECRET),
      callbackUrl: `${baseUrl}/auth/callback`,
    });
  });

  app.get('/api/auth/:provider/url', (req: Request, res: Response) => {
    const provider = String(req.params.provider || '').toLowerCase();
    const baseUrl = getBaseAppUrl(req);
    const redirectUri = `${baseUrl}/auth/callback`;

    if (provider === 'spotify') {
      const clientId = process.env.SPOTIFY_CLIENT_ID;
      if (!clientId) {
        res.json({
          configured: false,
          callbackUrl: redirectUri,
          message:
            'Для прямой OAuth-авторизации Spotify добавьте SPOTIFY_CLIENT_ID и SPOTIFY_CLIENT_SECRET в переменные окружения. Вы также можете синхронизировать треки и плейлисты по прямой ссылке ниже без ключей.',
        });
        return;
      }
      const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: 'user-library-read playlist-read-private',
        state: 'spotify',
      });
      res.json({ configured: true, url: `https://accounts.spotify.com/authorize?${params.toString()}` });
      return;
    }

    if (provider === 'soundcloud') {
      const clientId = process.env.SOUNDCLOUD_CLIENT_ID;
      if (!clientId) {
        res.json({
          configured: false,
          callbackUrl: redirectUri,
          message:
            'Для OAuth-входа SoundCloud задайте SOUNDCLOUD_CLIENT_ID и SOUNDCLOUD_CLIENT_SECRET. Публичные треки и сеты SoundCloud можно импортировать мгновенно по ссылке ниже.',
        });
        return;
      }
      const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        state: 'soundcloud',
      });
      res.json({ configured: true, url: `https://secure.soundcloud.com/authorize?${params.toString()}` });
      return;
    }

    if (provider === 'dropbox') {
      const clientId = process.env.DROPBOX_CLIENT_ID;
      if (!clientId) {
        res.json({
          configured: false,
          callbackUrl: redirectUri,
          message:
            'Для подключения аккаунта Dropbox задайте DROPBOX_CLIENT_ID и DROPBOX_CLIENT_SECRET, либо вставьте публичную ссылку Dropbox на аудиофайл.',
        });
        return;
      }
      const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        state: 'dropbox',
      });
      res.json({ configured: true, url: `https://www.dropbox.com/oauth2/authorize?${params.toString()}` });
      return;
    }

    res.status(400).json({ error: 'Неизвестный провайдер OAuth' });
  });

  const oauthCallbackHandler = async (req: Request, res: Response) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const provider = typeof req.query.state === 'string' ? req.query.state : 'spotify';
    const sid = getOrCreateSessionId(req, res);
    const tokens = sessionStore.get(sid) || {};
    const redirectUri = `${getBaseAppUrl(req)}/auth/callback`;

    try {
      if (code && provider === 'spotify' && process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
        const basic = Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ).toString('base64');
        const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${basic}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
          }),
        });
        if (tokenRes.ok) {
          const data = (await tokenRes.json()) as { access_token?: string };
          if (data.access_token) tokens.spotify = data.access_token;
        }
      } else if (
        code &&
        provider === 'soundcloud' &&
        process.env.SOUNDCLOUD_CLIENT_ID &&
        process.env.SOUNDCLOUD_CLIENT_SECRET
      ) {
        const tokenRes = await fetch('https://secure.soundcloud.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: process.env.SOUNDCLOUD_CLIENT_ID,
            client_secret: process.env.SOUNDCLOUD_CLIENT_SECRET,
            redirect_uri: redirectUri,
            code,
          }),
        });
        if (tokenRes.ok) {
          const data = (await tokenRes.json()) as { access_token?: string };
          if (data.access_token) tokens.soundcloud = data.access_token;
        }
      } else if (
        code &&
        provider === 'dropbox' &&
        process.env.DROPBOX_CLIENT_ID &&
        process.env.DROPBOX_CLIENT_SECRET
      ) {
        const tokenRes = await fetch('https://api.dropboxapi.com/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: process.env.DROPBOX_CLIENT_ID,
            client_secret: process.env.DROPBOX_CLIENT_SECRET,
            redirect_uri: redirectUri,
            code,
          }),
        });
        if (tokenRes.ok) {
          const data = (await tokenRes.json()) as { access_token?: string };
          if (data.access_token) tokens.dropbox = data.access_token;
        }
      }
      sessionStore.set(sid, tokens);
    } catch (err) {
      console.error('OAuth callback exchange error:', err);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="ru">
  <body style="background:#09090d;color:#f4f4f6;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
    <script>
      if (window.opener) {
        window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: ${JSON.stringify(provider)} }, '*');
        window.close();
      } else {
        window.location.href = '/';
      }
    </script>
    <p>Авторизация успешна. Окно закроется автоматически...</p>
  </body>
</html>`);
  };

  app.get(['/auth/callback', '/auth/callback/'], oauthCallbackHandler);

  // --- 2. Authenticated Spotify & SoundCloud Library Sync ---
  app.get('/api/spotify/library', async (req: Request, res: Response) => {
    const sid = getOrCreateSessionId(req, res);
    const token = sessionStore.get(sid)?.spotify;
    if (!token) {
      res.status(401).json({ error: 'Аккаунт Spotify не подключён' });
      return;
    }
    try {
      const spRes = await fetch('https://api.spotify.com/v1/me/tracks?limit=15', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!spRes.ok) {
        res.status(spRes.status).json({ error: 'Ошибка чтения медиатеки Spotify' });
        return;
      }
      const data = (await spRes.json()) as {
        items?: Array<{
          track?: {
            id: string;
            name: string;
            duration_ms: number;
            preview_url: string | null;
            explicit?: boolean;
            external_urls?: { spotify?: string };
            artists?: Array<{ name: string }>;
            album?: { name?: string; images?: Array<{ url: string }> };
          };
        }>;
      };
      const tracks = (data.items || [])
        .map((item) => item.track)
        .filter(Boolean)
        .map((t) => ({
          id: `sp-${t!.id}`,
          title: t!.name,
          artist: (t!.artists || []).map((a) => a.name).join(', ') || 'Spotify Artist',
          album: t!.album?.name || 'Spotify',
          duration: Math.round((t!.duration_ms || 30000) / 1000),
          audioUrl: t!.preview_url
            ? `/api/cloud/proxy?url=${encodeURIComponent(t!.preview_url)}`
            : '/audio/track-2.wav',
          coverUrl: t!.album?.images?.[0]?.url || '/covers/cover-2.svg',
          explicit: Boolean(t!.explicit),
          externalUrl: t!.external_urls?.spotify,
          source: 'spotify',
        }));
      res.json({ tracks });
    } catch {
      res.status(500).json({ error: 'Не удалось синхронизировать треки Spotify' });
    }
  });

  app.get('/api/soundcloud/library', async (req: Request, res: Response) => {
    const sid = getOrCreateSessionId(req, res);
    const token = sessionStore.get(sid)?.soundcloud;
    if (!token) {
      res.status(401).json({ error: 'Аккаунт SoundCloud не подключён' });
      return;
    }
    try {
      const scRes = await fetch('https://api.soundcloud.com/me/likes/tracks?limit=15', {
        headers: { Authorization: `OAuth ${token}` },
      });
      if (!scRes.ok) {
        res.status(scRes.status).json({ error: 'Ошибка чтения треков SoundCloud' });
        return;
      }
      const data = (await scRes.json()) as Array<{
        id: number;
        title: string;
        duration: number;
        artwork_url?: string;
        permalink_url?: string;
        user?: { username?: string };
      }>;
      const tracks = (Array.isArray(data) ? data : []).map((t) => ({
        id: `sc-${t.id}`,
        title: t.title,
        artist: t.user?.username || 'SoundCloud Artist',
        duration: Math.max(20, Math.round((t.duration || 25000) / 1000)),
        audioUrl: '/audio/track-3.wav',
        coverUrl: t.artwork_url ? t.artwork_url.replace('-large', '-t500x500') : '/covers/cover-3.svg',
        externalUrl: t.permalink_url,
        source: 'soundcloud',
      }));
      res.json({ tracks });
    } catch {
      res.status(500).json({ error: 'Не удалось синхронизировать SoundCloud' });
    }
  });

  // --- Full-Length Public Audio Engine (SoundCloud api-v2 + Audius) ---
  const BROWSER_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

  let cachedScClientId = '';
  let cachedScClientIdAt = 0;

  async function getSoundCloudPublicClientId(forceRefresh = false): Promise<string> {
    if (process.env.SOUNDCLOUD_CLIENT_ID) {
      return process.env.SOUNDCLOUD_CLIENT_ID;
    }
    const now = Date.now();
    if (!forceRefresh && cachedScClientId && now - cachedScClientIdAt < 2 * 60 * 60 * 1000) {
      return cachedScClientId;
    }
    try {
      const homeRes = await fetch('https://soundcloud.com', {
        headers: { 'User-Agent': BROWSER_UA },
      });
      if (!homeRes.ok) return cachedScClientId;
      const html = await homeRes.text();
      const scriptMatches = [
        ...html.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g),
      ].map((m) => m[1]);

      for (const scriptUrl of scriptMatches.slice(-4).reverse()) {
        const jsRes = await fetch(scriptUrl, { headers: { 'User-Agent': BROWSER_UA } });
        if (!jsRes.ok) continue;
        const jsText = await jsRes.text();
        const cidMatch = jsText.match(/client_id\s*:\s*"([a-zA-Z0-9]{32})"/);
        if (cidMatch?.[1]) {
          cachedScClientId = cidMatch[1];
          cachedScClientIdAt = now;
          return cachedScClientId;
        }
      }
    } catch {
      // Return previous cached value if any
    }
    return cachedScClientId;
  }

  interface ScTranscoding {
    url?: string;
    preset?: string;
    duration?: number;
    snipped?: boolean;
    format?: {
      protocol?: string;
      mime_type?: string;
    };
  }

  interface ScTrackItem {
    id?: number;
    kind?: string;
    title?: string;
    bpm?: number | null;
    genre?: string | null;
    duration?: number;
    full_duration?: number;
    artwork_url?: string | null;
    permalink_url?: string;
    publisher_metadata?: { artist?: string; album_title?: string; explicit?: boolean };
    user?: { username?: string; avatar_url?: string | null };
    media?: { transcodings?: ScTranscoding[] };
    tracks?: ScTrackItem[];
  }

  function estimateTrackBpm(track: ScTrackItem, fallbackSeed = 120): number {
    if (typeof track.bpm === 'number' && track.bpm >= 50 && track.bpm <= 210) {
      return Math.round(track.bpm);
    }
    const text = `${track.title || ''} ${track.genre || ''}`.toLowerCase();
    if (text.includes('hardstyle') || text.includes('hardcore')) return 155;
    if (text.includes('dnb') || text.includes('drum & bass') || text.includes('jungle')) return 172;
    if (text.includes('phonk') || text.includes('drift')) return 138;
    if (text.includes('speed up') || text.includes('sped up') || text.includes('nightcore')) return 148;
    if (text.includes('slowed') || text.includes('reverb') || text.includes('lofi')) return 86;
    if (text.includes('techno') || text.includes('trance')) return 134;
    if (text.includes('house') || text.includes('dance') || text.includes('club')) return 126;
    const idNum = track.id || fallbackSeed;
    return 96 + (idNum % 37);
  }

  /**
   * Strips individual segment 'sidx' boxes from concatenated fMP4 as a pure-Node fallback
   * so browsers don't mistake the first 2-10s segment sidx for the entire track duration.
   */
  function stripFragmentSidxBoxes(buf: Buffer): Buffer {
    const kept: Buffer[] = [];
    let offset = 0;
    while (offset + 8 <= buf.length) {
      const boxSize = buf.readUInt32BE(offset);
      const boxType = buf.subarray(offset + 4, offset + 8).toString('ascii');
      if (boxSize < 8 || offset + boxSize > buf.length) {
        kept.push(buf.subarray(offset));
        break;
      }
      if (boxType !== 'sidx') {
        kept.push(buf.subarray(offset, offset + boxSize));
      }
      offset += boxSize;
    }
    return kept.length > 0 ? Buffer.concat(kept) : buf;
  }

  /**
   * Losslessly remuxes fragmented MP4 segments into a standard +faststart M4A with full moov duration table.
   */
  async function remuxFmp4ToFaststartM4a(raw: Buffer): Promise<Buffer> {
    const uid = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const inPath = path.join(os.tmpdir(), `pulse_in_${uid}.mp4`);
    const outPath = path.join(os.tmpdir(), `pulse_out_${uid}.m4a`);
    try {
      await fs.writeFile(inPath, raw);
      await new Promise<void>((resolve, reject) => {
        execFile(
          'ffmpeg',
          ['-y', '-i', inPath, '-c', 'copy', '-movflags', '+faststart', outPath],
          { timeout: 8000 },
          (err) => (err ? reject(err) : resolve())
        );
      });
      const remuxed = await fs.readFile(outPath);
      if (remuxed.length > 1024) {
        return remuxed;
      }
      return stripFragmentSidxBoxes(raw);
    } catch {
      return stripFragmentSidxBoxes(raw);
    } finally {
      await fs.unlink(inPath).catch(() => {});
      await fs.unlink(outPath).catch(() => {});
    }
  }

  function pickUnencryptedFullTranscoding(
    track: ScTrackItem,
    allowSnipped = false
  ): ScTranscoding | null {
    const list = track.media?.transcodings || [];
    const candidates = list.filter((tr) => {
      const proto = tr.format?.protocol || '';
      const mime = tr.format?.mime_type || '';
      if (!allowSnipped && tr.snipped) return false;
      if (proto.includes('encrypted')) return false;
      return mime === 'audio/mpeg' || mime.startsWith('audio/mp4');
    });
    if (candidates.length === 0) return null;
    return (
      candidates.find((c) => c.format?.protocol === 'progressive') ||
      candidates.find((c) => c.format?.mime_type === 'audio/mpeg') ||
      candidates.find((c) => c.preset === 'aac_160k') ||
      candidates[0]
    );
  }

  function parseCleanArtistAndTitle(track: ScTrackItem): { title: string; artist: string } {
    const rawTitle = (track.title || 'Трек').trim();
    const pubArtist = track.publisher_metadata?.artist?.trim();
    const uploader = track.user?.username?.trim() || 'Исполнитель';

    const sepMatch = rawTitle.match(/^(.+?)\s+(?:[-–—])\s+(.+)$/);
    if (sepMatch) {
      return {
        artist: pubArtist || sepMatch[1].trim(),
        title: sepMatch[2].trim(),
      };
    }
    return {
      artist: pubArtist || uploader,
      title: rawTitle,
    };
  }

  interface CachedAudioBuffer {
    buffer: Buffer;
    contentType: string;
    createdAt: number;
  }

  const scStreamCache = new Map<string, CachedAudioBuffer>();
  const scInFlight = new Map<string, Promise<CachedAudioBuffer>>();

  async function assembleSoundCloudFullTrack(
    trackId: string,
    allowSnipped = false
  ): Promise<CachedAudioBuffer> {
    const cacheKey = allowSnipped ? `${trackId}:any` : trackId;
    const cached = scStreamCache.get(cacheKey) || scStreamCache.get(trackId);
    if (cached && Date.now() - cached.createdAt < 30 * 60 * 1000) {
      return cached;
    }
    const existingPromise = scInFlight.get(cacheKey);
    if (existingPromise) return existingPromise;

    const promise = (async (): Promise<CachedAudioBuffer> => {
      let cid = await getSoundCloudPublicClientId(false);
      if (!cid) throw new Error('SC client_id unavailable');

      let trackRes = await fetch(
        `https://api-v2.soundcloud.com/tracks/${encodeURIComponent(trackId)}?client_id=${cid}`,
        { headers: { 'User-Agent': BROWSER_UA } }
      );
      if (trackRes.status === 401 || trackRes.status === 403) {
        cid = await getSoundCloudPublicClientId(true);
        trackRes = await fetch(
          `https://api-v2.soundcloud.com/tracks/${encodeURIComponent(trackId)}?client_id=${cid}`,
          { headers: { 'User-Agent': BROWSER_UA } }
        );
      }
      if (!trackRes.ok) {
        throw new Error(`SC track lookup status ${trackRes.status}`);
      }

      const track = (await trackRes.json()) as ScTrackItem;
      const transcoding =
        pickUnencryptedFullTranscoding(track, false) ||
        (allowSnipped ? pickUnencryptedFullTranscoding(track, true) : null);
      if (!transcoding?.url) {
        throw new Error('No unencrypted full transcoding available');
      }

      const sep = transcoding.url.includes('?') ? '&' : '?';
      const streamInfoRes = await fetch(`${transcoding.url}${sep}client_id=${cid}`, {
        headers: { 'User-Agent': BROWSER_UA },
      });
      if (!streamInfoRes.ok) {
        throw new Error(`SC transcoding info status ${streamInfoRes.status}`);
      }
      const streamInfo = (await streamInfoRes.json()) as { url?: string };
      if (!streamInfo.url) {
        throw new Error('Empty SC stream URL');
      }

      const isMp3 = transcoding.format?.mime_type === 'audio/mpeg';
      const contentType = isMp3 ? 'audio/mpeg' : 'audio/mp4';

      let fullBuffer: Buffer;
      if (transcoding.format?.protocol === 'progressive') {
        const progRes = await fetch(streamInfo.url, { headers: { 'User-Agent': BROWSER_UA } });
        if (!progRes.ok) throw new Error('Progressive fetch failed');
        fullBuffer = Buffer.from(await progRes.arrayBuffer());
      } else {
        const m3u8Res = await fetch(streamInfo.url, { headers: { 'User-Agent': BROWSER_UA } });
        if (!m3u8Res.ok) throw new Error('M3U8 fetch failed');
        const m3u8Text = await m3u8Res.text();

        const segmentUrls: string[] = [];
        for (const rawLine of m3u8Text.split('\n')) {
          const line = rawLine.trim();
          const mapMatch = line.match(/#EXT-X-MAP:URI="([^"]+)"/);
          if (mapMatch?.[1]) {
            segmentUrls.push(mapMatch[1]);
          } else if (line.startsWith('http://') || line.startsWith('https://')) {
            segmentUrls.push(line);
          }
        }

        if (segmentUrls.length === 0) {
          throw new Error('No media segments in M3U8');
        }

        const chunks: Buffer[] = new Array(segmentUrls.length);
        const concurrency = 8;
        for (let i = 0; i < segmentUrls.length; i += concurrency) {
          const batch = segmentUrls.slice(i, i + concurrency);
          const downloaded = await Promise.all(
            batch.map(async (segUrl) => {
              const segRes = await fetch(segUrl, { headers: { 'User-Agent': BROWSER_UA } });
              if (!segRes.ok) throw new Error(`Segment HTTP ${segRes.status}`);
              return Buffer.from(await segRes.arrayBuffer());
            })
          );
          for (let j = 0; j < downloaded.length; j++) {
            chunks[i + j] = downloaded[j];
          }
        }
        const rawConcat = Buffer.concat(chunks);
        fullBuffer = isMp3 ? rawConcat : await remuxFmp4ToFaststartM4a(rawConcat);
      }

      const entry: CachedAudioBuffer = {
        buffer: fullBuffer,
        contentType,
        createdAt: Date.now(),
      };

      if (scStreamCache.size >= 10) {
        const oldestKey = scStreamCache.keys().next().value;
        if (oldestKey) scStreamCache.delete(oldestKey);
      }
      scStreamCache.set(cacheKey, entry);
      return entry;
    })();

    scInFlight.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      scInFlight.delete(cacheKey);
    }
  }

  function sendByteRangeBuffer(
    req: Request,
    res: Response,
    buffer: Buffer,
    contentType: string
  ): void {
    const total = buffer.length;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=60');

    const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : '';
    if (rangeHeader && rangeHeader.startsWith('bytes=')) {
      const [startStr, endStr] = rangeHeader.replace('bytes=', '').split('-');
      const start = Math.max(0, parseInt(startStr, 10) || 0);
      const end = endStr ? Math.min(total - 1, parseInt(endStr, 10)) : total - 1;

      if (start >= total || start > end) {
        res.status(416);
        res.setHeader('Content-Range', `bytes */${total}`);
        res.end();
        return;
      }

      const slice = buffer.subarray(start, end + 1);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', String(slice.length));
      res.send(slice);
      return;
    }

    res.status(200);
    res.setHeader('Content-Length', String(total));
    res.send(buffer);
  }

  // Serves full-length SoundCloud stream with HTTP 206 Range support for instant seeking, EQ & Offline Cache
  app.get('/api/stream/sc-full', async (req: Request, res: Response) => {
    const trackId = typeof req.query.trackId === 'string' ? req.query.trackId.trim() : '';
    if (!trackId || !/^\d+$/.test(trackId)) {
      res.status(400).json({ error: 'Некорректный идентификатор аудиопотока' });
      return;
    }

    try {
      const { buffer, contentType } = await assembleSoundCloudFullTrack(trackId);
      sendByteRangeBuffer(req, res, buffer, contentType);
    } catch {
      res.status(502).json({ error: 'Не удалось загрузить полный аудиопоток трека.' });
    }
  });

  // Helper: Find a full-length (>45s) stream for any "Artist Title" query via SoundCloud api-v2 or Audius
  async function findFullLengthStreamForQuery(
    queryText: string
  ): Promise<{ audioUrl: string; duration: number; bpm: number; coverUrl?: string } | null> {
    const cleaned = queryText.trim();
    if (!cleaned) return null;

    // 1. Try SoundCloud full unencrypted tracks
    try {
      const cid = await getSoundCloudPublicClientId(false);
      if (cid) {
        const scRes = await fetch(
          `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(cleaned)}&client_id=${cid}&limit=25`,
          { headers: { 'User-Agent': BROWSER_UA } }
        );
        if (scRes.ok) {
          const scData = (await scRes.json()) as { collection?: ScTrackItem[] };
          const best = (scData.collection || []).find(
            (t) =>
              t.id &&
              (t.duration || 0) > 45000 &&
              Boolean(pickUnencryptedFullTranscoding(t))
          );
          if (best?.id) {
            return {
              audioUrl: `/api/stream/sc-full?trackId=${best.id}&v=2`,
              duration: Math.round((best.duration || 180000) / 1000),
              bpm: estimateTrackBpm(best),
              coverUrl: best.artwork_url
                ? best.artwork_url.replace('-large', '-t500x500')
                : undefined,
            };
          }
        }
      }
    } catch {
      // Fall through to Audius
    }

    // 2. Try Audius public full-length MP3 stream
    try {
      const auRes = await fetch(
        `https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(cleaned)}&app_name=PulseOS`
      );
      if (auRes.ok) {
        const auData = (await auRes.json()) as {
          data?: Array<{
            id?: string;
            duration?: number;
            artwork?: { '480x480'?: string };
          }>;
        };
        const hit = (auData.data || []).find((d) => d.id && (d.duration || 0) > 45);
        if (hit?.id) {
          const streamTarget = `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(hit.id)}/stream?app_name=PulseOS`;
          return {
            audioUrl: `/api/cloud/proxy?url=${encodeURIComponent(streamTarget)}`,
            duration: Math.round(hit.duration || 180),
            bpm: 122,
            coverUrl: hit.artwork?.['480x480'],
          };
        }
      }
    } catch {
      // Ignore network errors
    }

    return null;
  }

  // On-demand full-length stream resolver for imported Spotify / SoundCloud playlist tracks
  const queryStreamCache = new Map<
    string,
    { kind: 'sc'; trackId: string } | { kind: 'direct'; url: string }
  >();

  app.get('/api/stream/by-query', async (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const fallbackUrl =
      typeof req.query.fallback === 'string' ? req.query.fallback.trim() : '';
    const fallbackTrackId =
      typeof req.query.fallbackTrackId === 'string' ? req.query.fallbackTrackId.trim() : '';

    if (!q && !fallbackUrl && !fallbackTrackId) {
      res.status(400).json({ error: 'Не указан поисковый запрос для аудиопотока' });
      return;
    }

    try {
      let resolved = q ? queryStreamCache.get(q.toLowerCase()) : undefined;

      if (!resolved && q) {
        const cid = await getSoundCloudPublicClientId(false);
        if (cid) {
          const scRes = await fetch(
            `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${cid}&limit=20`,
            { headers: { 'User-Agent': BROWSER_UA } }
          );
          if (scRes.ok) {
            const scData = (await scRes.json()) as { collection?: ScTrackItem[] };
            const best = (scData.collection || []).find(
              (t) =>
                t.id &&
                (t.duration || 0) > 45000 &&
                Boolean(pickUnencryptedFullTranscoding(t))
            );
            if (best?.id) {
              resolved = { kind: 'sc', trackId: String(best.id) };
            }
          }
        }

        if (!resolved) {
          try {
            const auRes = await fetch(
              `https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(q)}&app_name=PulseOS`
            );
            if (auRes.ok) {
              const auData = (await auRes.json()) as {
                data?: Array<{ id?: string; duration?: number }>;
              };
              const hit = (auData.data || []).find((d) => d.id && (d.duration || 0) > 45);
              if (hit?.id) {
                resolved = {
                  kind: 'direct',
                  url: `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(hit.id)}/stream?app_name=PulseOS`,
                };
              }
            }
          } catch {
            // Ignore Audius fallback error
          }
        }

        if (resolved) {
          if (queryStreamCache.size >= 300) {
            const firstKey = queryStreamCache.keys().next().value;
            if (firstKey) queryStreamCache.delete(firstKey);
          }
          queryStreamCache.set(q.toLowerCase(), resolved);
        }
      }

      if (resolved?.kind === 'sc') {
        const { buffer, contentType } = await assembleSoundCloudFullTrack(resolved.trackId);
        sendByteRangeBuffer(req, res, buffer, contentType);
        return;
      }

      if (fallbackTrackId && /^\d+$/.test(fallbackTrackId)) {
        try {
          const { buffer, contentType } = await assembleSoundCloudFullTrack(
            fallbackTrackId,
            true
          );
          sendByteRangeBuffer(req, res, buffer, contentType);
          return;
        } catch {
          // Fall through to URL fallback
        }
      }

      const directTarget =
        resolved?.kind === 'direct'
          ? resolved.url
          : fallbackUrl && isSafeExternalUrl(fallbackUrl)
            ? fallbackUrl
            : '';

      if (directTarget) {
        const headers: Record<string, string> = { 'User-Agent': BROWSER_UA };
        if (typeof req.headers.range === 'string') {
          headers['Range'] = req.headers.range;
        }
        const upstream = await fetch(directTarget, { headers, redirect: 'follow' });
        if (upstream.ok || upstream.status === 206) {
          res.status(upstream.status);
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader(
            'Content-Type',
            upstream.headers.get('content-type') || 'audio/mpeg'
          );
          const cl = upstream.headers.get('content-length');
          if (cl) res.setHeader('Content-Length', cl);
          const cr = upstream.headers.get('content-range');
          if (cr) res.setHeader('Content-Range', cr);
          const ar = upstream.headers.get('accept-ranges');
          if (ar) res.setHeader('Accept-Ranges', ar);
          res.send(Buffer.from(await upstream.arrayBuffer()));
          return;
        }
      }

      res.redirect('/audio/track-2.wav');
    } catch {
      res.status(502).json({ error: 'Не удалось загрузить поток трека из плейлиста.' });
    }
  });

  // --- Multi-Tier Automatic Lyrics Engine (LRCLIB + Genius.com / Google Search + Web Lyrics) ---
  interface AutoLyricsResult {
    found: boolean;
    syncedLyrics: string;
    plainLyrics: string;
    source: string;
    cachedAt: number;
  }

  const autoLyricsCache = new Map<string, AutoLyricsResult>();
  let geminiLyricsClient: GoogleGenAI | null = null;
  let geminiRateLimitedUntil = 0;

  function getGeminiLyricsClient(): GoogleGenAI | null {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === 'MY_GEMINI_API_KEY') return null;
    if (!geminiLyricsClient) {
      geminiLyricsClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
    return geminiLyricsClient;
  }

  function decodeHtmlEntities(input: string): string {
    return input
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(parseInt(code, 10)));
  }

  function sanitizePlainLyricsText(raw: string): string {
    const lines = decodeHtmlEntities(raw)
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter((l) => {
        if (!l) return false;
        if (/^\[(?:куплет|припев|интро|аутро|бридж|проигрыш|переход|chorus|verse|intro|outro|bridge|hook|pre-chorus|part|часть)[^\]]*\]$/i.test(l)) {
          return false;
        }
        if (/^(?:куплет|припев|вступление|проигрыш|кода|бридж|intro|outro|chorus|verse)[:.\s0-9xх()-]*$/i.test(l)) {
          return false;
        }
        if (/^(?:paroles de la chanson|текст песни|слова песни)/i.test(l)) {
          return false;
        }
        return true;
      });
    return lines.join('\n').trim();
  }

  function buildLyricsQueryCandidates(
    rawTitle: string,
    rawArtist: string
  ): {
    cleanTitle: string;
    cleanArtist: string;
    artists: string[];
    queries: string[];
  } {
    const stripNoise = (val: string) =>
      val
        .replace(/["'«»„“”]/g, ' ')
        .replace(/\.(mp3|wav|flac|m4a|ogg)$/i, '')
        .replace(/#\S+/g, ' ')
        .replace(/@\S+/g, ' ')
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(
          /\((?:[^)]*(?:prod|slowed|reverb|speed|sped|nightcore|remix|edit|mix|version|official|audio|video|clip|lyric|ost|feat|ft|live|bass|boosted)[^)]*)\)/gi,
          ' '
        )
        .replace(/\s+/g, ' ')
        .trim();

    let baseTitle = stripNoise(rawTitle);
    let baseArtist = stripNoise(rawArtist);

    // SoundCloud tracks often embed "Artist - Title" inside title while artist is uploader handle
    const dashMatch = baseTitle.match(/^(.+?)\s+(?:[-–—])\s+(.+)$/);
    if (dashMatch) {
      const left = dashMatch[1].trim();
      const right = dashMatch[2].trim();
      if (right.length >= 2) {
        if (
          !baseArtist ||
          baseArtist.toLowerCase() === 'soundcloud' ||
          baseArtist.toLowerCase() === 'spotify' ||
          !/\s/.test(baseArtist)
        ) {
          baseArtist = left;
        }
        baseTitle = right;
      }
    }

    const rawParts = baseArtist
      .split(/(?:^|\s)(?:ft\.?|feat\.?|featuring|при\s+уч\.?|уч\.?|w\/)(?=\s|$)|[,;&]|\s+(?:x|×)\s+/i)
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter((s) => s.length >= 2 && !/^(?:soundcloud|spotify|artist|исполнитель)$/i.test(s));

    const cleanArtist = rawParts.join(' ').trim() || baseArtist;
    const cleanTitle = baseTitle
      .replace(/(?:^|\s)(?:ft\.?|feat\.?|featuring|при\s+уч\.?).*$/i, '')
      .replace(/\s+/g, ' ')
      .trim() || baseTitle;

    const querySet = new Set<string>();
    const addQ = (q: string) => {
      const trimmed = q.replace(/\s+/g, ' ').trim();
      if (trimmed.length >= 2) querySet.add(trimmed);
    };

    if (cleanTitle && cleanArtist) addQ(`${cleanTitle} ${cleanArtist}`);
    for (const art of rawParts) {
      if (cleanTitle) addQ(`${cleanTitle} ${art}`);
    }
    if (cleanTitle && rawTitle !== cleanTitle) addQ(cleanTitle);

    return {
      cleanTitle: cleanTitle || rawTitle.trim(),
      cleanArtist: cleanArtist || rawArtist.trim(),
      artists: rawParts.length > 0 ? rawParts : cleanArtist ? [cleanArtist] : [],
      queries: [...querySet].slice(0, 5),
    };
  }

  async function searchWebLyricsFallback(
    cleanTitle: string,
    cleanArtist: string,
    artists: string[]
  ): Promise<{ plainLyrics: string; source: string } | null> {
    const primaryArtist = artists[0] || cleanArtist;

    // 1. Server-side Gemini 3.8 Flash with Google Search Grounding (searches genius.com & Google)
    const ai = getGeminiLyricsClient();
    if (ai && Date.now() > geminiRateLimitedUntil && cleanTitle) {
      try {
        const prompt = `Найди на genius.com или в поисковике полный оригинальный текст песни "${cleanTitle}" исполнителя "${cleanArtist || primaryArtist}". Верни ТОЛЬКО строки самого текста песни (без заголовков [Куплет], [Припев], без вступлений, комментариев и ссылок). Если текста этой песни точно не существует или это инструментал, ответь ровно словом NOT_FOUND.`;
        const resp = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
            systemInstruction:
              'Ты музыкальный архивариус текстов песен. Отвечай исключительно строками текста запрошенной песни без пояснений и без разметки Markdown.',
          },
        });
        const rawOut = (resp.text || '').trim();
        if (rawOut && !rawOut.includes('NOT_FOUND')) {
          const cleaned = sanitizePlainLyricsText(rawOut);
          const lineCount = cleaned.split('\n').filter(Boolean).length;
          if (lineCount >= 6) {
            const chunks = resp.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
            const fromGenius = chunks.some((c) =>
              (c.web?.uri || c.web?.title || '').toLowerCase().includes('genius')
            );
            return {
              plainLyrics: cleaned,
              source: fromGenius ? 'Genius.com' : 'Автопоиск',
            };
          }
        }
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        if (status === 429) {
          geminiRateLimitedUntil = Date.now() + 60_000;
        }
      }
    }

    // 2. Open Lyrics Catalog API (lyrics.ovh — fast JSON for international & Genius-indexed tracks)
    for (const art of [primaryArtist, ...artists.slice(1)].filter(Boolean)) {
      try {
        const ovhRes = await fetch(
          `https://api.lyrics.ovh/v1/${encodeURIComponent(art)}/${encodeURIComponent(cleanTitle)}`,
          {
            headers: { 'User-Agent': BROWSER_UA },
            signal: AbortSignal.timeout(3500),
          }
        );
        if (ovhRes.ok) {
          const ovhData = (await ovhRes.json()) as { lyrics?: string };
          if (ovhData.lyrics) {
            const cleaned = sanitizePlainLyricsText(ovhData.lyrics);
            if (cleaned.split('\n').length >= 6) {
              return { plainLyrics: cleaned, source: 'Genius / Каталог' };
            }
          }
        }
      } catch {
        // Continue to next web search provider
      }
    }

    // 3. Direct Russian/CIS Song Search Engine (amdm.ru — verifies exact song title match & strips chords)
    if (cleanTitle) {
      const searchTerms = [
        primaryArtist ? `${primaryArtist} ${cleanTitle}` : cleanTitle,
        artists[1] ? `${artists[1]} ${cleanTitle}` : '',
      ].filter(Boolean);

      for (const term of searchTerms) {
        try {
          const searchRes = await fetch(
            `https://amdm.ru/search/?q=${encodeURIComponent(term)}`,
            {
              headers: { 'User-Agent': BROWSER_UA },
              signal: AbortSignal.timeout(4000),
            }
          );
          if (!searchRes.ok) continue;
          const html = await searchRes.text();
          const normTitle = cleanTitle.toLowerCase();

          const anchorRegex =
            /<a[^>]+href="((?:https?:)?\/\/amdm\.ru\/akkordi\/[^/"]+\/\d+\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
          let matchedUrl = '';
          let m: RegExpExecArray | null;
          while ((m = anchorRegex.exec(html)) !== null) {
            const anchorText = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, ''))
              .toLowerCase()
              .trim();
            if (anchorText.includes(normTitle)) {
              matchedUrl = m[1].startsWith('//') ? `https:${m[1]}` : m[1];
              break;
            }
          }

          if (matchedUrl) {
            const songRes = await fetch(matchedUrl, {
              headers: { 'User-Agent': BROWSER_UA },
              signal: AbortSignal.timeout(4000),
            });
            if (songRes.ok) {
              const songHtml = await songRes.text();
              const preMatch =
                songHtml.match(/<pre[^>]*itemprop="chordsBlock"[^>]*>([\s\S]*?)<\/pre>/i) ||
                songHtml.match(/<pre[^>]*class="[^"]*field__podbor[^"]*"[^>]*>([\s\S]*?)<\/pre>/i);
              if (preMatch?.[1]) {
                const withoutChords = preMatch[1]
                  .replace(/<div[^>]*class="podbor__chord"[^>]*>[\s\S]*?<\/div>/gi, '')
                  .replace(/<span[^>]*class="podbor__chord"[^>]*>[\s\S]*?<\/span>/gi, '')
                  .replace(/<b[^>]*>[\s\S]*?<\/b>/gi, '')
                  .replace(/<[^>]+>/g, '');

                const filteredLines = decodeHtmlEntities(withoutChords)
                  .split(/\r?\n/)
                  .map((l) => l.replace(/\s+/g, ' ').trim())
                  .filter(
                    (l) =>
                      l.length > 2 &&
                      !/^(?:[A-GH][#b]?(?:m|maj|min|sus|dim|aug|add)?\d*(?:\/[A-GH][#b]?)?[\s|-]*)+$/i.test(
                        l
                      ) &&
                      !/^[A-Za-zА-Яа-яЁё0-9\s]{1,18}:$/.test(l)
                  );

                const cleaned = sanitizePlainLyricsText(filteredLines.join('\n'));
                if (cleaned.split('\n').length >= 6) {
                  return { plainLyrics: cleaned, source: 'Автопоиск текста' };
                }
              }
            }
          }
        } catch {
          // Continue to Tekstowo web search
        }
      }
    }

    // 4. Global Web Lyrics Search (tekstowo.pl — wide international + Genius-mirrored lyrics index)
    if (cleanTitle) {
      try {
        const tkQuery = primaryArtist ? `${primaryArtist} ${cleanTitle}` : cleanTitle;
        const tkSearch = await fetch(
          `https://www.tekstowo.pl/szukaj,${encodeURIComponent(tkQuery)}.html`,
          {
            headers: { 'User-Agent': BROWSER_UA },
            signal: AbortSignal.timeout(4000),
          }
        );
        if (tkSearch.ok) {
          const tkHtml = await tkSearch.text();
          const normTitle = cleanTitle.toLowerCase();
          const linkRegex = /<a[^>]+href="(\/piosenka,[^"]+\.html)"[^>]*title="([^"]*)"/gi;
          let targetPath = '';
          let lm: RegExpExecArray | null;
          while ((lm = linkRegex.exec(tkHtml)) !== null) {
            if (decodeHtmlEntities(lm[2]).toLowerCase().includes(normTitle)) {
              targetPath = lm[1];
              break;
            }
          }
          if (targetPath) {
            const pageRes = await fetch(`https://www.tekstowo.pl${targetPath}`, {
              headers: { 'User-Agent': BROWSER_UA },
              signal: AbortSignal.timeout(4000),
            });
            if (pageRes.ok) {
              const pageHtml = await pageRes.text();
              const innerMatch = pageHtml.match(
                /<div[^>]*class="inner-text"[^>]*>([\s\S]*?)<\/div>/i
              );
              if (innerMatch?.[1]) {
                const rawLines = innerMatch[1]
                  .replace(/<br\s*\/?>/gi, '\n')
                  .replace(/<[^>]+>/g, '');
                const cleaned = sanitizePlainLyricsText(rawLines);
                if (cleaned.split('\n').length >= 6) {
                  return { plainLyrics: cleaned, source: 'Genius / Автопоиск' };
                }
              }
            }
          }
        }
      } catch {
        // Ignore network errors
      }
    }

    return null;
  }

  async function lookupBestLyrics(
    rawTitle: string,
    rawArtist: string,
    allowWebFallback = true
  ): Promise<AutoLyricsResult> {
    const cacheKey = `${rawTitle.trim().toLowerCase()}::${rawArtist.trim().toLowerCase()}::${allowWebFallback ? 'full' : 'lrc'}`;
    const cached = autoLyricsCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < 60 * 60 * 1000) {
      return cached;
    }

    const { cleanTitle, cleanArtist, artists, queries } = buildLyricsQueryCandidates(
      rawTitle,
      rawArtist
    );
    const normTitle = cleanTitle.toLowerCase();
    let reservePlain = '';

    // Tier 1: LRCLIB across cleaned artist/collaborator permutations
    for (const q of queries) {
      try {
        const lrcRes = await fetch(
          `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`,
          {
            headers: { 'User-Agent': BROWSER_UA },
            signal: AbortSignal.timeout(3500),
          }
        );
        if (!lrcRes.ok) continue;
        const lrcList = (await lrcRes.json()) as Array<{
          trackName?: string;
          artistName?: string;
          syncedLyrics?: string | null;
          plainLyrics?: string | null;
        }>;
        if (!Array.isArray(lrcList) || lrcList.length === 0) continue;

        // Prefer entries matching the cleaned song title
        const titleMatched = lrcList.filter((item) => {
          const tn = (item.trackName || '').toLowerCase();
          return !normTitle || tn.includes(normTitle) || normTitle.includes(tn);
        });
        const pool = titleMatched.length > 0 ? titleMatched : lrcList;

        const syncedHit = pool.find((item) => item.syncedLyrics && item.syncedLyrics.trim());
        if (syncedHit?.syncedLyrics) {
          const resObj: AutoLyricsResult = {
            found: true,
            syncedLyrics: syncedHit.syncedLyrics,
            plainLyrics: syncedHit.plainLyrics || '',
            source: 'LRCLIB',
            cachedAt: Date.now(),
          };
          autoLyricsCache.set(cacheKey, resObj);
          return resObj;
        }

        if (!reservePlain) {
          const plainHit = pool.find((item) => item.plainLyrics && item.plainLyrics.trim());
          if (plainHit?.plainLyrics) {
            reservePlain = sanitizePlainLyricsText(plainHit.plainLyrics);
          }
        }
      } catch {
        // Try next query candidate
      }
    }

    if (reservePlain) {
      const resObj: AutoLyricsResult = {
        found: true,
        syncedLyrics: '',
        plainLyrics: reservePlain,
        source: 'LRCLIB',
        cachedAt: Date.now(),
      };
      autoLyricsCache.set(cacheKey, resObj);
      return resObj;
    }

    // Tier 2+: Genius.com / Search Engine Auto-Fallback when LRCLIB doesn't have the song
    if (allowWebFallback) {
      const webHit = await searchWebLyricsFallback(cleanTitle, cleanArtist, artists);
      if (webHit?.plainLyrics) {
        const resObj: AutoLyricsResult = {
          found: true,
          syncedLyrics: '',
          plainLyrics: webHit.plainLyrics,
          source: webHit.source,
          cachedAt: Date.now(),
        };
        autoLyricsCache.set(cacheKey, resObj);
        return resObj;
      }
    }

    const emptyRes: AutoLyricsResult = {
      found: false,
      syncedLyrics: '',
      plainLyrics: '',
      source: '',
      cachedAt: Date.now(),
    };
    autoLyricsCache.set(cacheKey, emptyRes);
    return emptyRes;
  }

  // Helper: Fetch synced LRC (or cleaned lyrics) during initial track/playlist import
  async function lookupSyncedLyrics(title: string, artist: string): Promise<string> {
    const best = await lookupBestLyrics(title, artist, false);
    return best.syncedLyrics || '';
  }

  // Helper: Parse Spotify public embed __NEXT_DATA__ (works without SPOTIFY_CLIENT_ID)
  interface SpotifyEmbedEntity {
    title?: string;
    name?: string;
    subtitle?: string;
    artists?: Array<{ name?: string }>;
    visualIdentity?: { image?: Array<{ url?: string }> };
    coverArt?: { sources?: Array<{ url?: string }> };
    audioPreview?: { url?: string };
    duration?: number;
    trackList?: Array<{
      uri?: string;
      title?: string;
      subtitle?: string;
      duration?: number;
      audioPreview?: { url?: string };
      isExplicit?: boolean;
    }>;
  }

  async function fetchSpotifyPublicEmbed(
    kind: 'track' | 'playlist' | 'album',
    id: string
  ): Promise<SpotifyEmbedEntity | null> {
    try {
      const embedRes = await fetch(`https://open.spotify.com/embed/${kind}/${id}`, {
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!embedRes.ok) return null;
      const html = await embedRes.text();
      const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (!match?.[1]) return null;
      const parsed = JSON.parse(match[1]) as {
        props?: { pageProps?: { state?: { data?: { entity?: SpotifyEmbedEntity } } } };
      };
      return parsed?.props?.pageProps?.state?.data?.entity || null;
    } catch {
      return null;
    }
  }

  // --- 3A. Zero-Key Music Catalog Search (Prioritizes FULL-LENGTH tracks 3-5+ min, NOT 30s snippets!) ---
  app.get('/api/streaming/search', async (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const provider = req.query.provider === 'soundcloud' ? 'soundcloud' : 'spotify';

    if (!q) {
      res.status(400).json({ error: 'Введите имя исполнителя или название песни.' });
      return;
    }

    try {
      const results: Array<{
        id: string;
        title: string;
        artist: string;
        album: string;
        coverUrl: string;
        audioUrl: string;
        duration: number;
        bpm: number;
        explicit: boolean;
        isFullTrack: boolean;
        source: 'spotify' | 'soundcloud';
      }> = [];

      // 1. Primary Full-Length Search via SoundCloud Public Engine (>45s unencrypted full songs)
      const cid = await getSoundCloudPublicClientId(false);
      if (cid) {
        const scRes = await fetch(
          `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${cid}&limit=35`,
          { headers: { 'User-Agent': BROWSER_UA } }
        );
        if (scRes.ok) {
          const scData = (await scRes.json()) as { collection?: ScTrackItem[] };
          for (const item of scData.collection || []) {
            if (results.length >= 10) break;
            if (!item.id || (item.duration || 0) <= 45000) continue;
            if (!pickUnencryptedFullTranscoding(item)) continue;

            const parsedMeta = parseCleanArtistAndTitle(item);
            const cover =
              (item.artwork_url && item.artwork_url.replace('-large', '-t500x500')) ||
              (item.user?.avatar_url && item.user.avatar_url.replace('-large', '-t500x500')) ||
              '/covers/cover-2.svg';

            results.push({
              id: `scfull-${item.id}`,
              title: parsedMeta.title,
              artist: parsedMeta.artist,
              album: item.publisher_metadata?.album_title || 'Полная версия',
              coverUrl: cover,
              audioUrl: `/api/stream/sc-full?trackId=${item.id}&v=2`,
              duration: Math.round((item.duration || 180000) / 1000),
              bpm: estimateTrackBpm(item),
              explicit: Boolean(item.publisher_metadata?.explicit),
              isFullTrack: true,
              source: provider,
            });
          }
        }
      }

      // 2. Supplement with Audius Public Full-Length MP3 Catalog if fewer than 8 full tracks found
      if (results.length < 8) {
        try {
          const auRes = await fetch(
            `https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(q)}&app_name=PulseOS`
          );
          if (auRes.ok) {
            const auData = (await auRes.json()) as {
              data?: Array<{
                id?: string;
                title?: string;
                duration?: number;
                user?: { name?: string };
                artwork?: { '480x480'?: string };
              }>;
            };
            for (const item of auData.data || []) {
              if (results.length >= 10) break;
              if (!item.id || !item.title || (item.duration || 0) <= 45) continue;
              const streamTarget = `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(item.id)}/stream?app_name=PulseOS`;
              results.push({
                id: `aufull-${item.id}`,
                title: item.title,
                artist: item.user?.name || 'Audius Artist',
                album: 'Полная версия',
                coverUrl: item.artwork?.['480x480'] || '/covers/cover-3.svg',
                audioUrl: `/api/cloud/proxy?url=${encodeURIComponent(streamTarget)}`,
                duration: Math.round(item.duration || 180),
                bpm: 122,
                explicit: false,
                isFullTrack: true,
                source: provider,
              });
            }
          }
        } catch {
          // Continue with existing results
        }
      }

      // 3. Fallback to iTunes 30s previews ONLY if zero full-length tracks were found
      if (results.length === 0) {
        const itunesRes = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=8`
        );
        if (itunesRes.ok) {
          const itunesData = (await itunesRes.json()) as {
            results?: Array<{
              trackId?: number;
              trackName?: string;
              artistName?: string;
              collectionName?: string;
              previewUrl?: string;
              artworkUrl100?: string;
              trackExplicitness?: string;
            }>;
          };
          for (const hit of itunesData.results || []) {
            if (!hit.trackName) continue;
            results.push({
              id: `cat-${provider}-${hit.trackId || Math.random().toString(36).slice(2, 8)}`,
              title: hit.trackName,
              artist: hit.artistName || 'Неизвестный исполнитель',
              album: hit.collectionName || 'Превью 30 сек',
              coverUrl: hit.artworkUrl100
                ? hit.artworkUrl100.replace('100x100bb', '600x600bb')
                : '/covers/cover-2.svg',
              audioUrl: hit.previewUrl
                ? `/api/cloud/proxy?url=${encodeURIComponent(hit.previewUrl)}`
                : '/audio/track-2.wav',
              duration: 30,
              bpm: 118,
              explicit: hit.trackExplicitness === 'explicit',
              isFullTrack: false,
              source: provider,
            });
          }
        }
      }

      res.json({ results });
    } catch {
      res.status(502).json({ error: 'Не удалось выполнить поиск по музыкальному каталогу.' });
    }
  });

  /**
   * Unwraps shortened Spotify / SoundCloud share URLs (on.soundcloud.com, spotify.link, spoti.fi, snd.sc)
   * and strips tracking query parameters that interfere with SoundCloud api-v2 resolve.
   */
  async function normalizeStreamingUrlForResolve(inputUrl: string): Promise<string> {
    let target = inputUrl.trim();
    const u = new URL(target);
    const host = u.hostname.toLowerCase();

    const isShortener =
      host === 'on.soundcloud.com' ||
      host === 'snd.sc' ||
      host === 'soundcloud.app.goo.gl' ||
      host === 'spotify.link' ||
      host === 'spoti.fi';

    if (isShortener) {
      try {
        const redirRes = await fetch(target, {
          method: 'GET',
          redirect: 'follow',
          headers: { 'User-Agent': BROWSER_UA },
          signal: AbortSignal.timeout(5000),
        });
        if (redirRes.url && isSafeExternalUrl(redirRes.url)) {
          target = redirRes.url;
        }
      } catch {
        // Keep original target if redirect check times out
      }
    }

    const finalUrl = new URL(target);
    if (finalUrl.hostname.toLowerCase().includes('soundcloud.com')) {
      finalUrl.hostname = 'soundcloud.com';
      const secretToken = finalUrl.searchParams.get('secret_token');
      finalUrl.search = '';
      if (secretToken) {
        finalUrl.searchParams.set('secret_token', secretToken);
      }
      return finalUrl.toString();
    }

    return finalUrl.toString();
  }

  /**
   * SoundCloud playlists return full metadata for the first ~4–5 tracks and stub `{ id }` objects
   * for tracks 6..N. This hydrates ALL stub tracks in parallel batches of 50 while preserving order.
   */
  async function hydrateSoundCloudPlaylistTracks(
    rawTracks: ScTrackItem[],
    cid: string
  ): Promise<ScTrackItem[]> {
    const capped = rawTracks.slice(0, 200);
    const stubIds: number[] = [];
    for (const item of capped) {
      if (item.id && (!item.title || !item.media?.transcodings)) {
        stubIds.push(item.id);
      }
    }

    const hydratedMap = new Map<number, ScTrackItem>();
    if (stubIds.length > 0) {
      const batches: number[][] = [];
      for (let i = 0; i < stubIds.length; i += 50) {
        batches.push(stubIds.slice(i, i + 50));
      }

      await Promise.all(
        batches.map(async (batch) => {
          try {
            const batchRes = await fetch(
              `https://api-v2.soundcloud.com/tracks?ids=${batch.join(',')}&client_id=${cid}`,
              {
                headers: { 'User-Agent': BROWSER_UA },
                signal: AbortSignal.timeout(6000),
              }
            );
            if (batchRes.ok) {
              const items = (await batchRes.json()) as ScTrackItem[];
              for (const tr of Array.isArray(items) ? items : []) {
                if (tr.id) hydratedMap.set(tr.id, tr);
              }
            }
          } catch {
            // Continue with remaining batches
          }
        })
      );
    }

    const ordered: ScTrackItem[] = [];
    for (const item of capped) {
      if (!item.id) continue;
      const full = hydratedMap.get(item.id) || item;
      if (full.title) {
        ordered.push(full);
      }
    }
    return ordered;
  }

  // --- 3B. Public Link & Playlist Resolver for Spotify / SoundCloud (Full Playlist & Track Hydration!) ---
  app.post('/api/streaming/resolve', async (req: Request, res: Response) => {
    const rawUrlInput = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const searchQuery = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    const withLyricsForTrack = req.body?.withLyrics !== false;

    if (!rawUrlInput && !searchQuery) {
      res.status(400).json({ error: 'Укажите ссылку Spotify / SoundCloud или поисковый запрос.' });
      return;
    }

    try {
      let title = '';
      let artist = '';
      let coverUrl = '';
      let directAudioUrl = '';
      let resolvedDuration = 0;
      let source: 'spotify' | 'soundcloud' = 'spotify';
      let rawUrl = rawUrlInput;

      if (rawUrl) {
        const extractedMatch = rawUrl.match(/https?:\/\/[^\s<>"']+/i);
        if (extractedMatch) rawUrl = extractedMatch[0];

        if (!isSafeExternalUrl(rawUrl)) {
          res.status(400).json({ error: 'Недопустимая ссылка.' });
          return;
        }

        rawUrl = await normalizeStreamingUrlForResolve(rawUrl);
        if (!isSafeExternalUrl(rawUrl)) {
          res.status(400).json({ error: 'Недопустимая целевая ссылка.' });
          return;
        }

        const parsedUrl = new URL(rawUrl);
        const host = parsedUrl.hostname.toLowerCase();

        if (host.includes('spotify.com') || host === 'spotify.link' || host === 'spoti.fi') {
          source = 'spotify';
          const spMatch = parsedUrl.pathname.match(/\/(track|playlist|album)\/([a-zA-Z0-9]+)/);

          // 1. Optional Connected Spotify OAuth Playlist API (if user connected OAuth, gets individual covers + 100 tracks)
          const sid = getOrCreateSessionId(req, res);
          const spToken = sessionStore.get(sid)?.spotify;
          if (spToken && spMatch && spMatch[1] === 'playlist') {
            try {
              const apiRes = await fetch(
                `https://api.spotify.com/v1/playlists/${encodeURIComponent(spMatch[2])}`,
                { headers: { Authorization: `Bearer ${spToken}` } }
              );
              if (apiRes.ok) {
                const plJson = (await apiRes.json()) as {
                  name?: string;
                  images?: Array<{ url?: string }>;
                  tracks?: {
                    items?: Array<{
                      track?: {
                        id?: string;
                        name?: string;
                        duration_ms?: number;
                        explicit?: boolean;
                        preview_url?: string | null;
                        external_urls?: { spotify?: string };
                        artists?: Array<{ name?: string }>;
                        album?: { name?: string; images?: Array<{ url?: string }> };
                      };
                    }>;
                  };
                };
                const plCover = plJson.images?.[0]?.url || '/covers/cover-2.svg';
                const items = (plJson.tracks?.items || [])
                  .map((i) => i.track)
                  .filter((t): t is NonNullable<typeof t> => Boolean(t?.name));

                if (items.length > 0) {
                  const firstArtist =
                    (items[0].artists || []).map((a) => a.name).filter(Boolean).join(', ') ||
                    'Spotify Artist';
                  const firstLrc = await lookupSyncedLyrics(items[0].name || '', firstArtist);

                  const tracks = items.map((t, idx) => {
                    const tTitle = t.name || `Трек ${idx + 1}`;
                    const tArtist =
                      (t.artists || []).map((a) => a.name).filter(Boolean).join(', ') ||
                      'Spotify Artist';
                    const dur = Math.max(22, Math.round((t.duration_ms || 180000) / 1000));
                    const fallbackParam = t.preview_url
                      ? `&fallback=${encodeURIComponent(t.preview_url)}`
                      : '';
                    return {
                      title: tTitle,
                      artist: tArtist,
                      album: t.album?.name || plJson.name || 'Spotify',
                      coverUrl: t.album?.images?.[0]?.url || plCover,
                      audioUrl: `/api/stream/by-query?q=${encodeURIComponent(`${tArtist} - ${tTitle}`)}${fallbackParam}&v=2`,
                      duration: dur,
                      bpm: estimateTrackBpm({ title: tTitle }, 118 + (idx % 18)),
                      explicit: Boolean(t.explicit),
                      source: 'spotify' as const,
                      externalUrl: t.external_urls?.spotify || rawUrl,
                      syncedLrc: idx === 0 ? firstLrc : undefined,
                    };
                  });

                  res.json({
                    playlistName: plJson.name || 'Плейлист Spotify',
                    source: 'spotify',
                    externalUrl: rawUrl,
                    tracks,
                  });
                  return;
                }
              }
            } catch {
              // Fall back to zero-key public embed below
            }
          }

          // 2. Zero-Key Spotify Playlist or Album Import (imports ALL tracks in trackList with on-demand full-length audio!)
          if (spMatch && (spMatch[1] === 'playlist' || spMatch[1] === 'album')) {
            const spKind = spMatch[1] as 'playlist' | 'album';
            const spId = spMatch[2];
            const entity = await fetchSpotifyPublicEmbed(spKind, spId);

            if (entity && Array.isArray(entity.trackList) && entity.trackList.length > 0) {
              const playlistName =
                entity.title ||
                entity.name ||
                (spKind === 'album' ? 'Альбом Spotify' : 'Плейлист Spotify');
              const entityCover =
                entity.coverArt?.sources?.[0]?.url ||
                entity.visualIdentity?.image?.[0]?.url ||
                '/covers/cover-2.svg';

              const firstItem = entity.trackList[0];
              const firstTitle = firstItem?.title || '';
              const firstArtist = (firstItem?.subtitle || '').replace(/\u00a0/g, ' ').trim();
              const firstSyncedLrc = firstTitle
                ? await lookupSyncedLyrics(firstTitle, firstArtist)
                : '';

              const tracks = entity.trackList.map((item, idx) => {
                const tTitle = item.title || `Трек ${idx + 1}`;
                const tArtist =
                  (item.subtitle || '').replace(/\u00a0/g, ' ').trim() ||
                  (entity.artists || []).map((a) => a.name).filter(Boolean).join(', ') ||
                  'Spotify Artist';
                const dur = Math.max(22, Math.round((item.duration || 180000) / 1000));
                const fallbackParam = item.audioPreview?.url
                  ? `&fallback=${encodeURIComponent(item.audioPreview.url)}`
                  : '';
                const trackSpId = item.uri?.startsWith('spotify:track:')
                  ? item.uri.split(':')[2]
                  : '';

                return {
                  title: tTitle,
                  artist: tArtist,
                  album: playlistName,
                  coverUrl: entityCover,
                  audioUrl: `/api/stream/by-query?q=${encodeURIComponent(`${tArtist} - ${tTitle}`)}${fallbackParam}&v=2`,
                  duration: dur,
                  bpm: estimateTrackBpm({ title: tTitle }, 118 + (idx % 18)),
                  explicit: Boolean(item.isExplicit),
                  source: 'spotify' as const,
                  externalUrl: trackSpId
                    ? `https://open.spotify.com/track/${trackSpId}`
                    : rawUrl,
                  syncedLrc: idx === 0 && firstSyncedLrc ? firstSyncedLrc : undefined,
                };
              });

              res.json({
                playlistName,
                source: 'spotify',
                externalUrl: rawUrl,
                tracks,
              });
              return;
            }
          }

          // Zero-key Spotify Single Track embed check
          if (spMatch && spMatch[1] === 'track') {
            const entity = await fetchSpotifyPublicEmbed('track', spMatch[2]);
            if (entity) {
              title = entity.title || entity.name || '';
              artist =
                (entity.artists || []).map((a) => a.name).filter(Boolean).join(', ') ||
                (entity.subtitle || '').replace(/\u00a0/g, ' ').trim();
              coverUrl =
                entity.coverArt?.sources?.[0]?.url ||
                entity.visualIdentity?.image?.[0]?.url ||
                '';
              if (entity.audioPreview?.url) {
                directAudioUrl = `/api/cloud/proxy?url=${encodeURIComponent(entity.audioPreview.url)}`;
                resolvedDuration = 30;
              }
            }
          }

          if (!title) {
            const oembedRes = await fetch(
              `https://open.spotify.com/oembed?url=${encodeURIComponent(rawUrl)}`
            );
            if (oembedRes.ok) {
              const meta = (await oembedRes.json()) as {
                title?: string;
                thumbnail_url?: string;
                author_name?: string;
              };
              title = meta.title || 'Spotify Track';
              artist = meta.author_name || 'Spotify';
              coverUrl = coverUrl || meta.thumbnail_url || '/covers/cover-2.svg';
            }
          }
        } else if (
          host.includes('soundcloud.com') ||
          host === 'snd.sc' ||
          host === 'soundcloud.app.goo.gl'
        ) {
          source = 'soundcloud';
          // Direct SoundCloud api-v2 resolve for full playlists (including stub track hydration!) & single tracks
          let cid = await getSoundCloudPublicClientId(false);
          if (cid) {
            let scResolve = await fetch(
              `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(rawUrl)}&client_id=${cid}`,
              { headers: { 'User-Agent': BROWSER_UA } }
            );
            if (scResolve.status === 401 || scResolve.status === 403) {
              cid = await getSoundCloudPublicClientId(true);
              scResolve = await fetch(
                `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(rawUrl)}&client_id=${cid}`,
                { headers: { 'User-Agent': BROWSER_UA } }
              );
            }

            if (scResolve.ok) {
              const resolvedObj = (await scResolve.json()) as ScTrackItem & {
                title?: string;
              };

              if (
                (resolvedObj.kind === 'playlist' ||
                  resolvedObj.kind === 'system-playlist') &&
                Array.isArray(resolvedObj.tracks)
              ) {
                const hydratedTracks = await hydrateSoundCloudPlaylistTracks(
                  resolvedObj.tracks,
                  cid
                );
                const plFallbackCover =
                  (resolvedObj.artwork_url &&
                    resolvedObj.artwork_url.replace('-large', '-t500x500')) ||
                  '/covers/cover-3.svg';

                if (hydratedTracks.length > 0) {
                  const firstMeta = parseCleanArtistAndTitle(hydratedTracks[0]);
                  const firstSyncedLrc = await lookupSyncedLyrics(
                    firstMeta.title,
                    firstMeta.artist
                  );

                  const playlistTracks = hydratedTracks.map((t, idx) => {
                    const parsedMeta = parseCleanArtistAndTitle(t);
                    const hasDirectFull = Boolean(pickUnencryptedFullTranscoding(t));
                    const cover =
                      (t.artwork_url && t.artwork_url.replace('-large', '-t500x500')) ||
                      (t.user?.avatar_url &&
                        t.user.avatar_url.replace('-large', '-t500x500')) ||
                      plFallbackCover;

                    return {
                      title: parsedMeta.title,
                      artist: parsedMeta.artist,
                      album: resolvedObj.title || 'SoundCloud Set',
                      coverUrl: cover,
                      audioUrl: hasDirectFull
                        ? `/api/stream/sc-full?trackId=${t.id}&v=2`
                        : `/api/stream/by-query?q=${encodeURIComponent(`${parsedMeta.artist} - ${parsedMeta.title}`)}&fallbackTrackId=${t.id}&v=2`,
                      duration: Math.max(
                        20,
                        Math.round(((t.full_duration || t.duration || 180000) as number) / 1000)
                      ),
                      bpm: estimateTrackBpm(t, 120 + (idx % 16)),
                      explicit: Boolean(t.publisher_metadata?.explicit),
                      source: 'soundcloud' as const,
                      externalUrl: t.permalink_url || rawUrl,
                      syncedLrc: idx === 0 && firstSyncedLrc ? firstSyncedLrc : undefined,
                    };
                  });

                  res.json({
                    playlistName: resolvedObj.title || 'Плейлист SoundCloud',
                    source: 'soundcloud',
                    externalUrl: resolvedObj.permalink_url || rawUrl,
                    tracks: playlistTracks,
                  });
                  return;
                }
              } else if (resolvedObj.kind === 'track' && resolvedObj.id) {
                const parsedMeta = parseCleanArtistAndTitle(resolvedObj);
                title = parsedMeta.title;
                artist = parsedMeta.artist;
                coverUrl =
                  (resolvedObj.artwork_url &&
                    resolvedObj.artwork_url.replace('-large', '-t500x500')) ||
                  '/covers/cover-3.svg';
                if (pickUnencryptedFullTranscoding(resolvedObj)) {
                  directAudioUrl = `/api/stream/sc-full?trackId=${resolvedObj.id}&v=2`;
                  resolvedDuration = Math.round((resolvedObj.duration || 180000) / 1000);
                }
              }
            }
          }

          if (!title) {
            const oembedRes = await fetch(
              `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(rawUrl)}`
            );
            if (oembedRes.ok) {
              const meta = (await oembedRes.json()) as {
                title?: string;
                author_name?: string;
                thumbnail_url?: string;
              };
              const rawTitle = meta.title || 'SoundCloud Track';
              if (rawTitle.includes(' by ')) {
                const [tPart, aPart] = rawTitle.split(' by ');
                title = tPart.trim();
                artist = (meta.author_name || aPart || 'SoundCloud').trim();
              } else {
                title = rawTitle;
                artist = meta.author_name || 'SoundCloud';
              }
              coverUrl = coverUrl || meta.thumbnail_url || '/covers/cover-3.svg';
            }
          }
        } else {
          res.status(400).json({ error: 'Поддерживаются ссылки Spotify и SoundCloud.' });
          return;
        }
      } else {
        title = searchQuery;
        source = req.body?.provider === 'soundcloud' ? 'soundcloud' : 'spotify';
      }

      // Upgrade any missing or 30s preview audio to a FULL-LENGTH stream whenever available!
      let resolvedBpm = source === 'spotify' ? 120 : 126;
      const lookupTerm = [
        artist && artist !== 'Spotify' && artist !== 'SoundCloud' ? artist : '',
        title,
      ]
        .filter(Boolean)
        .join(' ')
        .trim();

      if (lookupTerm && resolvedDuration <= 35) {
        const fullMatch = await findFullLengthStreamForQuery(lookupTerm);
        if (fullMatch) {
          directAudioUrl = fullMatch.audioUrl;
          resolvedDuration = fullMatch.duration;
          resolvedBpm = fullMatch.bpm;
          if (!coverUrl && fullMatch.coverUrl) {
            coverUrl = fullMatch.coverUrl;
          }
        }
      }

      // Fallback to iTunes metadata/preview ONLY if we still don't have an audio stream
      if (!directAudioUrl && lookupTerm) {
        try {
          const itunesRes = await fetch(
            `https://itunes.apple.com/search?term=${encodeURIComponent(lookupTerm)}&media=music&entity=song&limit=1`
          );
          if (itunesRes.ok) {
            const itunesData = (await itunesRes.json()) as {
              results?: Array<{
                trackName?: string;
                artistName?: string;
                previewUrl?: string;
                artworkUrl100?: string;
              }>;
            };
            const hit = itunesData.results?.[0];
            if (hit) {
              if (!rawUrl || !artist || artist === 'Spotify') {
                title = hit.trackName || title;
                artist = hit.artistName || artist;
              }
              if (hit.previewUrl) {
                directAudioUrl = `/api/cloud/proxy?url=${encodeURIComponent(hit.previewUrl)}`;
                resolvedDuration = 30;
              }
              if (!coverUrl && hit.artworkUrl100) {
                coverUrl = hit.artworkUrl100.replace('100x100bb', '600x600bb')
              }
            }
          }
        } catch {
          // Keep local fallback if external lookup fails
        }
      }

      const finalAudioUrl =
        directAudioUrl || (source === 'spotify' ? '/audio/track-2.wav' : '/audio/track-3.wav');
      const finalDuration = resolvedDuration > 0 ? resolvedDuration : 26;
      const syncedLrc = withLyricsForTrack ? await lookupSyncedLyrics(title, artist) : '';

      res.json({
        track: {
          title: title || 'Синхронизированный трек',
          artist: artist || (source === 'spotify' ? 'Spotify Artist' : 'SoundCloud Artist'),
          coverUrl: coverUrl || (source === 'spotify' ? '/covers/cover-2.svg' : '/covers/cover-3.svg'),
          audioUrl: finalAudioUrl,
          duration: finalDuration,
          bpm: resolvedBpm,
          source,
          externalUrl: rawUrl || undefined,
          syncedLrc,
        },
      });
    } catch {
      res.status(502).json({ error: 'Не удалось получить метаданные трека из стримингового сервиса.' });
    }
  });

  // --- 4. Cloud Storage Resolver (Yandex Disk public API, Google Drive, Dropbox, Direct URL) ---
  app.post('/api/cloud/resolve', async (req: Request, res: Response) => {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!rawUrl || !isSafeExternalUrl(rawUrl)) {
      res.status(400).json({ error: 'Укажите корректную внешнюю HTTPS-ссылку на облачный файл.' });
      return;
    }

    try {
      const u = new URL(rawUrl);
      const host = u.hostname.toLowerCase();

      if (host.includes('disk.yandex.') || host === 'yadi.sk') {
        const metaRes = await fetch(
          `https://cloud-api.yandex.net/v1/disk/public/resources?public_key=${encodeURIComponent(rawUrl)}`
        );
        if (!metaRes.ok) {
          res.status(400).json({ error: 'Не удалось прочитать публичный файл Яндекс Диска.' });
          return;
        }
        const meta = (await metaRes.json()) as { name?: string; file?: string; size?: number };
        if (!meta.file) {
          res.status(400).json({ error: 'Ссылка Яндекс Диска должна указывать на конкретный аудиофайл.' });
          return;
        }
        res.json({
          fileName: meta.name || 'YandexDisk_Track.mp3',
          size: meta.size || 0,
          proxyUrl: `/api/cloud/proxy?url=${encodeURIComponent(meta.file)}`,
        });
        return;
      }

      const guessedName = decodeURIComponent(u.pathname.split('/').pop() || 'Cloud_Audio.mp3');
      res.json({
        fileName: guessedName,
        proxyUrl: `/api/cloud/proxy?url=${encodeURIComponent(rawUrl)}`,
      });
    } catch {
      res.status(500).json({ error: 'Ошибка обработки облачной ссылки.' });
    }
  });

  // --- 5. CORS-Safe Audio Stream Proxy (for Web Audio Equalizer & IndexedDB Offline Caching) ---
  app.get('/api/cloud/proxy', async (req: Request, res: Response) => {
    const target = typeof req.query.url === 'string' ? req.query.url : '';
    if (!target || !isSafeExternalUrl(target)) {
      res.status(400).json({ error: 'Некорректный URL аудиопотока' });
      return;
    }

    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 PulseOS-AudioProxy/1.0',
      };
      if (typeof req.headers.range === 'string') {
        headers['Range'] = req.headers.range;
      }

      const upstream = await fetch(target, { headers, redirect: 'follow' });
      if (!upstream.ok && upstream.status !== 206) {
        res.status(upstream.status).json({ error: `Удалённый сервер вернул статус ${upstream.status}` });
        return;
      }

      res.status(upstream.status);
      res.setHeader('Access-Control-Allow-Origin', '*');
      const contentType = upstream.headers.get('content-type') || 'audio/mpeg';
      res.setHeader('Content-Type', contentType);

      const contentLength = upstream.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);

      const contentRange = upstream.headers.get('content-range');
      if (contentRange) res.setHeader('Content-Range', contentRange);

      const acceptRanges = upstream.headers.get('accept-ranges');
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

      const arrayBuffer = await upstream.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch {
      res.status(502).json({ error: 'Не удалось загрузить аудиофайл из облачного хранилища.' });
    }
  });

  // --- 6A. Automatic Lyrics Lookup (LRCLIB -> Genius.com -> Search Engine Auto-Fallback) ---
  app.get('/api/lyrics/auto', async (req: Request, res: Response) => {
    const title = typeof req.query.title === 'string' ? req.query.title.trim() : '';
    const artist = typeof req.query.artist === 'string' ? req.query.artist.trim() : '';
    if (!title && !artist) {
      res.status(400).json({ error: 'Укажите название песни для автоматического поиска текста.' });
      return;
    }

    try {
      const found = await lookupBestLyrics(title, artist, true);
      res.json({
        found: found.found,
        syncedLyrics: found.syncedLyrics,
        plainLyrics: found.plainLyrics,
        source: found.source,
      });
    } catch {
      res.json({ found: false, syncedLyrics: '', plainLyrics: '', source: '' });
    }
  });

  // --- 6B. Manual Live Lyrics Search (LRCLIB + Genius / Web Search Fallback) ---
  app.get('/api/lyrics/search', async (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) {
      res.status(400).json({ error: 'Введите название песни или исполнителя для поиска текста.' });
      return;
    }

    const cleanedQ = q.replace(/["'«»„“”]/g, ' ').replace(/\s+/g, ' ').trim();

    try {
      const upstream = await fetch(
        `https://lrclib.net/api/search?q=${encodeURIComponent(cleanedQ)}`,
        {
          headers: { 'User-Agent': BROWSER_UA },
          signal: AbortSignal.timeout(3500),
        }
      );

      let results: Array<{
        id: string;
        trackName: string;
        artistName: string;
        albumName: string;
        duration: number;
        syncedLyrics: string;
        plainLyrics: string;
      }> = [];

      if (upstream.ok) {
        const items = (await upstream.json()) as Array<{
          id: number;
          trackName?: string;
          artistName?: string;
          albumName?: string;
          duration?: number;
          syncedLyrics?: string | null;
          plainLyrics?: string | null;
        }>;
        results = (Array.isArray(items) ? items : []).slice(0, 8).map((item) => ({
          id: String(item.id),
          trackName: item.trackName || '',
          artistName: item.artistName || '',
          albumName: item.albumName || '',
          duration: item.duration || 0,
          syncedLyrics: item.syncedLyrics || '',
          plainLyrics: item.plainLyrics || '',
        }));
      }

      if (results.length === 0) {
        const autoFallback = await lookupBestLyrics(cleanedQ, '', true);
        if (autoFallback.found) {
          results.push({
            id: `web-${Date.now()}`,
            trackName: cleanedQ,
            artistName: autoFallback.source || 'Genius / Автопоиск',
            albumName: autoFallback.source || 'Веб-поиск',
            duration: 0,
            syncedLyrics: autoFallback.syncedLyrics,
            plainLyrics: autoFallback.plainLyrics,
          });
        }
      }

      res.json({ results });
    } catch {
      res.json({ results: [] });
    }
  });

  // --- 7. Vite Dev Middleware / Production Static Serving ---
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Pulse OS MP3 server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
