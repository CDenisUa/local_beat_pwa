// Core
import { create } from 'zustand'
// Services
import { db } from '@/services/db'
// Store
import { useLibraryStore } from '@/store/useLibraryStore'
import { useAudiobookStore } from '@/store/useAudiobookStore'
// Types
import type { Audiobook, AudiobookChapter, PlaybackSource, PlayerState, RepeatMode, Track } from '@/types'
// Utils
import { buildShuffledQueue } from '@/utils/shuffle'

/** Single shared HTMLAudioElement — the most reliable option on iOS Safari.
 * Both music tracks and audiobook chapters play through this one element;
 * there is never a second, competing audio element. */
let audio: HTMLAudioElement | null = null
let initialization: Promise<void> | null = null
/** Object URL for whatever is currently loaded (track or chapter audio). */
let currentObjectUrl: string | null = null
/** Object URL for the current *music track's* embedded cover art. */
let currentCoverUrl: string | null = null
/** Cached object URL for the current *audiobook's* cover — kept across
 * chapter changes within the same book so we don't re-decode the cover image
 * on every chapter switch, only revoked when the active book changes. */
let currentBookCoverBookId: string | null = null
let currentBookCoverUrl: string | null = null

let musicSaveTimer: ReturnType<typeof setTimeout> | null = null
let audiobookSaveTimer: ReturnType<typeof setTimeout> | null = null
let listeningAccumSeconds = 0
let lastListeningTickAt = Date.now()

const CONTINUE_REWIND_SECONDS = 3
const CONTINUE_REWIND_MIN_POSITION = 8

/**
 * Whether the user *wants* audio to be playing. Set true on a successful
 * `play()`, false only on an explicit user pause/stop. Used to tell an
 * iOS-initiated background suspension apart from a real user pause, and to
 * auto-resume when the app returns to the foreground.
 */
let intendedToPlay = false

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio()
    // iOS background-audio hardening: a DOM-connected element with these
    // attributes survives lock-screen / app-switch far more reliably than a
    // detached `new Audio()`.
    audio.preload = 'auto'
    audio.setAttribute('playsinline', '')
    audio.setAttribute('webkit-playsinline', '')
    audio.setAttribute('x-webkit-airplay', 'allow')
    if (typeof document !== 'undefined' && document.body) {
      audio.style.display = 'none'
      document.body.appendChild(audio)
    }
  }
  return audio
}

function resetBookCoverCache() {
  if (currentBookCoverUrl) URL.revokeObjectURL(currentBookCoverUrl)
  currentBookCoverUrl = null
  currentBookCoverBookId = null
}

async function getBookCoverUrl(bookId: string, coverBlobId?: string): Promise<string | null> {
  if (currentBookCoverBookId === bookId) return currentBookCoverUrl
  resetBookCoverCache()
  currentBookCoverBookId = bookId
  if (!coverBlobId) return null
  const record = await useAudiobookStore.getState().getBlob(coverBlobId)
  currentBookCoverUrl = record ? URL.createObjectURL(record.blob) : null
  return currentBookCoverUrl
}

interface NowPlayingMeta {
  title: string
  subtitle: string
  label: string
  kind: PlaybackSource
  chapterPosition?: { index: number; count: number }
}

interface PlayerStore {
  initialized: boolean
  source: PlaybackSource
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  coverUrl: string | null
  nowPlaying: NowPlayingMeta | null
  /** True when a prior session was restored but nothing has been played yet. */
  canResume: boolean

  // -- music session --
  currentTrackId: string | null
  currentPlaylistId: string | null
  musicQueue: string[]
  musicQueueIndex: number
  musicCurrentTime: number
  shuffleEnabled: boolean
  repeatMode: RepeatMode

  // -- audiobook session --
  currentBookId: string | null
  currentChapterId: string | null
  currentChapterIndex: number
  bookQueue: string[]
  bookQueueIndex: number

  init: () => Promise<void>
  playPlaylist: (playlistId: string, startTrackId?: string) => Promise<void>
  playRandom: (trackIds: string[], playlistId?: string | null) => Promise<void>
  playAudiobook: (bookId: string, opts?: { chapterId?: string; fromBeginning?: boolean }) => Promise<void>
  playChapter: (bookId: string, chapterId: string) => Promise<void>
  togglePlay: () => Promise<void>
  next: () => Promise<void>
  previous: () => Promise<void>
  previousTrack: () => Promise<void>
  seek: (time: number) => void
  setVolume: (volume: number) => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  stop: () => void
  resume: () => Promise<void>
  handleTrackRemoved: (trackId: string) => void
  handleBookRemoved: (bookId: string) => void
}

export const usePlayerStore = create<PlayerStore>((set, get) => {
  /** Persist the durable slice of player state to IndexedDB. Safe to call
   * regardless of which source is active — music and audiobook fields are
   * independent, so this never clobbers the "other" session's data. */
  const persistPlayerState = () => {
    const s = get()
    const state: PlayerState = {
      id: 'player',
      source: s.source,
      volume: s.volume,
      shuffleEnabled: s.shuffleEnabled,
      repeatMode: s.repeatMode,
      currentPlaylistId: s.currentPlaylistId,
      currentTrackId: s.currentTrackId,
      currentTime: s.source === 'music' ? s.currentTime : s.musicCurrentTime,
      queue: s.musicQueue,
      queueIndex: s.musicQueueIndex,
      currentBookId: s.currentBookId,
    }
    void db.playerState.put(state)
  }

  const persistThrottled = () => {
    if (musicSaveTimer) return
    musicSaveTimer = setTimeout(() => {
      musicSaveTimer = null
      persistPlayerState()
    }, 4000)
  }

  /** Save the current chapter's position (+ accumulated listening time) to
   * the Audiobook record — the single source of truth for resuming a book. */
  const flushAudiobookProgress = () => {
    const s = get()
    if (s.source !== 'audiobook' || !s.currentBookId || !s.currentChapterId) return
    void useAudiobookStore
      .getState()
      .saveChapterProgress(s.currentBookId, s.currentChapterId, { position: s.currentTime })
    if (listeningAccumSeconds > 0) {
      void useAudiobookStore.getState().addListeningTime(s.currentBookId, listeningAccumSeconds)
      listeningAccumSeconds = 0
    }
  }

  const flushAudiobookProgressNow = () => {
    if (audiobookSaveTimer) {
      clearTimeout(audiobookSaveTimer)
      audiobookSaveTimer = null
    }
    flushAudiobookProgress()
  }

  const tickAudiobookProgress = () => {
    const now = Date.now()
    const elapsed = (now - lastListeningTickAt) / 1000
    lastListeningTickAt = now
    if (get().isPlaying && elapsed > 0 && elapsed < 2) listeningAccumSeconds += elapsed
    if (audiobookSaveTimer) return
    audiobookSaveTimer = setTimeout(() => {
      audiobookSaveTimer = null
      flushAudiobookProgress()
    }, 5000)
  }

  /**
   * Register lock-screen / Now Playing transport handlers.
   *
   * iOS only shows three transport slots. For music we null the seek
   * handlers so previous/next track buttons take priority (the user can
   * still scrub via the timeline thanks to `seekto` + `setPositionState`).
   * For audiobooks, skipping ±30s within a chapter is far more valuable on
   * the lock screen than chapter skip, so we register seek handlers there
   * instead — iOS then shows skip buttons in place of prev/next, and chapter
   * navigation remains available inside the app.
   *
   * iOS recomputes the visible controls when metadata is published, and can
   * forget handlers registered only once at startup — so this is called both
   * on init and after every metadata update.
   */
  const registerMediaSessionHandlers = () => {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    ms.setActionHandler('play', () => void get().togglePlay())
    ms.setActionHandler('pause', () => void get().togglePlay())
    ms.setActionHandler('previoustrack', () => void get().previous())
    ms.setActionHandler('nexttrack', () => void get().next())
    ms.setActionHandler('seekto', (d) => {
      if (typeof d.seekTime === 'number') get().seek(d.seekTime)
    })
    if (get().source === 'audiobook') {
      ms.setActionHandler('seekforward', (d) => get().seek(get().currentTime + (d.seekOffset || 30)))
      ms.setActionHandler('seekbackward', (d) => get().seek(get().currentTime - (d.seekOffset || 30)))
    } else {
      ms.setActionHandler('seekforward', null)
      ms.setActionHandler('seekbackward', null)
    }
  }

  const fallbackArtwork = [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
  ]

  const setMusicMediaSession = (track: Track | undefined) => {
    if (!('mediaSession' in navigator) || !track) return
    const artwork = currentCoverUrl
      ? [{ src: currentCoverUrl, sizes: '512x512', type: 'image/jpeg' }]
      : fallbackArtwork
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork,
    })
    registerMediaSessionHandlers()
  }

  const setAudiobookMediaSession = (
    chapter: AudiobookChapter,
    book: Audiobook | undefined,
    coverUrl: string | null,
  ) => {
    if (!('mediaSession' in navigator)) return
    const artwork = coverUrl ? [{ src: coverUrl, sizes: '512x512', type: 'image/jpeg' }] : fallbackArtwork
    navigator.mediaSession.metadata = new MediaMetadata({
      title: chapter.title,
      artist: book?.author || book?.title || 'Audiobook',
      album: book?.title || '',
      artwork,
    })
    registerMediaSessionHandlers()
  }

  const updatePositionState = () => {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return
    const a = getAudio()
    if (!Number.isFinite(a.duration) || a.duration <= 0) return
    try {
      navigator.mediaSession.setPositionState({
        duration: a.duration,
        position: Math.min(a.currentTime, a.duration),
        playbackRate: a.playbackRate || 1,
      })
    } catch {
      /* setPositionState can throw on some iOS versions — ignore. */
    }
  }

  /** Load a music track's blob into the audio element. Plays when `autoplay`. */
  const loadMusicItem = async (trackId: string, autoplay: boolean) => {
    const lib = useLibraryStore.getState()
    const track = lib.getTrack(trackId)
    if (!track) return
    const blobRecord = await lib.getBlob(trackId)
    if (!blobRecord) return

    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl)
    if (currentCoverUrl) URL.revokeObjectURL(currentCoverUrl)
    resetBookCoverCache()
    currentObjectUrl = URL.createObjectURL(blobRecord.blob)
    currentCoverUrl = blobRecord.cover ? URL.createObjectURL(blobRecord.cover) : null

    const a = getAudio()
    a.src = currentObjectUrl
    a.load()

    const playlist = lib.getPlaylist(track.playlistId)
    set({
      source: 'music',
      currentTrackId: trackId,
      duration: track.duration || 0,
      currentTime: 0,
      musicCurrentTime: 0,
      coverUrl: currentCoverUrl,
      canResume: false,
      nowPlaying: {
        title: track.title,
        subtitle: track.artist,
        label: playlist?.name ?? 'Now Playing',
        kind: 'music',
      },
    })
    setMusicMediaSession(track)

    if (autoplay) {
      try {
        await a.play()
      } catch {
        set({ isPlaying: false })
      }
    }
    persistPlayerState()
  }

  const playAtIndex = async (index: number, autoplay = true) => {
    const { musicQueue } = get()
    if (index < 0 || index >= musicQueue.length) return
    set({ musicQueueIndex: index })
    await loadMusicItem(musicQueue[index], autoplay)
  }

  /** Load a chapter's blob into the audio element. Plays when `autoplay`. */
  const loadChapterAtIndex = async (
    bookId: string,
    index: number,
    autoplay: boolean,
    startAtOverride?: number,
  ) => {
    const abStore = useAudiobookStore.getState()
    const chapters = abStore.getChapters(bookId)
    const chapter = chapters[index]
    if (!chapter) return
    const book = abStore.getBook(bookId)
    const blobRecord = await abStore.getBlob(chapter.audioBlobId)
    if (!blobRecord) return

    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl)
    if (currentCoverUrl) {
      URL.revokeObjectURL(currentCoverUrl)
      currentCoverUrl = null
    }
    currentObjectUrl = URL.createObjectURL(blobRecord.blob)
    const coverUrl = await getBookCoverUrl(bookId, book?.coverBlobId)

    const a = getAudio()
    a.src = currentObjectUrl
    a.load()

    const startAt = startAtOverride ?? chapter.lastPosition ?? 0

    set({
      source: 'audiobook',
      currentBookId: bookId,
      currentChapterId: chapter.id,
      currentChapterIndex: index,
      bookQueue: chapters.map((c) => c.id),
      bookQueueIndex: index,
      duration: chapter.duration || 0,
      currentTime: 0,
      coverUrl,
      canResume: false,
      nowPlaying: {
        title: chapter.title,
        subtitle: book?.author || book?.title || 'Audiobook',
        label: book?.title ?? 'Audiobook',
        kind: 'audiobook',
        chapterPosition: { index, count: chapters.length },
      },
    })
    setAudiobookMediaSession(chapter, book, coverUrl)

    if (autoplay) {
      try {
        await a.play()
      } catch {
        set({ isPlaying: false })
      }
    }

    if (startAt > 0) {
      const applySeek = () => {
        a.currentTime = Math.min(startAt, a.duration || startAt)
        set({ currentTime: a.currentTime })
      }
      if (a.readyState >= 1) applySeek()
      else a.addEventListener('loadedmetadata', applySeek, { once: true })
    }

    void abStore.saveChapterProgress(bookId, chapter.id, { position: startAt })
    persistPlayerState()
  }

  const handleChapterEnded = async () => {
    const { currentBookId, currentChapterId, bookQueueIndex, bookQueue } = get()
    if (!currentBookId || !currentChapterId) return
    const abStore = useAudiobookStore.getState()
    const a = getAudio()
    const finalPosition = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : get().currentTime
    await abStore.saveChapterProgress(currentBookId, currentChapterId, {
      position: finalPosition,
      completed: true,
    })
    if (bookQueueIndex >= bookQueue.length - 1) {
      await abStore.markCompleted(currentBookId)
      intendedToPlay = false
      set({ isPlaying: false })
      return
    }
    await loadChapterAtIndex(currentBookId, bookQueueIndex + 1, true)
  }

  return {
    initialized: false,
    source: 'music',
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    coverUrl: null,
    nowPlaying: null,
    canResume: false,

    currentTrackId: null,
    currentPlaylistId: null,
    musicQueue: [],
    musicQueueIndex: -1,
    musicCurrentTime: 0,
    shuffleEnabled: false,
    repeatMode: 'off',

    currentBookId: null,
    currentChapterId: null,
    currentChapterIndex: 0,
    bookQueue: [],
    bookQueueIndex: -1,

    init() {
      // Concurrent startup calls (including React StrictMode) must share one
      // restoration and one set of media listeners, or ended skips tracks.
      if (!initialization) {
        initialization = (async () => {
          if (get().initialized) return
          const a = getAudio()

          a.addEventListener('timeupdate', () => {
            const s = get()
            set({ currentTime: a.currentTime, ...(s.source === 'music' ? { musicCurrentTime: a.currentTime } : {}) })
            if (s.source === 'music') {
              persistThrottled()
            } else {
              tickAudiobookProgress()
            }
          })
          a.addEventListener('durationchange', () => {
            if (Number.isFinite(a.duration) && a.duration > 0) {
              set({ duration: a.duration })
              updatePositionState()
            }
          })
          a.addEventListener('play', () => {
            intendedToPlay = true
            lastListeningTickAt = Date.now()
            set({ isPlaying: true })
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
            updatePositionState()
          })
          a.addEventListener('pause', () => {
            // Distinguish an OS-initiated background suspension (iOS lock screen,
            // app switch) from a genuine user pause. We still keep playback intent
            // recorded so the app can auto-resume on return to the foreground.
            const systemSuspend = intendedToPlay && !a.ended && document.hidden
            if (systemSuspend) {
              console.warn(
                '[player] paused while hidden — iOS background suspension; will auto-resume on foreground',
                { currentTime: a.currentTime, readyState: a.readyState },
              )
            }
            set({ isPlaying: false })
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
            persistPlayerState()
            if (get().source === 'audiobook') flushAudiobookProgressNow()
          })
          a.addEventListener('ended', () => {
            if (get().source === 'audiobook') void handleChapterEnded()
            else if (get().repeatMode === 'one') {
              a.currentTime = 0
              set({ currentTime: 0, musicCurrentTime: 0 })
              void a.play().catch(() => set({ isPlaying: false }))
            }
            else void get().next()
          })
          a.addEventListener('stalled', () =>
            console.warn('[player] stalled — network/decode stall while', document.hidden ? 'hidden' : 'visible'),
          )
          a.addEventListener('error', () =>
            console.error('[player] media error', a.error?.code, a.error?.message),
          )

          // Safety net: if iOS suspended playback while backgrounded, resume the
          // moment the app comes back to the foreground (intent is still "playing").
          // While hidden, flush whatever progress hasn't been persisted yet.
          document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
              persistPlayerState()
              if (get().source === 'audiobook') flushAudiobookProgressNow()
              return
            }
            if (intendedToPlay && a.paused && a.src) {
              a.play().catch((err) =>
                console.warn('[player] foreground auto-resume rejected', err),
              )
            }
          })
          window.addEventListener('pagehide', () => {
            persistPlayerState()
            if (get().source === 'audiobook') flushAudiobookProgressNow()
          })

          // System / lock-screen / headphone controls.
          registerMediaSessionHandlers()

          // Restore prior session (without autoplay — iOS needs a user gesture).
          const saved = await db.playerState.get('player')
          if (!saved) {
            set({ initialized: true })
            return
          }

          a.volume = saved.volume
          set({
            volume: saved.volume,
            shuffleEnabled: saved.shuffleEnabled,
            repeatMode: saved.repeatMode,
            source: saved.source ?? 'music',
            currentBookId: saved.currentBookId,
            initialized: true,
          })

          if ((saved.source ?? 'music') === 'music') {
            const lib = useLibraryStore.getState()
            const trackExists = saved.currentTrackId && lib.getTrack(saved.currentTrackId)
            const playlist = saved.currentPlaylistId ? lib.getPlaylist(saved.currentPlaylistId) : undefined
            const queue = (!saved.shuffleEnabled && playlist ? playlist.trackIds : saved.queue)
              .filter((id) => lib.getTrack(id))
            set({
              currentPlaylistId: saved.currentPlaylistId,
              musicQueue: queue,
              musicQueueIndex: saved.currentTrackId ? queue.indexOf(saved.currentTrackId) : -1,
            })
            if (trackExists) {
              const lastTrack = lib.getTrack(saved.currentTrackId!)!
              const playlist = lib.getPlaylist(lastTrack.playlistId)
              set({
                currentTrackId: saved.currentTrackId,
                currentTime: saved.currentTime,
                musicCurrentTime: saved.currentTime,
                duration: lastTrack.duration || 0,
                canResume: true,
                nowPlaying: {
                  title: lastTrack.title,
                  subtitle: lastTrack.artist,
                  label: playlist?.name ?? 'Now Playing',
                  kind: 'music',
                },
              })
            }
          } else if (saved.currentBookId) {
            const abStore = useAudiobookStore.getState()
            const book = abStore.getBook(saved.currentBookId)
            const chapters = abStore.getChapters(saved.currentBookId)
            if (book && chapters.length > 0) {
              const idx = chapters[book.currentChapterIndex] ? book.currentChapterIndex : 0
              const chapter = chapters[idx]
              set({
                currentChapterId: chapter.id,
                currentChapterIndex: idx,
                bookQueue: chapters.map((c) => c.id),
                bookQueueIndex: idx,
                currentTime: book.currentTime,
                duration: chapter.duration || 0,
                canResume: true,
                nowPlaying: {
                  title: chapter.title,
                  subtitle: book.author || book.title,
                  label: book.title,
                  kind: 'audiobook',
                  chapterPosition: { index: idx, count: chapters.length },
                },
              })
            }
          }
        })()
      }
      return initialization
    },

    async playPlaylist(playlistId, startTrackId) {
      const lib = useLibraryStore.getState()
      const playlist = lib.getPlaylist(playlistId)
      if (!playlist || playlist.trackIds.length === 0) return
      flushAudiobookProgressNow()

      const { shuffleEnabled } = get()
      const start = startTrackId ?? playlist.trackIds[0]
      const queue = shuffleEnabled
        ? buildShuffledQueue(playlist.trackIds, startTrackId ? undefined : start)
        : playlist.trackIds.slice()

      // Only shuffle moves a selected track to the front. In normal playback,
      // keep the playlist order and start at the selected track's own index.
      let index = queue.indexOf(start)
      if (shuffleEnabled && startTrackId && index > 0) {
        queue.splice(index, 1)
        queue.unshift(start)
        index = 0
      }
      if (index < 0) index = 0

      set({ source: 'music', currentPlaylistId: playlistId, musicQueue: queue })
      await playAtIndex(index)
    },

    async playRandom(trackIds, playlistId = null) {
      if (trackIds.length === 0) return
      flushAudiobookProgressNow()
      const queue = buildShuffledQueue(trackIds)
      set({ source: 'music', currentPlaylistId: playlistId, musicQueue: queue, shuffleEnabled: true })
      await playAtIndex(0)
    },

    async playAudiobook(bookId, opts = {}) {
      const abStore = useAudiobookStore.getState()
      const book = abStore.getBook(bookId)
      const chapters = abStore.getChapters(bookId)
      if (!book || chapters.length === 0) return

      flushAudiobookProgressNow()
      if (get().source === 'music') persistPlayerState()

      let targetIndex: number
      let startAt: number
      if (opts.fromBeginning) {
        targetIndex = 0
        startAt = 0
      } else if (opts.chapterId) {
        const idx = chapters.findIndex((c) => c.id === opts.chapterId)
        targetIndex = idx >= 0 ? idx : 0
        const chapter = chapters[targetIndex]
        startAt = chapter.id === book.currentChapterId ? book.currentTime : chapter.lastPosition || 0
      } else {
        targetIndex = book.currentChapterId
          ? Math.max(0, chapters.findIndex((c) => c.id === book.currentChapterId))
          : 0
        const raw = book.currentTime || 0
        startAt = raw > CONTINUE_REWIND_MIN_POSITION ? raw - CONTINUE_REWIND_SECONDS : raw
      }

      await abStore.recordPlayStart(bookId)
      await loadChapterAtIndex(bookId, targetIndex, true, startAt)
    },

    async playChapter(bookId, chapterId) {
      await get().playAudiobook(bookId, { chapterId })
    },

    async togglePlay() {
      const a = getAudio()
      const { currentTrackId, currentBookId, canResume, source } = get()
      const hasCurrent = source === 'music' ? !!currentTrackId : !!currentBookId
      if (!hasCurrent) return

      // Resuming a restored session: the blob is not loaded yet.
      if (canResume && !a.src) {
        await get().resume()
        return
      }
      if (a.paused) {
        try {
          await a.play()
        } catch {
          set({ isPlaying: false })
        }
      } else {
        // Explicit user pause — clear intent so the foreground safety net
        // doesn't auto-resume it.
        intendedToPlay = false
        a.pause()
      }
    },

    async next() {
      const { source, musicQueueIndex, musicQueue, currentBookId, bookQueueIndex, bookQueue } = get()

      if (source === 'music') {
        if (musicQueue.length === 0) return
        if (musicQueueIndex < musicQueue.length - 1) {
          await playAtIndex(musicQueueIndex + 1)
        } else {
          // End of queue: loop back to the first track (cyclic playback).
          await playAtIndex(0)
        }
        return
      }

      // Audiobook: advance one chapter. No wraparound at the end — the
      // `ended` handler is what marks a book completed; a manual "next" press
      // on the last chapter is a no-op.
      if (!currentBookId || bookQueueIndex >= bookQueue.length - 1) return
      flushAudiobookProgressNow()
      await loadChapterAtIndex(currentBookId, bookQueueIndex + 1, true)
    },

    async previous() {
      if (get().source === 'music') {
        await get().previousTrack()
        return
      }
      const a = getAudio()
      // For audiobooks, restart the current chapter if we are more than 3s in.
      if (a.currentTime > 3) {
        a.currentTime = 0
        set({ currentTime: 0 })
        if (get().source === 'audiobook') flushAudiobookProgressNow()
        return
      }
      const { currentBookId, bookQueueIndex } = get()

      if (currentBookId && bookQueueIndex > 0) {
        flushAudiobookProgressNow()
        await loadChapterAtIndex(currentBookId, bookQueueIndex - 1, true)
      } else {
        a.currentTime = 0
        set({ currentTime: 0 })
      }
    },

    async previousTrack() {
      const { source, musicQueueIndex, musicQueue, currentBookId, bookQueueIndex } = get()
      if (source === 'music') {
        if (musicQueue.length === 0) return
        await playAtIndex(musicQueueIndex > 0 ? musicQueueIndex - 1 : musicQueue.length - 1)
        return
      }
      if (currentBookId && bookQueueIndex > 0) {
        flushAudiobookProgressNow()
        await loadChapterAtIndex(currentBookId, bookQueueIndex - 1, true)
      }
    },

    seek(time) {
      const a = getAudio()
      const clamped = Math.max(0, Math.min(time, a.duration || time))
      a.currentTime = clamped
      const s = get()
      set({ currentTime: clamped, ...(s.source === 'music' ? { musicCurrentTime: clamped } : {}) })
      updatePositionState()
      if (s.source === 'audiobook') flushAudiobookProgressNow()
    },

    setVolume(volume) {
      const v = Math.max(0, Math.min(1, volume))
      getAudio().volume = v
      set({ volume: v })
      persistThrottled()
    },

    toggleShuffle() {
      if (get().source !== 'music') return
      const { shuffleEnabled, musicQueue, currentTrackId } = get()
      const next = !shuffleEnabled
      if (musicQueue.length > 0 && currentTrackId) {
        let newQueue: string[]
        let newIndex: number
        if (next) {
          // Keep current track first, shuffle the rest.
          const rest = musicQueue.filter((id) => id !== currentTrackId)
          newQueue = [currentTrackId, ...buildShuffledQueue(rest)]
          newIndex = 0
        } else {
          // Restore the playlist's natural order.
          const lib = useLibraryStore.getState()
          const playlist = get().currentPlaylistId ? lib.getPlaylist(get().currentPlaylistId!) : undefined
          newQueue = playlist ? playlist.trackIds.slice() : musicQueue.slice()
          newIndex = Math.max(0, newQueue.indexOf(currentTrackId))
        }
        set({ shuffleEnabled: next, musicQueue: newQueue, musicQueueIndex: newIndex })
      } else {
        set({ shuffleEnabled: next })
      }
      persistPlayerState()
    },

    cycleRepeat() {
      if (get().source !== 'music') return
      const order: RepeatMode[] = ['off', 'all', 'one']
      const current = get().repeatMode
      const next = order[(order.indexOf(current) + 1) % order.length]
      set({ repeatMode: next })
      persistPlayerState()
    },

    stop() {
      const a = getAudio()
      intendedToPlay = false
      if (get().source === 'audiobook') flushAudiobookProgressNow()
      a.pause()
      a.currentTime = 0
      set({ isPlaying: false, currentTime: 0 })
      persistPlayerState()
    },

    async resume() {
      const { source } = get()
      const a = getAudio()
      const applyAndPlay = async (targetTime: number) => {
        if (targetTime > 0 && Number.isFinite(a.duration)) {
          a.currentTime = Math.min(targetTime, a.duration)
        }
        try {
          await a.play()
        } catch {
          set({ isPlaying: false })
        }
      }
      const whenReady = (targetTime: number) => {
        if (a.readyState >= 1) return applyAndPlay(targetTime)
        return new Promise<void>((resolve) => {
          a.addEventListener('loadedmetadata', () => void applyAndPlay(targetTime).then(resolve), {
            once: true,
          })
        })
      }

      if (source === 'music') {
        const { currentTrackId, musicQueue, currentTime } = get()
        if (!currentTrackId) return
        const idx = musicQueue.indexOf(currentTrackId)
        set({ musicQueueIndex: idx >= 0 ? idx : get().musicQueueIndex })
        await loadMusicItem(currentTrackId, false)
        await whenReady(currentTime)
      } else {
        const { currentBookId, currentChapterIndex, currentTime } = get()
        if (!currentBookId) return
        await loadChapterAtIndex(currentBookId, currentChapterIndex, false, currentTime)
        await whenReady(currentTime)
      }
    },

    handleTrackRemoved(trackId) {
      const { musicQueue, currentTrackId } = get()
      const newQueue = musicQueue.filter((id) => id !== trackId)
      if (currentTrackId === trackId) {
        intendedToPlay = false
        getAudio().pause()
        if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl)
        if (currentCoverUrl) URL.revokeObjectURL(currentCoverUrl)
        currentObjectUrl = null
        currentCoverUrl = null
        getAudio().removeAttribute('src')
        set({
          musicQueue: newQueue,
          currentTrackId: null,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          coverUrl: null,
          musicQueueIndex: -1,
          canResume: false,
          nowPlaying: null,
        })
      } else {
        const newIndex = currentTrackId ? newQueue.indexOf(currentTrackId) : -1
        set({ musicQueue: newQueue, musicQueueIndex: newIndex })
      }
      persistPlayerState()
    },

    handleBookRemoved(bookId) {
      const { currentBookId } = get()
      if (currentBookId !== bookId) return
      intendedToPlay = false
      getAudio().pause()
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl)
      currentObjectUrl = null
      resetBookCoverCache()
      getAudio().removeAttribute('src')
      set({
        currentBookId: null,
        currentChapterId: null,
        currentChapterIndex: 0,
        bookQueue: [],
        bookQueueIndex: -1,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        coverUrl: null,
        canResume: false,
        nowPlaying: null,
      })
      persistPlayerState()
    },
  }
})
