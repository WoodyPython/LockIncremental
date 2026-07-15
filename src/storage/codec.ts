import { migrateSave } from './migrations'
import { type SaveEnvelope, validateSaveEnvelope } from './schema'

export const PORTABLE_SAVE_PREFIX = 'LI1:'
export const MAX_PORTABLE_SAVE_LENGTH = 512 * 1024
export const MAX_DECOMPRESSED_SAVE_BYTES = 1024 * 1024

export type DecodeSaveResult =
  | { readonly ok: true; readonly envelope: SaveEnvelope }
  | { readonly ok: false; readonly message: string }

export function encodeStoredSave(envelope: SaveEnvelope): string {
  return JSON.stringify(envelope)
}

export function decodeStoredSave(text: string): DecodeSaveResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return { ok: false, message: 'The saved data is not valid JSON.' }
  }
  const migration = migrateSave(parsed)
  if (!migration.ok) return migration
  return validateSaveEnvelope(migration.value)
}

export async function encodePortableSave(envelope: SaveEnvelope): Promise<string> {
  requireCompressionSupport()
  const bytes = new TextEncoder().encode(encodeStoredSave(envelope))
  const compressed = await streamBytes(bytes, new CompressionStream('gzip'))
  return `${PORTABLE_SAVE_PREFIX}${toBase64Url(compressed)}`
}

export async function decodePortableSave(input: string): Promise<DecodeSaveResult> {
  if (input.length > MAX_PORTABLE_SAVE_LENGTH) {
    return { ok: false, message: 'The portable save is too large.' }
  }
  const text = input.trim()
  if (!text.startsWith(PORTABLE_SAVE_PREFIX)) {
    return { ok: false, message: `Portable saves must begin with ${PORTABLE_SAVE_PREFIX}` }
  }
  if (text.length > MAX_PORTABLE_SAVE_LENGTH) {
    return { ok: false, message: 'The portable save is too large.' }
  }
  requireCompressionSupport()
  let compressed: Uint8Array
  try {
    compressed = fromBase64Url(text.slice(PORTABLE_SAVE_PREFIX.length))
  } catch {
    return { ok: false, message: 'The portable save contains invalid Base64URL data.' }
  }
  try {
    const decompressed = await streamBytes(
      compressed,
      new DecompressionStream('gzip'),
      MAX_DECOMPRESSED_SAVE_BYTES,
    )
    return decodeStoredSave(new TextDecoder('utf-8', { fatal: true }).decode(decompressed))
  } catch (error) {
    if (error instanceof StreamSizeLimitError) {
      return { ok: false, message: 'The decompressed save is too large.' }
    }
    return { ok: false, message: 'The portable save could not be decompressed.' }
  }
}

function requireCompressionSupport(): void {
  if (typeof CompressionStream === 'undefined' || typeof DecompressionStream === 'undefined') {
    throw new Error('This browser does not support compressed saves.')
  }
}

async function streamBytes(
  bytes: Uint8Array,
  transform: CompressionStream | DecompressionStream,
  maximumOutputBytes = Number.POSITIVE_INFINITY,
): Promise<Uint8Array> {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength))
  copy.set(bytes)
  const input = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(copy)
      controller.close()
    },
  })
  const reader = input.pipeThrough(transform).getReader()
  const chunks: Uint8Array[] = []
  let outputLength = 0

  try {
    for (;;) {
      const result = await reader.read()
      if (result.done) break
      outputLength += result.value.byteLength
      if (outputLength > maximumOutputBytes) {
        await reader.cancel()
        throw new StreamSizeLimitError()
      }
      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }

  const output = new Uint8Array(outputLength)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

class StreamSizeLimitError extends Error {}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('Invalid Base64URL')
  const standard = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}
