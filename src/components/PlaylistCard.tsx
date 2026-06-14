// Components
import { MusicIcon, TrashIcon } from '@/components/Icons'
// Types
import type { Playlist } from '@/types'
// Store
import { useLibraryStore } from '@/store/useLibraryStore'
// Utils
import { formatRelativeDate, formatTotalDuration } from '@/utils/format'

interface Props {
  playlist: Playlist
  onClick: () => void
  onDelete: () => void
}

export default function PlaylistCard({ playlist, onClick, onDelete }: Props) {
  const tracks = useLibraryStore((s) => s.getPlaylistTracks(playlist.id))
  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0)
  const count = playlist.trackIds.length

  return (
    <div className="playlist-card">
      <button type="button" className="playlist-card-main" onClick={onClick}>
        <div className="art">
          <MusicIcon width={26} height={26} />
        </div>
        <div className="meta">
          <div className="name">{playlist.name}</div>
          <div className="sub">
            {count} {count === 1 ? 'track' : 'tracks'}
            {totalDuration > 0 && ` · ${formatTotalDuration(totalDuration)}`}
          </div>
          <div className="date">Updated {formatRelativeDate(playlist.updatedAt)}</div>
        </div>
      </button>
      <button
        type="button"
        className="playlist-delete"
        onClick={onDelete}
        aria-label={`Delete ${playlist.name}`}
        title="Delete playlist"
      >
        <TrashIcon width={18} height={18} />
      </button>
    </div>
  )
}
