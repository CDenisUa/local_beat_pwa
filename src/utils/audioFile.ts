// Core
import jsmediatags from 'jsmediatags'

const SUPPORTED_EXTENSIONS = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac', 'oga', 'opus']

export interface ExtractedMeta {
  title: string
  artist: string
  album: string
  duration: number
  cover?: Blob
}

/** Best-effort check that a File is a playable audio file. */
export function isAudioFile(file: File): boolean {
  if (file.type && file.type.startsWith('audio/')) return true
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return SUPPORTED_EXTENSIONS.includes(ext)
}

/** File name without its extension — used as a title fallback. */
export function baseName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

/** Read the audio duration via a throwaway HTMLAudioElement. */
function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    const cleanup = () => {
      URL.revokeObjectURL(url)
      audio.removeAttribute('src')
    }
    audio.onloadedmetadata = () => {
      const d = Number.isFinite(audio.duration) ? audio.duration : 0
      cleanup()
      resolve(d)
    }
    audio.onerror = () => {
      cleanup()
      resolve(0)
    }
    audio.src = url
  })
}

/** Read ID3 / tag metadata (title, artist, album, cover art). */
function readTags(file: File): Promise<Partial<ExtractedMeta>> {
  return new Promise((resolve) => {
    jsmediatags.read(file, {
      onSuccess: ({ tags }) => {
        let cover: Blob | undefined
        if (tags.picture) {
          const { data, format } = tags.picture
          cover = new Blob([new Uint8Array(data)], { type: format || 'image/jpeg' })
        }
        resolve({
          title: tags.title?.trim() || undefined,
          artist: tags.artist?.trim() || undefined,
          album: tags.album?.trim() || undefined,
          cover,
        })
      },
      onError: () => resolve({}),
    })
  })
}

/** Combine tag + duration metadata with sensible fallbacks. */
export async function extractMetadata(file: File): Promise<ExtractedMeta> {
  const [duration, tags] = await Promise.all([readDuration(file), readTags(file)])
  return {
    title: tags.title || baseName(file.name),
    artist: tags.artist || 'Unknown Artist',
    album: tags.album || '',
    duration,
    cover: tags.cover,
  }
}
