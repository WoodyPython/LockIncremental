import { decodeStoredSave, encodeStoredSave } from './codec'
import { SAVE_STORAGE_KEY, type SaveEnvelope } from './schema'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type LoadSaveResult =
  | { readonly kind: 'empty' }
  | { readonly kind: 'loaded'; readonly envelope: SaveEnvelope }
  | { readonly kind: 'invalid'; readonly message: string; readonly raw: string }
  | { readonly kind: 'unavailable'; readonly message: string }

export class SaveRepository {
  public constructor(private readonly storage?: StorageLike) {}

  public load(): LoadSaveResult {
    let raw: string | null
    try {
      raw = this.getStorage().getItem(SAVE_STORAGE_KEY)
    } catch {
      return { kind: 'unavailable', message: 'Browser storage is unavailable.' }
    }
    if (raw === null) return { kind: 'empty' }
    const decoded = decodeStoredSave(raw)
    return decoded.ok
      ? { kind: 'loaded', envelope: decoded.envelope }
      : { kind: 'invalid', message: decoded.message, raw }
  }

  public save(envelope: SaveEnvelope): void {
    this.getStorage().setItem(SAVE_STORAGE_KEY, encodeStoredSave(envelope))
  }

  public remove(): void {
    this.getStorage().removeItem(SAVE_STORAGE_KEY)
  }

  private getStorage(): StorageLike {
    return this.storage ?? globalThis.localStorage
  }
}
