// Core
import { useEffect } from 'react'
// Components
import MiniPlayer from '@/components/MiniPlayer'
import FullPlayer from '@/components/FullPlayer'
// Screens
import HomeScreen from '@/screens/HomeScreen'
import PlaylistScreen from '@/screens/PlaylistScreen'
import SettingsScreen from '@/screens/SettingsScreen'
// Store
import { useLibraryStore } from '@/store/useLibraryStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useUiStore } from '@/store/useUiStore'

export default function App() {
  const loaded = useLibraryStore((s) => s.loaded)
  const loadAll = useLibraryStore((s) => s.loadAll)
  const initPlayer = usePlayerStore((s) => s.init)
  const currentTrackId = usePlayerStore((s) => s.currentTrackId)
  const { screen, fullPlayerOpen, toast } = useUiStore()

  // Load the library first, then restore the player session.
  useEffect(() => {
    void loadAll().then(() => initPlayer())
  }, [loadAll, initPlayer])

  if (!loaded) {
    return (
      <div className="app">
        <div className="empty" style={{ flex: 1 }}>
          <div className="empty-icon spin" style={{ borderRadius: '50%' }} />
          <p>Loading your library…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {screen.name === 'home' && <HomeScreen />}
      {screen.name === 'playlist' && <PlaylistScreen playlistId={screen.playlistId} />}
      {screen.name === 'settings' && <SettingsScreen />}

      {currentTrackId && !fullPlayerOpen && <MiniPlayer />}
      {fullPlayerOpen && <FullPlayer />}

      {toast && <div className="toast">{toast}</div>}

      {/* Developer credit strip — shown on the scrollable Settings screen so it
          never collides with the home screen's fixed button or the static
          playlist frame. */}
      {screen.name === 'settings' && (
        <div className="credit-strip">
          <div className="inner">
            <a
              href="https://chepio.tech"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Developed by Chepio"
            >
              <img src="/images/chepio-tech/logo_designed.svg" alt="chepio.tech" />
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
