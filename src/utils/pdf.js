import { getDocument, GlobalWorkerOptions, Util } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorker

/** Low-res thumbnail target width (CSS px). Independent from main viewer. */
export const THUMBNAIL_MAX_WIDTH = 140

/** Base viewer page width before zoom (CSS px). */
export const VIEWER_BASE_WIDTH = 720

/** Bump when extract algorithm changes so in-memory caches invalidate. */
export const PDF_TEXT_CACHE_VERSION = 'v10'

/**
 * Load a PDF File into a PDF.js document proxy.
 * @param {File} file
 */
export async function loadPdfFromFile(file) {
  const buffer = await file.arrayBuffer()
  const data = new Uint8Array(buffer).slice(0)
  const loadingTask = getDocument({ data })
  return loadingTask.promise
}

/**
 * Render a PDF page into a canvas at a given max CSS width.
 *
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdfDoc
 * @param {number} pageNumber
 * @param {HTMLCanvasElement} canvas
 * @param {{ maxWidth: number, pixelRatio?: number, signal?: AbortSignal }} options
 */
export async function renderPdfPage(pdfDoc, pageNumber, canvas, options) {
  const { maxWidth, pixelRatio = 1, signal, rotation = 0 } = options

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  const page = await pdfDoc.getPage(pageNumber)
  const normalizedRotation = ((Number(rotation) % 360) + 360) % 360
  const baseViewport = page.getViewport({ scale: 1, rotation: normalizedRotation })
  const cssScale = maxWidth / baseViewport.width
  const viewport = page.getViewport({
    scale: cssScale * pixelRatio,
    rotation: normalizedRotation,
  })

  const cssWidth = Math.floor(baseViewport.width * cssScale)
  const cssHeight = Math.floor(baseViewport.height * cssScale)

  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  canvas.style.width = `${cssWidth}px`
  canvas.style.height = `${cssHeight}px`

  const context = canvas.getContext('2d', { alpha: false })
  if (!context) {
    throw new Error('Could not get canvas 2D context')
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)

  const renderTask = page.render({
    canvasContext: context,
    viewport,
    canvas,
  })

  const onAbort = () => {
    try {
      renderTask.cancel()
    } catch {
      /* ignore */
    }
  }

  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    await renderTask.promise
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }

  return { width: cssWidth, height: cssHeight, rotation: normalizedRotation }
}

/**
 * @typedef {Object} PdfTextItem
 * @property {string} id
 * @property {string} text
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {number} fontSize
 * @property {string[]} [pdfTextIds]
 * @property {number} [lineCount]
 */

/**
 * Decide whether two runs on the same line need a space between them.
 * Keep this strict — soft gaps are kerning / glyph advances, not word spaces.
 * (Aggressive spacing was splitting Turkish words like "ölçek" → "ö lçe k".)
 * @param {string} prevText
 * @param {string} nextText
 * @param {number} gap
 * @param {number} font
 */
function needsSpaceBetween(prevText, nextText, gap, font) {
  if (!prevText || !nextText) return false
  if (/\s$/.test(prevText) || /^\s/.test(nextText)) return false

  // Real inter-word gap only
  if (gap > font * 0.18) return true
  // After sentence punctuation with a visible gap
  if (/[.,;:!?)]$/.test(prevText) && gap > font * 0.08) return true

  return false
}

/**
 * Extract visual lines with reliable word spacing.
 *
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdfDoc
 * @param {number} pageNumber
 * @param {number} cssWidth
 * @param {{ rotation?: number }} [options]
 * @returns {Promise<PdfTextItem[]>}
 */
export async function extractPageTextItems(pdfDoc, pageNumber, cssWidth, options = {}) {
  if (!pdfDoc || !cssWidth) return []

  const rotation = ((Number(options.rotation ?? 0) % 360) + 360) % 360
  const page = await pdfDoc.getPage(pageNumber)
  const baseViewport = page.getViewport({ scale: 1, rotation })
  const scale = cssWidth / baseViewport.width
  const viewport = page.getViewport({ scale, rotation })

  // Raw runs — do not let pdf.js pre-merge (it drops positional spaces)
  const textContent = await page.getTextContent({
    disableCombineTextItems: true,
    includeMarkedContent: false,
  })

  /** @type {Array<{ str: string, x: number, y: number, width: number, height: number, fontSize: number, hasEOL: boolean }>} */
  const runs = []

  for (const item of textContent.items) {
    if (!item || typeof item.str !== 'string') continue

    const tx = Util.transform(viewport.transform, item.transform)
    const fontSize = Math.max(4, Math.hypot(tx[2], tx[3]) || (item.height || 0) * scale || 10)
    // item.width is already in PDF user-space units — only apply viewport.scale.
    // Multiplying by hypot(tx[0],tx[1]) double-scales by font size and destroys word gaps.
    const width = Math.max((item.width || 0) * scale, item.str.trim() ? fontSize * 0.12 : 0)
    const height = Math.max(fontSize * 0.95, 5)
    const x = tx[4]
    const y = tx[5] - height

    runs.push({
      str: item.str,
      x,
      y,
      width,
      height,
      fontSize,
      hasEOL: Boolean(item.hasEOL),
    })
  }

  if (runs.length === 0) return []

  // Reading order
  runs.sort((a, b) => a.y - b.y || a.x - b.x)

  /** @type {Array<{ text: string, x: number, y: number, width: number, height: number, fontSize: number, runs: typeof runs }>} */
  const lineBuckets = []

  const findLine = (run) => {
    const runMid = run.y + run.height / 2
    return lineBuckets.find((line) => {
      const lineMid = line.y + line.height / 2
      const threshold = Math.max(line.fontSize, run.fontSize) * 0.5
      return Math.abs(lineMid - runMid) <= Math.max(threshold, 3)
    })
  }

  for (const run of runs) {
    let line = findLine(run)

    if (!line) {
      line = {
        text: '',
        x: run.x,
        y: run.y,
        width: run.width,
        height: run.height,
        fontSize: run.fontSize,
        runs: [],
      }
      lineBuckets.push(line)
    }

    line.runs.push(run)

    if (run.hasEOL) {
      // Force a new bucket after explicit EOL by slightly nudging tracker —
      // next run with different y opens a new line naturally; if same y, still OK.
    }
  }

  /** @type {PdfTextItem[]} */
  const lines = []

  lineBuckets.forEach((line, index) => {
    const sortedRuns = [...line.runs].sort((a, b) => a.x - b.x)
    let text = ''
    /** @type {(typeof runs)[number] | null} */
    let prev = null
    let minX = Infinity
    let minY = Infinity
    let maxR = -Infinity
    let maxB = -Infinity
    let fontSize = line.fontSize

    for (const run of sortedRuns) {
      if (!run.str.trim()) {
        if (text && !/\s$/.test(text)) text += ' '
        prev = run
        continue
      }

      if (prev && needsSpaceBetween(text, run.str, run.x - (prev.x + prev.width), Math.max(prev.fontSize, run.fontSize))) {
        text += ' '
      }

      text += run.str.replace(/\s+/g, ' ')
      minX = Math.min(minX, run.x)
      minY = Math.min(minY, run.y)
      maxR = Math.max(maxR, run.x + run.width)
      maxB = Math.max(maxB, run.y + run.height)
      fontSize = Math.max(fontSize, run.fontSize)
      prev = run
    }

    text = text.replace(/[ \t]+/g, ' ').trim()
    if (!text) return

    lines.push({
      id: `pdf-line-${pageNumber}-${index}-${Math.round(minX)}-${Math.round(minY)}`,
      text,
      x: minX,
      y: minY,
      width: Math.max(maxR - minX, fontSize * 2),
      height: Math.max(maxB - minY, fontSize),
      fontSize,
    })
  })

  return lines.sort((a, b) => a.y - b.y || a.x - b.x)
}

/**
 * Join wrapped PDF lines into flowing Word-like text.
 * @param {string} left
 * @param {string} right
 */
function joinFlowingText(left, right) {
  const a = String(left ?? '')
    .replace(/[ \t]+/g, ' ')
    .trimEnd()
  const b = String(right ?? '')
    .replace(/[ \t]+/g, ' ')
    .trimStart()
  if (!a) return b
  if (!b) return a
  if (/[A-Za-zÀ-ÖØ-öø-ÿÇĞİÖŞÜçğıöşü]-$/.test(a) && /^[a-zà-öø-ÿçğıöşü]/.test(b)) {
    return `${a.slice(0, -1)}${b}`
  }
  return `${a} ${b}`
}

/**
 * Whether two visual lines are wrapped lines of the same Word paragraph.
 * @param {PdfTextItem} a
 * @param {PdfTextItem} b
 */
export function arePdfLinesSameParagraph(a, b) {
  const font = Math.max(a.fontSize, b.fontSize, 8)
  const fontRatio =
    Math.min(a.fontSize, b.fontSize) / Math.max(a.fontSize, b.fontSize, 1)
  if (fontRatio < 0.85) return false

  const upper = a.y <= b.y ? a : b
  const lower = a.y <= b.y ? b : a
  const verticalGap = lower.y - (upper.y + upper.height)

  if (verticalGap < -font * 0.3) return false
  if (verticalGap > font * 1.35) return false

  const leftDelta = Math.abs(a.x - b.x)
  if (leftDelta > font * 1.4) return false

  // Short separate labels (phone / email / title) stay their own paragraphs
  const upperShort = upper.text.length < 42 && upper.width < font * 22
  const lowerShort = lower.text.length < 42 && lower.width < font * 22
  if (upperShort && lowerShort && verticalGap > font * 0.45) return false

  const looksWrapped = upper.text.length >= 40 || upper.width >= font * 18
  if (!looksWrapped && verticalGap > font * 0.65) return false

  return true
}

/**
 * @param {PdfTextItem} seed
 * @param {PdfTextItem[]} allLines
 */
export function growPdfParagraph(seed, allLines) {
  const pool = (allLines ?? []).filter(Boolean)
  if (!seed) return { lines: [], pdfTextIds: [] }

  /** @type {PdfTextItem[]} */
  const group = [seed]
  const used = new Set([seed.id])
  let changed = true

  while (changed) {
    changed = false
    for (const line of pool) {
      if (used.has(line.id)) continue
      if (group.some((member) => arePdfLinesSameParagraph(member, line))) {
        group.push(line)
        used.add(line.id)
        changed = true
      }
    }
  }

  group.sort((a, b) => a.y - b.y || a.x - b.x)
  return {
    lines: group,
    pdfTextIds: group.map((line) => line.id),
  }
}

/**
 * Convert PDF lines into an internal Word-like document (flowing paragraphs).
 * @param {PdfTextItem[]} lines
 */
export function convertPdfLinesToDocument(lines) {
  const remaining = [...(lines ?? [])].sort((a, b) => a.y - b.y || a.x - b.x)
  /** @type {Array<{ id: string, content: string, originalContent: string, x: number, y: number, width: number, height: number, fontSize: number, dirty: boolean }>} */
  const paragraphs = []

  while (remaining.length > 0) {
    const seed = remaining[0]
    const { lines: group, pdfTextIds } = growPdfParagraph(seed, remaining)
    const used = new Set(pdfTextIds)

    for (let i = remaining.length - 1; i >= 0; i -= 1) {
      if (used.has(remaining[i].id)) remaining.splice(i, 1)
    }

    let content = ''
    let minX = Infinity
    let minY = Infinity
    let maxR = -Infinity
    let maxB = -Infinity
    let fontSize = 8

    for (const line of group) {
      content = content ? joinFlowingText(content, line.text) : line.text
      minX = Math.min(minX, line.x)
      minY = Math.min(minY, line.y)
      maxR = Math.max(maxR, line.x + line.width)
      maxB = Math.max(maxB, line.y + line.height)
      fontSize = Math.max(fontSize, line.fontSize)
    }

    content = content.replace(/[ \t]+/g, ' ').trim()
    if (!content) continue

    const width = Math.max(maxR - minX, fontSize * 10)
    const height = Math.max(
      maxB - minY,
      Math.round(fontSize * 1.4 * Math.max(1, group.length)),
    )

    paragraphs.push({
      id: `doc-p-${paragraphs.length}-${Math.round(minX)}-${Math.round(minY)}`,
      content,
      originalContent: content,
      x: minX,
      y: minY,
      width,
      height,
      fontSize,
      dirty: false,
    })
  }

  return paragraphs
}

/** @deprecated use convertPdfLinesToDocument */
export function buildPdfParagraphs(lines) {
  return convertPdfLinesToDocument(lines)
}

export function isAbortError(error) {
  return (
    error?.name === 'AbortError' ||
    error?.name === 'RenderingCancelledException' ||
    /cancel/i.test(String(error?.message ?? ''))
  )
}
