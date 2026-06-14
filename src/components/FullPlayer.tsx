// Core
import { useEffect, useState } from 'react'
// Components
import {
  PlayIcon,
  PauseIcon,
  NextIcon,
  PrevIcon,
  ShuffleIcon,
  RepeatIcon,
  RepeatOneIcon,
  ChevronDownIcon,
  MusicIcon,
  VolumeIcon,
} from '@/components/Icons'
// Store
import { usePlayerStore } from '@/store/usePlayerStore'
import { useLibraryStore } from '@/store/useLibraryStore'
import { useUiStore } from '@/store/useUiStore'
// Utils
import { formatTime } from '@/utils/format'

export default function FullPlayer() {
  const player = usePlayerStore()
  const {
    currentTrackId,
    currentPlaylistId,
    isPlaying,
    currentTime,
    duration,
    volume,
    shuffleEnabled,
    repeatMode,
    coverUrl,
  } = player
  const track = useLibraryStore((s) => (currentTrackId ? s.getTrack(currentTrackId) : undefined))
  const playlist = useLibraryStore((s) =>
    currentPlaylistId ? s.getPlaylist(currentPlaylistId) : undefined,
  )
  const closeFullPlayer = useUiStore((s) => s.closeFullPlayer)

  // Local seek state so dragging the slider feels smooth.
  const [seeking, setSeeking] = useState<number | null>(null)
  const shownTime = seeking ?? currentTime

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeFullPlayer()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeFullPlayer])

  if (!track) return null

  const supportsVolume = !/iPhone|iPad|iPod/.test(navigator.userAgent)

  return (
    <div className="full-player">
      <div className="full-top">
        <button className="icon-btn ghost" onClick={closeFullPlayer} aria-label="Close player">
          <ChevronDownIcon />
        </button>
        <div className="label">{playlist ? playlist.name : 'Now Playing'}</div>
        <span style={{ width: 42 }} />
      </div>

      <div className="full-art-wrap">
        <div className="full-art">
          {coverUrl ? <img src={coverUrl} alt="" /> : <MusicIcon width={96} height={96} />}
        </div>
      </div>

      <div className="full-meta">
        <div className="title">{track.title}</div>
        <div className="artist">{track.artist}</div>
      </div>

      <div className="seek">
        <input
          type="range"
          min={0}
          max={duration || track.duration || 0}
          step={0.1}
          value={Math.min(shownTime, duration || track.duration || 0)}
          onChange={(e) => setSeeking(Number(e.target.value))}
          onMouseUp={(e) => {
            player.seek(Number((e.target as HTMLInputElement).value))
            setSeeking(null)
          }}
          onTouchEnd={(e) => {
            player.seek(Number((e.target as HTMLInputElement).value))
            setSeeking(null)
          }}
        />
        <div className="times">
          <span>{formatTime(shownTime)}</span>
          <span>{formatTime(duration || track.duration)}</span>
        </div>
      </div>

      <div className="transport">
        <button
          className={`side${shuffleEnabled ? ' active' : ''}`}
          onClick={player.toggleShuffle}
          aria-label="Shuffle"
        >
          <ShuffleIcon width={22} height={22} />
        </button>
        <button className="nav" onClick={() => void player.previous()} aria-label="Previous">
          <PrevIcon width={34} height={34} />
        </button>
        <button className="play" onClick={() => void player.togglePlay()} aria-label="Play/Pause">
          {isPlaying ? <PauseIcon width={34} height={34} /> : <PlayIcon width={34} height={34} />}
        </button>
        <button className="nav" onClick={() => void player.next()} aria-label="Next">
          <NextIcon width={34} height={34} />
        </button>
        <button
          className={`side${repeatMode !== 'off' ? ' active' : ''}`}
          onClick={player.cycleRepeat}
          aria-label="Repeat"
        >
          {repeatMode === 'one' ? (
            <RepeatOneIcon width={22} height={22} />
          ) : (
            <RepeatIcon width={22} height={22} />
          )}
        </button>
      </div>

      {supportsVolume && (
        <div className="volume-row">
          <VolumeIcon width={20} height={20} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => player.setVolume(Number(e.target.value))}
          />
        </div>
      )}
    </div>
  )
}
