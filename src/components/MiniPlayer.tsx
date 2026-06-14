// Core
import { useState, type CSSProperties } from 'react'
// Components
import {
  PlayIcon,
  PauseIcon,
  NextIcon,
  PrevIcon,
  MusicIcon,
  Rewind10Icon,
  Forward10Icon,
} from '@/components/Icons'
// Store
import { usePlayerStore } from '@/store/usePlayerStore'
import { useLibraryStore } from '@/store/useLibraryStore'
import { useUiStore } from '@/store/useUiStore'
// Utils
import { formatTime } from '@/utils/format'

export default function MiniPlayer() {
  const {
    currentTrackId,
    isPlaying,
    currentTime,
    duration,
    coverUrl,
    queue,
    queueIndex,
    togglePlay,
    next,
    previousTrack,
    seek,
  } = usePlayerStore()
  const track = useLibraryStore((s) => (currentTrackId ? s.getTrack(currentTrackId) : undefined))
  const openFullPlayer = useUiStore((s) => s.openFullPlayer)
  const [seeking, setSeeking] = useState<number | null>(null)

  if (!track) return null

  const totalDuration = duration || track.duration || 0
  const shownTime = Math.min(seeking ?? currentTime, totalDuration || currentTime)
  const progress = totalDuration > 0 ? Math.min(100, (shownTime / totalDuration) * 100) : 0
  const hasPreviousTrack = queueIndex > 0
  const hasNextTrack = queueIndex >= 0 && queueIndex < queue.length - 1
  const seekTo = (time: number) => seek(Math.max(0, Math.min(time, totalDuration || time)))
  const jumpBy = (seconds: number) => {
    seekTo(shownTime + seconds)
    setSeeking(null)
  }

  return (
    <div className="mini-player">
      <div className="mini-inner">
        <div className="mini-main">
          <button
            type="button"
            className="mini-art"
            onClick={openFullPlayer}
            aria-label="Open player"
          >
            {coverUrl ? <img src={coverUrl} alt="" /> : <MusicIcon width={22} height={22} />}
          </button>
          <button type="button" className="mini-info" onClick={openFullPlayer}>
            <div className="title">{track.title}</div>
            <div className="artist">{track.artist}</div>
          </button>
        </div>

        <div className="mini-seek">
          <input
            className="mini-scrub"
            type="range"
            min={0}
            max={totalDuration}
            step={0.1}
            value={shownTime}
            disabled={totalDuration <= 0}
            aria-label="Seek track"
            style={{
              '--mini-progress': `${progress}%`,
            } as CSSProperties}
            onChange={(e) => {
              const value = Number(e.target.value)
              setSeeking(value)
              seekTo(value)
            }}
            onMouseUp={() => setSeeking(null)}
            onTouchEnd={() => setSeeking(null)}
            onKeyUp={() => setSeeking(null)}
            onBlur={() => setSeeking(null)}
          />
          <div className="mini-times">
            <span>{formatTime(shownTime)}</span>
            <span>{formatTime(totalDuration)}</span>
          </div>
        </div>

        <div className="mini-controls" aria-label="Mini player controls">
          <button
            type="button"
            className="ctrl"
            onClick={() => void previousTrack()}
            aria-label="Previous track"
            disabled={!hasPreviousTrack}
          >
            <PrevIcon width={28} height={28} />
          </button>
          <button
            type="button"
            className="ctrl"
            onClick={() => jumpBy(-10)}
            aria-label="Rewind 10 seconds"
          >
            <Rewind10Icon width={28} height={28} />
          </button>
          <button
            type="button"
            className="ctrl play-toggle"
            onClick={() => void togglePlay()}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <PauseIcon width={32} height={32} /> : <PlayIcon width={32} height={32} />}
          </button>
          <button
            type="button"
            className="ctrl"
            onClick={() => jumpBy(10)}
            aria-label="Forward 10 seconds"
          >
            <Forward10Icon width={28} height={28} />
          </button>
          <button
            type="button"
            className="ctrl"
            onClick={() => void next()}
            aria-label="Next track"
            disabled={!hasNextTrack}
          >
            <NextIcon width={28} height={28} />
          </button>
        </div>
      </div>
    </div>
  )
}
