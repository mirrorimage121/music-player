import { LyricLine, LyricWord } from '../types/music';

/**
 * Formats seconds into M:SS or H:MM:SS tabular string.
 */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Formats seconds as HH:MM:SS for the artwork visual timecode badge (e.g. 00:05:01).
 */
export function formatTimecodeLong(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Formats remaining duration as -M:SS (matching Apple Music / reference screenshot).
 */
export function formatRemainingTime(currentTime: number, duration: number): string {
  if (!Number.isFinite(duration) || duration <= 0) return '-0:00';
  const remaining = Math.max(0, Math.ceil(duration - Math.max(0, currentTime)));
  return `-${formatTime(remaining)}`;
}

/**
 * Formats seconds into LRC timestamp [mm:ss.xx]
 */
export function formatLRCTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const mins = Math.floor(clamped / 60);
  const secs = clamped - mins * 60;
  const wholeSecs = Math.floor(secs);
  const hundredths = Math.round((secs - wholeSecs) * 100);
  const adjustedSecs = hundredths === 100 ? wholeSecs + 1 : wholeSecs;
  const adjustedHundredths = hundredths === 100 ? 0 : hundredths;
  const finalMins = adjustedSecs === 60 ? mins + 1 : mins;
  const finalSecs = adjustedSecs === 60 ? 0 : adjustedSecs;

  return `[${String(finalMins).padStart(2, '0')}:${String(finalSecs).padStart(2, '0')}.${String(
    adjustedHundredths
  ).padStart(2, '0')}]`;
}

/**
 * Parses standard and enhanced LRC strings (supports [mm:ss.xx], [mm:ss.xxx], [mm:ss] and inline <mm:ss.xx> words).
 */
export function parseLRC(lrcContent: string, totalDuration = 180): LyricLine[] {
  if (!lrcContent || !lrcContent.trim()) return [];

  const rawLines = lrcContent.split(/\r?\n/);
  const parsed: LyricLine[] = [];
  const lineTagRegex = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  const inlineWordRegex = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>([^<]+)/g;

  rawLines.forEach((raw, idx) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    // Ignore metadata tags like [ar:...], [ti:...], [al:...]
    if (/^\[(ar|ti|al|by|offset|length|re|ve):/i.test(trimmed)) return;

    const timestamps: number[] = [];
    let match: RegExpExecArray | null;
    lineTagRegex.lastIndex = 0;

    while ((match = lineTagRegex.exec(trimmed)) !== null) {
      const mins = parseInt(match[1], 10);
      const secs = parseInt(match[2], 10);
      const fracRaw = match[3] || '0';
      const frac =
        fracRaw.length === 3
          ? parseInt(fracRaw, 10) / 1000
          : fracRaw.length === 2
          ? parseInt(fracRaw, 10) / 100
          : parseInt(fracRaw, 10) / 10;
      timestamps.push(Number((mins * 60 + secs + frac).toFixed(3)));
    }

    const contentWithoutLineTags = trimmed.replace(lineTagRegex, '').trim();
    if (!contentWithoutLineTags) return;

    if (timestamps.length === 0) {
      return;
    }

    // Parse optional inline <mm:ss.xx> word tags
    const inlineWords: LyricWord[] = [];
    inlineWordRegex.lastIndex = 0;
    let wordMatch: RegExpExecArray | null;
    while ((wordMatch = inlineWordRegex.exec(contentWithoutLineTags)) !== null) {
      const mins = parseInt(wordMatch[1], 10);
      const secs = parseInt(wordMatch[2], 10);
      const fracRaw = wordMatch[3] || '0';
      const frac =
        fracRaw.length === 3
          ? parseInt(fracRaw, 10) / 1000
          : fracRaw.length === 2
          ? parseInt(fracRaw, 10) / 100
          : parseInt(fracRaw, 10) / 10;
      const start = Number((mins * 60 + secs + frac).toFixed(3));
      const wordText = wordMatch[4].trim();
      if (wordText) {
        inlineWords.push({ text: wordText, startTime: start, endTime: start + 0.4 });
      }
    }

    const cleanText = contentWithoutLineTags.replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, '').replace(/\s+/g, ' ').trim();
    if (!cleanText) return;

    timestamps.forEach((timeVal, tIdx) => {
      parsed.push({
        id: `lrc-${idx}-${tIdx}-${Math.round(timeVal * 100)}`,
        time: timeVal,
        text: cleanText,
        words: inlineWords.length > 0 ? inlineWords : undefined,
      });
    });
  });

  parsed.sort((a, b) => a.time - b.time);

  // Synthesize smooth word-level timing for karaoke glow when inline word tags aren't provided
  return enrichWordTimings(parsed, totalDuration);
}

/**
 * Generates proportional word-by-word timings between consecutive line timestamps.
 */
export function enrichWordTimings(lines: LyricLine[], totalDuration = 180): LyricLine[] {
  return lines.map((line, index) => {
    const nextTime =
      index < lines.length - 1
        ? lines[index + 1].time
        : Math.max(line.time + 3.5, totalDuration);
    const span = Math.max(0.6, Math.min(6.0, nextTime - line.time - 0.15));

    if (line.words && line.words.length > 0) {
      const fixedWords = line.words.map((w, wIdx) => ({
        ...w,
        endTime:
          wIdx < line.words!.length - 1
            ? line.words![wIdx + 1].startTime
            : Math.max(w.startTime + 0.25, Math.min(nextTime, line.time + span)),
      }));
      return { ...line, words: fixedWords };
    }

    const tokens = line.text.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return line;

    const totalChars = tokens.reduce((acc, w) => acc + w.length, 0) || 1;
    let cursor = line.time;

    const words: LyricWord[] = tokens.map((token) => {
      const weight = token.length / totalChars;
      const wordDuration = span * weight;
      const startTime = Number(cursor.toFixed(3));
      const endTime = Number((cursor + wordDuration).toFixed(3));
      cursor += wordDuration;
      return {
        text: token,
        startTime,
        endTime,
      };
    });

    return { ...line, words };
  });
}

/**
 * Serializes LyricLine[] back into standard .lrc text format.
 */
export function serializeLRC(lines: LyricLine[]): string {
  return [...lines]
    .sort((a, b) => a.time - b.time)
    .map((line) => `${formatLRCTimestamp(line.time)} ${line.text}`)
    .join('\n');
}

/**
 * Converts plain unsynced lyrics lines (from Genius / web search / plainLyrics)
 * into naturally spaced lines across the track duration with word-level karaoke timing.
 */
export function buildUnsyncedLines(plainText: string, duration = 120): LyricLine[] {
  const raw = plainText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (raw.length === 0) return [];

  const safeDuration = Math.max(18, duration);
  const introOffset = safeDuration >= 40 && raw.length >= 6 ? 2.2 : 0;
  const usableSpan = Math.max(raw.length * 1.8, (safeDuration - introOffset) * 0.9);
  const weights = raw.map((line) => Math.max(8, Math.min(72, line.length)));
  const totalWeight = weights.reduce((acc, w) => acc + w, 0) || 1;

  let cursor = introOffset;
  const baseLines: LyricLine[] = raw.map((text, idx) => {
    const lineTime = Number(cursor.toFixed(2));
    cursor += (weights[idx] / totalWeight) * usableSpan;
    return {
      id: `plain-${idx}`,
      time: lineTime,
      text,
    };
  });

  return enrichWordTimings(baseLines, safeDuration);
}

/**
 * Detects whether a track currently has empty or import-placeholder lyrics
 * (e.g., "Плейлист: ...", "Альбом: ...", "Импортировано из ...") so real lyrics can be auto-searched.
 */
export function hasOnlyPlaceholderLyrics(lines: LyricLine[], trackTitle?: string): boolean {
  if (!lines || lines.length === 0) return true;
  if (lines.length > 4) return false;

  const placeholderPrefix = /^(?:плейлист:|альбом:|исполнитель:|импортировано|откройте редактор lrc)/i;
  if (lines.some((l) => placeholderPrefix.test(l.text.trim()))) {
    return true;
  }

  if (
    trackTitle &&
    lines.length <= 2 &&
    lines[0].text.trim().toLowerCase() === trackTitle.trim().toLowerCase()
  ) {
    return true;
  }

  return false;
}

/**
 * Shifts all lyric line & word timestamps by offsetSeconds (clamped >= 0).
 */
export function shiftLyricsOffset(
  lines: LyricLine[],
  offsetSeconds: number,
  totalDuration = 180
): LyricLine[] {
  const shifted = lines.map((line) => ({
    ...line,
    time: Number(Math.max(0, line.time + offsetSeconds).toFixed(3)),
    words: undefined,
  }));
  return enrichWordTimings(shifted, totalDuration);
}

/**
 * Returns the index of the active lyric line for a given playback time in seconds.
 */
export function getActiveLyricIndex(lines: LyricLine[], currentTime: number): number {
  if (!lines || lines.length === 0) return -1;
  let activeIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (currentTime + 0.08 >= lines[i].time) {
      activeIdx = i;
    } else {
      break;
    }
  }
  return activeIdx;
}

/**
 * Computes 0..1 fill progress for a specific word at currentTime.
 */
export function getWordProgress(word: LyricWord, currentTime: number): number {
  if (currentTime <= word.startTime) return 0;
  if (currentTime >= word.endTime) return 1;
  const span = word.endTime - word.startTime;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (currentTime - word.startTime) / span));
}
