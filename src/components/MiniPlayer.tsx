// Components
import { PlayIcon, PauseIcon, NextIcon, MusicIcon } from '@/components/Icons'
// Store
import { usePlayerStore } from '@/store/usePlayerStore'
import { useLibraryStore } from '@/store/useLibraryStore'
import { useUiStore } from '@/store/useUiStore'

export default function MiniPlayer() {
  const { currentTrackId, isPlaying, currentTime, duration, coverUrl, togglePlay, next } =
    usePlayerStore()
  const track = useLibraryStore((s) => (currentTrackId ? s.getTrack(currentTrackId) : undefined))
  const openFullPlayer = useUiStore((s) => s.openFullPlayer)

  if (!track) return null

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0

  return (
    <div className="mini-player">
      <div className="mini-inner">
        <div className="progress-line" style={{ width: `${progress}%` }} />
        <button
          className="mini-art"
          onClick={openFullPlayer}
          aria-label="Open player"
        >
          {coverUrl ? <img src={coverUrl} alt="" /> : <MusicIcon width={22} height={22} />}
        </button>
        <button className="mini-info" onClick={openFullPlayer}>
          <div className="title">{track.title}</div>
          <div className="artist">{track.artist}</div>
        </button>
        <div className="mini-controls">
          <button
            className="ctrl"
            onClick={() => void togglePlay()}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <PauseIcon width={24} height={24} /> : <PlayIcon width={24} height={24} />}
          </button>
          <button className="ctrl" onClick={() => void next()} aria-label="Next">
            <NextIcon width={24} height={24} />
          </button>
        </div>
      </div>
    </div>
  )
}
