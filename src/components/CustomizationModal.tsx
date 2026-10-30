import React from 'react';
import { Check, Moon, Palette, RotateCcw, Sun, X } from 'lucide-react';
import { PlayerCustomization, ThemeMode } from '../types/music';

interface CustomizationModalProps {
  isOpen: boolean;
  customization: PlayerCustomization;
  onClose: () => void;
  onChangeCustomization: (patch: Partial<PlayerCustomization>) => void;
  onResetDefaults: () => void;
}

const ACCENT_PRESETS: Array<{ id: string; label: string; swatch: string }> = [
  { id: 'default', label: 'Классический', swatch: '#ffffff' },
  { id: '#f43f5e', label: 'Рубиновый', swatch: '#f43f5e' },
  { id: '#8b5cf6', label: 'Аметист', swatch: '#8b5cf6' },
  { id: '#3b82f6', label: 'Кобальт', swatch: '#3b82f6' },
  { id: '#06b6d4', label: 'Бирюза', swatch: '#06b6d4' },
  { id: '#10b981', label: 'Изумруд', swatch: '#10b981' },
  { id: '#f59e0b', label: 'Янтарь', swatch: '#f59e0b' },
  { id: '#ec4899', label: 'Маджента', swatch: '#ec4899' },
];

export const CustomizationModal: React.FC<CustomizationModalProps> = ({
  isOpen,
  customization,
  onClose,
  onChangeCustomization,
  onResetDefaults,
}) => {
  if (!isOpen) return null;

  const { theme, accentColor, glowIntensity } = customization;
  const pickerHex =
    accentColor === 'default'
      ? theme === 'dark'
        ? '#f43f5e'
        : '#3b82f6'
      : accentColor;

  const setTheme = (nextTheme: ThemeMode) => {
    onChangeCustomization({ theme: nextTheme });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Кастомизация плеера"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 dark:bg-black/75 backdrop-blur-sm p-4"
    >
      <div className="glass-panel-elevated w-full max-w-lg rounded-[30px] p-5 sm:p-6 text-slate-900 dark:text-zinc-100 max-h-[92vh] overflow-y-auto select-none">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900/8 dark:bg-white/10 flex items-center justify-center">
              <Palette className="w-5 h-5 text-slate-900 dark:text-white" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
                Кастомизация оформления
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Тема интерфейса, общий цвет по палитре и свечение фона
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть кастомизацию"
            className="p-2 rounded-full bg-slate-900/8 hover:bg-slate-900/15 dark:bg-white/10 dark:hover:bg-white/20 text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. Theme Selector */}
        <div className="mt-5">
          <span className="block text-xs font-semibold text-slate-600 dark:text-zinc-300 mb-2">
            Тема интерфейса
          </span>
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-900/[0.06] dark:bg-white/[0.06] border border-slate-900/10 dark:border-white/10">
            <button
              type="button"
              onClick={() => setTheme('dark')}
              aria-pressed={theme === 'dark'}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                theme === 'dark'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-zinc-950 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>Тёмная</span>
            </button>

            <button
              type="button"
              onClick={() => setTheme('light')}
              aria-pressed={theme === 'light'}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                theme === 'light'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-zinc-950 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Светлая</span>
            </button>
          </div>
        </div>

        {/* 2. Global Color Palette Swatches + Free Color Picker */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-zinc-300">
              Общий акцентный цвет плеера
            </span>
            <span className="text-[11px] font-mono-tabular text-slate-500 dark:text-zinc-400">
              {accentColor === 'default' ? 'По умолчанию' : accentColor.toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {ACCENT_PRESETS.map((preset) => {
              const selected = accentColor.toLowerCase() === preset.id.toLowerCase();
              const isClassic = preset.id === 'default';
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onChangeCustomization({ accentColor: preset.id })}
                  aria-pressed={selected}
                  className={`flex items-center gap-2 rounded-xl px-2.5 py-2 border text-left transition-colors cursor-pointer ${
                    selected
                      ? 'bg-slate-900/12 border-slate-900/35 dark:bg-white/15 dark:border-white/40'
                      : 'bg-slate-900/[0.04] border-slate-900/10 hover:bg-slate-900/[0.08] dark:bg-white/[0.04] dark:border-white/10 dark:hover:bg-white/[0.09]'
                  }`}
                >
                  <span
                    className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center border border-black/15"
                    style={{
                      background: isClassic
                        ? 'linear-gradient(135deg, #ffffff 0%, #52525b 100%)'
                        : preset.swatch,
                    }}
                  >
                    {selected && (
                      <Check
                        className={`w-2.5 h-2.5 ${
                          isClassic ? 'text-zinc-900' : 'text-white'
                        }`}
                      />
                    )}
                  </span>
                  <span className="text-[11px] font-semibold truncate text-slate-800 dark:text-zinc-200">
                    {preset.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Arbitrary Color Palette Input */}
          <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-slate-900/[0.05] dark:bg-white/[0.05] border border-slate-900/10 dark:border-white/10 px-3.5 py-2.5">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-800 dark:text-zinc-100">
                Выбрать любой оттенок по палитре
              </div>
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                Меняет свечение фона, ползунки, активные кнопки и пульс ритма
              </div>
            </div>

            <label
              aria-label="Палитра выбора общего цвета"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900/10 hover:bg-slate-900/15 dark:bg-white/10 dark:hover:bg-white/20 px-3 py-1.5 cursor-pointer shrink-0 transition-colors"
            >
              <input
                type="color"
                data-testid="custom-color-picker"
                value={pickerHex}
                onChange={(e) => onChangeCustomization({ accentColor: e.target.value })}
                className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
              />
              <span className="text-xs font-mono-tabular font-semibold text-slate-800 dark:text-white">
                Палитра
              </span>
            </label>
          </div>
        </div>

        {/* 3. Ambient Glow Intensity */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <label
              htmlFor="glow-intensity-slider"
              className="text-xs font-semibold text-slate-600 dark:text-zinc-300"
            >
              Интенсивность фонового свечения
            </label>
            <span className="text-xs font-mono-tabular text-slate-600 dark:text-zinc-300">
              {Math.round(glowIntensity * 100)}%
            </span>
          </div>
          <input
            id="glow-intensity-slider"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={glowIntensity}
            onChange={(e) =>
              onChangeCustomization({ glowIntensity: parseFloat(e.target.value) })
            }
            className="pulse-range w-full"
            style={{
              background: `linear-gradient(to right, ${
                accentColor === 'default'
                  ? theme === 'dark'
                    ? '#ffffff'
                    : '#0f172a'
                  : accentColor
              } ${glowIntensity * 100}%, ${
                theme === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.15)'
              } ${glowIntensity * 100}%)`,
              borderRadius: '9999px',
              height: '4px',
            }}
          />
        </div>

        {/* Footer: Reset to Defaults + Done */}
        <div className="mt-6 pt-4 border-t border-slate-900/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-2.5">
          <button
            type="button"
            data-testid="reset-defaults-btn"
            onClick={onResetDefaults}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900/8 hover:bg-slate-900/15 dark:bg-white/10 dark:hover:bg-white/20 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Вернуть дефолтные параметры</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 px-5 py-2 text-xs font-bold transition-colors cursor-pointer"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};
