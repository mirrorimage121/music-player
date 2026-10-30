import React, { useEffect, useState } from 'react';
import {
  Check,
  Clock,
  Download,
  Loader2,
  Pause,
  Play,
  Radio,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { LyricLine, Track } from '../types/music';
import {
  buildUnsyncedLines,
  enrichWordTimings,
  formatLRCTimestamp,
  parseLRC,
  serializeLRC,
  shiftLyricsOffset,
} from '../utils/lrcParser';

interface LyricSyncModalProps {
  isOpen: boolean;
  track: Track;
  currentTime: number;
  isPlaying: boolean;
  onClose: () => void;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onSaveLyrics: (trackId: string, lyrics: LyricLine[]) => void;
}

interface LRCLibSearchResult {
  id: string;
  trackName: string;
  artistName: string;
  albumName: string;
  syncedLyrics: string;
  plainLyrics: string;
}

export const LyricSyncModal: React.FC<LyricSyncModalProps> = ({
  isOpen,
  track,
  currentTime,
  isPlaying,
  onClose,
  onTogglePlay,
  onSeek,
  onSaveLyrics,
}) => {
  const [mode, setMode] = useState<'tap' | 'editor' | 'search'>('tap');
  const [lines, setLines] = useState<LyricLine[]>(track.lyrics);
  const [tapCursor, setTapCursor] = useState(0);
  const [rawText, setRawText] = useState(() => serializeLRC(track.lyrics));

  const [searchQuery, setSearchQuery] = useState(`${track.artist} ${track.title}`);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<LRCLibSearchResult[]>([]);
  const [statusNote, setStatusNote] = useState('');

  useEffect(() => {
    if (isOpen) {
      setLines(track.lyrics);
      setRawText(
        track.lyrics.length > 0
          ? serializeLRC(track.lyrics)
          : `${track.title}\n`
      );
      setTapCursor(0);
      setSearchQuery(`${track.artist} ${track.title}`);
      setStatusNote('');
    }
  }, [isOpen, track.id]);

  if (!isOpen) return null;

  const handleStampLine = (idx: number) => {
    const stampedTime = Number(currentTime.toFixed(2));
    const updated = lines.map((l, i) =>
      i === idx ? { ...l, time: stampedTime, words: undefined } : l
    );
    const enriched = enrichWordTimings(updated, track.duration || 180);
    setLines(enriched);
    setRawText(serializeLRC(enriched));
    setTapCursor(Math.min(lines.length - 1, idx + 1));
  };

  const handleShiftOffset = (deltaSec: number) => {
    const shifted = shiftLyricsOffset(lines, deltaSec, track.duration || 180);
    setLines(shifted);
    setRawText(serializeLRC(shifted));
    setStatusNote(
      `Таймкоды сдвинуты на ${deltaSec > 0 ? `+${deltaSec}` : deltaSec} сек.`
    );
  };

  const handleApplyRawEditor = () => {
    const hasTimestamps = /\[\d{1,3}:\d{2}/.test(rawText);
    const nextLines = hasTimestamps
      ? parseLRC(rawText, track.duration || 180)
      : buildUnsyncedLines(rawText, track.duration || 180);
    setLines(nextLines);
    setRawText(serializeLRC(nextLines));
    setMode('tap');
    setStatusNote('Строки обновлены. Теперь можно точно расставить таймкоды или сохранить.');
  };

  const handleLrcFileUpload = async (file: File | undefined) => {
    if (!file) return;
    const content = await file.text();
    const parsed = parseLRC(content, track.duration || 180);
    if (parsed.length > 0) {
      setLines(parsed);
      setRawText(serializeLRC(parsed));
      setStatusNote(`Загружено строк из ${file.name}: ${parsed.length}`);
    } else {
      const plain = buildUnsyncedLines(content, track.duration || 180);
      setLines(plain);
      setRawText(serializeLRC(plain));
      setStatusNote('Текст загружен — нажмите «Отметить таймкод» под музыку.');
    }
  };

  const handleDownloadLrc = () => {
    const content = serializeLRC(lines);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${track.artist} - ${track.title}.lrc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSearchLrcLib = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setStatusNote('');
    try {
      const res = await fetch(`/api/lyrics/search?q=${encodeURIComponent(searchQuery.trim())}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.results)) {
        setSearchResults(data.results);
        if (data.results.length === 0) {
          setStatusNote('Синхронные тексты по запросу не найдены. Используйте ручную синхронизацию.');
        }
      } else {
        setStatusNote(data.error || 'Не удалось выполнить поиск текста.');
      }
    } catch {
      setStatusNote('Сервис поиска недоступен офлайн.');
    } finally {
      setSearching(false);
    }
  };

  const handleSaveAndClose = () => {
    const finalLines =
      mode === 'editor'
        ? /\[\d{1,3}:\d{2}/.test(rawText)
          ? parseLRC(rawText, track.duration || 180)
          : buildUnsyncedLines(rawText, track.duration || 180)
        : lines;
    onSaveLyrics(track.id, finalLines);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Студия синхронизации текста песни в реальном времени"
      className="dark fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
    >
      <div className="glass-panel-elevated w-full max-w-3xl rounded-[30px] p-5 sm:p-7 text-zinc-100 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-white">
              Синхронизация текста в реальном времени
            </h2>
            <p className="text-xs text-zinc-400">
              {track.title} — {track.artist}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть студию текста"
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-zinc-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Mini Transport + Offset Bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/[0.05] border border-white/10 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onTogglePlay}
              className="inline-flex items-center gap-1.5 rounded-full bg-white text-zinc-950 px-3.5 py-1.5 text-xs font-semibold hover:bg-zinc-200 cursor-pointer"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{isPlaying ? 'Пауза' : 'Слушать'}</span>
            </button>
            <span className="font-mono-tabular text-sm font-semibold text-white">
              {formatLRCTimestamp(currentTime)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleShiftOffset(-0.5)}
              className="rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1 text-xs font-mono-tabular text-zinc-200 cursor-pointer"
            >
              -0.5с
            </button>
            <button
              type="button"
              onClick={() => handleShiftOffset(0.5)}
              className="rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1 text-xs font-mono-tabular text-zinc-200 cursor-pointer"
            >
              +0.5с
            </button>

            <label className="inline-flex items-center gap-1 rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1 text-xs text-zinc-200 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>.LRC</span>
              <input
                type="file"
                accept=".lrc,.txt"
                onChange={(e) => handleLrcFileUpload(e.target.files?.[0])}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={handleDownloadLrc}
              className="inline-flex items-center gap-1 rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1 text-xs text-zinc-200 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Экспорт</span>
            </button>
          </div>
        </div>

        {/* Mode Tabs */}
        <div className="mt-4 grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-white/[0.05] border border-white/10">
          <button
            type="button"
            onClick={() => setMode('tap')}
            className={`py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
              mode === 'tap' ? 'bg-white text-zinc-950' : 'text-zinc-300 hover:text-white'
            }`}
          >
            Живой тайм-код
          </button>
          <button
            type="button"
            onClick={() => setMode('editor')}
            className={`py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
              mode === 'editor' ? 'bg-white text-zinc-950' : 'text-zinc-300 hover:text-white'
            }`}
          >
            Текст / LRC-код
          </button>
          <button
            type="button"
            onClick={() => setMode('search')}
            className={`py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
              mode === 'search' ? 'bg-white text-zinc-950' : 'text-zinc-300 hover:text-white'
            }`}
          >
            Поиск в LRCLIB
          </button>
        </div>

        {/* Body */}
        <div className="mt-4 flex-1 min-h-0 overflow-y-auto pr-1">
          {mode === 'tap' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3.5 py-2 text-xs text-zinc-300">
                <span>
                  Включите воспроизведение и нажимайте <strong>«Отметить сейчас»</strong> в начале каждой фразы:
                </span>
                <button
                  type="button"
                  onClick={() => handleStampLine(tapCursor)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white text-zinc-950 px-3.5 py-1 text-xs font-bold hover:bg-zinc-200 shrink-0 cursor-pointer"
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>Отметить строку #{tapCursor + 1}</span>
                </button>
              </div>

              {lines.map((line, idx) => {
                const isTarget = idx === tapCursor;
                return (
                  <div
                    key={line.id}
                    className={`flex items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 border transition-colors ${
                      isTarget
                        ? 'bg-white/15 border-white/30'
                        : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.07]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setTapCursor(idx);
                        onSeek(line.time);
                      }}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <span className="font-mono-tabular text-xs text-zinc-400 shrink-0">
                        {formatLRCTimestamp(line.time)}
                      </span>
                      <span className="text-sm font-medium text-white truncate">{line.text}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStampLine(idx)}
                      className="inline-flex items-center gap-1 rounded-xl bg-white/10 hover:bg-white/25 px-2.5 py-1 text-[11px] font-semibold text-white shrink-0 cursor-pointer"
                    >
                      <Clock className="w-3 h-3" />
                      <span>Отметить сейчас</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {mode === 'editor' && (
            <div className="space-y-3">
              <label htmlFor="raw-lrc-textarea" className="block text-xs text-zinc-400">
                Вставьте обычный текст песни (по одной фразе на строку) или готовый формат `[мм:сс.хх] Строка`:
              </label>
              <textarea
                id="raw-lrc-textarea"
                rows={10}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                className="w-full rounded-2xl bg-black/55 border border-white/15 p-3.5 text-xs font-mono-tabular text-zinc-100 focus:outline-none focus:border-white/40"
              />
              <button
                type="button"
                onClick={handleApplyRawEditor}
                className="rounded-xl bg-white/15 hover:bg-white/25 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                Разобрать строки и перейти к тайм-кодам
              </button>
            </div>
          )}

          {mode === 'search' && (
            <div className="space-y-3">
              <form onSubmit={handleSearchLrcLib} className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Поиск синхронного текста LRCLIB"
                  placeholder="Исполнитель и название песни..."
                  className="flex-1 rounded-xl bg-black/50 border border-white/15 px-3.5 py-2 text-xs text-white focus:outline-none focus:border-white/40"
                />
                <button
                  type="submit"
                  disabled={searching}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white text-zinc-950 px-4 py-2 text-xs font-semibold hover:bg-zinc-200 cursor-pointer"
                >
                  {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  <span>Найти</span>
                </button>
              </form>

              <div className="space-y-2">
                {searchResults.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.04] border border-white/10 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">
                        {item.trackName} — {item.artistName}
                      </div>
                      <div className="text-[11px] text-zinc-400 truncate">
                        {item.syncedLyrics ? 'Синхронизированный LRC' : 'Обычный текст'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = item.syncedLyrics
                          ? parseLRC(item.syncedLyrics, track.duration || 180)
                          : buildUnsyncedLines(item.plainLyrics || '', track.duration || 180);
                        setLines(next);
                        setRawText(serializeLRC(next));
                        setMode('tap');
                        setStatusNote(`Применён текст «${item.trackName}».`);
                      }}
                      className="rounded-xl bg-white text-zinc-950 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-200 shrink-0 cursor-pointer"
                    >
                      Применить
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-3">
          <span className="text-xs text-emerald-300 truncate">{statusNote}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2 text-xs font-medium text-zinc-200 cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleSaveAndClose}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white text-zinc-950 px-5 py-2 text-xs font-bold hover:bg-zinc-200 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Сохранить синхронизацию</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
