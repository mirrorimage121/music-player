export enum RepeatMode {
  OFF = 'off',
  ALL = 'all',
  ONE = 'one',
}

export enum TrackSource {
  LOCAL = 'local',
  CLOUD = 'cloud',
  SPOTIFY = 'spotify',
  SOUNDCLOUD = 'soundcloud',
  BUILTIN = 'builtin',
}

export enum CloudProvider {
  GOOGLE_DRIVE = 'gdrive',
  DROPBOX = 'dropbox',
  YANDEX_DISK = 'yandex',
  DIRECT_URL = 'direct',
}

export enum LeftWidgetMode {
  PULSE_BPM = 'pulse_bpm',
  MINI_EQ = 'mini_eq',
}

export type ThemeMode = 'dark' | 'light';

export interface PlayerCustomization {
  theme: ThemeMode;
  accentColor: string; // 'default' or hex '#rrggbb'
  glowIntensity: number; // 0..1
}

export interface LyricWord {
  text: string;
  startTime: number;
  endTime: number;
}

export interface LyricLine {
  id: string;
  time: number; // seconds
  text: string;
  words?: LyricWord[];
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number; // seconds
  audioUrl: string;
  coverUrl: string;
  explicit?: boolean;
  bpm: number;
  bpmRange?: [number, number];
  source: TrackSource;
  cloudProvider?: CloudProvider;
  externalUrl?: string;
  isFavorite: boolean;
  isOfflineCached?: boolean;
  offlineSizeBytes?: number;
  accentGlow?: string;
  lyricsSynced?: boolean;
  lyricsSource?: string;
  lyrics: LyricLine[];
  addedAt: number;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  trackIds: string[];
  source?: 'spotify' | 'soundcloud';
  externalUrl?: string;
  scheduleSlot?: 'morning' | 'afternoon' | 'evening';
  scheduleTime?: string;
  isSystem?: boolean;
  createdAt: number;
}

export interface EQBand {
  frequency: number;
  label: string;
  gain: number; // -12 to +12 dB
  type: BiquadFilterType;
}

export interface EQPreset {
  id: string;
  name: string;
  gains: number[]; // 10 bands
  preamp: number;
  bassBoost: number;
}

export interface StreamingConnectionStatus {
  spotifyConnected: boolean;
  soundcloudConnected: boolean;
  dropboxConnected: boolean;
  spotifyConfigured: boolean;
  soundcloudConfigured: boolean;
  dropboxConfigured: boolean;
}
