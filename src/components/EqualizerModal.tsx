import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw, Save, Sliders, X } from 'lucide-react';
import { EQPreset } from '../types/music';
import { EQ_FREQUENCIES, generateEQCurvePath } from '../utils/equalizerMath';
import { audioEngine } from '../services/audioEngine';

interface EqualizerModalProps {
  isOpen: boolean;
  isPlaying: boolean;
  enabled: boolean;
  gains: number[];
  preamp: number;
  bassBoost: number;
  presets: EQPreset[];
  activePresetId: string;
  onClose: () => void;
  onToggleEnabled: () => void;
  onChangeGain: (bandIdx: number, db: number) => void;
  onChangePreamp: (db: number) => void;
  onChangeBassBoost: (db: number) => void;
  onSelectPreset: (preset: EQPreset) => void;
  onSaveCustomPreset: (name: string) => void;
  onResetFlat: () => void;
}

export const EqualizerModal: React.FC<EqualizerModalProps> = ({
  isOpen,
  isPlaying,
  enabled,
  gains,
  preamp,
  bassBoost,
  presets,
  activePresetId,
  onClose,
  onToggleEnabled,
  onChangeGain,
  onChangePreamp,
  onChangeBassBoost,
  onSelectPreset,
  onSaveCustomPreset,
  onResetFlat,
}) => {
  const [customName, setCustomName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const fftCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const canvas = fftCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const freqData = new Uint8Array(128);

    const drawSpectrum = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const hasFreq = isPlaying && audioEngine.getFrequencyData(freqData);
      const barCount = 36;
      const step = w / barCount;

      for (let i = 0; i < barCount; i++) {
        const val = hasFreq ? freqData[Math.min(freqData.length - 1, i * 2)] / 255 : 0.06;
        const barH = Math.max(3, val * (h - 16));
        ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.fillRect(i * step + 2, h - barH, step - 4, barH);
      }

      if (isPlaying) {
        rafId = window.requestAnimationFrame(drawSpectrum);
      }
    };

    drawSpectrum();
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [isOpen, isPlaying]);

  if (!isOpen) return null;

  const curve = generateEQCurvePath(gains, 640, 130, 28, 16);

  const handleSavePreset = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customName.trim();
    if (!trimmed) return;
    onSaveCustomPreset(trimmed);
    setCustomName('');
    setShowSaveInput(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="10-полосный графический эквалайзер"
      className="dark fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
    >
      <div className="glass-panel-elevated w-full max-w-3xl rounded-[30px] p-5 sm:p-7 text-zinc-100 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
              <Sliders className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-white">
                Встроенный эквалайзер
              </h2>
              <p className="text-xs text-zinc-400">
                10-полосный параметрический фильтр Web Audio DSP в реальном времени
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onToggleEnabled}
              aria-pressed={enabled}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                enabled
                  ? 'bg-white text-zinc-950'
                  : 'bg-white/10 text-zinc-400 hover:text-white'
              }`}
            >
              {enabled ? 'Активен' : 'Выключен'}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть эквалайзер"
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-zinc-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Presets Bar */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {presets.map((preset) => {
              const active = preset.id === activePresetId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelectPreset(preset)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer ${
                    active
                      ? 'bg-white text-zinc-950 font-semibold'
                      : 'bg-white/[0.06] text-zinc-300 hover:bg-white/15'
                  }`}
                >
                  {preset.name}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowSaveInput((v) => !v)}
              className="inline-flex items-center gap-1 rounded-xl bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs font-medium text-zinc-200 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Сохранить пресет</span>
            </button>

            <button
              type="button"
              onClick={onResetFlat}
              aria-label="Сбросить эквалайзер"
              className="inline-flex items-center gap-1 rounded-xl bg-white/10 hover:bg-white/20 px-2.5 py-1.5 text-xs font-medium text-zinc-300 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Сброс</span>
            </button>
          </div>
        </div>

        {showSaveInput && (
          <form onSubmit={handleSavePreset} className="mt-3 flex items-center gap-2">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Название пользовательского пресета..."
              aria-label="Название нового пресета эквалайзера"
              className="flex-1 rounded-xl bg-black/50 border border-white/15 px-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/40"
            />
            <button
              type="submit"
              className="rounded-xl bg-white text-zinc-950 px-4 py-1.5 text-xs font-semibold hover:bg-zinc-200 cursor-pointer"
            >
              Сохранить
            </button>
          </form>
        )}

        {/* Spline Response Curve + Live FFT Spectrum */}
        <div className="mt-5 relative rounded-2xl bg-black/55 border border-white/10 overflow-hidden h-[134px]">
          <canvas
            ref={fftCanvasRef}
            width={640}
            height={130}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />
          <svg
            viewBox="0 0 640 130"
            preserveAspectRatio="none"
            className={`relative z-10 w-full h-full transition-opacity ${
              enabled ? 'opacity-100' : 'opacity-40'
            }`}
          >
            <defs>
              <linearGradient id="eqArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <line
              x1="0"
              y1="65"
              x2="640"
              y2="65"
              stroke="rgba(255,255,255,0.14)"
              strokeDasharray="4 4"
            />
            <path d={curve.areaPath} fill="url(#eqArea)" />
            <path
              d={curve.linePath}
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {curve.points.map((pt, idx) => (
              <circle key={idx} cx={pt.x} cy={pt.y} r="4" fill="#ffffff" />
            ))}
          </svg>
          <div className="absolute top-2 left-3 text-[10px] font-mono-tabular text-zinc-500">+12 дБ</div>
          <div className="absolute bottom-2 left-3 text-[10px] font-mono-tabular text-zinc-500">-12 дБ</div>
        </div>

        {/* 10 Vertical Band Faders */}
        <div className="mt-5 grid grid-cols-5 sm:grid-cols-10 gap-2 sm:gap-3 pt-2">
          {EQ_FREQUENCIES.map((band, idx) => {
            const val = gains[idx] ?? 0;
            return (
              <div
                key={band.frequency}
                className="flex flex-col items-center justify-between rounded-2xl bg-white/[0.04] border border-white/[0.06] py-3 px-1 h-44"
              >
                <span className="text-[11px] font-mono-tabular text-zinc-300">
                  {val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)}
                </span>

                <div className="flex-1 flex items-center justify-center">
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={0.5}
                    disabled={!enabled}
                    value={val}
                    onChange={(e) => onChangeGain(idx, parseFloat(e.target.value))}
                    aria-label={`Частота ${band.label} Гц`}
                    className="w-24 -rotate-90 accent-white cursor-pointer"
                  />
                </div>

                <span className="text-[11px] font-semibold text-zinc-400">{band.label}</span>
              </div>
            );
          })}
        </div>

        {/* Preamp & Bass Boost Sub-Controls */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-white/10">
          <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-3.5">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-zinc-200">Предусилитель (Preamp)</span>
              <span className="font-mono-tabular text-zinc-300">
                {preamp > 0 ? `+${preamp.toFixed(1)}` : preamp.toFixed(1)} дБ
              </span>
            </div>
            <input
              type="range"
              min={-12}
              max={12}
              step={0.5}
              disabled={!enabled}
              value={preamp}
              onChange={(e) => onChangePreamp(parseFloat(e.target.value))}
              aria-label="Предусилитель"
              className="w-full accent-white cursor-pointer"
            />
          </div>

          <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-3.5">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-zinc-200">Усиление суб-баса (85 Гц)</span>
              <span className="font-mono-tabular text-zinc-300">+{bassBoost.toFixed(1)} дБ</span>
            </div>
            <input
              type="range"
              min={0}
              max={12}
              step={0.5}
              disabled={!enabled}
              value={bassBoost}
              onChange={(e) => onChangeBassBoost(parseFloat(e.target.value))}
              aria-label="Усиление суб-баса"
              className="w-full accent-white cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
