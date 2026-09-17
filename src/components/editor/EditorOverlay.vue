<template>
  <div
    ref="overlayRef"
    class="editor-overlay"
    :class="{
      'editor-overlay--select': isSelectTool,
      'editor-overlay--text': isTextTool,
      'editor-overlay--draw': isDrawTool,
      'editor-overlay--shape': isShapeTool,
    }"
    :style="overlayStyle"
    @pointerdown="onOverlayPointerDown"
  >
    <PdfDocumentTextLayer
      v-if="showPdfDocText"
      :blocks="pdfParagraphs"
      :interactive="isSelectTool || isTextTool"
      :editing-id="editingPdfParagraphId"
      @focus-block="onPdfParagraphFocus"
      @blur-block="onPdfParagraphBlur"
      @update-content="onPdfParagraphUpdate"
    />

    <EditorObjectNode
      v-for="object in objects"
      :key="object.id"
      :object="object"
      :selected="object.id === selectedObjectId"
      :selectable="isSelectTool"
      :text-tool-active="isTextTool"
      @select="onSelect"
      @move-start="onMoveStart"
      @resize-start="onResizeStart"
      @rotate-start="onRotateStart"
    />

    <DrawingStrokeLayer
      v-if="isDrawTool"
      :page-width="pageWidth"
      :page-height="pageHeight"
      :coordinate-el="overlayRef"
    />

    <ShapeCreateLayer
      v-if="isShapeTool"
      :page-width="pageWidth"
      :page-height="pageHeight"
      :coordinate-el="overlayRef"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { storeToRefs } from 'pinia'
import DrawingStrokeLayer from '@/components/editor/DrawingStrokeLayer.vue'
import EditorObjectNode from '@/components/editor/EditorObjectNode.vue'
import PdfDocumentTextLayer from '@/components/editor/PdfDocumentTextLayer.vue'
import ShapeCreateLayer from '@/components/editor/ShapeCreateLayer.vue'
import { useEditorStore } from '@/stores/editor'
import {
  angleFromObjectCenter,
  clientToPagePoint,
  moveObjectByDelta,
  resizeObjectFromHandle,
} from '@/utils/editorObjects'

const props = defineProps({
  objects: {
    type: Array,
    default: () => [],
  },
  pageWidth: {
    type: Number,
    required: true,
  },
  pageHeight: {
    type: Number,
    required: true,
  },
  pdfParagraphs: {
    type: Array,
    default: () => [],
  },
})

const editorStore = useEditorStore()
const { activeTool, selectedObjectId, editingPdfParagraphId } = storeToRefs(editorStore)

const overlayRef = ref(null)

const isSelectTool = computed(() => activeTool.value === 'select')
const isTextTool = computed(() => activeTool.value === 'text')
const isDrawTool = computed(() => activeTool.value === 'draw')
const isShapeTool = computed(() => activeTool.value === 'shape')
const showPdfDocText = computed(() => props.pdfParagraphs.length > 0)

function onPdfParagraphFocus(id) {
  editorStore.setEditingPdfParagraph(id)
}

function onPdfParagraphBlur() {
  editorStore.setEditingPdfParagraph(null)
}

function onPdfParagraphUpdate({ id, content }) {
  editorStore.updatePdfParagraphContent(id, content)
}

const overlayStyle = computed(() => ({
  width: `${props.pageWidth}px`,
  height: `${props.pageHeight}px`,
}))

const pageSize = computed(() => ({
  width: props.pageWidth,
  height: props.pageHeight,
}))

/** @type {{ mode: 'move' | 'resize' | 'rotate', pointerId: number, objectId: string, handle?: string, startPoint: {x:number,y:number}, origin: object, startAngle?: number } | null} */
let dragState = null

function onSelect(id) {
  editorStore.selectObject(id)
}

function onOverlayPointerDown(event) {
  if (event.button != null && event.button !== 0) return
  if (event.target !== overlayRef.value) return

  if (isSelectTool.value) {
    editorStore.clearSelection()
    return
  }

  if (isTextTool.value) {
    event.preventDefault()
    const point = clientToPagePoint(event, overlayRef.value, pageSize.value)
    editorStore.addTextAtPoint(point)
  }
}

function beginDrag(mode, event, object, handle) {
  if (!overlayRef.value || !isSelectTool.value) return

  event.preventDefault()
  event.stopPropagation()

  const label =
    mode === 'move' ? 'object-move' : mode === 'resize' ? 'object-resize' : 'object-rotate'
  editorStore.recordHistory(label)

  const startPoint = clientToPagePoint(event, overlayRef.value, pageSize.value)
  dragState = {
    mode,
    pointerId: event.pointerId,
    objectId: object.id,
    handle,
    startPoint,
    origin: {
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
      rotation: object.rotation ?? 0,
    },
    startAngle:
      mode === 'rotate' ? angleFromObjectCenter(object, startPoint) : undefined,
  }

  overlayRef.value.setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}

function onMoveStart({ event, object }) {
  beginDrag('move', event, object)
}

function onResizeStart({ event, object, handle }) {
  beginDrag('resize', event, object, handle)
}

function onRotateStart({ event, object }) {
  beginDrag('rotate', event, object)
}

function onPointerMove(event) {
  if (!dragState || !overlayRef.value) return
  if (event.pointerId !== dragState.pointerId) return

  const point = clientToPagePoint(event, overlayRef.value, pageSize.value)

  if (dragState.mode === 'move') {
    const delta = {
      x: point.x - dragState.startPoint.x,
      y: point.y - dragState.startPoint.y,
    }
    const next = moveObjectByDelta(
      {
        ...dragState.origin,
        width: dragState.origin.width,
        height: dragState.origin.height,
      },
      delta,
      pageSize.value,
    )
    editorStore.updateObject(dragState.objectId, next, { history: false })
    return
  }

  if (dragState.mode === 'resize' && dragState.handle) {
    const next = resizeObjectFromHandle(
      {
        x: dragState.origin.x,
        y: dragState.origin.y,
        width: dragState.origin.width,
        height: dragState.origin.height,
      },
      dragState.handle,
      point,
      pageSize.value,
    )
    editorStore.updateObject(dragState.objectId, next, { history: false })
    return
  }

  if (dragState.mode === 'rotate') {
    const angle = angleFromObjectCenter(dragState.origin, point)
    const delta = angle - (dragState.startAngle ?? 0)
    editorStore.updateObject(
      dragState.objectId,
      {
        rotation: dragState.origin.rotation + delta,
      },
      { history: false },
    )
  }
}

function onPointerUp(event) {
  if (!dragState) return
  if (event.pointerId !== dragState.pointerId) return
  endDrag()
}

function endDrag() {
  if (overlayRef.value && dragState) {
    try {
      overlayRef.value.releasePointerCapture?.(dragState.pointerId)
    } catch {
      /* ignore */
    }
  }
  dragState = null
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
}

onBeforeUnmount(() => {
  endDrag()
})
</script>

<style lang="scss" scoped>
.editor-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;

  &--select,
  &--text,
  &--draw,
  &--shape {
    pointer-events: auto;
    cursor: default;

    :deep(.editor-object) {
      pointer-events: auto;
    }
  }

  &--text {
    cursor: text;
  }

  &--draw,
  &--shape {
    cursor: crosshair;

    :deep(.editor-object) {
      pointer-events: none;
    }
  }
}
</style>
