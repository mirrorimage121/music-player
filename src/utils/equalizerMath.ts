import { EQBand, EQPreset } from '../types/music';

export const EQ_FREQUENCIES: { frequency: number; label: string; type: BiquadFilterType }[] = [
  { frequency: 32, label: '32', type: 'lowshelf' },
  { frequency: 64, label: '64', type: 'peaking' },
  { frequency: 125, label: '125', type: 'peaking' },
  { frequency: 250, label: '250', type: 'peaking' },
  { frequency: 500, label: '500', type: 'peaking' },
  { frequency: 1000, label: '1К', type: 'peaking' },
  { frequency: 2000, label: '2К', type: 'peaking' },
  { frequency: 4000, label: '4К', type: 'peaking' },
  { frequency: 8000, label: '8К', type: 'peaking' },
  { frequency: 16000, label: '16К', type: 'highshelf' },
];

export const BUILTIN_EQ_PRESETS: EQPreset[] = [
  {
    id: 'flat',
    name: 'По умолчанию',
    gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    preamp: 0,
    bassBoost: 0,
  },
  {
    id: 'bass_boost',
    name: 'Глубокий бас',
    gains: [7.5, 6.5, 4.5, 1.5, -0.5, -1.0, 0.5, 1.5, 2.0, 2.5],
    preamp: -1.5,
    bassBoost: 5,
  },
  {
    id: 'phonk_night',
    name: 'Фонк & Драйв',
    gains: [8.0, 7.0, 3.0, -2.0, -1.5, 2.0, 4.5, 5.5, 4.0, 3.5],
    preamp: -2.0,
    bassBoost: 6,
  },
  {
    id: 'vocal_live',
    name: 'Чистый вокал',
    gains: [-2.0, -1.5, 0, 2.5, 4.5, 5.0, 4.0, 2.0, 0.5, 0],
    preamp: 0,
    bassBoost: 0,
  },
  {
    id: 'late_night',
    name: 'Ночной режим',
    gains: [4.0, 3.5, 2.0, 0.5, -1.0, -1.5, -2.0, -1.5, 1.0, 2.0],
    preamp: -1.0,
    bassBoost: 3,
  },
  {
    id: 'rock_postpunk',
    name: 'Пост-панк',
    gains: [5.0, 4.0, 1.5, -1.5, -1.0, 1.5, 3.5, 4.5, 4.5, 4.0],
    preamp: -1.0,
    bassBoost: 3,
  },
];

export function clampGain(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.max(-12, Math.min(12, Number(db.toFixed(1))));
}

export function buildEQBands(gains: number[]): EQBand[] {
  return EQ_FREQUENCIES.map((spec, idx) => ({
    frequency: spec.frequency,
    label: spec.label,
    gain: clampGain(gains[idx] ?? 0),
    type: spec.type,
  }));
}

/**
 * Generates a smooth cubic SVG path representing the 10-band EQ frequency response curve.
 */
export function generateEQCurvePath(
  gains: number[],
  width: number,
  height: number,
  paddingX = 18,
  paddingY = 14
): { linePath: string; areaPath: string; points: { x: number; y: number }[] } {
  const safeGains = EQ_FREQUENCIES.map((_, i) => clampGain(gains[i] ?? 0));
  const innerWidth = Math.max(10, width - paddingX * 2);
  const innerHeight = Math.max(10, height - paddingY * 2);
  const midY = paddingY + innerHeight / 2;

  const points = safeGains.map((gain, idx) => {
    const x = paddingX + (idx / (safeGains.length - 1)) * innerWidth;
    // +12dB maps to paddingY, -12dB maps to paddingY + innerHeight
    const normalized = gain / 12; // -1..1
    const y = midY - normalized * (innerHeight / 2);
    return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
  });

  if (points.length === 0) {
    return { linePath: '', areaPath: '', points: [] };
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cpX = Number(((p0.x + p1.x) / 2).toFixed(2));
    d += ` C ${cpX} ${p0.y}, ${cpX} ${p1.y}, ${p1.x} ${p1.y}`;
  }

  const last = points[points.length - 1];
  const first = points[0];
  const areaPath = `${d} L ${last.x} ${height} L ${first.x} ${height} Z`;

  return { linePath: d, areaPath, points };
}
