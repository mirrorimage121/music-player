import { EQ_FREQUENCIES, clampGain } from '../utils/equalizerMath';

/**
 * Real Web Audio API 10-Band Parametric/Graphic Equalizer + Preamp + Bass Shelf + FFT/Waveform Analyser.
 */
class PulseAudioEngine {
  private audio: HTMLAudioElement;
  private ctx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private preampNode: GainNode | null = null;
  private bassBoostNode: BiquadFilterNode | null = null;
  private bandFilters: BiquadFilterNode[] = [];
  private analyser: AnalyserNode | null = null;

  private eqEnabled = true;
  private currentGains: number[] = new Array(10).fill(0);
  private currentPreamp = 0;
  private currentBassBoost = 0;
  private activeObjectUrl: string | null = null;

  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'metadata';
  }

  public getAudioElement(): HTMLAudioElement {
    return this.audio;
  }

  public ensureGraph(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      const source = ctx.createMediaElementSource(this.audio);
      const preamp = ctx.createGain();
      const bassShelf = ctx.createBiquadFilter();
      bassShelf.type = 'lowshelf';
      bassShelf.frequency.value = 85;
      bassShelf.gain.value = 0;

      const filters = EQ_FREQUENCIES.map((spec) => {
        const filter = ctx.createBiquadFilter();
        filter.type = spec.type;
        filter.frequency.value = spec.frequency;
        filter.Q.value = spec.type === 'peaking' ? 1.4 : 0.707;
        filter.gain.value = 0;
        return filter;
      });

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;

      // Connect audio DSP chain
      source.connect(preamp);
      preamp.connect(bassShelf);

      let prev: AudioNode = bassShelf;
      for (const f of filters) {
        prev.connect(f);
        prev = f;
      }
      prev.connect(analyser);
      analyser.connect(ctx.destination);

      this.ctx = ctx;
      this.sourceNode = source;
      this.preampNode = preamp;
      this.bassBoostNode = bassShelf;
      this.bandFilters = filters;
      this.analyser = analyser;

      this.applyDSPValues();

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch (err) {
      console.warn('Web Audio graph initialization skipped:', err);
    }
  }

  public setSource(url: string, isObjectUrl = false): void {
    if (this.activeObjectUrl && this.activeObjectUrl !== url) {
      URL.revokeObjectURL(this.activeObjectUrl);
      this.activeObjectUrl = null;
    }
    if (isObjectUrl) {
      this.activeObjectUrl = url;
    }
    if (this.audio.src !== url) {
      this.audio.src = url;
      this.audio.load();
    }
  }

  public async play(): Promise<void> {
    this.ensureGraph();
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume().catch(() => {});
    }
    await this.audio.play();
  }

  public pause(): void {
    this.audio.pause();
  }

  public seek(seconds: number): void {
    if (Number.isFinite(seconds)) {
      this.audio.currentTime = Math.max(0, seconds);
    }
  }

  public setVolume(vol: number): void {
    this.audio.volume = Math.max(0, Math.min(1, vol));
  }

  public setEqualizer(options: {
    enabled: boolean;
    gains: number[];
    preamp: number;
    bassBoost: number;
  }): void {
    this.eqEnabled = options.enabled;
    this.currentGains = options.gains.map((g) => clampGain(g));
    this.currentPreamp = clampGain(options.preamp);
    this.currentBassBoost = Math.max(0, Math.min(12, options.bassBoost));
    this.applyDSPValues();
  }

  private applyDSPValues(): void {
    if (!this.ctx || !this.preampNode || !this.bassBoostNode) return;
    const now = this.ctx.currentTime;

    if (!this.eqEnabled) {
      this.preampNode.gain.setTargetAtTime(1.0, now, 0.02);
      this.bassBoostNode.gain.setTargetAtTime(0, now, 0.02);
      this.bandFilters.forEach((f) => f.gain.setTargetAtTime(0, now, 0.02));
      return;
    }

    const linearPreamp = Math.pow(10, this.currentPreamp / 20);
    this.preampNode.gain.setTargetAtTime(linearPreamp, now, 0.02);
    this.bassBoostNode.gain.setTargetAtTime(this.currentBassBoost, now, 0.02);
    this.bandFilters.forEach((f, idx) => {
      const targetGain = this.currentGains[idx] ?? 0;
      f.gain.setTargetAtTime(targetGain, now, 0.02);
    });
  }

  public getFrequencyData(target: Uint8Array): boolean {
    if (!this.analyser) return false;
    this.analyser.getByteFrequencyData(target as Uint8Array<ArrayBuffer>);
    return true;
  }

  public getWaveformData(target: Uint8Array): boolean {
    if (!this.analyser) return false;
    this.analyser.getByteTimeDomainData(target as Uint8Array<ArrayBuffer>);
    return true;
  }
}

export const audioEngine = new PulseAudioEngine();
