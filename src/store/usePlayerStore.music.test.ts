// Core
import { afterEach, describe, expect, it, vi } from 'vitest'

// `addFiles` reads real audio duration via a throwaway <audio> element and
// waits for `loadedmetadata` — jsdom never fires that event, so it would
// hang forever. Stub metadata extraction; nothing in these tests depends on
// realistic tag data, only on tracks existing with a known duration.
vi.mock('@/utils/audioFile', async () => {
  const actual = await vi.importActual<typeof import('@/utils/audioFile')>('@/utils/audioFile')
  return {
    ...actual,
    extractMetadata: async (file: File) => ({
      title: actual.baseName(file.name),
      artist: 'Unknown Artist',
      album: '',
      duration: 180,
      cover: undefined,
    }),
  }
})

async function freshModules() {
  vi.resetModules()
  const { db } = await import('@/services/db')
  const { useLibraryStore } = await import('@/store/useLibraryStore')
  const { useAudiobookStore } = await import('@/store/useAudiobookStore')
  const { usePlayerStore } = await import('@/store/usePlayerStore')
  await db.playlists.clear()
  await db.tracks.clear()
  await db.blobs.clear()
  await db.playerState.clear()
  await db.audiobooks.clear()
  await db.audiobookChapters.clear()
  await db.audiobookBlobs.clear()
  await usePlayerStore.getState().init()
  return { db, useLibraryStore, useAudiobookStore, usePlayerStore }
}

async function seedPlaylist(
  useLibraryStore: Awaited<ReturnType<typeof freshModules>>['useLibraryStore'],
  trackCount: number,
) {
  const playlist = await useLibraryStore.getState().createPlaylist('Regression Playlist')
  const files = Array.from(
    { length: trackCount },
    (_, i) => new File([new Uint8Array(1024)], `${i + 1}.mp3`, { type: 'audio/mpeg' }),
  )
  await useLibraryStore.getState().addFiles(playlist.id, files)
  const tracks = useLibraryStore.getState().getPlaylistTracks(playlist.id)
  return { playlist, tracks }
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('usePlayerStore — music playback (post audiobook refactor)', () => {
  it('playPlaylist starts the first track with source "music" and correct nowPlaying', async () => {
    const { useLibraryStore, usePlayerStore } = await freshModules()
    const { playlist, tracks } = await seedPlaylist(useLibraryStore, 3)

    await usePlayerStore.getState().playPlaylist(playlist.id)

    const s = usePlayerStore.getState()
    expect(s.source).toBe('music')
    expect(s.currentTrackId).toBe(tracks[0].id)
    expect(s.nowPlaying?.kind).toBe('music')
    expect(s.isPlaying).toBe(true)
  })

  it('next()/previous() wrap cyclically for music, unlike audiobooks', async () => {
    const { useLibraryStore, usePlayerStore } = await freshModules()
    const { playlist } = await seedPlaylist(useLibraryStore, 2)
    await usePlayerStore.getState().playPlaylist(playlist.id)

    expect(usePlayerStore.getState().musicQueueIndex).toBe(0)
    await usePlayerStore.getState().next()
    expect(usePlayerStore.getState().musicQueueIndex).toBe(1)
    await usePlayerStore.getState().next() // past the end -> wraps to the first track
    expect(usePlayerStore.getState().musicQueueIndex).toBe(0)
  })

  it('switching to an audiobook and back preserves each session state independently', async () => {
    const { useLibraryStore, useAudiobookStore, usePlayerStore } = await freshModules()
    const { playlist, tracks } = await seedPlaylist(useLibraryStore, 2)
    await usePlayerStore.getState().playPlaylist(playlist.id, tracks[0].id)
    await usePlayerStore.getState().next() // move to track index 1 so we have a non-zero pointer

    const musicTrackId = usePlayerStore.getState().currentTrackId
    const musicQueueIndex = usePlayerStore.getState().musicQueueIndex

    const book = await useAudiobookStore.getState().importBook({
      title: 'Interrupting Book',
      chapters: [
        {
          file: new File([new Uint8Array(1024)], 'ch1.mp3', { type: 'audio/mpeg' }),
          title: 'Chapter 1',
          duration: 60,
        },
      ],
      fingerprint: 'fp-cross',
    })
    await usePlayerStore.getState().playAudiobook(book.id)

    // The audiobook is now live, but the music session's own fields must be untouched.
    let s = usePlayerStore.getState()
    expect(s.source).toBe('audiobook')
    expect(s.currentTrackId).toBe(musicTrackId)
    expect(s.musicQueueIndex).toBe(musicQueueIndex)

    // Switching back to music resumes exactly where the music session left off.
    await usePlayerStore.getState().playPlaylist(playlist.id, musicTrackId!)
    s = usePlayerStore.getState()
    expect(s.source).toBe('music')
    expect(s.currentTrackId).toBe(musicTrackId)
  })

  it('a stale currentTrackId from a prior music session never impersonates the live audiobook', async () => {
    const { useLibraryStore, useAudiobookStore, usePlayerStore } = await freshModules()
    const { playlist, tracks } = await seedPlaylist(useLibraryStore, 1)
    await usePlayerStore.getState().playPlaylist(playlist.id, tracks[0].id)

    const book = await useAudiobookStore.getState().importBook({
      title: 'Another Book',
      chapters: [
        {
          file: new File([new Uint8Array(1024)], 'ch1.mp3', { type: 'audio/mpeg' }),
          title: 'Chapter 1',
          duration: 60,
        },
      ],
      fingerprint: 'fp-stale',
    })
    await usePlayerStore.getState().playAudiobook(book.id)

    const s = usePlayerStore.getState()
    // currentTrackId is still the old music track (by design — it's the music
    // session's own pointer), but source correctly reflects the live audiobook.
    expect(s.currentTrackId).toBe(tracks[0].id)
    expect(s.source).toBe('audiobook')
    expect(s.nowPlaying?.kind).toBe('audiobook')
  })
})
