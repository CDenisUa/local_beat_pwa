// Core
import { useState } from 'react'
// Components
import { TrashIcon, PlayIcon, PauseIcon } from '@/components/Icons'
// Types
import type { Track } from '@/types'
// Utils
import { formatTime } from '@/utils/format'

interface Props {
  track: Track
  index: number
  isCurrent: boolean
  isPlaying: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onPlay: () => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

export default function TrackItem({
  track,
  index,
  isCurrent,
  isPlaying,
  canMoveUp,
  canMoveDown,
  onPlay,
  onRemove,
  onMoveUp,
  onMoveDown,
}: Props) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className={`track-item${isCurrent ? ' playing' : ''}`}>
      <button className="index" onClick={onPlay} aria-label="Play track">
        {isCurrent && isPlaying ? (
          <PauseIcon width={16} height={16} />
        ) : isCurrent ? (
          <PlayIcon width={16} height={16} />
        ) : (
          index + 1
        )}
      </button>
      <button className="body" onClick={onPlay}>
        <div className="title">{track.title}</div>
        <div className="artist">{track.artist}</div>
      </button>
      <span className="dur">{formatTime(track.duration)}</span>
      <div className="reorder">
        <button onClick={onMoveUp} disabled={!canMoveUp} aria-label="Move up">
          ▲
        </button>
        <button onClick={onMoveDown} disabled={!canMoveDown} aria-label="Move down">
          ▼
        </button>
      </div>
      <button
        className="row-btn"
        onClick={() => {
          if (confirming) {
            onRemove()
          } else {
            setConfirming(true)
            setTimeout(() => setConfirming(false), 2500)
          }
        }}
        aria-label="Remove track"
        title={confirming ? 'Tap again to remove' : 'Remove'}
        style={confirming ? { color: 'var(--danger)', background: 'var(--surface-hover)' } : undefined}
      >
        <TrashIcon width={18} height={18} />
      </button>
    </div>
  )
}
