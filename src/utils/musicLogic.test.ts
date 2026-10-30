import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLRC,
  serializeLRC,
  getActiveLyricIndex,
  getWordProgress,
  shiftLyricsOffset,
  formatTime,
  formatRemainingTime,
  buildUnsyncedLines,
  hasOnlyPlaceholderLyrics,
} from './lrcParser';
import {
  resolveCloudInput,
  parseStreamingUrl,
  extractSpotifyEntityFromUrl,
} from './cloudUrlResolver';
import { clampGain, generateEQCurvePath, BUILTIN_EQ_PRESETS } from './equalizerMath';
import { getNextTrackId, getPreviousTrackId, filterTracks } from './playlistLogic';
import { CloudProvider, RepeatMode, Track, TrackSource } from '../types/music';

test('parseLRC parses timestamps, strips metadata, and enriches word timings', () => {
  const sample = `
[ti:Болен]
[ar:dope17, mapt0v]
[00:02.00] Она спасёт меня
[00:05.00] Она снова зароллит в меч
[00:09.50] Та тень из средневековья
`;
  const lines = parseLRC(sample, 22);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].time, 2);
  assert.equal(lines[0].text, 'Она спасёт меня');
  assert.ok(lines[1].words && lines[1].words.length === 5);

  assert.equal(getActiveLyricIndex(lines, 1.0), -1);
  assert.equal(getActiveLyricIndex(lines, 2.1), 0);
  assert.equal(getActiveLyricIndex(lines, 5.2), 1);
  assert.equal(getActiveLyricIndex(lines, 12.0), 2);

  const firstWord = lines[1].words![0];
  assert.equal(getWordProgress(firstWord, 4.9), 0);
  assert.equal(getWordProgress(firstWord, 9.0), 1);
});

test('hasOnlyPlaceholderLyrics detects imported SoundCloud/Spotify stubs and preserves real lyrics', () => {
  const stub = buildUnsyncedLines(
    '"Отпусти"\nДжиган ft. Юлия Савичева\nПлейлист: aye228rus',
    199
  );
  assert.equal(hasOnlyPlaceholderLyrics(stub, '"Отпусти"'), true);

  const realSong = buildUnsyncedLines(
    'Больше нечего ловить\nВсё, что надо я поймал\nНадо сразу уходить\nЧтоб никто не привыкал\nЯрко жёлтые очки\nДва сердечка на брелке',
    199
  );
  assert.equal(hasOnlyPlaceholderLyrics(realSong, 'Отпусти'), false);
  assert.equal(realSong.length, 6);
  assert.ok(realSong[1].time > realSong[0].time);
  assert.ok(realSong[5].time < 199);
});

test('shiftLyricsOffset and serializeLRC round-trip cleanly', () => {
  const lines = parseLRC('[00:04.00] Первая строка\n[00:08.50] Вторая строка', 20);
  const shifted = shiftLyricsOffset(lines, -1.5, 20);
  assert.equal(shifted[0].time, 2.5);
  assert.equal(shifted[1].time, 7.0);

  const serialized = serializeLRC(shifted);
  assert.match(serialized, /\[00:02\.50\] Первая строка/);
  assert.match(serialized, /\[00:07\.00\] Вторая строка/);
});

test('formatTime and formatRemainingTime handle tabular formatting', () => {
  assert.equal(formatTime(5), '0:05');
  assert.equal(formatTime(125), '2:05');
  assert.equal(formatRemainingTime(5, 22), '-0:17');
});

test('resolveCloudInput normalizes Google Drive, Dropbox, Yandex Disk, and rejects empty URLs', () => {
  const emptyRes = resolveCloudInput('   ');
  assert.equal(emptyRes.valid, false);

  const gdrive = resolveCloudInput('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing');
  assert.equal(gdrive.valid, true);
  assert.equal(gdrive.provider, CloudProvider.GOOGLE_DRIVE);
  assert.equal(gdrive.directUrl, 'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOp');

  const dropbox = resolveCloudInput('https://www.dropbox.com/s/xyz123/song.mp3?dl=0');
  assert.equal(dropbox.valid, true);
  assert.equal(dropbox.provider, CloudProvider.DROPBOX);
  assert.match(dropbox.directUrl, /dl\.dropboxusercontent\.com/);

  const yandex = resolveCloudInput('https://disk.yandex.ru/d/abc12345');
  assert.equal(yandex.valid, true);
  assert.equal(yandex.provider, CloudProvider.YANDEX_DISK);
  assert.equal(yandex.needsServerResolve, true);
});

test('parseStreamingUrl and extractSpotifyEntityFromUrl detect Spotify and SoundCloud tracks and playlists', () => {
  const spTrack = parseStreamingUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
  assert.equal(spTrack.valid, true);
  assert.equal(spTrack.provider, 'spotify');
  assert.equal(spTrack.kind, 'track');

  const spIntlPlaylist = extractSpotifyEntityFromUrl(
    'https://open.spotify.com/intl-ru/playlist/37i9dQZF1DXcBWIGoYBM5M?si=123'
  );
  assert.deepEqual(spIntlPlaylist, { kind: 'playlist', id: '37i9dQZF1DXcBWIGoYBM5M' });

  const scSet = parseStreamingUrl('https://soundcloud.com/artist/sets/night-drive');
  assert.equal(scSet.valid, true);
  assert.equal(scSet.provider, 'soundcloud');
  assert.equal(scSet.kind, 'playlist');

  const scShortFromShareText = parseStreamingUrl(
    'Послушай мой плейлист https://on.soundcloud.com/AbCdEf123'
  );
  assert.equal(scShortFromShareText.valid, true);
  assert.equal(scShortFromShareText.provider, 'soundcloud');
  assert.equal(scShortFromShareText.url, 'https://on.soundcloud.com/AbCdEf123');

  const spShort = parseStreamingUrl('https://spotify.link/XyZ987');
  assert.equal(spShort.valid, true);
  assert.equal(spShort.provider, 'spotify');

  const invalid = parseStreamingUrl('https://example.com/music.mp3');
  assert.equal(invalid.valid, false);
});

test('equalizerMath clamps dB gains and generates 10-point SVG spline curves', () => {
  assert.equal(clampGain(18.4), 12);
  assert.equal(clampGain(-19), -12);
  const curve = generateEQCurvePath(BUILTIN_EQ_PRESETS[1].gains, 360, 120);
  assert.equal(curve.points.length, 10);
  assert.ok(curve.linePath.startsWith('M '));
  assert.ok(curve.areaPath.endsWith('Z'));
});

test('playlist queue navigation and filtering work deterministically', () => {
  const queue = ['t1', 't2', 't3'];
  assert.equal(getNextTrackId(queue, 't1', RepeatMode.OFF, false), 't2');
  assert.equal(getNextTrackId(queue, 't3', RepeatMode.OFF, false), null);
  assert.equal(getNextTrackId(queue, 't3', RepeatMode.ALL, false), 't1');
  assert.equal(getNextTrackId(queue, 't2', RepeatMode.ONE, false), 't2');
  assert.equal(getPreviousTrackId(queue, 't1', RepeatMode.ALL), 't3');

  const mockTracks: Track[] = [
    {
      id: 't1',
      title: 'Болен',
      artist: 'dope17',
      duration: 22,
      audioUrl: '/audio/track-1.wav',
      coverUrl: '/covers/cover-1.svg',
      bpm: 97,
      source: TrackSource.BUILTIN,
      isFavorite: true,
      isOfflineCached: true,
      lyrics: [],
      addedAt: 1,
    },
    {
      id: 't2',
      title: 'Ночной проспект',
      artist: 'KinoSynth',
      duration: 24,
      audioUrl: '/audio/track-2.wav',
      coverUrl: '/covers/cover-2.svg',
      bpm: 124,
      source: TrackSource.SPOTIFY,
      isFavorite: false,
      isOfflineCached: false,
      lyrics: [],
      addedAt: 2,
    },
  ];

  assert.equal(filterTracks(mockTracks, { onlyOffline: true }).length, 1);
  assert.equal(filterTracks(mockTracks, { query: 'проспект' })[0].id, 't2');
});
