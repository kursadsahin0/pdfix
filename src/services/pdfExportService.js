import { degrees, PDFDocument } from 'pdf-lib'
import { createPageCoordMapper } from '@/utils/pdfCoordinates'
import { VIEWER_BASE_WIDTH } from '@/utils/pdf'
import { createFontResolver } from '@/services/pdfExport/fonts'
import {
  drawEditorObject,
  drawPdfParagraphEdit,
} from '@/services/pdfExport/drawers'

export const EXPORT_FILENAME = 'edited-document.pdf'

/**
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdfJsDoc
 * @param {number} sourcePage
 * @param {number} rotation
 */
async function measureEditorPage(pdfJsDoc, sourcePage, rotation) {
  const page = await pdfJsDoc.getPage(sourcePage)
  const normalizedRotation = ((Number(rotation) % 360) + 360) % 360
  const viewBox = Array.from(page.view)
  const baseViewport = page.getViewport({ scale: 1, rotation: normalizedRotation })
  const cssScale = VIEWER_BASE_WIDTH / baseViewport.width

  return {
    viewBox,
    rotation: normalizedRotation,
    editorWidth: Math.floor(baseViewport.width * cssScale),
    editorHeight: Math.floor(baseViewport.height * cssScale),
  }
}

/**
 * Download PDF bytes in the browser.
 * @param {Uint8Array} bytes
 * @param {string} [filename]
 */
export function downloadPdfBytes(bytes, filename = EXPORT_FILENAME) {
  const blob = new Blob([bytes], { type: 'application/pdf' })
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
}

/**
 * Collect dirty PDF text paragraphs for a source page from the text cache map.
 *
 * @param {Record<string, unknown[]>} pdfTextByPage
 * @param {number} sourcePage
 * @returns {object[]}
 */
function getDirtyParagraphsForPage(pdfTextByPage, sourcePage) {
  if (!pdfTextByPage) return []
  const prefix = `${sourcePage}@`
  /** @type {object[]} */
  const dirty = []

  for (const [key, list] of Object.entries(pdfTextByPage)) {
    if (!key.startsWith(prefix)) continue
    for (const block of list ?? []) {
      if (block?.dirty) dirty.push(block)
    }
  }

  return dirty
}

/**
 * Build an exported PDF from the original file + editor state.
 *
 * @param {{
 *   pdfFile: File | Blob,
 *   pdfJsDoc: import('pdfjs-dist').PDFDocumentProxy,
 *   pageOrder: number[],
 *   rotations?: Record<string, number>,
 *   objectsByPage?: Record<string, import('@/utils/editorObjects').EditorObject[]>,
 *   pdfTextByPage?: Record<string, unknown[]>,
 *   onProgress?: (info: { current: number, total: number, phase: string }) => void,
 * }} options
 * @returns {Promise<Uint8Array>}
 */
export async function buildEditedPdf(options) {
  const {
    pdfFile,
    pdfJsDoc,
    pageOrder,
    rotations = {},
    objectsByPage = {},
    pdfTextByPage = {},
    onProgress,
  } = options

  if (!pdfFile) {
    throw new Error('No PDF file is loaded.')
  }
  if (!pdfJsDoc) {
    throw new Error('PDF document is not ready.')
  }
  if (!Array.isArray(pageOrder) || pageOrder.length === 0) {
    throw new Error('There are no pages to export.')
  }

  onProgress?.({ current: 0, total: pageOrder.length, phase: 'load' })

  const sourceBytes = new Uint8Array(await pdfFile.arrayBuffer())
  const sourceDoc = await PDFDocument.load(sourceBytes, {
    ignoreEncryption: true,
  })
  const outDoc = await PDFDocument.create()
  const fontResolver = await createFontResolver(outDoc)
  /** @type {Map<string, import('pdf-lib').PDFImage>} */
  const imageCache = new Map()

  const zeroBasedIndices = pageOrder.map((sourcePage) => {
    const index = sourcePage - 1
    if (index < 0 || index >= sourceDoc.getPageCount()) {
      throw new Error(`Page ${sourcePage} is missing from the source PDF.`)
    }
    return index
  })

  const copiedPages = await outDoc.copyPages(sourceDoc, zeroBasedIndices)

  for (let i = 0; i < copiedPages.length; i += 1) {
    const sourcePage = pageOrder[i]
    const page = copiedPages[i]
    outDoc.addPage(page)

    const rotation = Number(rotations[String(sourcePage)] ?? 0) || 0
    page.setRotation(degrees(((rotation % 360) + 360) % 360))

    onProgress?.({
      current: i + 1,
      total: pageOrder.length,
      phase: 'page',
    })

    const measured = await measureEditorPage(pdfJsDoc, sourcePage, rotation)
    const mapper = createPageCoordMapper(measured)
    const ctx = {
      resolveFont: (style) => fontResolver.resolve(style),
      imageCache,
    }

    const dirtyParagraphs = getDirtyParagraphsForPage(pdfTextByPage, sourcePage)
    for (const paragraph of dirtyParagraphs) {
      await drawPdfParagraphEdit(page, mapper, paragraph, ctx)
    }

    const objects = objectsByPage[String(sourcePage)] ?? []
    for (const object of objects) {
      await drawEditorObject(outDoc, page, mapper, object, ctx)
    }
  }

  onProgress?.({
    current: pageOrder.length,
    total: pageOrder.length,
    phase: 'save',
  })

  return outDoc.save()
}

/**
 * Build and save/download the edited PDF via fileService.
 *
 * @param {Parameters<typeof buildEditedPdf>[0] & { filename?: string }} options
 */
export async function exportEditedPdf(options) {
  const { saveFile } = await import('@/services/fileService')
  const bytes = await buildEditedPdf(options)
  await saveFile({
    data: bytes,
    filename: options.filename ?? EXPORT_FILENAME,
    mimeType: 'application/pdf',
  })
  return bytes
}
