/**
 * Coordinate transforms between editor (CSS / overlay) space and PDF user space.
 *
 * Pipeline:
 *   Browser CSS px (zoom applied only as CSS transform on the stage)
 *     → Editor page coordinates (unzoomed, top-left origin, y↓)
 *     → PDF user space (media / view box, bottom-left origin, y↑)
 *
 * Matches PDF.js PageViewport so export aligns with what the viewer renders.
 */

/**
 * @typedef {[number, number, number, number, number, number]} AffineMatrix
 */

/**
 * @typedef {Object} PageCoordMapper
 * @property {number} editorWidth
 * @property {number} editorHeight
 * @property {number} mediaWidth
 * @property {number} mediaHeight
 * @property {number} rotation
 * @property {number} scale
 * @property {(x: number, y: number) => { x: number, y: number }} editorToPdf
 * @property {(x0: number, y0: number, x1: number, y1: number) => number} editorDistanceToPdf
 * @property {(length: number) => number} editorLengthToPdf
 * @property {(rect: { x: number, y: number, width: number, height: number }) => { x: number, y: number, width: number, height: number }} editorRectToPdf
 */

/**
 * @param {number[]} viewBox
 * @param {number} scale
 * @param {number} rotation
 * @returns {AffineMatrix} PDF → editor/canvas transform
 */
export function buildViewportTransform(viewBox, scale, rotation = 0) {
  const [, , xMax, yMax] = viewBox
  const xMin = viewBox[0]
  const yMin = viewBox[1]
  const centerX = (xMax + xMin) / 2
  const centerY = (yMax + yMin) / 2

  let rot = ((Number(rotation) % 360) + 360) % 360
  let rotateA
  let rotateB
  let rotateC
  let rotateD

  switch (rot) {
    case 180:
      rotateA = -1
      rotateB = 0
      rotateC = 0
      rotateD = 1
      break
    case 90:
      rotateA = 0
      rotateB = 1
      rotateC = 1
      rotateD = 0
      break
    case 270:
      rotateA = 0
      rotateB = -1
      rotateC = -1
      rotateD = 0
      break
    case 0:
      rotateA = 1
      rotateB = 0
      rotateC = 0
      rotateD = -1
      break
    default:
      throw new Error('Page rotation must be a multiple of 90 degrees')
  }

  let offsetCanvasX
  let offsetCanvasY

  if (rotateA === 0) {
    offsetCanvasX = Math.abs(centerY - yMin) * scale
    offsetCanvasY = Math.abs(centerX - xMin) * scale
  } else {
    offsetCanvasX = Math.abs(centerX - xMin) * scale
    offsetCanvasY = Math.abs(centerY - yMin) * scale
  }

  return [
    rotateA * scale,
    rotateB * scale,
    rotateC * scale,
    rotateD * scale,
    offsetCanvasX - rotateA * scale * centerX - rotateC * scale * centerY,
    offsetCanvasY - rotateB * scale * centerX - rotateD * scale * centerY,
  ]
}

/**
 * @param {[number, number]} point
 * @param {AffineMatrix} m
 * @returns {[number, number]}
 */
export function applyTransform(point, m) {
  const [x, y] = point
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

/**
 * @param {[number, number]} point
 * @param {AffineMatrix} m
 * @returns {[number, number]}
 */
export function applyInverseTransform(point, m) {
  const [x, y] = point
  const det = m[0] * m[3] - m[1] * m[2]
  if (!det) return [0, 0]
  const invDet = 1 / det
  const a = m[3] * invDet
  const b = -m[1] * invDet
  const c = -m[2] * invDet
  const d = m[0] * invDet
  const e = (m[2] * m[5] - m[3] * m[4]) * invDet
  const f = (m[1] * m[4] - m[0] * m[5]) * invDet
  return [a * x + c * y + e, b * x + d * y + f]
}

/**
 * Create a mapper from editor page CSS coordinates to PDF user space.
 *
 * @param {{
 *   viewBox: number[],
 *   editorWidth: number,
 *   editorHeight: number,
 *   rotation?: number,
 * }} options
 * @returns {PageCoordMapper}
 */
export function createPageCoordMapper(options) {
  const viewBox = options.viewBox
  const editorWidth = Math.max(1, Number(options.editorWidth) || 1)
  const editorHeight = Math.max(1, Number(options.editorHeight) || 1)
  const rotation = ((Number(options.rotation ?? 0) % 360) + 360) % 360

  const mediaWidth = viewBox[2] - viewBox[0]
  const mediaHeight = viewBox[3] - viewBox[1]
  const baseWidth = rotation === 90 || rotation === 270 ? mediaHeight : mediaWidth
  const scale = editorWidth / Math.max(baseWidth, 1e-6)
  const transform = buildViewportTransform(viewBox, scale, rotation)

  function editorToPdf(x, y) {
    const [px, py] = applyInverseTransform([x, y], transform)
    return { x: px, y: py }
  }

  function editorDistanceToPdf(x0, y0, x1, y1) {
    const a = editorToPdf(x0, y0)
    const b = editorToPdf(x1, y1)
    return Math.hypot(b.x - a.x, b.y - a.y)
  }

  function editorLengthToPdf(length) {
    return editorDistanceToPdf(0, 0, length, 0)
  }

  /**
   * Axis-aligned editor rect → axis-aligned PDF box (origin = bottom-left).
   */
  function editorRectToPdf(rect) {
    const corners = [
      editorToPdf(rect.x, rect.y),
      editorToPdf(rect.x + rect.width, rect.y),
      editorToPdf(rect.x + rect.width, rect.y + rect.height),
      editorToPdf(rect.x, rect.y + rect.height),
    ]
    const xs = corners.map((c) => c.x)
    const ys = corners.map((c) => c.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    return {
      x: minX,
      y: minY,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY),
    }
  }

  return {
    editorWidth,
    editorHeight,
    mediaWidth,
    mediaHeight,
    rotation,
    scale,
    editorToPdf,
    editorDistanceToPdf,
    editorLengthToPdf,
    editorRectToPdf,
  }
}

/**
 * Convert browser client coordinates into editor page coordinates.
 * Accounts for overlay element box and CSS zoom on an ancestor.
 *
 * @param {DOMRect | { left: number, top: number, width: number, height: number }} overlayRect
 * @param {number} clientX
 * @param {number} clientY
 * @param {number} [zoomPercent=100]
 * @returns {{ x: number, y: number }}
 */
export function browserToEditorPoint(overlayRect, clientX, clientY, zoomPercent = 100) {
  const zoom = Math.max(0.01, (Number(zoomPercent) || 100) / 100)
  return {
    x: (clientX - overlayRect.left) / zoom,
    y: (clientY - overlayRect.top) / zoom,
  }
}

/**
 * Full pipeline helper: browser → editor → PDF.
 *
 * @param {PageCoordMapper} mapper
 * @param {DOMRect | { left: number, top: number }} overlayRect
 * @param {number} clientX
 * @param {number} clientY
 * @param {number} [zoomPercent=100]
 */
export function browserToPdfPoint(mapper, overlayRect, clientX, clientY, zoomPercent = 100) {
  const editor = browserToEditorPoint(overlayRect, clientX, clientY, zoomPercent)
  return mapper.editorToPdf(editor.x, editor.y)
}
