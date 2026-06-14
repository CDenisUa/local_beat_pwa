/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module 'jsmediatags' {
  export interface PictureType {
    format: string
    data: number[]
  }
  export interface TagType {
    tags: {
      title?: string
      artist?: string
      album?: string
      picture?: PictureType
      [key: string]: unknown
    }
  }
  export interface CallbacksType {
    onSuccess: (tag: TagType) => void
    onError: (error: { type: string; info: string }) => void
  }
  export function read(file: Blob | File, callbacks: CallbacksType): void
  const _default: { read: typeof read }
  export default _default
}
