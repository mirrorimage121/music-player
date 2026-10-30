import React, { useEffect, useState } from 'react';
import { CheckCircle2, Disc3, Music2 } from 'lucide-react';
import { Track, TrackSource } from '../types/music';
import { formatTimecodeLong } from '../utils/lrcParser';

interface ArtworkStageCardProps {
  track: Track;
  currentTime: number;
  isPlaying: boolean;
  onOpenPlaylists: () => void;
}

const SOURCE_LABELS: Record<TrackSource, string> = {
  [TrackSource.BUILTIN]: 'Сейчас играет',
  [TrackSource.LOCAL]: 'Локальный MP3',
  [TrackSource.CLOUD]: 'Облачный диск',
  [TrackSource.SPOTIFY]: 'Spotify Sync',
  [TrackSource.SOUNDCLOUD]: 'SoundCloud Sync',
};

export const ArtworkStageCard: React.FC<ArtworkStageCardProps> = ({
  track,
  currentTime,
  isPlaying,
  onOpenPlaylists,
}) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [track.coverUrl]);

  return (
    <div className="relative w-full h-[205px] sm:h-[232px] rounded-[28px] overflow-hidden border border-slate-900/12 dark:border-white/[0.12] bg-zinc-950 shadow-[0_18px_40px_rgba(15,23,42,0.16)] dark:shadow-[0_22px_50px_rgba(0,0,0,0.55)] select-none group">
      {!imgError ? (
        <img
          src={track.coverUrl}
          alt={`${track.title} — ${track.artist}`}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className={`w-full h-full object-cover transition-transform duration-700 ${
            isPlaying ? 'scale-[1.03]' : 'scale-100'
          }`}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-800 via-zinc-900 to-black text-zinc-400">
          <Disc3 className="w-12 h-12 mb-2 opacity-60" />
          <span className="text-xs font-medium">{track.title}</span>
        </div>
      )}

      {/* Measured contrast scrim matching screenshot top/bottom vignette */}
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/45 pointer-events-none"
        aria-hidden="true"
      />

      {/* Top-left "Сейчас играет" pill button (matching screenshot) */}
      <div className="absolute top-3.5 left-4 right-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onOpenPlaylists}
          className="inline-flex items-center gap-1.5 rounded-full bg-black/65 hover:bg-black/85 backdrop-blur-md border border-white/10 px-3 py-1 text-[11px] font-semibold text-zinc-100 transition-colors cursor-pointer"
        >
          <Music2 className="w-3 h-3 text-zinc-200" />
          <span>{SOURCE_LABELS[track.source] || 'Сейчас играет'}</span>
        </button>

        {track.isOfflineCached && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300 drop-shadow">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Офлайн</span>
          </span>
        )}
      </div>

      {/* Bottom row: Artist watermark left + tabular HH:MM:SS timecode right */}
      <div className="absolute bottom-3.5 left-4 right-4 flex items-center justify-between text-[11px] font-semibold tracking-wider text-zinc-300/85 pointer-events-none">
        <span className="truncate max-w-[65%] uppercase">
          {track.artist.replace(/,/g, ' ·')}
        </span>
        <span className="font-mono-tabular text-zinc-200/90">
          {formatTimecodeLong(currentTime)}
        </span>
      </div>
    </div>
  );
};
