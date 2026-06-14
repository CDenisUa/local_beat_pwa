// Core
import { useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
// Components
import { TrashIcon, PlayIcon, PauseIcon, DragIcon, EditIcon } from '@/components/Icons'
// Types
import type { Track } from '@/types'
// Utils
import { formatTime } from '@/utils/format'

interface Props {
  track: Track
  index: number
  isCurrent: boolean
  isPlaying: boolean
  isDragging: boolean
  editing: boolean
  /** Remaining seconds for the currently playing track (countdown). */
  remaining: number | null
  registerRef: (el: HTMLDivElement | null) => void
  onPlay: () => void
  onRemove: () => void
  onRename: () => void
  onDragStart: (e: ReactPointerEvent) => void
  onDragMove: (e: ReactPointerEvent) => void
  onDragEnd: (e: ReactPointerEvent) => void
}

export default function TrackItem({
  track,
  index,
  isCurrent,
  isPlaying,
  isDragging,
  editing,
  remaining,
  registerRef,
  onPlay,
  onRemove,
  onRename,
  onDragStart,
  onDragMove,
  onDragEnd,
}: Props) {
  const [confirming, setConfirming] = useState(false)

  const timeLabel =
    isCurrent && remaining != null ? `-${formatTime(remaining)}` : formatTime(track.duration)

  return (
    <div
      ref={registerRef}
      className={`track-item${isCurrent ? ' playing' : ''}${isDragging ? ' dragging' : ''}`}
    >
      <button
        className="drag-handle"
        aria-label="Reorder track"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <DragIcon width={20} height={20} />
      </button>
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
      {editing && (
        <>
          <button className="row-btn" onClick={onRename} aria-label="Rename track" title="Rename">
            <EditIcon width={18} height={18} />
          </button>
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
            style={
              confirming ? { color: 'var(--danger)', background: 'var(--surface-hover)' } : undefined
            }
          >
            <TrashIcon width={18} height={18} />
          </button>
        </>
      )}
      <span className={`dur${isCurrent && remaining != null ? ' remaining' : ''}`}>{timeLabel}</span>
    </div>
  )
}
