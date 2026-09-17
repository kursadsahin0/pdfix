<template>
  <svg
    ref="svgRef"
    class="shape-create-layer"
    :width="pageWidth"
    :height="pageHeight"
    @pointerdown="onPointerDown"
  >
    <g ref="previewRef" class="shape-create-layer__preview" />
  </svg>
</template>

<script setup>
/**
 * Imperative drag-to-create preview — avoids Vue re-renders while dragging.
 */
import { onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/stores/editor'
import {
  clientToPagePoint,
  rectFromDragPoints,
} from '@/utils/editorObjects'

const props = defineProps({
  pageWidth: { type: Number, required: true },
  pageHeight: { type: Number, required: true },
  coordinateEl: { type: Object, default: null },
})

const editorStore = useEditorStore()
const {
  shapeType,
  shapeStrokeColor,
  shapeFillColor,
  shapeStrokeWidth,
  shapeOpacity,
} = storeToRefs(editorStore)

const svgRef = ref(null)
const previewRef = ref(null)

let drawing = false
let activePointerId = null
/** @type {{ x: number, y: number } | null} */
let startPoint = null

function pageSize() {
  return { width: props.pageWidth, height: props.pageHeight }
}

function eventPoint(event) {
  const el = props.coordinateEl || svgRef.value
  if (!el) return { x: 0, y: 0 }
  return clientToPagePoint(event, el, pageSize())
}

function clearPreview() {
  const g = previewRef.value
  if (g) g.innerHTML = ''
}

function paintPreview(start, end) {
  const g = previewRef.value
  if (!g) return
  g.innerHTML = ''

  const type = shapeType.value
  const stroke = shapeStrokeColor.value
  const fill = type === 'line' || type === 'arrow' ? 'none' : shapeFillColor.value
  const sw = shapeStrokeWidth.value
  const opacity = shapeOpacity.value
  const { x, y, width, height } = rectFromDragPoints(start, end)

  const ns = 'http://www.w3.org/2000/svg'

  if (type === 'rectangle') {
    const el = document.createElementNS(ns, 'rect')
    el.setAttribute('x', String(x))
    el.setAttribute('y', String(y))
    el.setAttribute('width', String(Math.max(width, 1)))
    el.setAttribute('height', String(Math.max(height, 1)))
    el.setAttribute('fill', fill)
    el.setAttribute('stroke', stroke)
    el.setAttribute('stroke-width', String(sw))
    el.setAttribute('opacity', String(opacity))
    g.appendChild(el)
    return
  }

  if (type === 'circle') {
    const el = document.createElementNS(ns, 'ellipse')
    el.setAttribute('cx', String(x + width / 2))
    el.setAttribute('cy', String(y + height / 2))
    el.setAttribute('rx', String(Math.max(width / 2, 0.5)))
    el.setAttribute('ry', String(Math.max(height / 2, 0.5)))
    el.setAttribute('fill', fill)
    el.setAttribute('stroke', stroke)
    el.setAttribute('stroke-width', String(sw))
    el.setAttribute('opacity', String(opacity))
    g.appendChild(el)
    return
  }

  // line / arrow
  const line = document.createElementNS(ns, 'line')
  line.setAttribute('x1', String(start.x))
  line.setAttribute('y1', String(start.y))
  line.setAttribute('x2', String(end.x))
  line.setAttribute('y2', String(end.y))
  line.setAttribute('stroke', stroke)
  line.setAttribute('stroke-width', String(sw))
  line.setAttribute('stroke-linecap', 'round')
  line.setAttribute('opacity', String(opacity))
  g.appendChild(line)

  if (type === 'arrow') {
    const angle = Math.atan2(end.y - start.y, end.x - start.x)
    const head = Math.max(10, sw * 3)
    const a1 = angle + Math.PI * 0.85
    const a2 = angle - Math.PI * 0.85
    const path = document.createElementNS(ns, 'path')
    const p1 = `${end.x},${end.y}`
    const p2 = `${end.x + Math.cos(a1) * head},${end.y + Math.sin(a1) * head}`
    const p3 = `${end.x + Math.cos(a2) * head},${end.y + Math.sin(a2) * head}`
    path.setAttribute('d', `M ${p2} L ${p1} L ${p3}`)
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', stroke)
    path.setAttribute('stroke-width', String(sw))
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('stroke-linejoin', 'round')
    path.setAttribute('opacity', String(opacity))
    g.appendChild(path)
  }
}

function onPointerDown(event) {
  if (event.button != null && event.button !== 0) return
  if (!svgRef.value) return

  event.preventDefault()
  event.stopPropagation()

  drawing = true
  activePointerId = event.pointerId
  startPoint = eventPoint(event)
  paintPreview(startPoint, startPoint)

  svgRef.value.setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}

function onPointerMove(event) {
  if (!drawing || event.pointerId !== activePointerId || !startPoint) return
  paintPreview(startPoint, eventPoint(event))
}

function onPointerUp(event) {
  if (!drawing || event.pointerId !== activePointerId) return

  const end = eventPoint(event)
  const start = startPoint
  const pointerId = activePointerId

  drawing = false
  activePointerId = null
  startPoint = null

  if (svgRef.value && pointerId != null) {
    try {
      svgRef.value.releasePointerCapture?.(pointerId)
    } catch {
      /* ignore */
    }
  }

  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)

  clearPreview()
  if (!start) return
  editorStore.addShapeFromDrag({ start, end })
}

watch(
  () => [props.pageWidth, props.pageHeight],
  () => clearPreview(),
)

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
.shape-create-layer {
  position: absolute;
  inset: 0;
  z-index: 5;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: crosshair;
  pointer-events: auto;
  overflow: visible;
}
</style>
