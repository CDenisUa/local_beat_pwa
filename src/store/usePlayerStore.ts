// Core
import { create } from 'zustand'
// Services
import { db } from '@/services/db'
// Store
import { useLibraryStore } from '@/store/useLibraryStore'
// Types
import type { PlayerState, RepeatMode, Track } from '@/types'
// Utils
import { buildShuffledQueue } from '@/utils/shuffle'

/** Single shared HTMLAudioElement — the most reliable option on iOS Safari. */
let audio: HTMLAudioElement | null = null
let currentObjectUrl: string | null = null
let currentCoverUrl: string | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

function getAudio(): HTMLAudioElement {
  if (!audio) audio = new Audio()
  return audio
}

interface PlayerStore {
  initialized: boolean
  currentTrackId: string | null
  currentPlaylistId: string | null
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  shuffleEnabled: boolean
  repeatMode: RepeatMode
  queue: string[]
  queueIndex: number
  coverUrl: string | null
  /** True when a prior session was restored but nothing has been played yet. */
  canResume: boolean

  init: () => Promise<void>
  playPlaylist: (playlistId: string, startTrackId?: string) => Promise<void>
  playRandom: (trackIds: string[], playlistId?: string | null) => Promise<void>
  togglePlay: () => Promise<void>
  next: () => Promise<void>
  previous: () => Promise<void>
  seek: (time: number) => void
  setVolume: (volume: number) => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  stop: () => void
  resume: () => Promise<void>
  handleTrackRemoved: (trackId: string) => void
}

export const usePlayerStore = create<PlayerStore>((set, get) => {
  /** Persist the durable slice of player state to IndexedDB. */
  const persist = () => {
    const s = get()
    const state: PlayerState = {
      id: 'player',
      currentPlaylistId: s.currentPlaylistId,
      currentTrackId: s.currentTrackId,
      currentTime: s.currentTime,
      volume: s.volume,
      shuffleEnabled: s.shuffleEnabled,
      repeatMode: s.repeatMode,
      queue: s.queue,
      queueIndex: s.queueIndex,
    }
    void db.playerState.put(state)
  }

  const persistThrottled = () => {
    if (saveTimer) return
    saveTimer = setTimeout(() => {
      saveTimer = null
      persist()
    }, 4000)
  }

  const setMediaSession = (track: Track | undefined) => {
    if (!('mediaSession' in navigator) || !track) return
    const artwork = currentCoverUrl
      ? [{ src: currentCoverUrl, sizes: '512x512', type: 'image/jpeg' }]
      : [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ]
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork,
    })
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

  /** Load a track's blob into the audio element. Plays when `autoplay`. */
  const loadTrack = async (trackId: string, autoplay: boolean) => {
    const lib = useLibraryStore.getState()
    const track = lib.getTrack(trackId)
    if (!track) return
    const blobRecord = await lib.getBlob(trackId)
    if (!blobRecord) return

    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl)
    if (currentCoverUrl) URL.revokeObjectURL(currentCoverUrl)
    currentObjectUrl = URL.createObjectURL(blobRecord.blob)
    currentCoverUrl = blobRecord.cover ? URL.createObjectURL(blobRecord.cover) : null

    const a = getAudio()
    a.src = currentObjectUrl
    a.load()

    set({
      currentTrackId: trackId,
      duration: track.duration || 0,
      currentTime: 0,
      coverUrl: currentCoverUrl,
      canResume: false,
    })
    setMediaSession(track)

    if (autoplay) {
      try {
        await a.play()
      } catch {
        set({ isPlaying: false })
      }
    }
    persist()
  }

  const playAtIndex = async (index: number, autoplay = true) => {
    const { queue } = get()
    if (index < 0 || index >= queue.length) return
    set({ queueIndex: index })
    await loadTrack(queue[index], autoplay)
  }

  return {
    initialized: false,
    currentTrackId: null,
    currentPlaylistId: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    shuffleEnabled: false,
    repeatMode: 'off',
    queue: [],
    queueIndex: -1,
    coverUrl: null,
    canResume: false,

    async init() {
      if (get().initialized) return
      const a = getAudio()

      a.addEventListener('timeupdate', () => {
        set({ currentTime: a.currentTime })
        persistThrottled()
      })
      a.addEventListener('durationchange', () => {
        if (Number.isFinite(a.duration) && a.duration > 0) {
          set({ duration: a.duration })
          updatePositionState()
        }
      })
      a.addEventListener('play', () => {
        set({ isPlaying: true })
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
        updatePositionState()
      })
      a.addEventListener('pause', () => {
        set({ isPlaying: false })
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
        persist()
      })
      a.addEventListener('ended', () => {
        void get().next()
      })

      // System / lock-screen / headphone controls.
      if ('mediaSession' in navigator) {
        const ms = navigator.mediaSession
        ms.setActionHandler('play', () => void get().togglePlay())
        ms.setActionHandler('pause', () => void get().togglePlay())
        ms.setActionHandler('nexttrack', () => void get().next())
        ms.setActionHandler('previoustrack', () => void get().previous())
        ms.setActionHandler('seekto', (d) => {
          if (typeof d.seekTime === 'number') get().seek(d.seekTime)
        })
        // Leave seek forward/backward unset so the system shows the
        // previous/next track buttons on the lock-screen widget instead.
        ms.setActionHandler('seekforward', null)
        ms.setActionHandler('seekbackward', null)
      }

      // Restore prior session (without autoplay — iOS needs a user gesture).
      const saved = await db.playerState.get('player')
      if (saved) {
        a.volume = saved.volume
        const lib = useLibraryStore.getState()
        const trackExists = saved.currentTrackId && lib.getTrack(saved.currentTrackId)
        set({
          volume: saved.volume,
          shuffleEnabled: saved.shuffleEnabled,
          repeatMode: saved.repeatMode,
          currentPlaylistId: saved.currentPlaylistId,
          queue: saved.queue.filter((id) => lib.getTrack(id)),
          queueIndex: saved.queueIndex,
          initialized: true,
        })
        if (trackExists) {
          const lastTrack = lib.getTrack(saved.currentTrackId!)!
          set({
            currentTrackId: saved.currentTrackId,
            currentTime: saved.currentTime,
            duration: lastTrack.duration || 0,
            canResume: true,
          })
        }
      } else {
        set({ initialized: true })
      }
    },

    async playPlaylist(playlistId, startTrackId) {
      const lib = useLibraryStore.getState()
      const playlist = lib.getPlaylist(playlistId)
      if (!playlist || playlist.trackIds.length === 0) return

      const { shuffleEnabled } = get()
      const start = startTrackId ?? playlist.trackIds[0]
      const queue = shuffleEnabled
        ? buildShuffledQueue(playlist.trackIds, startTrackId ? undefined : start)
        : playlist.trackIds.slice()

      // Ensure an explicitly chosen track plays first.
      let index = queue.indexOf(start)
      if (startTrackId && index > 0) {
        queue.splice(index, 1)
        queue.unshift(start)
        index = 0
      }
      if (index < 0) index = 0

      set({ currentPlaylistId: playlistId, queue })
      await playAtIndex(index)
    },

    async playRandom(trackIds, playlistId = null) {
      if (trackIds.length === 0) return
      const queue = buildShuffledQueue(trackIds)
      set({ currentPlaylistId: playlistId, queue, shuffleEnabled: true })
      await playAtIndex(0)
    },

    async togglePlay() {
      const a = getAudio()
      const { currentTrackId, canResume } = get()
      if (!currentTrackId) return

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
        a.pause()
      }
    },

    async next() {
      const { repeatMode, queueIndex, queue } = get()
      if (queue.length === 0) return

      if (repeatMode === 'one') {
        const a = getAudio()
        a.currentTime = 0
        await a.play().catch(() => set({ isPlaying: false }))
        return
      }
      if (queueIndex < queue.length - 1) {
        await playAtIndex(queueIndex + 1)
      } else if (repeatMode === 'all') {
        await playAtIndex(0)
      } else {
        // End of queue, no repeat: stop on the last track.
        getAudio().pause()
        set({ isPlaying: false })
      }
    },

    async previous() {
      const a = getAudio()
      // Restart current track if we are more than 3s in.
      if (a.currentTime > 3) {
        a.currentTime = 0
        return
      }
      const { queueIndex, queue, repeatMode } = get()
      if (queueIndex > 0) {
        await playAtIndex(queueIndex - 1)
      } else if (repeatMode === 'all') {
        await playAtIndex(queue.length - 1)
      } else {
        a.currentTime = 0
      }
    },

    seek(time) {
      const a = getAudio()
      const clamped = Math.max(0, Math.min(time, a.duration || time))
      a.currentTime = clamped
      set({ currentTime: clamped })
      updatePositionState()
    },

    setVolume(volume) {
      const v = Math.max(0, Math.min(1, volume))
      getAudio().volume = v
      set({ volume: v })
      persistThrottled()
    },

    toggleShuffle() {
      const { shuffleEnabled, queue, currentTrackId } = get()
      const next = !shuffleEnabled
      if (queue.length > 0 && currentTrackId) {
        let newQueue: string[]
        let newIndex: number
        if (next) {
          // Keep current track first, shuffle the rest.
          const rest = queue.filter((id) => id !== currentTrackId)
          newQueue = [currentTrackId, ...buildShuffledQueue(rest)]
          newIndex = 0
        } else {
          // Restore the playlist's natural order.
          const lib = useLibraryStore.getState()
          const playlist = get().currentPlaylistId
            ? lib.getPlaylist(get().currentPlaylistId!)
            : undefined
          newQueue = playlist ? playlist.trackIds.slice() : queue.slice()
          newIndex = Math.max(0, newQueue.indexOf(currentTrackId))
        }
        set({ shuffleEnabled: next, queue: newQueue, queueIndex: newIndex })
      } else {
        set({ shuffleEnabled: next })
      }
      persist()
    },

    cycleRepeat() {
      const order: RepeatMode[] = ['off', 'all', 'one']
      const current = get().repeatMode
      const next = order[(order.indexOf(current) + 1) % order.length]
      set({ repeatMode: next })
      persist()
    },

    stop() {
      const a = getAudio()
      a.pause()
      a.currentTime = 0
      set({ isPlaying: false, currentTime: 0 })
      persist()
    },

    async resume() {
      const { currentTrackId, queue, currentTime } = get()
      if (!currentTrackId) return
      const idx = queue.indexOf(currentTrackId)
      set({ queueIndex: idx >= 0 ? idx : get().queueIndex })
      await loadTrack(currentTrackId, false)
      // Restore saved position, then play (called from a user gesture).
      const a = getAudio()
      const applyAndPlay = async () => {
        if (currentTime > 0 && Number.isFinite(a.duration)) {
          a.currentTime = Math.min(currentTime, a.duration)
        }
        try {
          await a.play()
        } catch {
          set({ isPlaying: false })
        }
      }
      if (a.readyState >= 1) {
        await applyAndPlay()
      } else {
        a.addEventListener('loadedmetadata', () => void applyAndPlay(), { once: true })
      }
    },

    handleTrackRemoved(trackId) {
      const { queue, currentTrackId } = get()
      const newQueue = queue.filter((id) => id !== trackId)
      if (currentTrackId === trackId) {
        getAudio().pause()
        if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl)
        if (currentCoverUrl) URL.revokeObjectURL(currentCoverUrl)
        currentObjectUrl = null
        currentCoverUrl = null
        getAudio().removeAttribute('src')
        set({
          queue: newQueue,
          currentTrackId: null,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          coverUrl: null,
          queueIndex: -1,
          canResume: false,
        })
      } else {
        const newIndex = currentTrackId ? newQueue.indexOf(currentTrackId) : -1
        set({ queue: newQueue, queueIndex: newIndex })
      }
      persist()
    },
  }
})
