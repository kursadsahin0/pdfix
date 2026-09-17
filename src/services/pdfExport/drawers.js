import {
  LineCapStyle,
  pushGraphicsState,
  popGraphicsState,
  translate,
  rotateDegrees,
  rgb,
} from 'pdf-lib'
import {
  DEFAULT_DRAWING_DATA,
  DEFAULT_SHAPE_DATA,
  DEFAULT_TEXT_DATA,
} from '@/utils/editorObjects'

/**
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number }}
 */
export function parseHexColor(hex, fallback = '#000000') {
  const raw = String(hex || fallback).trim()
  const short = /^#([0-9a-fA-F]{3})$/.exec(raw)
  if (short) {
    const s = short[1]
    return {
      r: parseInt(s[0] + s[0], 16) / 255,
      g: parseInt(s[1] + s[1], 16) / 255,
      b: parseInt(s[2] + s[2], 16) / 255,
    }
  }
  const full = /^#([0-9a-fA-F]{6})$/.exec(raw)
  if (full) {
    const n = full[1]
    return {
      r: parseInt(n.slice(0, 2), 16) / 255,
      g: parseInt(n.slice(2, 4), 16) / 255,
      b: parseInt(n.slice(4, 6), 16) / 255,
    }
  }
  return parseHexColor(fallback)
}

/**
 * @param {string} hex
 */
export function colorFromHex(hex) {
  const { r, g, b } = parseHexColor(hex)
  return rgb(r, g, b)
}

/**
 * Run draw ops inside a CTM that rotates around a PDF center point.
 * CSS positive rotation is clockwise; PDF angles are counter-clockwise.
 *
 * @param {import('pdf-lib').PDFPage} page
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} cssRotationDeg
 * @param {() => void} draw
 */
export function withCenterRotation(page, centerX, centerY, cssRotationDeg, draw) {
  const angle = Number(cssRotationDeg) || 0
  if (!angle) {
    draw()
    return
  }

  page.pushOperators(
    pushGraphicsState(),
    translate(centerX, centerY),
    rotateDegrees(-angle),
    translate(-centerX, -centerY),
  )
  try {
    draw()
  } finally {
    page.pushOperators(popGraphicsState())
  }
}

/**
 * @param {string} src
 * @returns {Promise<{ bytes: Uint8Array, kind: 'png' | 'jpg' }>}
 */
export async function rasterizeImageSrc(src) {
  if (!src) throw new Error('Missing image source')

  const image = await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image for export'))
    img.crossOrigin = 'anonymous'
    img.src = src
  })

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, image.naturalWidth || image.width)
  canvas.height = Math.max(1, image.naturalHeight || image.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create canvas for image export')
  ctx.drawImage(image, 0, 0)

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Image encode failed'))),
      'image/png',
    )
  })

  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    kind: 'png',
  }
}

/**
 * Simple word wrap using font width metrics.
 *
 * @param {string} text
 * @param {import('pdf-lib').PDFFont} font
 * @param {number} fontSize
 * @param {number} maxWidth
 * @returns {string[]}
 */
export function wrapTextLines(text, font, fontSize, maxWidth) {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n')
  const paragraphs = normalized.split('\n')
  /** @type {string[]} */
  const lines = []

  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push('')
      continue
    }

    const words = paragraph.split(/\s+/).filter(Boolean)
    let current = ''

    for (const word of words) {
      const next = current ? `${current} ${word}` : word
      const width = font.widthOfTextAtSize(next, fontSize)
      if (width <= maxWidth || !current) {
        current = next
        if (width > maxWidth && current === word) {
          // Extremely long single word — hard-split
          let chunk = ''
          for (const ch of word) {
            const trial = chunk + ch
            if (font.widthOfTextAtSize(trial, fontSize) > maxWidth && chunk) {
              lines.push(chunk)
              chunk = ch
            } else {
              chunk = trial
            }
          }
          current = chunk
        }
      } else {
        lines.push(current)
        current = word
      }
    }
    if (current) lines.push(current)
  }

  return lines.length ? lines : ['']
}

/**
 * @param {import('pdf-lib').PDFPage} page
 * @param {import('@/utils/pdfCoordinates').PageCoordMapper} mapper
 * @param {import('@/utils/editorObjects').EditorObject} object
 * @param {{ resolveFont: (style: object) => Promise<import('pdf-lib').PDFFont> }} ctx
 */
export async function drawTextObject(page, mapper, object, ctx) {
  const data = { ...DEFAULT_TEXT_DATA, ...(object.data ?? {}) }
  const box = mapper.editorRectToPdf({
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
  })
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  const font = await ctx.resolveFont(data)
  const fontSize = Math.max(
    4,
    mapper.editorDistanceToPdf(object.x, object.y, object.x, object.y + (data.fontSize || 16)),
  )
  const lineHeight = fontSize * (Number(data.lineHeight) > 0 ? Number(data.lineHeight) : 1.3)
  const color = colorFromHex(data.color || '#000000')
  const pad = mapper.editorLengthToPdf(2)
  const maxWidth = Math.max(4, box.width - pad * 2)
  const lines = wrapTextLines(String(data.content ?? ''), font, fontSize, maxWidth)
  const align = data.textAlign || 'left'

  withCenterRotation(page, centerX, centerY, object.rotation || 0, () => {
    if (data.whiteout || data.source === 'pdf') {
      page.drawRectangle({
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        color: rgb(1, 1, 1),
        borderWidth: 0,
      })
    }

    let cursorY = box.y + box.height - fontSize - pad
    for (const line of lines) {
      if (cursorY < box.y - fontSize) break
      const textWidth = font.widthOfTextAtSize(line, fontSize)
      let textX = box.x + pad
      if (align === 'center') textX = box.x + (box.width - textWidth) / 2
      else if (align === 'right') textX = box.x + box.width - textWidth - pad

      page.drawText(line, {
        x: textX,
        y: cursorY,
        size: fontSize,
        font,
        color,
      })
      cursorY -= lineHeight
    }
  })
}

/**
 * @param {import('pdf-lib').PDFPage} page
 * @param {import('@/utils/pdfCoordinates').PageCoordMapper} mapper
 * @param {import('@/utils/editorObjects').EditorObject} object
 */
export function drawDrawingObject(page, mapper, object) {
  const data = { ...DEFAULT_DRAWING_DATA, ...(object.data ?? {}) }
  const localPoints = Array.isArray(data.points) ? data.points : []
  if (localPoints.length === 0) return

  const strokeWidth = Math.max(
    0.5,
    mapper.editorLengthToPdf(Number(data.strokeWidth) || DEFAULT_DRAWING_DATA.strokeWidth),
  )
  const color = colorFromHex(data.color || DEFAULT_DRAWING_DATA.color)

  const pagePoints = localPoints.map((point) =>
    mapper.editorToPdf(object.x + point.x, object.y + point.y),
  )

  if (pagePoints.length === 1) {
    const p = pagePoints[0]
    page.drawCircle({
      x: p.x,
      y: p.y,
      size: strokeWidth / 2,
      color,
      borderWidth: 0,
    })
    return
  }

  for (let i = 1; i < pagePoints.length; i += 1) {
    const start = pagePoints[i - 1]
    const end = pagePoints[i]
    page.drawLine({
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y },
      thickness: strokeWidth,
      color,
      lineCap: LineCapStyle.Round,
    })
  }
}

/**
 * @param {import('pdf-lib').PDFPage} page
 * @param {import('@/utils/pdfCoordinates').PageCoordMapper} mapper
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} to
 * @param {number} strokeWidth
 * @param {ReturnType<typeof colorFromHex>} color
 */
function drawArrowHead(page, from, to, strokeWidth, color) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const size = Math.max(strokeWidth * 3.2, 6)
  const left = {
    x: to.x - size * Math.cos(angle - Math.PI / 7),
    y: to.y - size * Math.sin(angle - Math.PI / 7),
  }
  const right = {
    x: to.x - size * Math.cos(angle + Math.PI / 7),
    y: to.y - size * Math.sin(angle + Math.PI / 7),
  }

  page.drawLine({
    start: { x: left.x, y: left.y },
    end: { x: to.x, y: to.y },
    thickness: strokeWidth,
    color,
    lineCap: LineCapStyle.Round,
  })
  page.drawLine({
    start: { x: right.x, y: right.y },
    end: { x: to.x, y: to.y },
    thickness: strokeWidth,
    color,
    lineCap: LineCapStyle.Round,
  })
}

/**
 * @param {import('pdf-lib').PDFPage} page
 * @param {import('@/utils/pdfCoordinates').PageCoordMapper} mapper
 * @param {import('@/utils/editorObjects').EditorObject} object
 */
export function drawShapeObject(page, mapper, object) {
  const data = { ...DEFAULT_SHAPE_DATA, ...(object.data ?? {}) }
  const box = mapper.editorRectToPdf({
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
  })
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  const strokeWidth = Math.max(0.5, mapper.editorLengthToPdf(Number(data.strokeWidth) || 2))
  const stroke = colorFromHex(data.strokeColor || DEFAULT_SHAPE_DATA.strokeColor)
  const fill = colorFromHex(data.fillColor || DEFAULT_SHAPE_DATA.fillColor)
  const opacity = Math.min(1, Math.max(0, Number(data.opacity ?? 1)))
  const shapeType = data.shapeType || 'rectangle'

  withCenterRotation(page, centerX, centerY, object.rotation || 0, () => {
    if (shapeType === 'rectangle') {
      page.drawRectangle({
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        color: fill,
        borderColor: stroke,
        borderWidth: strokeWidth,
        opacity,
        borderOpacity: opacity,
      })
      return
    }

    if (shapeType === 'circle') {
      page.drawEllipse({
        x: centerX,
        y: centerY,
        xScale: Math.max(0.5, box.width / 2),
        yScale: Math.max(0.5, box.height / 2),
        color: fill,
        borderColor: stroke,
        borderWidth: strokeWidth,
        opacity,
        borderOpacity: opacity,
      })
      return
    }

    const x1 = object.x + (data.x1 ?? 0) * object.width
    const y1 = object.y + (data.y1 ?? 0) * object.height
    const x2 = object.x + (data.x2 ?? 1) * object.width
    const y2 = object.y + (data.y2 ?? 1) * object.height
    const start = mapper.editorToPdf(x1, y1)
    const end = mapper.editorToPdf(x2, y2)

    page.drawLine({
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y },
      thickness: strokeWidth,
      color: stroke,
      opacity,
      lineCap: LineCapStyle.Round,
    })

    if (shapeType === 'arrow') {
      drawArrowHead(page, start, end, strokeWidth, stroke)
    }
  })
}

/**
 * @param {import('pdf-lib').PDFDocument} pdfDoc
 * @param {import('pdf-lib').PDFPage} page
 * @param {import('@/utils/pdfCoordinates').PageCoordMapper} mapper
 * @param {import('@/utils/editorObjects').EditorObject} object
 * @param {Map<string, import('pdf-lib').PDFImage>} imageCache
 */
export async function drawImageObject(pdfDoc, page, mapper, object, imageCache) {
  const src = String(object.data?.src || '')
  if (!src) return

  let embedded = imageCache.get(src)
  if (!embedded) {
    const { bytes, kind } = await rasterizeImageSrc(src)
    embedded = kind === 'jpg' ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes)
    imageCache.set(src, embedded)
  }

  const box = mapper.editorRectToPdf({
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
  })
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2

  withCenterRotation(page, centerX, centerY, object.rotation || 0, () => {
    page.drawImage(embedded, {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    })
  })
}

/**
 * Dirty PDF paragraph edits: whiteout original area and write new content.
 *
 * @param {import('pdf-lib').PDFPage} page
 * @param {import('@/utils/pdfCoordinates').PageCoordMapper} mapper
 * @param {object} paragraph
 * @param {{ resolveFont: Function }} ctx
 */
export async function drawPdfParagraphEdit(page, mapper, paragraph, ctx) {
  if (!paragraph?.dirty) return
  const content = String(paragraph.content ?? '')
  const original = String(paragraph.originalContent ?? '')
  if (content === original) return

  const box = mapper.editorRectToPdf({
    x: paragraph.x,
    y: paragraph.y,
    width: paragraph.width,
    height: paragraph.height,
  })

  page.drawRectangle({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  })

  const font = await ctx.resolveFont({
    fontFamily: 'Helvetica, Arial, sans-serif',
    fontWeight: 'normal',
    fontStyle: 'normal',
  })
  const fontSize = Math.max(
    4,
    mapper.editorDistanceToPdf(
      paragraph.x,
      paragraph.y,
      paragraph.x,
      paragraph.y + (paragraph.fontSize || 14),
    ),
  )
  const lines = wrapTextLines(content, font, fontSize, Math.max(4, box.width - 2))
  let cursorY = box.y + box.height - fontSize - 1
  for (const line of lines) {
    if (cursorY < box.y - fontSize) break
    page.drawText(line, {
      x: box.x + 1,
      y: cursorY,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    })
    cursorY -= fontSize * 1.35
  }
}

/**
 * @param {import('pdf-lib').PDFDocument} pdfDoc
 * @param {import('pdf-lib').PDFPage} page
 * @param {import('@/utils/pdfCoordinates').PageCoordMapper} mapper
 * @param {import('@/utils/editorObjects').EditorObject} object
 * @param {{ resolveFont: Function, imageCache: Map<string, import('pdf-lib').PDFImage> }} ctx
 */
export async function drawEditorObject(pdfDoc, page, mapper, object, ctx) {
  if (!object) return

  switch (object.type) {
    case 'text':
      await drawTextObject(page, mapper, object, ctx)
      break
    case 'drawing':
      drawDrawingObject(page, mapper, object)
      break
    case 'shape':
      drawShapeObject(page, mapper, object)
      break
    case 'image':
    case 'signature':
      await drawImageObject(pdfDoc, page, mapper, object, ctx.imageCache)
      break
    default:
      break
  }
}
