// Core
import { useState } from 'react'
// Components
import { BackIcon, TrashIcon, MusicIcon } from '@/components/Icons'
// Store
import { useLibraryStore } from '@/store/useLibraryStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useUiStore } from '@/store/useUiStore'
// Utils
import { formatBytes } from '@/utils/format'

type ConfirmKind = 'music' | 'playlists' | null

export default function SettingsScreen() {
  const playlists = useLibraryStore((s) => s.playlists)
  const tracks = useLibraryStore((s) => s.tracks)
  const { clearAllMusic, deleteAllPlaylists } = useLibraryStore()
  const player = usePlayerStore()
  const { goHome, showToast } = useUiStore()
  const [confirm, setConfirm] = useState<ConfirmKind>(null)

  const trackList = Object.values(tracks)
  const totalBytes = trackList.reduce((sum, t) => sum + (t.fileSize || 0), 0)

  const stopEverything = () => {
    player.stop()
    Object.keys(tracks).forEach((id) => player.handleTrackRemoved(id))
  }

  const doClearMusic = async () => {
    stopEverything()
    await clearAllMusic()
    setConfirm(null)
    showToast('All music cleared')
  }

  const doDeletePlaylists = async () => {
    stopEverything()
    await deleteAllPlaylists()
    setConfirm(null)
    showToast('All playlists deleted')
  }

  return (
    <div className={`screen${player.currentTrackId ? ' has-mini' : ''}`}>
      <div className="topbar">
        <button className="icon-btn" onClick={goHome} aria-label="Back">
          <BackIcon />
        </button>
        <h1>Settings</h1>
      </div>

      <div className="section-title">Library</div>
      <div className="stat-grid">
        <div className="stat">
          <div className="value">{playlists.length}</div>
          <div className="label">Playlists</div>
        </div>
        <div className="stat">
          <div className="value">{trackList.length}</div>
          <div className="label">Tracks</div>
        </div>
        <div className="stat" style={{ gridColumn: '1 / -1' }}>
          <div className="value">{formatBytes(totalBytes)}</div>
          <div className="label">Local storage used</div>
        </div>
      </div>

      <div className="notice">
        ⚠️ Your music is stored locally inside this browser only. Keep the original audio files on
        your device — if the browser clears its storage (for example when space runs low), your
        imported tracks may be lost and would need to be added again.
      </div>

      <div className="section-title">Danger Zone</div>
      <div className="btn-row" style={{ flexDirection: 'column' }}>
        <button
          className="btn danger block"
          onClick={() => setConfirm('music')}
          disabled={trackList.length === 0}
        >
          <MusicIcon width={18} height={18} /> Clear all music
        </button>
        <button
          className="btn danger block"
          onClick={() => setConfirm('playlists')}
          disabled={playlists.length === 0}
        >
          <TrashIcon width={18} height={18} /> Delete all playlists
        </button>
      </div>

      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{confirm === 'music' ? 'Clear all music?' : 'Delete all playlists?'}</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.5 }}>
              {confirm === 'music'
                ? 'Every imported track will be removed from this device. Your playlists will remain but become empty.'
                : 'All playlists and all tracks will be permanently removed from this device.'}
              {' This cannot be undone.'}
            </p>
            <div className="actions">
              <button className="btn" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={() => (confirm === 'music' ? void doClearMusic() : void doDeletePlaylists())}
              >
                {confirm === 'music' ? 'Clear' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
