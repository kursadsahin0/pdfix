let objectSeq = 0

/**
 * @typedef {'text' | 'shape' | 'drawing' | 'image' | 'signature'} EditorObjectType
 */

/**
 * @typedef {Object} TextObjectData
 * @property {string} content
 * @property {number} fontSize
 * @property {string} fontFamily
 * @property {string} fontWeight
 * @property {string} fontStyle
 * @property {string} color
 * @property {'left'|'center'|'right'|'justify'} textAlign
 */

/**
 * @typedef {{ x: number, y: number }} DrawPoint
 */

/**
 * @typedef {Object} DrawingObjectData
 * @property {DrawPoint[]} points - coordinates relative to object origin
 * @property {string} color
 * @property {number} strokeWidth
 */

/**
 * @typedef {Object} ImageObjectData
 * @property {string} src - blob: URL (managed client-side)
 * @property {number} [naturalWidth]
 * @property {number} [naturalHeight]
 */

/**
 * @typedef {Object} EditorObject
 * @property {string} id
 * @property {EditorObjectType} type
 * @property {number} page
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {number} rotation
 * @property {Record<string, unknown>} data
 */

/** @type {TextObjectData} */
export const DEFAULT_TEXT_DATA = {
  content: 'Hello World',
  fontSize: 16,
  fontFamily: 'Roboto, Helvetica, Arial, sans-serif',
  fontWeight: 'normal',
  fontStyle: 'normal',
  color: '#000000',
  textAlign: 'left',
}

export const TEXT_FONT_OPTIONS = [
  { label: 'Roboto', value: 'Roboto, Helvetica, Arial, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Times', value: '"Times New Roman", Times, serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier', value: '"Courier New", Courier, monospace' },
]

export const TEXT_SIZE_OPTIONS = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64]

/** @type {DrawingObjectData} */
export const DEFAULT_DRAWING_DATA = {
  points: [],
  color: '#111827',
  strokeWidth: 4,
}

export const STROKE_WIDTH_OPTIONS = [2, 4, 8]

/** Eraser brush sizes (page px diameter-ish via stroke width) */
export const ERASER_WIDTH_OPTIONS = [8, 16, 24, 32]

/** Min distance between sampled stroke points (page px) */
export const DRAW_POINT_MIN_DISTANCE = 1.5

/**
 * @typedef {'rectangle' | 'circle' | 'line' | 'arrow'} ShapeType
 */

/**
 * @typedef {Object} ShapeObjectData
 * @property {ShapeType} shapeType
 * @property {string} strokeColor
 * @property {string} fillColor
 * @property {number} strokeWidth
 * @property {number} opacity
 * @property {number} [x1] - line/arrow start (0–1 of width)
 * @property {number} [y1]
 * @property {number} [x2]
 * @property {number} [y2]
 */

/** @type {ShapeObjectData} */
export const DEFAULT_SHAPE_DATA = {
  shapeType: 'rectangle',
  strokeColor: '#2563eb',
  fillColor: '#93c5fd',
  strokeWidth: 2,
  opacity: 1,
  x1: 0,
  y1: 0,
  x2: 1,
  y2: 1,
}

export const SHAPE_TYPE_OPTIONS = [
  { id: 'rectangle', label: 'Rectangle', icon: 'crop_square' },
  { id: 'circle', label: 'Circle', icon: 'circle' },
  { id: 'line', label: 'Line', icon: 'show_chart' },
  { id: 'arrow', label: 'Arrow', icon: 'north_east' },
]

export const MIN_SHAPE_SIZE = 8

/**
 * @param {Partial<EditorObject> & { type: EditorObjectType, page: number }} partial
 * @returns {EditorObject}
 */
export function createEditorObject(partial) {
  objectSeq += 1
  return {
    id: partial.id ?? `object-${objectSeq}-${Date.now().toString(36)}`,
    type: partial.type,
    page: partial.page,
    x: partial.x ?? 80,
    y: partial.y ?? 80,
    width: partial.width ?? 160,
    height: partial.height ?? 48,
    rotation: partial.rotation ?? 0,
    data: { ...(partial.data ?? {}) },
  }
}

/**
 * @param {{ page: number, x: number, y: number, width?: number, height?: number, data?: Partial<TextObjectData> }} options
 * @returns {EditorObject}
 */
export function createTextObject(options) {
  const fontSize = options.data?.fontSize ?? DEFAULT_TEXT_DATA.fontSize
  return createEditorObject({
    type: 'text',
    page: options.page,
    x: options.x,
    y: options.y,
    width: options.width ?? Math.max(160, Math.round(fontSize * 12)),
    height: options.height ?? Math.max(36, Math.round(fontSize * 2.2)),
    rotation: 0,
    data: {
      ...DEFAULT_TEXT_DATA,
      ...(options.data ?? {}),
    },
  })
}

/**
 * Build an editable Word-like text frame from a PDF paragraph block.
 * @param {{ page: number, pdfTextIds?: string[], lineCount?: number } & import('@/utils/pdf').PdfTextItem} item
 */
export function createPdfTextObject(item) {
  const fontSize = Math.max(8, Math.round(item.fontSize || 14))
  const lineHeight = 1.4
  const lineCount = Math.max(1, item.lineCount || Math.round(item.height / (fontSize * 1.15)) || 1)
  const width = Math.max(item.width, fontSize * 14)
  const height = Math.max(item.height, Math.round(fontSize * lineHeight * lineCount + 10))
  const pdfTextIds = item.pdfTextIds?.length ? item.pdfTextIds : [item.id]

  return createTextObject({
    page: item.page,
    x: Math.max(0, item.x),
    y: Math.max(0, item.y),
    width,
    height,
    data: {
      content: item.text,
      fontSize,
      fontFamily: 'Helvetica, Arial, sans-serif',
      fontWeight: 'normal',
      fontStyle: 'normal',
      color: '#000000',
      textAlign: 'left',
      lineHeight,
      source: 'pdf',
      pdfTextId: item.id,
      pdfTextIds,
      whiteout: true,
    },
  })
}

/**
 * Build a drawing object from page-space stroke points.
 * @param {{ page: number, points: DrawPoint[], color?: string, strokeWidth?: number }} options
 * @returns {EditorObject | null}
 */
export function createDrawingObjectFromPoints(options) {
  const points = options.points ?? []
  if (points.length === 0) return null

  const strokeWidth = options.strokeWidth ?? DEFAULT_DRAWING_DATA.strokeWidth
  const color = options.color ?? DEFAULT_DRAWING_DATA.color
  const pad = Math.ceil(strokeWidth / 2) + 2

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  // Single tap → small mark
  if (points.length === 1) {
    minX -= 0.5
    minY -= 0.5
    maxX += 0.5
    maxY += 0.5
  }

  const x = minX - pad
  const y = minY - pad
  const width = Math.max(MIN_OBJECT_SIZE, maxX - minX + pad * 2)
  const height = Math.max(MIN_OBJECT_SIZE, maxY - minY + pad * 2)

  const localPoints = points.map((point) => ({
    x: point.x - x,
    y: point.y - y,
  }))

  return createEditorObject({
    type: 'drawing',
    page: options.page,
    x,
    y,
    width,
    height,
    rotation: 0,
    data: {
      ...DEFAULT_DRAWING_DATA,
      points: localPoints,
      color,
      strokeWidth,
    },
  })
}

/**
 * @param {{
 *   page: number,
 *   x: number,
 *   y: number,
 *   width: number,
 *   height: number,
 *   src: string,
 *   naturalWidth?: number,
 *   naturalHeight?: number,
 * }} options
 */
export function createImageObject(options) {
  return createEditorObject({
    type: 'image',
    page: options.page,
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height,
    rotation: 0,
    data: {
      src: options.src,
      naturalWidth: options.naturalWidth,
      naturalHeight: options.naturalHeight,
    },
  })
}

/**
 * @param {{
 *   page: number,
 *   x: number,
 *   y: number,
 *   width: number,
 *   height: number,
 *   src: string,
 *   naturalWidth?: number,
 *   naturalHeight?: number,
 * }} options
 */
export function createSignatureObject(options) {
  return createEditorObject({
    type: 'signature',
    page: options.page,
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height,
    rotation: 0,
    data: {
      src: options.src,
      naturalWidth: options.naturalWidth,
      naturalHeight: options.naturalHeight,
    },
  })
}

/**
 * Fit an image into the page with a sensible default display size.
 * @param {{ pageWidth: number, pageHeight: number, imageWidth: number, imageHeight: number }} size
 */
export function fitImageToPage(size) {
  const maxW = Math.min(size.pageWidth * 0.45, 360)
  const maxH = Math.min(size.pageHeight * 0.45, 420)
  const scale = Math.min(maxW / size.imageWidth, maxH / size.imageHeight, 1)
  const width = Math.max(MIN_OBJECT_SIZE, Math.round(size.imageWidth * scale))
  const height = Math.max(MIN_OBJECT_SIZE, Math.round(size.imageHeight * scale))
  const x = Math.max(0, Math.round((size.pageWidth - width) / 2))
  const y = Math.max(0, Math.round((size.pageHeight - height) / 2))
  return { x, y, width, height }
}

/**
 * Signatures are typically wide and short.
 * @param {{ pageWidth: number, pageHeight: number, imageWidth: number, imageHeight: number }} size
 */
export function fitSignatureToPage(size) {
  const maxW = Math.min(size.pageWidth * 0.4, 280)
  const maxH = Math.min(size.pageHeight * 0.18, 110)
  const scale = Math.min(maxW / size.imageWidth, maxH / size.imageHeight, 1)
  const width = Math.max(MIN_OBJECT_SIZE, Math.round(size.imageWidth * scale))
  const height = Math.max(20, Math.round(size.imageHeight * scale))
  const x = Math.max(0, Math.round((size.pageWidth - width) / 2))
  const y = Math.max(0, Math.round(size.pageHeight * 0.72 - height / 2))
  return { x, y, width, height }
}

/**
 * @param {{ x: number, y: number }} p
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 */
export function distancePointToSegment(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const projX = a.x + t * dx
  const projY = a.y + t * dy
  return Math.hypot(p.x - projX, p.y - projY)
}

/**
 * @param {{ x: number, y: number }} point
 * @param {{ x: number, y: number }[]} polyline
 */
export function distancePointToPolyline(point, polyline) {
  if (!polyline?.length) return Infinity
  if (polyline.length === 1) {
    return Math.hypot(point.x - polyline[0].x, point.y - polyline[0].y)
  }
  let min = Infinity
  for (let i = 1; i < polyline.length; i += 1) {
    min = Math.min(min, distancePointToSegment(point, polyline[i - 1], polyline[i]))
  }
  return min
}

/**
 * Split a page-space polyline by removing points near the eraser path.
 * @param {{ x: number, y: number }[]} pagePoints
 * @param {{ x: number, y: number }[]} eraserPoints
 * @param {number} radius
 * @returns {{ x: number, y: number }[][]}
 */
export function splitPolylineByEraser(pagePoints, eraserPoints, radius) {
  if (!pagePoints?.length) return []

  const keptFlags = pagePoints.map(
    (point) => distancePointToPolyline(point, eraserPoints) > radius,
  )

  /** @type {{ x: number, y: number }[][]} */
  const runs = []
  /** @type {{ x: number, y: number }[]} */
  let current = []

  for (let i = 0; i < pagePoints.length; i += 1) {
    if (keptFlags[i]) {
      current.push({ ...pagePoints[i] })
    } else if (current.length) {
      runs.push(current)
      current = []
    }
  }
  if (current.length) runs.push(current)

  return runs.filter((run) => run.length >= 1)
}

/**
 * Apply eraser path to one drawing object → replacement drawing objects (page space).
 * @param {EditorObject} drawing
 * @param {{ x: number, y: number }[]} eraserPoints
 * @param {number} radius
 * @returns {{ remove: boolean, replacements: EditorObject[] }}
 */
export function eraseDrawingObject(drawing, eraserPoints, radius) {
  if (drawing.type !== 'drawing') {
    return { remove: false, replacements: [] }
  }

  const localPoints = Array.isArray(drawing.data?.points) ? drawing.data.points : []
  if (!localPoints.length) {
    return { remove: true, replacements: [] }
  }

  const pagePoints = localPoints.map((point) => ({
    x: drawing.x + point.x,
    y: drawing.y + point.y,
  }))

  const runs = splitPolylineByEraser(pagePoints, eraserPoints, radius)
  if (runs.length === 0) {
    return { remove: true, replacements: [] }
  }

  // Nothing erased
  if (
    runs.length === 1 &&
    runs[0].length === pagePoints.length &&
    runs[0].every((p, i) => p.x === pagePoints[i].x && p.y === pagePoints[i].y)
  ) {
    return { remove: false, replacements: [] }
  }

  const color = drawing.data?.color ?? DEFAULT_DRAWING_DATA.color
  const strokeWidth = drawing.data?.strokeWidth ?? DEFAULT_DRAWING_DATA.strokeWidth

  const replacements = runs
    .map((run) =>
      createDrawingObjectFromPoints({
        page: drawing.page,
        points: run,
        color,
        strokeWidth,
      }),
    )
    .filter(Boolean)

  return { remove: true, replacements }
}

/**
 * Normalize a drag from start→end into a page-space box + optional line endpoints.
 * @param {{ x: number, y: number }} start
 * @param {{ x: number, y: number }} end
 */
export function rectFromDragPoints(start, end) {
  const x = Math.min(start.x, end.x)
  const y = Math.min(start.y, end.y)
  const width = Math.abs(end.x - start.x)
  const height = Math.abs(end.y - start.y)
  return { x, y, width, height }
}

/**
 * @param {{
 *   page: number,
 *   start: { x: number, y: number },
 *   end: { x: number, y: number },
 *   data?: Partial<ShapeObjectData>,
 * }} options
 * @returns {EditorObject | null}
 */
export function createShapeObjectFromDrag(options) {
  const shapeType = options.data?.shapeType ?? DEFAULT_SHAPE_DATA.shapeType
  const isLineLike = shapeType === 'line' || shapeType === 'arrow'
  const { start, end } = options
  const dragW = Math.abs(end.x - start.x)
  const dragH = Math.abs(end.y - start.y)

  if (dragW < 2 && dragH < 2) {
    if (isLineLike) return null
    const size = MIN_OBJECT_SIZE
    return createEditorObject({
      type: 'shape',
      page: options.page,
      x: start.x - size / 2,
      y: start.y - size / 2,
      width: size,
      height: size,
      rotation: 0,
      data: {
        ...DEFAULT_SHAPE_DATA,
        ...(options.data ?? {}),
        shapeType,
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
      },
    })
  }

  if (isLineLike) {
    const pad = 6
    let x = Math.min(start.x, end.x) - pad
    let y = Math.min(start.y, end.y) - pad
    let width = dragW + pad * 2
    let height = dragH + pad * 2

    if (width < MIN_SHAPE_SIZE) {
      const cx = (start.x + end.x) / 2
      width = MIN_SHAPE_SIZE
      x = cx - width / 2
    }
    if (height < MIN_SHAPE_SIZE) {
      const cy = (start.y + end.y) / 2
      height = MIN_SHAPE_SIZE
      y = cy - height / 2
    }

    return createEditorObject({
      type: 'shape',
      page: options.page,
      x,
      y,
      width,
      height,
      rotation: 0,
      data: {
        ...DEFAULT_SHAPE_DATA,
        ...(options.data ?? {}),
        shapeType,
        x1: (start.x - x) / width,
        y1: (start.y - y) / height,
        x2: (end.x - x) / width,
        y2: (end.y - y) / height,
      },
    })
  }

  const { x, y, width, height } = rectFromDragPoints(start, end)

  return createEditorObject({
    type: 'shape',
    page: options.page,
    x,
    y,
    width: Math.max(width, MIN_OBJECT_SIZE),
    height: Math.max(height, MIN_OBJECT_SIZE),
    rotation: 0,
    data: {
      ...DEFAULT_SHAPE_DATA,
      ...(options.data ?? {}),
      shapeType,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
    },
  })
}

/**
 * Angle in degrees from object center to a page point.
 * @param {{ x: number, y: number, width: number, height: number }} object
 * @param {{ x: number, y: number }} point
 */
export function angleFromObjectCenter(object, point) {
  const cx = object.x + object.width / 2
  const cy = object.y + object.height / 2
  return (Math.atan2(point.y - cy, point.x - cx) * 180) / Math.PI
}

/**
 * Deep-ish clone suitable for undo snapshots.
 * @param {Record<string, EditorObject[]>} objectsByPage
 */
export function cloneObjectsByPage(objectsByPage) {
  /** @type {Record<string, EditorObject[]>} */
  const next = {}
  for (const [page, list] of Object.entries(objectsByPage ?? {})) {
    next[page] = list.map((obj) => {
      const data = { ...(obj.data ?? {}) }
      if (Array.isArray(data.points)) {
        data.points = data.points.map((point) => ({ ...point }))
      }
      return { ...obj, data }
    })
  }
  return next
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export const MIN_OBJECT_SIZE = 24

/**
 * Map a pointer event into unscaled page coordinates.
 * Uses the live bounding box so CSS zoom/transform stays correct.
 *
 * @param {Pick<PointerEvent, 'clientX' | 'clientY'>} event
 * @param {HTMLElement} pageEl
 * @param {{ width: number, height: number }} pageSize
 */
export function clientToPagePoint(event, pageEl, pageSize) {
  const rect = pageEl.getBoundingClientRect()
  if (!rect.width || !rect.height || !pageSize.width || !pageSize.height) {
    return { x: 0, y: 0 }
  }

  return {
    x: ((event.clientX - rect.left) / rect.width) * pageSize.width,
    y: ((event.clientY - rect.top) / rect.height) * pageSize.height,
  }
}

/**
 * @param {EditorObject} object
 * @param {'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w'} handle
 * @param {{ x: number, y: number }} point
 * @param {{ width: number, height: number }} pageSize
 * @returns {Pick<EditorObject, 'x' | 'y' | 'width' | 'height'>}
 */
export function resizeObjectFromHandle(object, handle, point, pageSize) {
  let { x, y, width, height } = object
  const right = x + width
  const bottom = y + height

  if (handle.includes('e')) {
    width = clamp(point.x - x, MIN_OBJECT_SIZE, pageSize.width - x)
  }
  if (handle.includes('s')) {
    height = clamp(point.y - y, MIN_OBJECT_SIZE, pageSize.height - y)
  }
  if (handle.includes('w')) {
    const nextX = clamp(point.x, 0, right - MIN_OBJECT_SIZE)
    width = right - nextX
    x = nextX
  }
  if (handle.includes('n')) {
    const nextY = clamp(point.y, 0, bottom - MIN_OBJECT_SIZE)
    height = bottom - nextY
    y = nextY
  }

  return { x, y, width, height }
}

/**
 * @param {EditorObject} object
 * @param {{ x: number, y: number }} delta
 * @param {{ width: number, height: number }} pageSize
 */
export function moveObjectByDelta(object, delta, pageSize) {
  const width = object.width
  const height = object.height
  return {
    x: clamp(object.x + delta.x, 0, Math.max(0, pageSize.width - width)),
    y: clamp(object.y + delta.y, 0, Math.max(0, pageSize.height - height)),
  }
}

export const RESIZE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/**
 * Rotate an editor object 90° clockwise within a page of size (pageWidth x pageHeight).
 * Remaps the axis-aligned box into the new page coordinate system (old H×W → W×H).
 * Local drawing points are relative to the object origin; shape line ends are 0–1 fractions.
 * Object.rotation is left unchanged — it is relative to page axes after remapping.
 *
 * @param {EditorObject} object
 * @param {number} pageWidth - page CSS width before rotation
 * @param {number} pageHeight - page CSS height before rotation
 * @returns {EditorObject}
 */
export function rotateObjectOnPage90CW(object, pageWidth, pageHeight) {
  const x = object.x
  const y = object.y
  const width = object.width
  const height = object.height

  /** @type {EditorObject} */
  const next = {
    ...object,
    x: pageHeight - y - height,
    y: x,
    width: height,
    height: width,
    rotation: object.rotation ?? 0,
    data: { ...(object.data ?? {}) },
  }

  // Drawing strokes: points are local to the object box
  if (Array.isArray(object.data?.points)) {
    next.data.points = object.data.points.map((point) => ({
      x: height - point.y,
      y: point.x,
    }))
  }

  // Line / arrow endpoints are normalized to width/height
  if (
    typeof object.data?.x1 === 'number' ||
    typeof object.data?.y1 === 'number' ||
    typeof object.data?.x2 === 'number' ||
    typeof object.data?.y2 === 'number'
  ) {
    const x1 = object.data.x1 ?? 0
    const y1 = object.data.y1 ?? 0
    const x2 = object.data.x2 ?? 1
    const y2 = object.data.y2 ?? 1
    next.data.x1 = 1 - y1
    next.data.y1 = x1
    next.data.x2 = 1 - y2
    next.data.y2 = x2
  }

  return next
}

/**
 * @param {number} count
 * @returns {number[]}
 */
export function createDefaultPageOrder(count) {
  return Array.from({ length: Math.max(0, count) }, (_, index) => index + 1)
}

