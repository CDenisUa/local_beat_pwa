// Core
import { useRef, useState } from 'react'
// Components
import TrackItem from '@/components/TrackItem'
import PlaylistFormModal from '@/components/PlaylistFormModal'
import {
  BackIcon,
  PlusIcon,
  PlayIcon,
  ShuffleIcon,
  EditIcon,
  TrashIcon,
  MusicIcon,
} from '@/components/Icons'
// Store
import { useLibraryStore } from '@/store/useLibraryStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useUiStore } from '@/store/useUiStore'
// Utils
import { formatTotalDuration } from '@/utils/format'

const ACCEPT = 'audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac'

interface Props {
  playlistId: string
}

export default function PlaylistScreen({ playlistId }: Props) {
  const playlist = useLibraryStore((s) => s.getPlaylist(playlistId))
  const tracks = useLibraryStore((s) => s.getPlaylistTracks(playlistId))
  const { addFiles, renamePlaylist, deletePlaylist, removeTrack, reorderTracks, importProgress } =
    useLibraryStore()
  const player = usePlayerStore()
  const { goHome, openFullPlayer, showToast } = useUiStore()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [renaming, setRenaming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!playlist) {
    // Playlist was deleted — bounce home.
    goHome()
    return null
  }

  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0)

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    const files = Array.from(fileList)
    const result = await addFiles(playlistId, files)
    if (result.skipped.length > 0) {
      showToast(
        `Added ${result.added}. Skipped ${result.skipped.length} unsupported file${
          result.skipped.length === 1 ? '' : 's'
        }.`,
      )
    } else if (result.added > 0) {
      showToast(`Added ${result.added} track${result.added === 1 ? '' : 's'}`)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const playAll = () => {
    if (tracks.length === 0) return
    if (player.shuffleEnabled) player.toggleShuffle()
    void player.playPlaylist(playlistId)
    openFullPlayer()
  }

  const shufflePlay = () => {
    if (tracks.length === 0) return
    if (!player.shuffleEnabled) player.toggleShuffle()
    void player.playPlaylist(playlistId)
    openFullPlayer()
  }

  const playTrack = (trackId: string) => {
    if (player.currentTrackId === trackId) {
      void player.togglePlay()
    } else {
      void player.playPlaylist(playlistId, trackId)
    }
  }

  const handleRemove = (trackId: string) => {
    void removeTrack(playlistId, trackId)
    player.handleTrackRemoved(trackId)
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= playlist.trackIds.length) return
    const ids = playlist.trackIds.slice()
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved)
    void reorderTracks(playlistId, ids)
  }

  return (
    <div className={`screen${player.currentTrackId ? ' has-mini' : ''}`}>
      <div className="topbar">
        <button className="icon-btn" onClick={goHome} aria-label="Back">
          <BackIcon />
        </button>
        <h1 style={{ fontSize: 18, opacity: 0.7, fontWeight: 600 }}>Playlist</h1>
      </div>

      <div className="playlist-head">
        <div className="name">{playlist.name}</div>
        <div className="sub">
          {playlist.trackIds.length} {playlist.trackIds.length === 1 ? 'track' : 'tracks'}
          {totalDuration > 0 && ` · ${formatTotalDuration(totalDuration)}`}
        </div>
      </div>

      <div className="btn-row">
        <button className="btn primary" onClick={() => fileInputRef.current?.click()}>
          <PlusIcon width={18} height={18} /> Add Music
        </button>
        <button className="btn" onClick={playAll} disabled={tracks.length === 0}>
          <PlayIcon width={18} height={18} /> Play All
        </button>
        <button className="btn" onClick={shufflePlay} disabled={tracks.length === 0}>
          <ShuffleIcon width={18} height={18} /> Shuffle
        </button>
      </div>
      <div className="btn-row">
        <button className="btn" onClick={() => setRenaming(true)}>
          <EditIcon width={18} height={18} /> Rename
        </button>
        <button className="btn danger" onClick={() => setConfirmDelete(true)}>
          <TrashIcon width={18} height={18} /> Delete
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {importProgress && (
        <div className="import-bar">
          Importing {importProgress.done} / {importProgress.total}…
          <div className="track">
            <div
              className="fill"
              style={{ width: `${(importProgress.done / importProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {tracks.length === 0 && !importProgress ? (
        <div className="empty">
          <div className="empty-icon">
            <MusicIcon width={40} height={40} />
          </div>
          <h2>Empty playlist</h2>
          <p>Tap “Add Music” to choose audio files from your device.</p>
        </div>
      ) : (
        <div className="track-list">
          {tracks.map((track, i) => (
            <TrackItem
              key={track.id}
              track={track}
              index={i}
              isCurrent={player.currentTrackId === track.id}
              isPlaying={player.currentTrackId === track.id && player.isPlaying}
              canMoveUp={i > 0}
              canMoveDown={i < tracks.length - 1}
              onPlay={() => playTrack(track.id)}
              onRemove={() => handleRemove(track.id)}
              onMoveUp={() => move(i, i - 1)}
              onMoveDown={() => move(i, i + 1)}
            />
          ))}
        </div>
      )}

      {renaming && (
        <PlaylistFormModal
          title="Rename Playlist"
          initialValue={playlist.name}
          confirmLabel="Save"
          onSubmit={(name) => {
            void renamePlaylist(playlistId, name)
            setRenaming(false)
          }}
          onClose={() => setRenaming(false)}
        />
      )}

      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Delete playlist?</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.5 }}>
              “{playlist.name}” and all {playlist.trackIds.length} of its tracks will be removed from
              this device. This cannot be undone.
            </p>
            <div className="actions">
              <button className="btn" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  playlist.trackIds.forEach((id) => player.handleTrackRemoved(id))
                  void deletePlaylist(playlistId)
                  setConfirmDelete(false)
                  goHome()
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
