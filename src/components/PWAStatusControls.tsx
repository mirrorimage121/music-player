import React, { useState } from 'react';
import { Download, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 px-3 py-1 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Установить</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 px-3 py-1 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>На экран iOS</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Установка на iOS"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          >
            <div className="glass-panel-elevated w-full max-w-sm rounded-3xl p-6 text-zinc-100">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold">Установка на iPhone / iPad</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Закрыть инструкцию"
                  className="p-1.5 rounded-full hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="mt-3 text-sm text-zinc-300 leading-relaxed">
                1. Нажмите кнопку <strong>Поделиться</strong> в панели Safari.
                <br />
                2. Выберите пункт <strong>На экран «Домой»</strong> для запуска плеера в офлайн-режиме.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-white text-zinc-950 py-2.5 text-sm font-semibold hover:bg-zinc-200 transition-colors"
              >
                Понятно
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

interface OfflineIndicatorProps {
  offlineModeForced: boolean;
  onToggleOfflineMode: () => void;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  offlineModeForced,
  onToggleOfflineMode,
}) => {
  const isOnline = useOnlineStatus();

  if (isOnline && !offlineModeForced) return null;

  return (
    <div className="fixed bottom-4 left-4 z-40 flex items-center gap-2.5 rounded-2xl bg-zinc-900/95 border border-amber-400/30 px-3.5 py-2 text-xs font-medium text-amber-200 shadow-2xl backdrop-blur-xl">
      <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <span>
        {!isOnline
          ? 'Нет сети — воспроизведение из офлайн-кэша'
          : 'Автономный режим — доступны скачанные треки'}
      </span>
      {isOnline && offlineModeForced && (
        <button
          type="button"
          onClick={onToggleOfflineMode}
          className="ml-1 underline text-white hover:text-amber-100 whitespace-nowrap cursor-pointer"
        >
          Выйти
        </button>
      )}
    </div>
  );
};
