<template>
  <div
    class="page-thumbnail"
    :class="{
      'page-thumbnail--active': active,
      'page-thumbnail--dragging': dragging,
      'page-thumbnail--drag-over': dragOver,
    }"
    draggable="true"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <button
      type="button"
      class="page-thumbnail__hit"
      :aria-label="`Page ${displayIndex}`"
      :aria-current="active ? 'page' : undefined"
      @click="$emit('select', sourcePage)"
    >
      <div ref="thumbRef" class="page-thumbnail__frame">
        <canvas v-show="ready" ref="canvasRef" class="page-thumbnail__canvas" />
        <div v-if="!ready" class="page-thumbnail__placeholder">
          <q-spinner v-if="loading" color="primary" size="20px" />
          <span v-else class="page-thumbnail__fallback">{{ displayIndex }}</span>
        </div>
      </div>
      <span class="page-thumbnail__label">Page {{ displayIndex }}</span>
    </button>

    <div class="page-thumbnail__actions">
      <q-btn
        flat
        dense
        round
        size="sm"
        icon="drag_indicator"
        class="page-thumbnail__action page-thumbnail__action--drag"
        aria-label="Reorder page"
        tabindex="-1"
      />
      <q-btn
        flat
        dense
        round
        size="sm"
        icon="rotate_right"
        class="page-thumbnail__action"
        aria-label="Rotate page 90 degrees"
        @click.stop="$emit('rotate', sourcePage)"
      />
      <q-btn
        flat
        dense
        round
        size="sm"
        icon="delete_outline"
        class="page-thumbnail__action"
        color="negative"
        aria-label="Delete page"
        :disable="!canDelete"
        @click.stop="$emit('delete', sourcePage)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/stores/editor'
import { isAbortError, renderPdfPage, THUMBNAIL_MAX_WIDTH } from '@/utils/pdf'

const props = defineProps({
  sourcePage: {
    type: Number,
    required: true,
  },
  displayIndex: {
    type: Number,
    required: true,
  },
  active: {
    type: Boolean,
    default: false,
  },
  rotation: {
    type: Number,
    default: 0,
  },
  canDelete: {
    type: Boolean,
    default: true,
  },
  dragging: {
    type: Boolean,
    default: false,
  },
  dragOver: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['select', 'rotate', 'delete', 'drag-start', 'drag-over', 'drop', 'drag-end'])

const editorStore = useEditorStore()
const { pdfDoc } = storeToRefs(editorStore)

const thumbRef = ref(null)
const canvasRef = ref(null)
const ready = ref(false)
const loading = ref(false)

const frameAspect = computed(() => {
  const rot = ((Number(props.rotation) % 360) + 360) % 360
  return rot === 90 || rot === 270 ? '297 / 210' : '210 / 297'
})

let observer = null
let abortController = null
let isVisible = false

async function renderThumbnail() {
  if (!pdfDoc.value || !canvasRef.value || !isVisible) return

  abortController?.abort()
  abortController = new AbortController()
  const { signal } = abortController

  loading.value = true
  ready.value = false

  try {
    await renderPdfPage(pdfDoc.value, props.sourcePage, canvasRef.value, {
      maxWidth: THUMBNAIL_MAX_WIDTH,
      pixelRatio: 1,
      rotation: props.rotation,
      signal,
    })
    if (!signal.aborted) {
      ready.value = true
    }
  } catch (error) {
    if (!isAbortError(error)) {
      console.error(`Thumbnail render failed (page ${props.sourcePage})`, error)
    }
  } finally {
    if (!signal.aborted) {
      loading.value = false
    }
  }
}

function setupObserver() {
  observer?.disconnect()
  if (!thumbRef.value) return

  let root = thumbRef.value.parentElement
  while (root) {
    const style = getComputedStyle(root)
    if (/(auto|scroll)/.test(style.overflowY)) break
    root = root.parentElement
  }

  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      isVisible = Boolean(entry?.isIntersecting)
      if (isVisible) {
        renderThumbnail()
      } else {
        abortController?.abort()
      }
    },
    {
      root: root || null,
      rootMargin: '80px 0px',
      threshold: 0.01,
    },
  )

  observer.observe(thumbRef.value)
}

function onDragStart(event) {
  // Don't start a reorder when interacting with rotate/delete
  const action = event.target?.closest?.('.page-thumbnail__action')
  if (action && !action.classList.contains('page-thumbnail__action--drag')) {
    event.preventDefault()
    return
  }

  event.dataTransfer?.setData('text/plain', String(props.displayIndex - 1))
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
  emit('drag-start', props.displayIndex - 1)
}

function onDragEnd() {
  emit('drag-end')
}

function onDragOver(event) {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  emit('drag-over', props.displayIndex - 1)
}

function onDragLeave() {
  /* parent clears via drag-over of other items */
}

function onDrop() {
  emit('drop', props.displayIndex - 1)
}

onMounted(async () => {
  await nextTick()
  setupObserver()
})

watch(
  () => [pdfDoc.value, props.sourcePage, props.rotation],
  async () => {
    ready.value = false
    await nextTick()
    if (isVisible) {
      renderThumbnail()
    }
  },
)

onBeforeUnmount(() => {
  observer?.disconnect()
  abortController?.abort()
})
</script>

<style lang="scss" scoped>
.page-thumbnail {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  padding: 8px;
  border: 2px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--pe-text-muted);
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    color 0.15s ease,
    opacity 0.15s ease;

  &:hover {
    background: var(--pe-bg);

    .page-thumbnail__actions {
      opacity: 1;
    }
  }

  &--active {
    border-color: var(--pe-accent);
    color: var(--pe-text);
    background: var(--pe-accent-soft);
  }

  &--dragging {
    opacity: 0.45;
  }

  &--drag-over {
    border-color: var(--pe-accent);
    box-shadow: inset 0 0 0 1px var(--pe-accent);
  }

  &__hit {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 100%;
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  &__frame {
    width: 100%;
    aspect-ratio: v-bind(frameAspect);
    max-height: 120px;
    background: var(--pe-workspace-bg);
    border-radius: 4px;
    border: 1px solid var(--pe-border);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
  }

  &__canvas {
    display: block;
    max-width: 100%;
    max-height: 100%;
    width: auto !important;
    height: auto !important;
    object-fit: contain;
  }

  &__placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__fallback {
    font-size: 18px;
    font-weight: 600;
    color: var(--pe-text-muted);
  }

  &__label {
    font-size: 12px;
    font-weight: 500;
  }

  &__actions {
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.15s ease;
    background: rgba(255, 255, 255, 0.92);
    border-radius: 8px;
    border: 1px solid var(--pe-border);
    padding: 2px;
  }

  &__action {
    color: var(--pe-text-muted);

    &--drag {
      cursor: grab;
    }
  }
}
</style>
