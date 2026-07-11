// Components
import { MusicIcon, BookIcon } from '@/components/Icons'
// Store
import { useUiStore, sectionOfScreen } from '@/store/useUiStore'

export default function SectionSwitcher() {
  const screen = useUiStore((s) => s.screen)
  const goHome = useUiStore((s) => s.goHome)
  const openAudiobookLibrary = useUiStore((s) => s.openAudiobookLibrary)
  const section = sectionOfScreen(screen)

  return (
    <div className="section-switcher" role="tablist" aria-label="App section">
      <button
        type="button"
        role="tab"
        aria-selected={section === 'music'}
        className={`section-tab${section === 'music' ? ' active' : ''}`}
        onClick={goHome}
      >
        <MusicIcon width={16} height={16} />
        Music
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={section === 'audiobooks'}
        className={`section-tab${section === 'audiobooks' ? ' active' : ''}`}
        onClick={openAudiobookLibrary}
      >
        <BookIcon width={16} height={16} />
        Audio Books
      </button>
    </div>
  )
}
