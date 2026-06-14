// Core
import Dexie from 'dexie'
import type { Table } from 'dexie'
// Types
import type { Playlist, Track, TrackBlob, PlayerState } from '@/types'

/**
 * IndexedDB layer. Playlists, track metadata, the raw audio blobs and the
 * persisted player state all live here. The Cache API (service worker) only
 * ever stores the app shell — never audio files.
 */
class LocalBeatDB extends Dexie {
  playlists!: Table<Playlist, string>
  tracks!: Table<Track, string>
  blobs!: Table<TrackBlob, string>
  playerState!: Table<PlayerState, string>

  constructor() {
    super('local-beat')
    this.version(1).stores({
      playlists: 'id, name, updatedAt',
      tracks: 'id, playlistId, createdAt',
      blobs: 'id',
      playerState: 'id',
    })
  }
}

export const db = new LocalBeatDB()

/** Total bytes used by stored audio (metadata + cover overhead ignored). */
export async function estimateStorageBytes(): Promise<number> {
  const tracks = await db.tracks.toArray()
  return tracks.reduce((sum, t) => sum + (t.fileSize || 0), 0)
}
