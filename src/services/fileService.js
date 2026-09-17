import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { isNativePlatform } from '@/utils/platform'

export const DEFAULT_PDF_ACCEPT = 'application/pdf,.pdf'
export const DEFAULT_PDF_MIME = 'application/pdf'
export const DEFAULT_PDF_FILENAME = 'edited-document.pdf'

/**
 * @typedef {Object} OpenFileResult
 * @property {File} file
 * @property {string} name
 * @property {string} [mimeType]
 */

/**
 * @typedef {Object} SaveFileResult
 * @property {'download' | 'filesystem'} method
 * @property {string} filename
 * @property {string} [uri]
 */

/**
 * @typedef {Object} ShareFileResult
 * @property {'share' | 'download'} method
 * @property {string} filename
 * @property {boolean} [cancelled]
 */

/**
 * @param {Uint8Array | ArrayBuffer | Blob} data
 * @returns {Blob}
 */
function toBlob(data, mimeType = DEFAULT_PDF_MIME) {
  if (data instanceof Blob) return data
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data
  // Copy into a plain ArrayBuffer — avoids SharedArrayBuffer typing issues
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy.buffer], { type: mimeType })
}

/**
 * @param {Uint8Array | ArrayBuffer | Blob} data
 * @returns {Promise<string>}
 */
async function toBase64(data) {
  const blob = toBlob(data)
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/**
 * @param {string} filename
 * @param {string} [mimeType]
 */
function pickWithFileInput(accept, multiple = false) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    document.body.appendChild(input)

    let settled = false

    const cleanup = () => {
      input.removeEventListener('change', onChange)
      window.removeEventListener('focus', onFocus)
      input.remove()
    }

    const finish = (value, error) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve(value)
    }

    const onChange = () => {
      const file = input.files?.[0]
      if (!file) {
        finish(null)
        return
      }
      finish({
        file,
        name: file.name,
        mimeType: file.type || undefined,
      })
    }

    // User cancelled the picker (best-effort)
    const onFocus = () => {
      window.setTimeout(() => {
        if (!settled && !input.files?.length) finish(null)
      }, 400)
    }

    input.addEventListener('change', onChange)
    window.addEventListener('focus', onFocus)
    input.click()
  })
}

/**
 * Open a file via the platform file picker.
 * Web + Capacitor WebView both use the browser file input (official Capacitor
 * stack has no dedicated file-picker plugin).
 *
 * @param {{ accept?: string, multiple?: boolean }} [options]
 * @returns {Promise<OpenFileResult | null>}
 */
export async function openFile(options = {}) {
  const accept = options.accept ?? DEFAULT_PDF_ACCEPT
  return pickWithFileInput(accept, Boolean(options.multiple))
}

/**
 * Persist a file on the current platform.
 * Web → browser download. Native → Filesystem Documents directory.
 *
 * @param {{
 *   data: Uint8Array | ArrayBuffer | Blob,
 *   filename?: string,
 *   mimeType?: string,
 * }} options
 * @returns {Promise<SaveFileResult>}
 */
export async function saveFile(options) {
  const filename = options.filename || DEFAULT_PDF_FILENAME
  const mimeType = options.mimeType || DEFAULT_PDF_MIME
  const blob = toBlob(options.data, mimeType)

  if (!isNativePlatform()) {
    const url = URL.createObjectURL(blob)
    try {
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.rel = 'noopener'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } finally {
      URL.revokeObjectURL(url)
    }
    return { method: 'download', filename }
  }

  const base64 = await toBase64(blob)
  const result = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Documents,
  })

  return {
    method: 'filesystem',
    filename,
    uri: result.uri,
  }
}

/**
 * Share a file with the system share sheet (native) or Web Share API.
 * Falls back to save/download when sharing is unavailable.
 *
 * @param {{
 *   data: Uint8Array | ArrayBuffer | Blob,
 *   filename?: string,
 *   mimeType?: string,
 *   title?: string,
 *   text?: string,
 * }} options
 * @returns {Promise<ShareFileResult>}
 */
export async function shareFile(options) {
  const filename = options.filename || DEFAULT_PDF_FILENAME
  const mimeType = options.mimeType || DEFAULT_PDF_MIME
  const title = options.title || 'Share PDF'
  const text = options.text || filename
  const blob = toBlob(options.data, mimeType)

  if (!isNativePlatform()) {
    const file = new File([blob], filename, { type: mimeType })
    if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title,
          text,
        })
        return { method: 'share', filename }
      } catch (error) {
        if (error?.name === 'AbortError') {
          return { method: 'share', filename, cancelled: true }
        }
        // Fall through to download
      }
    }

    await saveFile({ data: blob, filename, mimeType })
    return { method: 'download', filename }
  }

  const base64 = await toBase64(blob)
  const written = await Filesystem.writeFile({
    path: `share/${Date.now()}-${filename}`,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  })

  try {
    await Share.share({
      title,
      text,
      dialogTitle: title,
      files: [written.uri],
    })
    return { method: 'share', filename }
  } catch (error) {
    if (error?.message?.includes('cancel') || error?.message?.includes('canceled')) {
      return { method: 'share', filename, cancelled: true }
    }
    throw error
  }
}

/**
 * Whether the current platform can present a native/web share sheet for files.
 */
export function canShareFiles() {
  if (isNativePlatform()) return true
  if (typeof navigator === 'undefined' || typeof File === 'undefined') return false
  try {
    const probe = new File([''], 'probe.pdf', { type: DEFAULT_PDF_MIME })
    return Boolean(navigator.canShare?.({ files: [probe] }))
  } catch {
    return false
  }
}
