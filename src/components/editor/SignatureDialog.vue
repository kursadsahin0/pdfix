<template>
  <q-dialog
    :model-value="signatureDialogOpen"
    persistent
    @update:model-value="onDialogModel"
  >
    <q-card class="signature-dialog">
      <q-card-section class="signature-dialog__header">
        <div class="signature-dialog__title">Signature</div>
        <q-btn flat dense round icon="close" aria-label="Close" @click="close" />
      </q-card-section>

      <q-card-section class="signature-dialog__body">
        <div class="signature-dialog__pad-wrap">
          <canvas
            ref="canvasRef"
            class="signature-dialog__canvas"
            @pointerdown="onPointerDown"
          />
          <p v-if="!hasInk" class="signature-dialog__hint">Draw your signature here</p>
        </div>
        <p v-if="localError" class="signature-dialog__error">{{ localError }}</p>
      </q-card-section>

      <q-card-actions class="signature-dialog__actions" align="between">
        <q-btn flat no-caps label="Clear" icon="delete_outline" @click="clearPad" />
        <q-btn
          unelevated
          no-caps
          color="primary"
          label="Add"
          icon="check"
          :disable="!hasInk"
          :loading="saving"
          @click="onAdd"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/stores/editor'
import { exportSignatureFromCanvas } from '@/utils/imageAsset'

const editorStore = useEditorStore()
const { signatureDialogOpen } = storeToRefs(editorStore)

const canvasRef = ref(null)
const hasInk = ref(false)
const saving = ref(false)
const localError = ref(null)

/** @type {CanvasRenderingContext2D | null} */
let ctx = null
let drawing = false
let activePointerId = null
/** @type {{ x: number, y: number } | null} */
let lastPoint = null

const PAD_CSS_WIDTH = 520
const PAD_CSS_HEIGHT = 220
const STROKE_WIDTH = 2.5

function onDialogModel(value) {
  if (!value) editorStore.closeSignatureDialog()
}

function close() {
  editorStore.closeSignatureDialog()
}

function setupCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.floor(PAD_CSS_WIDTH * dpr)
  canvas.height = Math.floor(PAD_CSS_HEIGHT * dpr)
  canvas.style.width = `${PAD_CSS_WIDTH}px`
  canvas.style.height = `${PAD_CSS_HEIGHT}px`

  ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#111827'
  ctx.fillStyle = '#111827'
  ctx.lineWidth = STROKE_WIDTH
  clearPad()
}

function clearPad() {
  if (!ctx || !canvasRef.value) return
  ctx.clearRect(0, 0, PAD_CSS_WIDTH, PAD_CSS_HEIGHT)
  hasInk.value = false
  localError.value = null
}

function eventPoint(event) {
  const canvas = canvasRef.value
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * PAD_CSS_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * PAD_CSS_HEIGHT,
  }
}

function onPointerDown(event) {
  if (event.button != null && event.button !== 0) return
  if (!canvasRef.value || !ctx) return

  event.preventDefault()
  drawing = true
  activePointerId = event.pointerId
  lastPoint = eventPoint(event)
  hasInk.value = true
  localError.value = null

  ctx.beginPath()
  ctx.arc(lastPoint.x, lastPoint.y, STROKE_WIDTH / 2, 0, Math.PI * 2)
  ctx.fill()

  canvasRef.value.setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}

function onPointerMove(event) {
  if (!drawing || event.pointerId !== activePointerId || !ctx || !lastPoint) return
  const point = eventPoint(event)
  ctx.beginPath()
  ctx.moveTo(lastPoint.x, lastPoint.y)
  ctx.lineTo(point.x, point.y)
  ctx.stroke()
  lastPoint = point
}

function onPointerUp(event) {
  if (!drawing || event.pointerId !== activePointerId) return
  drawing = false
  const pointerId = activePointerId
  activePointerId = null
  lastPoint = null

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
}

async function onAdd() {
  if (!canvasRef.value || !hasInk.value || saving.value) return
  saving.value = true
  localError.value = null

  try {
    const asset = await exportSignatureFromCanvas(canvasRef.value)
    const ok = await editorStore.addSignatureAsset(asset)
    if (!ok) {
      localError.value = 'Could not add signature. Open a PDF first.'
    }
  } catch (error) {
    localError.value = error?.message || 'Failed to export signature.'
  } finally {
    saving.value = false
  }
}

watch(
  signatureDialogOpen,
  async (open) => {
    if (!open) {
      drawing = false
      return
    }
    localError.value = null
    await nextTick()
    setupCanvas()
  },
)
</script>

<style lang="scss" scoped>
.signature-dialog {
  width: min(560px, calc(100vw - 24px));
  max-width: 100%;
  border-radius: 14px;
  overflow: hidden;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 8px;
  }

  &__title {
    font-size: 17px;
    font-weight: 650;
    letter-spacing: -0.02em;
  }

  &__body {
    padding: 8px 16px 4px;
  }

  &__pad-wrap {
    position: relative;
    border: 1px dashed var(--pe-border);
    border-radius: 12px;
    background:
      linear-gradient(180deg, #fafbfc 0%, #f4f6f8 100%);
    overflow: hidden;
  }

  &__canvas {
    display: block;
    width: 100%;
    max-width: 520px;
    height: auto;
    aspect-ratio: 520 / 220;
    touch-action: none;
    cursor: crosshair;
    background: transparent;
  }

  &__hint {
    position: absolute;
    inset: 0;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    color: var(--pe-text-muted);
    font-size: 14px;
    font-weight: 500;
  }

  &__error {
    margin: 10px 0 0;
    font-size: 12px;
    color: #c62828;
  }

  &__actions {
    padding: 12px 16px 16px;
  }
}
</style>
