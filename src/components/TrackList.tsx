// Core
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
// Components
import TrackItem from '@/components/TrackItem'
// Store
import { usePlayerStore } from '@/store/usePlayerStore'
// Types
import type { Track } from '@/types'

interface Props {
  tracks: Track[]
  editing: boolean
  onPlay: (trackId: string) => void
  onRemove: (trackId: string) => void
  onRename: (trackId: string) => void
  onReorder: (trackIds: string[]) => void
}

export default function TrackList({
  tracks,
  editing,
  onPlay,
  onRemove,
  onRename,
  onReorder,
}: Props) {
  const currentTrackId = usePlayerStore((s) => s.currentTrackId)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)

  // Live row order — diverges from `tracks` only while dragging.
  const [order, setOrder] = useState<string[]>(() => tracks.map((t) => t.id))
  const [dragId, setDragId] = useState<string | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Keep local order in sync with the store when not actively dragging.
  useEffect(() => {
    if (!dragId) setOrder(tracks.map((t) => t.id))
  }, [tracks, dragId])

  const trackMap = new Map(tracks.map((t) => [t.id, t]))

  const handleDragStart = (id: string) => (e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragId(id)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handleDragMove = (e: ReactPointerEvent) => {
    if (!dragId) return
    e.preventDefault()
    const y = e.clientY
    const others = order.filter((id) => id !== dragId)
    let to = others.length
    for (let i = 0; i < others.length; i++) {
      const el = rowRefs.current[others[i]]
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (y < r.top + r.height / 2) {
        to = i
        break
      }
    }
    const next = [...others.slice(0, to), dragId, ...others.slice(to)]
    // Only update state when the order actually changed.
    if (next.some((id, i) => id !== order[i])) setOrder(next)
  }

  const handleDragEnd = (e: ReactPointerEvent) => {
    if (!dragId) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* pointer may already be released */
    }
    const finalOrder = order
    setDragId(null)
    const original = tracks.map((t) => t.id)
    if (finalOrder.some((id, i) => id !== original[i])) onReorder(finalOrder)
  }

  return (
    <div className="track-list">
      {order.map((id, i) => {
        const track = trackMap.get(id)
        if (!track) return null
        const isCurrent = currentTrackId === id
        const remaining =
          isCurrent && duration > 0 ? Math.max(0, duration - currentTime) : null
        return (
          <TrackItem
            key={id}
            track={track}
            index={i}
            isCurrent={isCurrent}
            isPlaying={isCurrent && isPlaying}
            isDragging={dragId === id}
            editing={editing}
            remaining={remaining}
            registerRef={(el) => {
              rowRefs.current[id] = el
            }}
            onPlay={() => onPlay(id)}
            onRemove={() => onRemove(id)}
            onRename={() => onRename(id)}
            onDragStart={handleDragStart(id)}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
          />
        )
      })}
    </div>
  )
}
