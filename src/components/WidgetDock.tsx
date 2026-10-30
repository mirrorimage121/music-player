import React, { useEffect, useRef, useState } from 'react';
import { Clock, Download, Heart, Sliders } from 'lucide-react';
import { EQPreset, LeftWidgetMode, ThemeMode, Track } from '../types/music';
import { audioEngine } from '../services/audioEngine';

interface WidgetDockProps {
  currentTrack: Track;
  isPlaying: boolean;
  eqGains: number[];
  activePresetId: string;
  presets: EQPreset[];
  bassBoost: number;
  offlineCachedCount: number;
  sleepTimerMinutes: number | null;
  theme: ThemeMode;
  accentColor: string;
  onChangeBandGain: (index: number, gain: number) => void;
  onSelectPreset: (preset: EQPreset) => void;
  onToggleBassBoost: () => void;
  onOpenFullEqualizer: () => void;
  onToggleOfflineCacheTrack: (track: Track) => void;
  onSetSleepTimer: (mins: number | null) => void;
  onUpdateTrackBpm?: (trackId: string, bpm: number) => void;
}

/**
 * Computes a realistic cardiac P-Q-R-S-T deflection for normalized beat phase p in [0, 1).
 * R-peak aligns right after p = 0 so every beat downbeat triggers a crisp upward spike.
 */
function sampleBeatEcg(p: number): number {
  if (p >= 0.86 && p < 0.94) {
    return -0.14 * Math.sin(((p - 0.86) / 0.08) * Math.PI);
  }
  if (p >= 0.96 && p < 0.995) {
    return 0.2 * Math.sin(((p - 0.96) / 0.035) * Math.PI);
  }
  if (p >= 0 && p < 0.065) {
    return -0.86 * Math.sin((p / 0.065) * Math.PI);
  }
  if (p >= 0.065 && p < 0.115) {
    return 0.4 * Math.sin(((p - 0.065) / 0.05) * Math.PI);
  }
  if (p >= 0.18 && p < 0.31) {
    return -0.22 * Math.sin(((p - 0.18) / 0.13) * Math.PI);
  }
  return 0;
}

export const WidgetDock: React.FC<WidgetDockProps> = ({
  currentTrack,
  isPlaying,
  eqGains,
  activePresetId,
  presets,
  bassBoost,
  offlineCachedCount,
  sleepTimerMinutes,
  theme,
  accentColor,
  onChangeBandGain,
  onSelectPreset,
  onToggleBassBoost,
  onOpenFullEqualizer,
  onToggleOfflineCacheTrack,
  onSetSleepTimer,
  onUpdateTrackBpm,
}) => {
  const [leftMode, setLeftMode] = useState<LeftWidgetMode>(LeftWidgetMode.PULSE_BPM);
  const [tapActive, setTapActive] = useState(false);

  const effectiveBpm = Math.max(45, Math.min(220, Math.round(currentTrack.bpm || 120)));

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const heartBeatRef = useRef<HTMLSpanElement | null>(null);
  const numberPulseRef = useRef<HTMLSpanElement | null>(null);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const bpmRef = useRef(effectiveBpm);
  bpmRef.current = effectiveBpm;
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const accentRef = useRef(accentColor);
  accentRef.current = accentColor;

  const tapTimesRef = useRef<number[]>([]);
  const tapResetTimerRef = useRef<number | null>(null);

  const handleTapTempo = () => {
    const now = performance.now();
    const prev = tapTimesRef.current;
    if (prev.length > 0 && now - prev[prev.length - 1] > 2200) {
      tapTimesRef.current = [now];
    } else {
      tapTimesRef.current = [...prev.slice(-4), now];
    }

    setTapActive(true);
    if (tapResetTimerRef.current) window.clearTimeout(tapResetTimerRef.current);
    tapResetTimerRef.current = window.setTimeout(() => {
      setTapActive(false);
    }, 1400);

    const times = tapTimesRef.current;
    if (times.length >= 2 && onUpdateTrackBpm) {
      let sum = 0;
      for (let i = 1; i < times.length; i++) {
        sum += times[i] - times[i - 1];
      }
      const avgMs = sum / (times.length - 1);
      if (avgMs > 260 && avgMs < 1400) {
        onUpdateTrackBpm(currentTrack.id, Math.round(60000 / avgMs));
      }
    }
  };

  // Full-width BPM-locked Heartbeat + Wide 5.5-Beat ECG / Audio Waveform renderer
  useEffect(() => {
    if (leftMode !== LeftWidgetMode.PULSE_BPM) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    const waveBuf = new Uint8Array(128);
    const freqBuf = new Uint8Array(32);
    let beatCount = 0.35;
    let lastTime = performance.now();

    const applyHeartStyle = (pulseEnv: number) => {
      const pulseColor =
        accentRef.current !== 'default' ? accentRef.current : 'rgba(244, 63, 94, 0.9)';
      if (heartBeatRef.current) {
        if (pulseEnv > 0.005 && !prefersReducedMotion) {
          const scale = 1 + pulseEnv * 0.34;
          const glow = Math.round(pulseEnv * 11);
          heartBeatRef.current.style.transform = `scale(${scale.toFixed(3)})`;
          heartBeatRef.current.style.filter = `drop-shadow(0 0 ${glow}px ${pulseColor})`;
        } else {
          heartBeatRef.current.style.transform = 'scale(1)';
          heartBeatRef.current.style.filter = 'none';
        }
      }
      if (numberPulseRef.current) {
        if (pulseEnv > 0.02 && !prefersReducedMotion) {
          const numScale = 1 + pulseEnv * 0.032;
          numberPulseRef.current.style.transform = `scale(${numScale.toFixed(3)})`;
        } else {
          numberPulseRef.current.style.transform = 'scale(1)';
        }
      }
    };

    const render = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;

      const playing = isPlayingRef.current;
      const currentBpm = bpmRef.current;
      const isDark = themeRef.current === 'dark';
      const customAcc = accentRef.current !== 'default' ? accentRef.current : '';

      if (playing && !prefersReducedMotion) {
        beatCount += dt * (currentBpm / 60);
      }

      const beatPhase = ((beatCount % 1) + 1) % 1;

      let pulseEnv = 0;
      if (playing) {
        if (beatPhase < 0.16) {
          pulseEnv = Math.sin((beatPhase / 0.16) * Math.PI);
        } else if (beatPhase >= 0.2 && beatPhase < 0.32) {
          pulseEnv = 0.38 * Math.sin(((beatPhase - 0.2) / 0.12) * Math.PI);
        }

        if (audioEngine.getFrequencyData(freqBuf)) {
          const subEnergy = (freqBuf[0] + freqBuf[1] + freqBuf[2]) / (3 * 255);
          pulseEnv = Math.min(1.15, pulseEnv * (0.85 + subEnergy * 0.35));
        }
      }

      applyHeartStyle(pulseEnv);

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Subtle vertical grid lines across the full-width ECG viewport
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)';
      ctx.lineWidth = 1;
      for (let gx = 24; gx < w; gx += 32) {
        ctx.beginPath();
        ctx.moveTo(gx, 4);
        ctx.lineTo(gx, h - 4);
        ctx.stroke();
      }

      const hasLiveWave = playing && audioEngine.getWaveformData(waveBuf);
      const midY = h * 0.6;
      const endX = w - 12;
      const beatsVisible = 5.4;
      let endY = midY;

      const peakAccent = customAcc || '#f43f5e';
      const baseStrokeStart = isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(15, 23, 42, 0.14)';
      const baseStrokeMid = customAcc
        ? customAcc
        : isDark
        ? 'rgba(255, 255, 255, 0.86)'
        : 'rgba(15, 23, 42, 0.82)';
      const baseStrokeEnd = customAcc
        ? customAcc
        : pulseEnv > 0.35
        ? peakAccent
        : isDark
        ? '#ffffff'
        : '#0f172a';

      ctx.save();
      const grad = ctx.createLinearGradient(0, 0, endX, 0);
      grad.addColorStop(0, baseStrokeStart);
      grad.addColorStop(0.32, baseStrokeMid);
      grad.addColorStop(0.88, baseStrokeMid);
      grad.addColorStop(1, baseStrokeEnd);

      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.1;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor =
        pulseEnv > 0.35
          ? peakAccent
          : customAcc || (isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(15, 23, 42, 0.18)');
      ctx.shadowBlur = isDark ? 8 : 4;
      ctx.beginPath();

      for (let x = 0; x <= endX; x++) {
        const normX = x / endX;
        let y = midY;

        if (playing && !prefersReducedMotion) {
          const localBeatPhase =
            (((beatCount - (1 - normX) * beatsVisible) % 1) + 1) % 1;
          const ecg = sampleBeatEcg(localBeatPhase);
          let waveRipple = 0;
          if (hasLiveWave) {
            const sampleIdx = Math.min(
              waveBuf.length - 1,
              Math.floor(normX * waveBuf.length)
            );
            waveRipple = ((waveBuf[sampleIdx] - 128) / 128) * 0.24;
          }
          y = midY + (ecg * 0.66 + waveRipple) * (h * 0.44);
        } else {
          const staticPhase = (((0.42 - (1 - normX) * 5.2) % 1) + 1) % 1;
          const ecg = sampleBeatEcg(staticPhase);
          y = midY + ecg * 0.64 * (h * 0.44);
        }

        if (x === endX) endY = y;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (pulseEnv > 0.2) {
        ctx.globalAlpha = Math.min(0.5, pulseEnv * 0.45);
        ctx.fillStyle = peakAccent;
        ctx.beginPath();
        ctx.arc(endX, endY, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = customAcc || (isDark ? '#ffffff' : '#0f172a');
      ctx.beginPath();
      ctx.arc(endX, endY, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (playing && !prefersReducedMotion) {
        rafId = window.requestAnimationFrame(render);
      }
    };

    rafId = window.requestAnimationFrame(render);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      applyHeartStyle(0);
    };
  }, [leftMode, isPlaying, currentTrack.id, theme, accentColor]);

  const activePreset = presets.find((p) => p.id === activePresetId) || presets[0];

  const cyclePreset = () => {
    const idx = presets.findIndex((p) => p.id === activePresetId);
    const next = presets[(idx + 1) % presets.length];
    onSelectPreset(next);
  };

  const rangeMin = currentTrack.bpmRange?.[0] ?? Math.max(52, effectiveBpm - 28);
  const rangeMax = currentTrack.bpmRange?.[1] ?? effectiveBpm;
  const hasCustomAccent = accentColor !== 'default';
  const heartColor = hasCustomAccent ? accentColor : '#f43f5e';

  return (
    <section
      aria-label="Виджет пульса ритма и эквалайзера"
      data-testid="pulse-rhythm-widget"
      data-bpm={effectiveBpm}
      className="w-full glass-panel rounded-[28px] p-5 flex flex-col justify-between min-h-[214px] select-none"
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
          {leftMode === LeftWidgetMode.PULSE_BPM ? (
            <>
              <span
                ref={heartBeatRef}
                data-testid="pulse-heart-icon"
                className="inline-flex items-center justify-center origin-center will-change-transform"
              >
                <Heart
                  className="w-4 h-4"
                  style={{ color: heartColor, fill: heartColor }}
                />
              </span>
              <span>Пульс ритма</span>
            </>
          ) : (
            <>
              <Sliders className="w-4 h-4 text-slate-700 dark:text-zinc-200" />
              <span>Быстрый эквалайзер</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const order: (number | null)[] = [null, 15, 30, 60];
              const next = order[(order.indexOf(sleepTimerMinutes) + 1) % order.length];
              onSetSleepTimer(next);
            }}
            title="Таймер сна"
            className="inline-flex items-center gap-1 rounded-full bg-slate-900/[0.06] hover:bg-slate-900/[0.12] dark:bg-white/[0.07] dark:hover:bg-white/[0.14] px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-zinc-300 transition-colors cursor-pointer tabular-nums"
          >
            <Clock className="w-3 h-3" />
            <span>{sleepTimerMinutes ? `${sleepTimerMinutes}м` : 'Сон'}</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setLeftMode((m) =>
                m === LeftWidgetMode.PULSE_BPM ? LeftWidgetMode.MINI_EQ : LeftWidgetMode.PULSE_BPM
              )
            }
            className="rounded-full bg-slate-900/[0.06] hover:bg-slate-900/[0.12] dark:bg-white/[0.07] dark:hover:bg-white/[0.14] px-3 py-1 text-[11px] font-semibold text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer"
          >
            {leftMode === LeftWidgetMode.PULSE_BPM ? 'Мини-EQ' : 'Пульс ритма'}
          </button>
        </div>
      </div>

      {leftMode === LeftWidgetMode.PULSE_BPM ? (
        <>
          <div className="mt-1 flex items-baseline justify-between gap-4">
            <button
              type="button"
              onClick={handleTapTempo}
              title="Нажмите несколько раз в такт музыке (Tap BPM), чтобы подстроить ритм"
              className="flex items-baseline gap-2.5 text-left group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-white/40 rounded-lg"
            >
              <span
                ref={numberPulseRef}
                data-testid="pulse-bpm-value"
                className="inline-block origin-left text-[46px] leading-none font-extrabold tracking-tight text-slate-900 dark:text-white tabular-nums will-change-transform"
              >
                {effectiveBpm}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 group-hover:text-slate-800 dark:text-zinc-400 dark:group-hover:text-zinc-200 transition-colors">
                {tapActive ? 'TAP BPM' : 'УД/МИН'}
              </span>
            </button>

            <span className="text-xs text-slate-500 dark:text-zinc-400 tabular-nums">
              Диапазон {rangeMin}–{rangeMax}
            </span>
          </div>

          {/* Stretched Full-Width Live BPM ECG Trace */}
          <div className="my-1.5">
            <canvas
              ref={canvasRef}
              width={520}
              height={66}
              data-testid="pulse-ecg-canvas"
              className="w-full h-[66px]"
            />
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-zinc-400">
            <button
              type="button"
              onClick={() => onToggleOfflineCacheTrack(currentTrack)}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/[0.06] hover:bg-slate-900/[0.12] dark:bg-white/[0.08] dark:hover:bg-white/[0.15] px-3 py-1 font-medium text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer"
            >
              <Download className="w-3 h-3" />
              <span>
                {currentTrack.isOfflineCached
                  ? `В офлайн-кэше (${offlineCachedCount})`
                  : `Сохранить офлайн (${offlineCachedCount})`}
              </span>
            </button>

            <button
              type="button"
              onClick={onToggleBassBoost}
              aria-pressed={bassBoost > 0}
              style={
                bassBoost > 0 && hasCustomAccent
                  ? { backgroundColor: accentColor, color: '#ffffff' }
                  : undefined
              }
              className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer ${
                bassBoost > 0
                  ? hasCustomAccent
                    ? ''
                    : 'bg-slate-900 text-white dark:bg-white dark:text-zinc-950'
                  : 'bg-slate-900/[0.08] text-slate-800 hover:bg-slate-900/[0.15] dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/20'
              }`}
            >
              {bassBoost > 0 ? 'Bass+ Вкл' : 'Bass+'}
            </button>
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col justify-between pt-2">
          {/* Full-width 8-band quick equalizer sliders */}
          <div className="grid grid-cols-8 gap-2 items-center h-28 px-1">
            {[
              { idx: 0, lbl: '32' },
              { idx: 1, lbl: '64' },
              { idx: 2, lbl: '125' },
              { idx: 4, lbl: '500' },
              { idx: 5, lbl: '1К' },
              { idx: 7, lbl: '4К' },
              { idx: 8, lbl: '8К' },
              { idx: 9, lbl: '16К' },
            ].map(({ idx, lbl }) => {
              const val = eqGains[idx] ?? 0;
              return (
                <div key={idx} className="flex flex-col items-center h-full justify-between">
                  <span className="text-[10px] font-mono-tabular text-slate-500 dark:text-zinc-400">
                    {val > 0 ? `+${Math.round(val)}` : Math.round(val)}
                  </span>
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={0.5}
                    value={val}
                    onChange={(e) => onChangeBandGain(idx, parseFloat(e.target.value))}
                    aria-label={`Полоса ${lbl} Гц`}
                    className="w-16 -rotate-90 accent-slate-900 dark:accent-white cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400">{lbl}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={cyclePreset}
              className="flex-1 truncate rounded-full bg-slate-900/[0.08] hover:bg-slate-900/[0.14] dark:bg-white/10 dark:hover:bg-white/15 px-3 py-1.5 text-[11px] font-semibold text-slate-800 dark:text-zinc-100 cursor-pointer"
            >
              Пресет: {activePreset.name}
            </button>
            <button
              type="button"
              onClick={onOpenFullEqualizer}
              className="rounded-full bg-slate-900/[0.08] hover:bg-slate-900/[0.15] dark:bg-white/10 dark:hover:bg-white/20 px-3 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-zinc-200 cursor-pointer"
            >
              Все 10 полос
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
