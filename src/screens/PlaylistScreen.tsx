// Core
import { useEffect, useRef, useState } from 'react'
// Components
import TrackList from '@/components/TrackList'
import PlaylistFormModal from '@/components/PlaylistFormModal'
import {
  BackIcon,
  PlusIcon,
  PlayIcon,
  ShuffleIcon,
  EditIcon,
  TrashIcon,
  MusicIcon,
  PlaylistIcon,
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
  const dirInputRef = useRef<HTMLInputElement>(null)
  const [renaming, setRenaming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // `webkitdirectory` is not a typed React attribute — set it imperatively.
  useEffect(() => {
    if (dirInputRef.current) {
      dirInputRef.current.setAttribute('webkitdirectory', '')
      dirInputRef.current.setAttribute('directory', '')
    }
  }, [])

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
    if (result.added > 0 && result.skipped.length > 0) {
      showToast(`Added ${result.added}, skipped ${result.skipped.length} non-audio file(s)`)
    } else if (result.added > 0) {
      showToast(`Added ${result.added} track${result.added === 1 ? '' : 's'}`)
    } else {
      showToast('No supported audio files found')
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (dirInputRef.current) dirInputRef.current.value = ''
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

  const handleReorder = (trackIds: string[]) => {
    void reorderTracks(playlistId, trackIds)
  }

  return (
    <div className={`playlist-screen${player.currentTrackId ? ' has-mini' : ''}`}>
      <div className="playlist-static">
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
          <button className="btn" onClick={() => dirInputRef.current?.click()}>
            <PlaylistIcon width={18} height={18} /> Add Folder
          </button>
        </div>
        <div className="btn-row">
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
        <input
          ref={dirInputRef}
          type="file"
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
      </div>

      <div className="playlist-scroll">
        {tracks.length === 0 && !importProgress ? (
          <div className="empty">
            <div className="empty-icon">
              <MusicIcon width={40} height={40} />
            </div>
            <h2>Empty playlist</h2>
            <p>Tap “Add Music” to pick files, or “Add Folder” to import a whole folder.</p>
          </div>
        ) : (
          <TrackList
            tracks={tracks}
            onPlay={playTrack}
            onRemove={handleRemove}
            onReorder={handleReorder}
          />
        )}
      </div>

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
