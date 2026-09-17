<template>
  <canvas
    ref="canvasRef"
    class="drawing-stroke-layer"
    :class="{ 'drawing-stroke-layer--eraser': isEraser }"
    @pointerdown="onPointerDown"
  />
</template>

<script setup>
/**
 * Imperative stroke canvas — points live in plain JS arrays,
 * so Vue does not re-render on every pointermove.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/stores/editor'
import {
  clientToPagePoint,
  DRAW_POINT_MIN_DISTANCE,
} from '@/utils/editorObjects'

const props = defineProps({
  pageWidth: {
    type: Number,
    required: true,
  },
  pageHeight: {
    type: Number,
    required: true,
  },
  /** Overlay root used for coordinate mapping (includes zoom transform) */
  coordinateEl: {
    type: Object,
    default: null,
  },
})

const editorStore = useEditorStore()
const { drawColor, drawStrokeWidth, drawMode, eraserWidth } = storeToRefs(editorStore)

const canvasRef = ref(null)
const isEraser = computed(() => drawMode.value === 'eraser')

/** @type {CanvasRenderingContext2D | null} */
let ctx = null
/** @type {{ x: number, y: number }[]} */
let strokePoints = []
let drawing = false
let activePointerId = null

function pageSize() {
  return { width: props.pageWidth, height: props.pageHeight }
}

function activeWidth() {
  return isEraser.value ? eraserWidth.value : drawStrokeWidth.value
}

function syncCanvasSize() {
  const canvas = canvasRef.value
  if (!canvas || !props.pageWidth || !props.pageHeight) return

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.max(1, Math.floor(props.pageWidth * dpr))
  canvas.height = Math.max(1, Math.floor(props.pageHeight * dpr))
  canvas.style.width = `${props.pageWidth}px`
  canvas.style.height = `${props.pageHeight}px`

  ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  clearCanvas()
}

function clearCanvas() {
  if (!ctx) return
  ctx.clearRect(0, 0, props.pageWidth, props.pageHeight)
}

function distance(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

function eventPoint(event) {
  const el = props.coordinateEl || canvasRef.value
  if (!el) return { x: 0, y: 0 }
  return clientToPagePoint(event, el, pageSize())
}

function paintSegment(from, to) {
  if (!ctx) return
  ctx.strokeStyle = isEraser.value ? 'rgba(148, 163, 184, 0.55)' : drawColor.value
  ctx.lineWidth = activeWidth()
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
}

function paintDot(point) {
  if (!ctx) return
  ctx.fillStyle = isEraser.value ? 'rgba(148, 163, 184, 0.55)' : drawColor.value
  ctx.beginPath()
  ctx.arc(point.x, point.y, activeWidth() / 2, 0, Math.PI * 2)
  ctx.fill()
}

function onPointerDown(event) {
  if (event.button != null && event.button !== 0) return
  if (!canvasRef.value) return

  event.preventDefault()
  event.stopPropagation()

  drawing = true
  activePointerId = event.pointerId
  strokePoints = []

  const point = eventPoint(event)
  strokePoints.push(point)
  paintDot(point)

  canvasRef.value.setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}

function onPointerMove(event) {
  if (!drawing || event.pointerId !== activePointerId) return

  const point = eventPoint(event)
  const last = strokePoints[strokePoints.length - 1]
  if (last && distance(last, point) < DRAW_POINT_MIN_DISTANCE) return

  strokePoints.push(point)
  if (last) paintSegment(last, point)
}

function onPointerUp(event) {
  if (!drawing || event.pointerId !== activePointerId) return
  finishStroke()
}

function finishStroke() {
  const points = strokePoints.slice()
  const erasing = isEraser.value
  const color = drawColor.value
  const strokeWidth = drawStrokeWidth.value
  const radius = eraserWidth.value / 2
  const pointerId = activePointerId

  drawing = false
  activePointerId = null
  strokePoints = []

  if (canvasRef.value && pointerId != null) {
    try {
      canvasRef.value.releasePointerCapture?.(pointerId)
    } catch {
      /* ignore */
    }
  }

  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)

  clearCanvas()

  if (points.length === 0) return

  if (erasing) {
    editorStore.eraseDrawingsAlongPath({ points, radius })
    return
  }

  editorStore.addDrawingStroke({ points, color, strokeWidth })
}

watch(
  () => [props.pageWidth, props.pageHeight],
  () => syncCanvasSize(),
)

onMounted(() => {
  syncCanvasSize()
})

onBeforeUnmount(() => {
  if (drawing) {
    drawing = false
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
  }
})
</script>

<style lang="scss" scoped>
.drawing-stroke-layer {
  position: absolute;
  inset: 0;
  z-index: 5;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: crosshair;
  pointer-events: auto;

  &--eraser {
    cursor: cell;
  }
}
</style>
