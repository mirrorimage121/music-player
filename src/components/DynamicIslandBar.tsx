import React, { useEffect, useState } from 'react';
import {
  CloudDownload,
  ListMusic,
  Moon,
  Palette,
  Pause,
  Play,
  Sliders,
  SkipBack,
  SkipForward,
  Sun,
  WifiOff,
} from 'lucide-react';
import { Playlist, ThemeMode, Track } from '../types/music';
import { PWAInstallButton } from './PWAStatusControls';

interface DynamicIslandBarProps {
  currentTrack: Track;
  isPlaying: boolean;
  eqEnabled: boolean;
  offlineOnly: boolean;
  offlineCount: number;
  activePlaylist: Playlist | null;
  theme: ThemeMode;
  accentColor: string;
  onToggleTheme: () => void;
  onOpenCustomization: () => void;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onOpenPlaylists: () => void;
  onOpenEqualizer: () => void;
  onOpenCloudSync: () => void;
  onToggleOfflineOnly: () => void;
}

const DAYS_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export const DynamicIslandBar: React.FC<DynamicIslandBarProps> = ({
  currentTrack,
  isPlaying,
  eqEnabled,
  offlineOnly,
  offlineCount,
  activePlaylist,
  theme,
  accentColor,
  onToggleTheme,
  onOpenCustomization,
  onTogglePlay,
  onPrev,
  onNext,
  onOpenPlaylists,
  onOpenEqualizer,
  onOpenCloudSync,
  onToggleOfflineOnly,
}) => {
  const [now, setNow] = useState(() => new Date());
  const [islandExpanded, setIslandExpanded] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(id);
  }, []);

  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const dateStr = `${DAYS_RU[now.getDay()]} ${now.getDate()} ${MONTHS_RU[now.getMonth()]}`;
  const barWaveColor = accentColor !== 'default' ? accentColor : '#ffffff';

  return (
    <header className="relative z-30 flex items-center justify-between gap-2 sm:gap-4 px-3 sm:px-7 pt-3 pb-2 select-none">
      {/* Zone 1: System Status Clock + Interactive Moon/Sun Theme Toggle (top-left) */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 text-xs sm:text-[13px] font-semibold text-slate-700 dark:text-zinc-200 whitespace-nowrap shrink-0">
        <span className="tabular-nums tracking-tight text-slate-900 dark:text-white">{timeStr}</span>
        <span className="hidden md:inline text-slate-500 dark:text-zinc-400 font-medium">{dateStr}</span>
        <button
          type="button"
          data-testid="theme-toggle-btn"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
          title={theme === 'dark' ? 'Переключить на светлую тему' : 'Переключить на тёмную тему'}
          className="w-7 h-7 rounded-full flex items-center justify-center bg-slate-900/[0.06] hover:bg-slate-900/[0.14] dark:bg-white/[0.07] dark:hover:bg-white/[0.16] border border-slate-900/10 dark:border-white/10 transition-colors cursor-pointer"
        >
          {theme === 'dark' ? (
            <Moon className="w-3.5 h-3.5 text-zinc-300 fill-zinc-300/80" />
          ) : (
            <Sun className="w-3.5 h-3.5 text-amber-500 fill-amber-400/80" />
          )}
        </button>
      </div>

      {/* Zone 2: Center Dynamic Island Widget (expandable mini-player & live waveform) */}
      <div className="relative flex justify-center min-w-0">
        <button
          type="button"
          onClick={() => setIslandExpanded((v) => !v)}
          aria-expanded={islandExpanded}
          aria-label={`Динамический остров: ${currentTrack.title} — ${currentTrack.artist}`}
          className="group flex items-center gap-2 sm:gap-3 rounded-full bg-zinc-950/95 border border-black/15 dark:border-white/[0.12] px-2.5 sm:px-3 py-1 sm:py-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.22)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.85)] hover:border-slate-500/40 dark:hover:border-white/25 transition-colors cursor-pointer max-w-[162px] sm:max-w-[280px] md:max-w-[320px]"
        >
          <img
            src={currentTrack.coverUrl}
            alt={currentTrack.title}
            referrerPolicy="no-referrer"
            className="w-6 h-6 sm:w-7 sm:h-7 rounded-full object-cover border border-white/15 shrink-0"
          />
          <div className="min-w-0 text-left pr-0.5 sm:pr-1">
            <div className="text-[11px] font-bold text-white truncate leading-tight">
              {currentTrack.title}
            </div>
            <div className="text-[10px] text-zinc-400 truncate leading-tight">
              {currentTrack.artist}
            </div>
          </div>

          {/* 5-dot / bar live waveform */}
          <div className="flex items-center gap-[2.5px] sm:gap-[3px] pl-0.5 pr-0.5 h-4 shrink-0" aria-hidden="true">
            {[0.45, 0.85, 1.0, 0.65, 0.5].map((scale, idx) => (
              <span
                key={idx}
                className="w-[2.5px] sm:w-[3px] rounded-full transition-transform duration-200"
                style={{
                  backgroundColor: barWaveColor,
                  height: '12px',
                  transform: isPlaying
                    ? `scaleY(${0.35 + ((idx * 37 + now.getSeconds() * 19) % 70) / 100})`
                    : `scaleY(${scale * 0.35})`,
                }}
              />
            ))}
          </div>
        </button>

        {/* Expanded Dynamic Island Floating Widget */}
        {islandExpanded && (
          <div
            role="region"
            aria-label="Виджет быстрого управления Dynamic Island"
            className="fixed sm:absolute top-14 sm:top-12 left-1/2 -translate-x-1/2 w-[310px] sm:w-[350px] rounded-[26px] bg-zinc-950/95 border border-white/15 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.65)] backdrop-blur-2xl z-50 text-white"
          >
            <div className="flex items-center gap-3">
              <img
                src={currentTrack.coverUrl}
                alt={currentTrack.title}
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-2xl object-cover border border-white/10 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-white truncate">{currentTrack.title}</div>
                <div className="text-xs text-zinc-400 truncate">{currentTrack.artist}</div>
                <div className="text-[11px] text-zinc-500 mt-0.5 truncate">
                  {activePlaylist ? `Плейлист: ${activePlaylist.name}` : 'Все треки'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIslandExpanded(false)}
                className="text-[11px] text-zinc-400 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 cursor-pointer"
              >
                Скрыть
              </button>
            </div>

            <div className="mt-3.5 flex items-center justify-between gap-2 pt-3 border-t border-white/10">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onPrev}
                  aria-label="Предыдущий трек в виджете"
                  className="p-2 rounded-full hover:bg-white/10 text-zinc-200 cursor-pointer"
                >
                  <SkipBack className="w-4 h-4 fill-current" />
                </button>
                <button
                  type="button"
                  onClick={onTogglePlay}
                  aria-label={isPlaying ? 'Пауза в виджете' : 'Воспроизвести в виджете'}
                  className="p-2.5 rounded-full bg-white text-zinc-950 hover:bg-zinc-200 cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  aria-label="Следующий трек в виджете"
                  className="p-2 rounded-full hover:bg-white/10 text-zinc-200 cursor-pointer"
                >
                  <SkipForward className="w-4 h-4 fill-current" />
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIslandExpanded(false);
                    onOpenEqualizer();
                  }}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                    eqEnabled ? 'bg-white/15 text-white' : 'bg-white/5 text-zinc-400'
                  }`}
                >
                  EQ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIslandExpanded(false);
                    onOpenPlaylists();
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-medium text-white cursor-pointer"
                >
                  Плейлисты
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Zone 3: Quick Feature Navigation (Playlists, EQ, Cloud/Streaming, Customization, Offline) */}
      <nav aria-label="Основные разделы плеера" className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onOpenPlaylists}
          aria-label="Плейлисты"
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-slate-900/[0.06] hover:bg-slate-900/[0.12] dark:bg-white/[0.07] dark:hover:bg-white/[0.14] border border-slate-900/10 dark:border-white/10 min-w-[34px] min-h-[34px] px-2 sm:px-3 py-1.5 text-xs font-medium text-slate-800 hover:text-slate-950 dark:text-zinc-200 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <ListMusic className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Плейлисты</span>
        </button>

        <button
          type="button"
          onClick={onOpenEqualizer}
          aria-label="Эквалайзер"
          className={`inline-flex items-center justify-center gap-1.5 rounded-full border min-w-[34px] min-h-[34px] px-2 sm:px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            eqEnabled
              ? 'bg-slate-900/[0.11] border-slate-900/20 text-slate-950 dark:bg-white/[0.11] dark:border-white/20 dark:text-white'
              : 'bg-slate-900/[0.04] border-slate-900/10 text-slate-600 hover:text-slate-900 dark:bg-white/[0.05] dark:border-white/10 dark:text-zinc-400 dark:hover:text-white'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Эквалайзер</span>
        </button>

        <button
          type="button"
          onClick={onOpenCloudSync}
          aria-label="Импорт и Стриминг"
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-slate-900/[0.06] hover:bg-slate-900/[0.12] dark:bg-white/[0.07] dark:hover:bg-white/[0.14] border border-slate-900/10 dark:border-white/10 min-w-[34px] min-h-[34px] px-2 sm:px-3 py-1.5 text-xs font-medium text-slate-800 hover:text-slate-950 dark:text-zinc-200 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <CloudDownload className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Импорт и Стриминг</span>
        </button>

        <button
          type="button"
          data-testid="open-customization-btn"
          onClick={onOpenCustomization}
          aria-label="Кастомизация"
          title="Кастомизация цвета и темы"
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-slate-900/[0.06] hover:bg-slate-900/[0.12] dark:bg-white/[0.07] dark:hover:bg-white/[0.14] border border-slate-900/10 dark:border-white/10 min-w-[34px] min-h-[34px] px-2 sm:px-3 py-1.5 text-xs font-medium text-slate-800 hover:text-slate-950 dark:text-zinc-200 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Palette
            className="w-3.5 h-3.5"
            style={accentColor !== 'default' ? { color: accentColor } : undefined}
          />
          <span className="hidden lg:inline">Оформление</span>
        </button>

        <button
          type="button"
          onClick={onToggleOfflineOnly}
          aria-pressed={offlineOnly}
          aria-label={`Офлайн (${offlineCount})`}
          title="Автономный режим (только скачанные треки)"
          className={`inline-flex items-center justify-center gap-1.5 rounded-full border min-w-[34px] min-h-[34px] px-2 sm:px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            offlineOnly
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-800 dark:text-amber-200'
              : 'bg-slate-900/[0.05] border-slate-900/10 text-slate-700 hover:text-slate-950 dark:bg-white/[0.06] dark:border-white/10 dark:text-zinc-300 dark:hover:text-white'
          }`}
        >
          <WifiOff className="w-3.5 h-3.5" />
          <span className="hidden 2xl:inline">Офлайн ({offlineCount})</span>
        </button>

        <PWAInstallButton />
      </nav>
    </header>
  );
};
