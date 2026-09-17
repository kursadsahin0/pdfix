import { defineStore, acceptHMRUpdate } from 'pinia'
import { computed, markRaw, ref } from 'vue'
import {
  cloneObjectsByPage,
  createDrawingObjectFromPoints,
  createEditorObject,
  createImageObject,
  createSignatureObject,
  createShapeObjectFromDrag,
  createTextObject,
  DEFAULT_DRAWING_DATA,
  DEFAULT_SHAPE_DATA,
  eraseDrawingObject,
  fitImageToPage,
  fitSignatureToPage,
  MIN_OBJECT_SIZE,
  createDefaultPageOrder,
  rotateObjectOnPage90CW,
} from '@/utils/editorObjects'
import {
  IMAGE_ACCEPT,
  isSupportedImageFile,
  prepareImageAsset,
  revokeAllManagedObjectUrls,
  revokeObjectUrl,
} from '@/utils/imageAsset'
import {
  convertPdfLinesToDocument,
  extractPageTextItems,
  loadPdfFromFile,
  PDF_TEXT_CACHE_VERSION,
  VIEWER_BASE_WIDTH,
} from '@/utils/pdf'
import { clearPdfSession, loadPdfSession, savePdfSession } from '@/utils/pdfSession'
import { createHistory } from '@/composables/useHistory'

export const useEditorStore = defineStore('editor', () => {
  const pdfFile = ref(null)
  /** @type {import('vue').Ref<import('pdfjs-dist').PDFDocumentProxy | null>} */
  const pdfDoc = ref(null)
  const currentPage = ref(1)
  const zoom = ref(100)
  const activeTool = ref('select')
  const totalPages = ref(0)
  /** Original PDF page count (before deletes). */
  const pdfPageCount = ref(0)
  const isLoadingPdf = ref(false)
  const pdfError = ref(null)
  const isAddingImage = ref(false)
  const imageError = ref(null)
  const signatureDialogOpen = ref(false)
  /** When set, Add replaces this signature object instead of creating a new one */
  const signatureReplaceId = ref(null)

  /** CSS pixel size of the current page (pre-zoom), shared by PDF canvas + overlay */
  const pageSize = ref({ width: 0, height: 0 })

  /**
   * Page-keyed object lists. Prefer immutable replacements for future undo/redo.
   * @type {import('vue').Ref<Record<string, import('@/utils/editorObjects').EditorObject[]>>}
   */
  const objectsByPage = ref({})
  const selectedObjectId = ref(null)
  /** Inline text editing target */
  const editingObjectId = ref(null)

  /**
   * Future-ready page document layout (order / rotations).
   * `order` holds source PDF page numbers in display order.
   * @type {import('vue').Ref<{ order: number[], rotations: Record<string, number> }>}
   */
  const pageLayout = ref({
    order: [],
    rotations: {},
  })

  const history = createHistory({ maxSize: 50 })

  /** Source PDF page numbers in sidebar / navigation order */
  const pageOrder = computed(() => {
    if (pageLayout.value.order?.length) return pageLayout.value.order
    if (pdfPageCount.value > 0) return createDefaultPageOrder(pdfPageCount.value)
    return []
  })

  /** Visible page count after deletes */
  const visiblePageCount = computed(() => pageOrder.value.length)

  /** 1-based index of current page in the visible order */
  const currentDisplayIndex = computed(() => {
    const index = pageOrder.value.indexOf(currentPage.value)
    return index >= 0 ? index + 1 : 0
  })

  /**
   * Word-like editable PDF paragraphs keyed by cache key.
   * @type {import('vue').Ref<Record<string, Array<import('@/utils/pdf').PdfTextItem & { content: string }>>>}
   */
  const pdfTextByPage = ref({})
  /** @type {import('vue').Ref<Record<string, Promise<unknown>>>} */
  const pdfTextLoadPromises = ref({})
  /** Focused document paragraph id */
  const editingPdfParagraphId = ref(null)

  /** Draw tool defaults (applied to new strokes) */
  const drawColor = ref(DEFAULT_DRAWING_DATA.color)
  const drawStrokeWidth = ref(DEFAULT_DRAWING_DATA.strokeWidth)
  /** @type {import('vue').Ref<'pen' | 'eraser'>} */
  const drawMode = ref('pen')
  const eraserWidth = ref(16)

  /** Shape tool defaults */
  const shapeType = ref(DEFAULT_SHAPE_DATA.shapeType)
  const shapeStrokeColor = ref(DEFAULT_SHAPE_DATA.strokeColor)
  const shapeFillColor = ref(DEFAULT_SHAPE_DATA.fillColor)
  const shapeStrokeWidth = ref(DEFAULT_SHAPE_DATA.strokeWidth)
  const shapeOpacity = ref(DEFAULT_SHAPE_DATA.opacity)

  const selectedObject = computed(() => {
    if (!selectedObjectId.value) return null
    const pageKey = String(currentPage.value)
    const list = objectsByPage.value[pageKey] ?? []
    return (
      list.find((obj) => obj.id === selectedObjectId.value) ??
      findObjectById(selectedObjectId.value)
    )
  })

  const currentPageObjects = computed(() => {
    return objectsByPage.value[String(currentPage.value)] ?? []
  })

  /**
   * Editable PDF paragraphs for the current page (Word-like document text).
   */
  const currentPagePdfParagraphs = computed(() => {
    return getPdfParagraphsForPage(currentPage.value)
  })

  const isEditingText = computed(() => {
    if (editingPdfParagraphId.value) return true
    if (!editingObjectId.value) return false
    const obj = findObjectById(editingObjectId.value)
    return obj?.type === 'text'
  })

  function pdfTextCacheKey(pageNumber, cssWidth = pageSize.value.width) {
    const width = Math.round(cssWidth || 0)
    if (!pageNumber || !width) return ''
    const rotation = getPageRotation(pageNumber)
    return `${pageNumber}@${width}@r${rotation}@${PDF_TEXT_CACHE_VERSION}`
  }

  function getPdfParagraphsForPage(pageNumber) {
    const key = pdfTextCacheKey(pageNumber)
    if (!key) return []
    return pdfTextByPage.value[key] ?? []
  }

  function clearPdfTextCache() {
    pdfTextByPage.value = {}
    pdfTextLoadPromises.value = {}
    editingPdfParagraphId.value = null
  }

  /**
   * Convert the PDF page into an internal Word-like document for editing.
   * @param {number} pageNumber
   * @param {number} cssWidth
   */
  async function ensurePdfTextForPage(pageNumber, cssWidth) {
    if (!pdfDoc.value || !pageNumber || !cssWidth) return []

    const pageKey = pdfTextCacheKey(pageNumber, cssWidth)
    if (!pageKey) return []

    if (pdfTextByPage.value[pageKey]) {
      return pdfTextByPage.value[pageKey]
    }

    if (pdfTextLoadPromises.value[pageKey]) {
      return pdfTextLoadPromises.value[pageKey]
    }

    const rotation = getPageRotation(pageNumber)
    const loadPromise = extractPageTextItems(pdfDoc.value, pageNumber, cssWidth, {
      rotation,
    })
      .then((lines) => {
        if (!pdfDoc.value) return []
        const documentBlocks = convertPdfLinesToDocument(lines)
        pdfTextByPage.value = {
          ...pdfTextByPage.value,
          [pageKey]: documentBlocks,
        }
        return documentBlocks
      })
      .catch((error) => {
        console.error('PDF text extract failed', error)
        return []
      })
      .finally(() => {
        const next = { ...pdfTextLoadPromises.value }
        delete next[pageKey]
        pdfTextLoadPromises.value = next
      })

    pdfTextLoadPromises.value = {
      ...pdfTextLoadPromises.value,
      [pageKey]: loadPromise,
    }

    return loadPromise
  }

  /**
   * @param {string | null} id
   */
  function setEditingPdfParagraph(id) {
    editingPdfParagraphId.value = id || null
    if (id) {
      editingObjectId.value = null
      selectedObjectId.value = null
    }
  }

  /**
   * @param {string} id
   * @param {string} content
   */
  function updatePdfParagraphContent(id, content) {
    const pageKey = pdfTextCacheKey(currentPage.value)
    if (!pageKey) return

    const list = pdfTextByPage.value[pageKey]
    if (!list) return

    const index = list.findIndex((block) => block.id === id)
    if (index < 0) return

    const prev = list[index]
    const nextContent = String(content ?? '')
    if (String(prev.content ?? '') === nextContent) return

    recordHistory('pdf-text-edit', { coalesceKey: `pdf-text:${id}` })

    const nextList = [...list]
    nextList[index] = {
      ...prev,
      content: nextContent,
      text: nextContent,
      dirty: nextContent !== String(prev.originalContent ?? ''),
    }
    pdfTextByPage.value = {
      ...pdfTextByPage.value,
      [pageKey]: nextList,
    }
  }

  function findObjectById(id) {
    for (const list of Object.values(objectsByPage.value)) {
      const found = list.find((obj) => obj.id === id)
      if (found) return found
    }
    return null
  }

  function setActiveTool(tool) {
    if (tool === 'image') {
      void pickAndAddImage()
      return
    }
    if (tool === 'signature') {
      openSignatureDialog()
      return
    }
    activeTool.value = tool
    if (tool === 'text' || tool === 'draw' || tool === 'shape') {
      stopEditing()
      selectedObjectId.value = null
    } else if (tool !== 'select') {
      stopEditing()
      selectedObjectId.value = null
    }
  }

  function setDrawColor(color) {
    drawColor.value = color
  }

  function setDrawStrokeWidth(width) {
    drawStrokeWidth.value = width
  }

  function setDrawMode(mode) {
    drawMode.value = mode === 'eraser' ? 'eraser' : 'pen'
  }

  function setEraserWidth(width) {
    eraserWidth.value = width
  }

  function setShapeType(type) {
    shapeType.value = type
  }

  function setShapeStrokeColor(color) {
    shapeStrokeColor.value = color
  }

  function setShapeFillColor(color) {
    shapeFillColor.value = color
  }

  function setShapeStrokeWidth(width) {
    shapeStrokeWidth.value = width
  }

  function setShapeOpacity(value) {
    shapeOpacity.value = Math.min(1, Math.max(0, Number(value) || 0))
  }

  function setCurrentPage(page) {
    if (!pageOrder.value.includes(page)) return
    currentPage.value = page
    selectedObjectId.value = null
    stopEditing()
    pageSize.value = { width: 0, height: 0 }
  }

  function setPageSize(width, height) {
    pageSize.value = {
      width: Math.max(0, Math.round(width)),
      height: Math.max(0, Math.round(height)),
    }
  }

  function zoomIn() {
    zoom.value = Math.min(zoom.value + 10, 300)
  }

  function zoomOut() {
    zoom.value = Math.max(zoom.value - 10, 25)
  }

  function resetZoom() {
    zoom.value = 100
  }

  function selectObject(id) {
    selectedObjectId.value = id
  }

  function clearSelection() {
    selectedObjectId.value = null
    stopEditing()
  }

  function startEditing(id) {
    const obj = findObjectById(id)
    if (!obj || obj.type !== 'text') return
    editingPdfParagraphId.value = null
    selectedObjectId.value = id
    editingObjectId.value = id
  }

  function stopEditing() {
    editingObjectId.value = null
    editingPdfParagraphId.value = null
    history.endCoalesce()
  }

  /**
   * Clone PDF text paragraph map (content only — no PDF binary).
   * @param {Record<string, unknown[]>} map
   */
  function clonePdfTextByPage(map) {
    /** @type {Record<string, unknown[]>} */
    const next = {}
    for (const [key, list] of Object.entries(map ?? {})) {
      next[key] = (list ?? []).map((item) => ({ ...item }))
    }
    return next
  }

  function clonePageLayout(layout) {
    return {
      order: Array.isArray(layout?.order) ? [...layout.order] : [],
      rotations: { ...(layout?.rotations ?? {}) },
    }
  }

  function getPageRotation(sourcePage) {
    const value = pageLayout.value.rotations[String(sourcePage)] ?? 0
    return ((Number(value) % 360) + 360) % 360
  }

  function syncVisiblePageCount() {
    totalPages.value = pageLayout.value.order.length
  }

  function invalidatePdfTextForSourcePage(sourcePage) {
    const prefix = `${sourcePage}@`
    /** @type {Record<string, unknown[]>} */
    const next = {}
    for (const [key, list] of Object.entries(pdfTextByPage.value)) {
      if (!key.startsWith(prefix)) next[key] = list
    }
    pdfTextByPage.value = next
  }

  /**
   * Measure CSS page size for a source page at the current rotation (viewer base width).
   * @param {number} sourcePage
   * @param {number} [rotation]
   */
  async function measureSourcePageSize(sourcePage, rotation) {
    if (!pdfDoc.value) return { width: 0, height: 0 }
    const page = await pdfDoc.value.getPage(sourcePage)
    const rot = rotation ?? getPageRotation(sourcePage)
    const baseViewport = page.getViewport({ scale: 1, rotation: rot })
    const scale = VIEWER_BASE_WIDTH / baseViewport.width
    return {
      width: Math.floor(baseViewport.width * scale),
      height: Math.floor(baseViewport.height * scale),
    }
  }

  /**
   * Lightweight editor document snapshot for undo/redo (never includes PDF bytes).
   */
  function getHistorySnapshot() {
    return {
      objectsByPage: cloneObjectsByPage(objectsByPage.value),
      pdfTextByPage: clonePdfTextByPage(pdfTextByPage.value),
      pageLayout: clonePageLayout(pageLayout.value),
      currentPage: currentPage.value,
    }
  }

  /**
   * @param {ReturnType<typeof getHistorySnapshot>} snapshot
   */
  function restoreHistorySnapshot(snapshot) {
    if (!snapshot) return

    objectsByPage.value = cloneObjectsByPage(snapshot.objectsByPage ?? {})
    pdfTextByPage.value = clonePdfTextByPage(snapshot.pdfTextByPage ?? {})
    pageLayout.value = clonePageLayout(
      snapshot.pageLayout ?? { order: createDefaultPageOrder(pdfPageCount.value), rotations: {} },
    )
    syncVisiblePageCount()

    if (
      typeof snapshot.currentPage === 'number' &&
      pageLayout.value.order.includes(snapshot.currentPage)
    ) {
      currentPage.value = snapshot.currentPage
    } else if (pageLayout.value.order.length) {
      currentPage.value = pageLayout.value.order[0]
    }

    pageSize.value = { width: 0, height: 0 }

    if (selectedObjectId.value && !findObjectById(selectedObjectId.value)) {
      selectedObjectId.value = null
    }
    if (editingObjectId.value && !findObjectById(editingObjectId.value)) {
      editingObjectId.value = null
    }
    editingPdfParagraphId.value = null
  }

  /**
   * Record current editor state before a mutating change.
   * @param {string} [label]
   * @param {{ coalesceKey?: string | null }} [meta]
   */
  function recordHistory(label = '', meta = {}) {
    history.push(getHistorySnapshot(), {
      label,
      coalesceKey: meta.coalesceKey ?? null,
    })
  }

  function undo() {
    stopEditing()
    return history.undo(getHistorySnapshot, restoreHistorySnapshot)
  }

  function redo() {
    stopEditing()
    return history.redo(getHistorySnapshot, restoreHistorySnapshot)
  }

  function clearHistory() {
    history.clear()
  }

  /**
   * Apply a page-layout change with history support.
   * @param {(layout: { order: number[], rotations: Record<string, number> }) => { order: number[], rotations: Record<string, number> }} mutator
   * @param {string} [label]
   */
  function updatePageLayout(mutator, label = 'page-update') {
    recordHistory(label)
    pageLayout.value = clonePageLayout(mutator(clonePageLayout(pageLayout.value)))
    syncVisiblePageCount()
  }

  /**
   * Reorder visible pages by display index (0-based).
   * @param {number} fromIndex
   * @param {number} toIndex
   */
  function reorderPages(fromIndex, toIndex) {
    const order = [...pageOrder.value]
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= order.length ||
      toIndex >= order.length ||
      fromIndex === toIndex
    ) {
      return false
    }

    recordHistory('page-reorder')
    const [moved] = order.splice(fromIndex, 1)
    order.splice(toIndex, 0, moved)
    pageLayout.value = {
      ...pageLayout.value,
      order,
    }
    syncVisiblePageCount()
    return true
  }

  /**
   * Delete a source PDF page from the document view.
   * @param {number} sourcePage
   */
  function deletePage(sourcePage) {
    const order = [...pageOrder.value]
    const index = order.indexOf(sourcePage)
    if (index < 0) return false
    if (order.length <= 1) {
      pdfError.value = 'At least one page must remain.'
      return false
    }

    recordHistory('page-delete')

    order.splice(index, 1)
    const nextRotations = { ...pageLayout.value.rotations }
    delete nextRotations[String(sourcePage)]

    pageLayout.value = {
      order,
      rotations: nextRotations,
    }
    syncVisiblePageCount()

    const nextObjects = { ...objectsByPage.value }
    delete nextObjects[String(sourcePage)]
    objectsByPage.value = nextObjects
    invalidatePdfTextForSourcePage(sourcePage)

    if (currentPage.value === sourcePage) {
      const fallback = order[Math.min(index, order.length - 1)]
      currentPage.value = fallback
      selectedObjectId.value = null
      stopEditing()
      pageSize.value = { width: 0, height: 0 }
    } else if (selectedObjectId.value) {
      const selected = findObjectById(selectedObjectId.value)
      if (selected?.page === sourcePage) {
        selectedObjectId.value = null
        stopEditing()
      }
    }

    return true
  }

  /**
   * Rotate a source page 90° clockwise. Transforms editor objects to match.
   * @param {number} sourcePage
   */
  async function rotatePage(sourcePage) {
    if (!pdfDoc.value || !pageOrder.value.includes(sourcePage)) return false

    recordHistory('page-rotate')

    const prevRotation = getPageRotation(sourcePage)
    const size = await measureSourcePageSize(sourcePage, prevRotation)
    const pageKey = String(sourcePage)
    const list = objectsByPage.value[pageKey] ?? []

    if (list.length && size.width > 0 && size.height > 0) {
      objectsByPage.value = {
        ...objectsByPage.value,
        [pageKey]: list.map((obj) =>
          rotateObjectOnPage90CW(obj, size.width, size.height),
        ),
      }
    }

    pageLayout.value = {
      ...pageLayout.value,
      rotations: {
        ...pageLayout.value.rotations,
        [pageKey]: (prevRotation + 90) % 360,
      },
    }

    invalidatePdfTextForSourcePage(sourcePage)

    if (currentPage.value === sourcePage) {
      selectedObjectId.value = null
      stopEditing()
      pageSize.value = { width: 0, height: 0 }
    }

    return true
  }

  /**
   * Immutable snapshot for undo stacks.
   */
  function getObjectsSnapshot() {
    return cloneObjectsByPage(objectsByPage.value)
  }

  /**
   * Replace all objects from a snapshot (undo/redo).
   * @param {Record<string, import('@/utils/editorObjects').EditorObject[]>} snapshot
   */
  function replaceObjects(snapshot) {
    objectsByPage.value = cloneObjectsByPage(snapshot ?? {})
    if (selectedObjectId.value && !findObjectById(selectedObjectId.value)) {
      selectedObjectId.value = null
    }
    if (editingObjectId.value && !findObjectById(editingObjectId.value)) {
      editingObjectId.value = null
    }
  }

  /**
   * @param {import('@/utils/editorObjects').EditorObject | (Partial<import('@/utils/editorObjects').EditorObject> & { type: import('@/utils/editorObjects').EditorObjectType, page: number })} objectOrPartial
   * @param {{ history?: boolean }} [options]
   */
  function addObject(objectOrPartial, options = {}) {
    if (options.history !== false) {
      recordHistory('object-add')
    }

    const object =
      objectOrPartial.id && objectOrPartial.type && objectOrPartial.page != null
        ? {
            ...objectOrPartial,
            data: { ...(objectOrPartial.data ?? {}) },
          }
        : createEditorObject(objectOrPartial)

    const pageKey = String(object.page)
    const list = objectsByPage.value[pageKey] ?? []
    objectsByPage.value = {
      ...objectsByPage.value,
      [pageKey]: [...list, object],
    }
    return object
  }

  /**
   * Place a new text object in page coordinates and enter edit mode.
   * @param {{ x: number, y: number, page?: number }} point
   */
  function addTextAtPoint(point) {
    const page = point.page ?? currentPage.value
    const size = pageSize.value
    const width = 200
    const height = 40
    const x = Math.min(Math.max(0, point.x), Math.max(0, size.width - width))
    const y = Math.min(Math.max(0, point.y), Math.max(0, size.height - height))

    const object = createTextObject({ page, x, y, width, height })
    addObject(object)
    selectedObjectId.value = object.id
    editingObjectId.value = object.id
    activeTool.value = 'select'
    return object
  }

  /**
   * Commit a finished freehand stroke as a drawing object.
   * @param {{ points: { x: number, y: number }[], page?: number, color?: string, strokeWidth?: number }} stroke
   */
  function addDrawingStroke(stroke) {
    const object = createDrawingObjectFromPoints({
      page: stroke.page ?? currentPage.value,
      points: stroke.points,
      color: stroke.color ?? drawColor.value,
      strokeWidth: stroke.strokeWidth ?? drawStrokeWidth.value,
    })
    if (!object) return null
    addObject(object)
    return object
  }

  /**
   * Erase drawing strokes along a path on the current page.
   * @param {{ points: { x: number, y: number }[], radius?: number, page?: number }} stroke
   */
  function eraseDrawingsAlongPath(stroke) {
    const page = stroke.page ?? currentPage.value
    const pageKey = String(page)
    const radius = stroke.radius ?? eraserWidth.value / 2
    const eraserPoints = stroke.points ?? []
    if (eraserPoints.length === 0) return false

    const list = objectsByPage.value[pageKey] ?? []
    /** @type {import('@/utils/editorObjects').EditorObject[]} */
    const nextList = []
    let changed = false
    let selectionRemoved = false

    for (const obj of list) {
      if (obj.type !== 'drawing') {
        nextList.push(obj)
        continue
      }

      const result = eraseDrawingObject(obj, eraserPoints, radius)
      if (!result.remove) {
        nextList.push(obj)
        continue
      }

      changed = true
      if (selectedObjectId.value === obj.id) {
        selectionRemoved = true
      }
      nextList.push(...result.replacements)
    }

    if (!changed) return false

    recordHistory('object-erase')
    objectsByPage.value = {
      ...objectsByPage.value,
      [pageKey]: nextList,
    }

    if (selectionRemoved) {
      selectedObjectId.value = null
    }
    return true
  }

  /**
   * Commit a shape created by drag gesture.
   * @param {{ start: { x: number, y: number }, end: { x: number, y: number }, page?: number }} drag
   */
  function addShapeFromDrag(drag) {
    const object = createShapeObjectFromDrag({
      page: drag.page ?? currentPage.value,
      start: drag.start,
      end: drag.end,
      data: {
        shapeType: shapeType.value,
        strokeColor: shapeStrokeColor.value,
        fillColor: shapeFillColor.value,
        strokeWidth: shapeStrokeWidth.value,
        opacity: shapeOpacity.value,
      },
    })
    if (!object) return null
    addObject(object)
    selectedObjectId.value = object.id
    activeTool.value = 'select'
    return object
  }

  /**
   * Open a file picker, process the image client-side, and place it on the page.
   */
  function pickAndAddImage() {
    if (isAddingImage.value) return
    if (!pdfDoc.value) {
      imageError.value = 'Open a PDF before adding images.'
      return
    }

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = IMAGE_ACCEPT
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      if (!file) return
      await addImageFromFile(file)
    })
    input.click()
  }

  /**
   * @param {File} file
   */
  async function addImageFromFile(file) {
    if (!pdfDoc.value) {
      imageError.value = 'Open a PDF before adding images.'
      return null
    }
    if (!isSupportedImageFile(file)) {
      imageError.value = 'Unsupported image type. Use PNG, JPG, or WEBP.'
      return null
    }

    isAddingImage.value = true
    imageError.value = null

    try {
      const asset = await prepareImageAsset(file)
      const page = currentPage.value
      const size = pageSize.value
      const pageWidth = size.width || 720
      const pageHeight = size.height || 1000
      const box = fitImageToPage({
        pageWidth,
        pageHeight,
        imageWidth: asset.width,
        imageHeight: asset.height,
      })

      const object = createImageObject({
        page,
        ...box,
        src: asset.src,
        naturalWidth: asset.width,
        naturalHeight: asset.height,
      })

      addObject(object)
      selectedObjectId.value = object.id
      activeTool.value = 'select'
      stopEditing()
      return object
    } catch (error) {
      console.error('Failed to add image', error)
      imageError.value = error?.message || 'Failed to add image.'
      return null
    } finally {
      isAddingImage.value = false
    }
  }

  /**
   * Replace the source of an existing image object.
   * @param {string} id
   * @param {File} file
   */
  async function replaceImageFromFile(id, file) {
    const obj = findObjectById(id)
    if (!obj || obj.type !== 'image') return false

    isAddingImage.value = true
    imageError.value = null

    try {
      const asset = await prepareImageAsset(file)
      const prevSrc = obj.data?.src
      const ratio = asset.width / asset.height
      let width = obj.width
      let height = Math.max(MIN_OBJECT_SIZE, Math.round(width / ratio))

      // Keep roughly same footprint
      if (height > obj.height * 1.8 || height < obj.height * 0.4) {
        height = obj.height
        width = Math.max(MIN_OBJECT_SIZE, Math.round(height * ratio))
      }

      updateObject(id, {
        width,
        height,
        data: {
          src: asset.src,
          naturalWidth: asset.width,
          naturalHeight: asset.height,
        },
      })
      revokeObjectUrl(prevSrc)
      return true
    } catch (error) {
      console.error('Failed to replace image', error)
      imageError.value = error?.message || 'Failed to replace image.'
      return false
    } finally {
      isAddingImage.value = false
    }
  }

  function openSignatureDialog(replaceId = null) {
    if (!pdfDoc.value) {
      imageError.value = 'Open a PDF before adding a signature.'
      return
    }
    signatureReplaceId.value = replaceId
    signatureDialogOpen.value = true
  }

  function closeSignatureDialog() {
    signatureDialogOpen.value = false
    signatureReplaceId.value = null
  }

  /**
   * Place or replace a signature from an exported PNG asset.
   * @param {{ src: string, width: number, height: number }} asset
   */
  async function addSignatureAsset(asset) {
    if (!pdfDoc.value || !asset?.src) return false

    const replaceId = signatureReplaceId.value
    if (replaceId) {
      const existing = findObjectById(replaceId)
      if (existing?.type === 'signature') {
        const prevSrc = existing.data?.src
        const ratio = asset.width / Math.max(asset.height, 1)
        let width = existing.width
        let height = Math.max(20, Math.round(width / ratio))
        updateObject(replaceId, {
          width,
          height,
          data: {
            src: asset.src,
            naturalWidth: asset.width,
            naturalHeight: asset.height,
          },
        })
        revokeObjectUrl(prevSrc)
        selectedObjectId.value = replaceId
        activeTool.value = 'select'
        closeSignatureDialog()
        return true
      }
    }

    const size = pageSize.value
    const pageWidth = size.width || 720
    const pageHeight = size.height || 1000
    const box = fitSignatureToPage({
      pageWidth,
      pageHeight,
      imageWidth: asset.width,
      imageHeight: asset.height,
    })

    const object = createSignatureObject({
      page: currentPage.value,
      ...box,
      src: asset.src,
      naturalWidth: asset.width,
      naturalHeight: asset.height,
    })

    addObject(object)
    selectedObjectId.value = object.id
    activeTool.value = 'select'
    stopEditing()
    closeSignatureDialog()
    return true
  }

  /**
   * @param {string} id
   * @param {Partial<import('@/utils/editorObjects').EditorObject>} patch
   * @param {{ history?: boolean, coalesceKey?: string | null, label?: string }} [options]
   */
  function updateObject(id, patch, options = {}) {
    const obj = findObjectById(id)
    if (!obj) return

    if (options.history !== false) {
      recordHistory(options.label ?? 'object-update', {
        coalesceKey: options.coalesceKey ?? null,
      })
    }

    let changed = false
    /** @type {Record<string, import('@/utils/editorObjects').EditorObject[]>} */
    const next = {}

    for (const [pageKey, list] of Object.entries(objectsByPage.value)) {
      next[pageKey] = list.map((item) => {
        if (item.id !== id) return item
        changed = true
        return {
          ...item,
          ...patch,
          id: item.id,
          type: patch.type ?? item.type,
          page: patch.page ?? item.page,
          data: patch.data ? { ...item.data, ...patch.data } : { ...item.data },
        }
      })
    }

    if (changed) {
      objectsByPage.value = next
    }
  }

  /**
   * @param {string} id
   * @param {Record<string, unknown>} dataPatch
   * @param {{ history?: boolean, coalesceKey?: string | null }} [options]
   */
  function updateObjectData(id, dataPatch, options = {}) {
    const obj = findObjectById(id)
    if (!obj) return

    const coalesceKey =
      options.coalesceKey ??
      (dataPatch.content !== undefined ? `text-content:${id}` : null)

    updateObject(
      id,
      { data: { ...obj.data, ...dataPatch } },
      {
        history: options.history,
        coalesceKey,
        label: dataPatch.content !== undefined ? 'object-update-text' : 'object-update',
      },
    )
  }

  function removeObject(id) {
    const target = findObjectById(id)
    if (!target) return

    // Keep blob URLs alive so undo can restore image/signature objects.
    // URLs are revoked on full reset / PDF clear.
    recordHistory('object-delete')

    /** @type {Record<string, import('@/utils/editorObjects').EditorObject[]>} */
    const next = {}
    for (const [pageKey, list] of Object.entries(objectsByPage.value)) {
      next[pageKey] = list.filter((obj) => obj.id !== id)
    }
    objectsByPage.value = next
    if (selectedObjectId.value === id) {
      selectedObjectId.value = null
    }
    if (editingObjectId.value === id) {
      editingObjectId.value = null
    }
  }

  function deleteSelectedObject() {
    if (!selectedObjectId.value || editingObjectId.value || editingPdfParagraphId.value) {
      return false
    }
    removeObject(selectedObjectId.value)
    return true
  }

  function resetObjects() {
    revokeAllManagedObjectUrls()
    objectsByPage.value = {}
    selectedObjectId.value = null
    editingObjectId.value = null
    imageError.value = null
    clearPdfTextCache()
    clearHistory()
  }

  async function clearPdf() {
    if (pdfDoc.value) {
      try {
        await pdfDoc.value.destroy()
      } catch {
        /* ignore */
      }
    }
    pdfDoc.value = null
    pdfFile.value = null
    totalPages.value = 0
    pdfPageCount.value = 0
    currentPage.value = 1
    pageSize.value = { width: 0, height: 0 }
    pageLayout.value = { order: [], rotations: {} }
    pdfError.value = null
    resetObjects()
    try {
      await clearPdfSession()
    } catch (error) {
      console.warn('Failed to clear PDF session', error)
    }
  }

  /**
   * @param {File} file
   * @param {{ persist?: boolean }} [options]
   */
  async function loadPdfFile(file, options = {}) {
    if (!file) return false
    const persist = options.persist !== false

    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

    if (!isPdf) {
      pdfError.value = 'Please select a PDF file.'
      return false
    }

    isLoadingPdf.value = true
    pdfError.value = null

    try {
      if (pdfDoc.value) {
        try {
          await pdfDoc.value.destroy()
        } catch {
          /* ignore */
        }
        pdfDoc.value = null
      }

      const doc = await loadPdfFromFile(file)
      pdfDoc.value = markRaw(doc)
      pdfFile.value = file
      pdfPageCount.value = doc.numPages
      pageLayout.value = {
        order: createDefaultPageOrder(doc.numPages),
        rotations: {},
      }
      syncVisiblePageCount()
      currentPage.value = 1
      zoom.value = 100
      pageSize.value = { width: 0, height: 0 }
      resetObjects()

      if (persist) {
        try {
          await savePdfSession(file)
        } catch (error) {
          console.warn('Failed to persist PDF session', error)
        }
      }

      return true
    } catch (error) {
      console.error('Failed to load PDF', error)
      pdfError.value = 'Failed to load PDF. Please try another file.'
      pdfFile.value = null
      pdfDoc.value = null
      totalPages.value = 0
      pdfPageCount.value = 0
      pageLayout.value = { order: [], rotations: {} }
      currentPage.value = 1
      pageSize.value = { width: 0, height: 0 }
      resetObjects()
      return false
    } finally {
      isLoadingPdf.value = false
    }
  }

  /**
   * Restore the last opened PDF after a page refresh.
   */
  async function restorePdfSession() {
    if (pdfDoc.value) return true

    try {
      const file = await loadPdfSession()
      if (!file) return false
      return loadPdfFile(file, { persist: false })
    } catch (error) {
      console.warn('Failed to restore PDF session', error)
      return false
    }
  }

  return {
    pdfFile,
    pdfDoc,
    currentPage,
    zoom,
    activeTool,
    selectedObject,
    selectedObjectId,
    editingObjectId,
    isEditingText,
    drawColor,
    drawStrokeWidth,
    drawMode,
    eraserWidth,
    shapeType,
    shapeStrokeColor,
    shapeFillColor,
    shapeStrokeWidth,
    shapeOpacity,
    objectsByPage,
    pdfTextByPage,
    pageLayout,
    pageOrder,
    visiblePageCount,
    currentDisplayIndex,
    pdfPageCount,
    currentPageObjects,
    currentPagePdfParagraphs,
    editingPdfParagraphId,
    pageSize,
    totalPages,
    isLoadingPdf,
    pdfError,
    isAddingImage,
    imageError,
    signatureDialogOpen,
    signatureReplaceId,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    setActiveTool,
    setDrawColor,
    setDrawStrokeWidth,
    setDrawMode,
    setEraserWidth,
    setShapeType,
    setShapeStrokeColor,
    setShapeFillColor,
    setShapeStrokeWidth,
    setShapeOpacity,
    setCurrentPage,
    setPageSize,
    zoomIn,
    zoomOut,
    resetZoom,
    selectObject,
    clearSelection,
    startEditing,
    stopEditing,
    addObject,
    addTextAtPoint,
    ensurePdfTextForPage,
    setEditingPdfParagraph,
    updatePdfParagraphContent,
    addDrawingStroke,
    eraseDrawingsAlongPath,
    addShapeFromDrag,
    pickAndAddImage,
    addImageFromFile,
    replaceImageFromFile,
    openSignatureDialog,
    closeSignatureDialog,
    addSignatureAsset,
    updateObject,
    updateObjectData,
    removeObject,
    deleteSelectedObject,
    resetObjects,
    getObjectsSnapshot,
    replaceObjects,
    recordHistory,
    undo,
    redo,
    clearHistory,
    updatePageLayout,
    getPageRotation,
    reorderPages,
    deletePage,
    rotatePage,
    getHistorySnapshot,
    restoreHistorySnapshot,
    loadPdfFile,
    restorePdfSession,
    clearPdf,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useEditorStore, import.meta.hot))
}
