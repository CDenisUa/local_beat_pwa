// Core
import { useState } from 'react'
// Components
import PlaylistCard from '@/components/PlaylistCard'
import PlaylistFormModal from '@/components/PlaylistFormModal'
import { PlusIcon, SettingsIcon, MusicIcon, ShuffleIcon, PlayIcon } from '@/components/Icons'
// Store
import { useLibraryStore } from '@/store/useLibraryStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useUiStore } from '@/store/useUiStore'

export default function HomeScreen() {
  const playlists = useLibraryStore((s) => s.playlists)
  const tracks = useLibraryStore((s) => s.tracks)
  const createPlaylist = useLibraryStore((s) => s.createPlaylist)
  const { openPlaylist, openSettings, openFullPlayer } = useUiStore()
  const { playRandom, resume, canResume, currentTrackId } = usePlayerStore()
  const [creating, setCreating] = useState(false)

  const allTrackIds = Object.keys(tracks)

  const handleCreate = async (name: string) => {
    const playlist = await createPlaylist(name)
    setCreating(false)
    openPlaylist(playlist.id)
  }

  const handleRandom = () => {
    if (allTrackIds.length === 0) return
    void playRandom(allTrackIds, null)
    openFullPlayer()
  }

  const handleResume = async () => {
    await resume()
    openFullPlayer()
  }

  return (
    <div className={`screen has-create${currentTrackId ? ' has-mini' : ''}`}>
      <div className="topbar">
        <div className="brand">
          <img className="brand-logo" src="/icons/logo.png" alt="Local Beat" />
          <div>
            <h1 style={{ fontSize: 22 }}>Local Beat</h1>
            <span className="subtitle">Your offline music</span>
          </div>
        </div>
        <button className="icon-btn" onClick={openSettings} aria-label="Settings">
          <SettingsIcon />
        </button>
      </div>

      {canResume && currentTrackId && (
        <button
          className="btn primary block"
          onClick={() => void handleResume()}
          style={{ marginBottom: 10 }}
        >
          <PlayIcon width={18} height={18} /> Continue listening
        </button>
      )}

      {allTrackIds.length > 0 && (
        <button className="btn block" onClick={handleRandom} style={{ marginBottom: 8 }}>
          <ShuffleIcon width={18} height={18} /> Shuffle All
        </button>
      )}

      {playlists.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <MusicIcon width={40} height={40} />
          </div>
          <h2>No playlists yet</h2>
          <p>
            Create a playlist and add your own audio files from this device. Everything stays on
            your phone — no accounts, no internet needed.
          </p>
        </div>
      ) : (
        <>
          <div className="section-title">Your Playlists</div>
          <div className="card-grid">
            {playlists.map((p) => (
              <PlaylistCard key={p.id} playlist={p} onClick={() => openPlaylist(p.id)} />
            ))}
          </div>
        </>
      )}

      <div className={`home-create${currentTrackId ? ' with-mini' : ''}`}>
        <button className="btn primary block" onClick={() => setCreating(true)}>
          <PlusIcon width={18} height={18} /> New Playlist
        </button>
      </div>

      {creating && (
        <PlaylistFormModal
          title="New Playlist"
          confirmLabel="Create"
          onSubmit={handleCreate}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  )
}
