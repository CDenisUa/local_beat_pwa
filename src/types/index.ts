export type RepeatMode = 'off' | 'one' | 'all'

export interface Playlist {
  id: string
  name: string
  trackIds: string[]
  createdAt: number
  updatedAt: number
}

/**
 * Lightweight track record stored in the `tracks` table. The actual audio data
 * and cover art live separately in the `blobs` table so that listing tracks
 * never forces large Blobs into memory.
 */
export interface Track {
  id: string
  playlistId: string
  title: string
  artist: string
  album: string
  duration: number
  fileName: string
  fileSize: number
  mimeType: string
  hasCover: boolean
  createdAt: number
}

/** Heavy payload kept out of the metadata table. */
export interface TrackBlob {
  id: string
  blob: Blob
  cover?: Blob
}

export interface PlayerState {
  id: 'player'
  currentPlaylistId: string | null
  currentTrackId: string | null
  currentTime: number
  volume: number
  shuffleEnabled: boolean
  repeatMode: RepeatMode
  queue: string[]
  queueIndex: number
}
