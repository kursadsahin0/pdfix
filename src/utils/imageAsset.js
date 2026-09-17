/** Max longest edge after client-side downscale (px). */
export const MAX_IMAGE_EDGE = 1600

/** Prefer WebP when the browser can encode it. */
export const IMAGE_OUTPUT_TYPE = 'image/webp'
export const IMAGE_OUTPUT_QUALITY = 0.82

export const IMAGE_ACCEPT =
  'image/png,image/jpeg,image/jpg,image/webp,.png,.jpg,.jpeg,.webp'

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])

/** @type {Set<string>} */
const managedObjectUrls = new Set()

/**
 * @param {File} file
 */
export function isSupportedImageFile(file) {
  if (!file) return false
  if (ALLOWED_TYPES.has(file.type)) return true
  return /\.(png|jpe?g|webp)$/i.test(file.name)
}

/**
 * @param {string | null | undefined} url
 */
export function trackObjectUrl(url) {
  if (typeof url === 'string' && url.startsWith('blob:')) {
    managedObjectUrls.add(url)
  }
}

/**
 * @param {string | null | undefined} url
 */
export function revokeObjectUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('blob:')) return
  if (!managedObjectUrls.has(url)) return
  URL.revokeObjectURL(url)
  managedObjectUrls.delete(url)
}

export function revokeAllManagedObjectUrls() {
  for (const url of managedObjectUrls) {
    URL.revokeObjectURL(url)
  }
  managedObjectUrls.clear()
}

/**
 * @param {File | Blob} source
 * @returns {Promise<HTMLImageElement>}
 */
function loadImageElement(source) {
  const tempUrl = URL.createObjectURL(source)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(tempUrl)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(tempUrl)
      reject(new Error('Failed to load image'))
    }
    img.src = tempUrl
  })
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} type
 * @param {number} quality
 * @returns {Promise<Blob>}
 */
function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode image'))
          return
        }
        resolve(blob)
      },
      type,
      quality,
    )
  })
}

/**
 * Downscale + re-encode image on the client. Returns a managed blob: URL.
 *
 * @param {File} file
 * @returns {Promise<{ src: string, width: number, height: number, mimeType: string, bytes: number }>}
 */
export async function prepareImageAsset(file) {
  if (!isSupportedImageFile(file)) {
    throw new Error('Unsupported image type. Use PNG, JPG, or WEBP.')
  }

  const img = await loadImageElement(file)
  const naturalWidth = img.naturalWidth || img.width
  const naturalHeight = img.naturalHeight || img.height

  if (!naturalWidth || !naturalHeight) {
    throw new Error('Invalid image dimensions')
  }

  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(naturalWidth, naturalHeight))
  const width = Math.max(1, Math.round(naturalWidth * scale))
  const height = Math.max(1, Math.round(naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create canvas context')

  ctx.drawImage(img, 0, 0, width, height)

  let mimeType = IMAGE_OUTPUT_TYPE
  let blob
  try {
    blob = await canvasToBlob(canvas, IMAGE_OUTPUT_TYPE, IMAGE_OUTPUT_QUALITY)
  } catch {
    mimeType = 'image/jpeg'
    blob = await canvasToBlob(canvas, 'image/jpeg', IMAGE_OUTPUT_QUALITY)
  }

  // Fallback if WebP encoding produced an empty/odd result
  if (!blob || blob.size === 0) {
    mimeType = 'image/jpeg'
    blob = await canvasToBlob(canvas, 'image/jpeg', IMAGE_OUTPUT_QUALITY)
  }

  const src = URL.createObjectURL(blob)
  trackObjectUrl(src)

  return {
    src,
    width,
    height,
    mimeType,
    bytes: blob.size,
  }
}

/**
 * Export a signature pad canvas as a cropped transparent PNG blob URL.
 * @param {HTMLCanvasElement} sourceCanvas
 * @returns {Promise<{ src: string, width: number, height: number, mimeType: string, bytes: number }>}
 */
export async function exportSignatureFromCanvas(sourceCanvas) {
  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not read signature canvas')

  const { width, height } = sourceCanvas
  const imageData = ctx.getImageData(0, 0, width, height)
  const { data } = imageData

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3]
      if (alpha > 8) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error('Please draw a signature first.')
  }

  const pad = 8
  const cropX = Math.max(0, minX - pad)
  const cropY = Math.max(0, minY - pad)
  const cropW = Math.min(width - cropX, maxX - minX + 1 + pad * 2)
  const cropH = Math.min(height - cropY, maxY - minY + 1 + pad * 2)

  const out = document.createElement('canvas')
  out.width = cropW
  out.height = cropH
  const outCtx = out.getContext('2d')
  if (!outCtx) throw new Error('Could not create signature export canvas')

  outCtx.clearRect(0, 0, cropW, cropH)
  outCtx.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)

  const blob = await canvasToBlob(out, 'image/png', 1)
  const src = URL.createObjectURL(blob)
  trackObjectUrl(src)

  return {
    src,
    width: cropW,
    height: cropH,
    mimeType: 'image/png',
    bytes: blob.size,
  }
}
