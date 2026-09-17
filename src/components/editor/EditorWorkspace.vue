<template>
  <main ref="workspaceRef" class="editor-workspace">
    <div v-if="isLoadingPdf" class="editor-workspace__status">
      <q-spinner color="primary" size="40px" />
      <p>Loading PDF…</p>
    </div>

    <div v-else-if="pdfError" class="editor-workspace__status">
      <q-icon name="error_outline" size="40px" color="negative" />
      <p>{{ pdfError }}</p>
    </div>

    <div
      v-else-if="pdfDoc"
      class="editor-workspace__fit"
      :style="fitShellStyle"
    >
      <div class="editor-workspace__stage" :style="stageStyle">
        <div
          class="editor-workspace__page editor-workspace__page--live"
          :style="pageBoxStyle"
        >
          <canvas ref="canvasRef" class="editor-workspace__canvas-el" />

          <EditorOverlay
            v-if="pageSize.width > 0 && pageSize.height > 0"
            :objects="currentPageObjects"
            :pdf-paragraphs="currentPagePdfParagraphs"
            :page-width="pageSize.width"
            :page-height="pageSize.height"
          />

          <div v-if="rendering" class="editor-workspace__page-loading">
            <q-spinner color="primary" size="28px" />
          </div>
        </div>
      </div>
    </div>

    <div v-else class="editor-workspace__stage editor-workspace__stage--placeholder">
      <div class="editor-workspace__page">
        <div class="editor-workspace__placeholder">
          <q-icon name="description" size="48px" color="grey-5" />
          <p class="editor-workspace__placeholder-title">PDFix</p>
          <p class="editor-workspace__placeholder-text">Open a PDF file to start editing</p>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import EditorOverlay from '@/components/editor/EditorOverlay.vue'
import { useEditorStore } from '@/stores/editor'
import { isAbortError, renderPdfPage, VIEWER_BASE_WIDTH } from '@/utils/pdf'

const editorStore = useEditorStore()
const {
  zoom,
  pdfDoc,
  currentPage,
  isLoadingPdf,
  pdfError,
  pageSize,
  currentPageObjects,
  currentPagePdfParagraphs,
  pageLayout,
} = storeToRefs(editorStore)

const workspaceRef = ref(null)
const canvasRef = ref(null)
const rendering = ref(false)
const containerWidth = ref(0)
let abortController = null
/** @type {ResizeObserver | null} */
let resizeObserver = null

const WORKSPACE_PAD = 24

const pageBoxStyle = computed(() => {
  if (!pageSize.value.width || !pageSize.value.height) {
    return undefined
  }
  return {
    width: `${pageSize.value.width}px`,
    height: `${pageSize.value.height}px`,
  }
})

/** Scale page down to fit the workspace width; user zoom stacks on top. */
const fitScale = computed(() => {
  const pageW = pageSize.value.width
  if (!pageW || !containerWidth.value) return 1
  const available = Math.max(120, containerWidth.value - WORKSPACE_PAD)
  return Math.min(1, available / pageW)
})

const displayScale = computed(() => fitScale.value * (zoom.value / 100))

const fitShellStyle = computed(() => {
  const w = pageSize.value.width
  const h = pageSize.value.height
  if (!w || !h) return undefined
  const s = displayScale.value
  return {
    width: `${w * s}px`,
    height: `${h * s}px`,
  }
})

const stageStyle = computed(() => {
  const w = pageSize.value.width
  const h = pageSize.value.height
  if (!w || !h) return { transform: `scale(${displayScale.value})` }
  return {
    width: `${w}px`,
    height: `${h}px`,
    transform: `scale(${displayScale.value})`,
    transformOrigin: 'top left',
  }
})

const currentPageRotation = computed(() => editorStore.getPageRotation(currentPage.value))

function measureContainer() {
  const el = workspaceRef.value
  if (!el) return
  containerWidth.value = el.clientWidth
}

async function renderCurrentPage() {
  if (!pdfDoc.value || !canvasRef.value || !currentPage.value) return

  abortController?.abort()
  abortController = new AbortController()
  const { signal } = abortController

  rendering.value = true

  try {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    const size = await renderPdfPage(pdfDoc.value, currentPage.value, canvasRef.value, {
      maxWidth: VIEWER_BASE_WIDTH,
      pixelRatio,
      rotation: currentPageRotation.value,
      signal,
    })

    if (!signal.aborted && size) {
      editorStore.setPageSize(size.width, size.height)
      void editorStore.ensurePdfTextForPage(currentPage.value, size.width)
    }
  } catch (error) {
    if (!isAbortError(error)) {
      console.error('Viewer render failed', error)
    }
  } finally {
    if (!signal.aborted) {
      rendering.value = false
    }
  }
}

watch(
  [pdfDoc, currentPage, currentPageRotation, () => pageLayout.value.order.join(',')],
  async () => {
    await nextTick()
    measureContainer()
    await renderCurrentPage()
  },
  { immediate: true },
)

onMounted(() => {
  measureContainer()
  if (typeof ResizeObserver !== 'undefined' && workspaceRef.value) {
    resizeObserver = new ResizeObserver(() => {
      measureContainer()
    })
    resizeObserver.observe(workspaceRef.value)
  }
  window.addEventListener('resize', measureContainer)
})

onBeforeUnmount(() => {
  abortController?.abort()
  resizeObserver?.disconnect()
  window.removeEventListener('resize', measureContainer)
})
</script>

<style lang="scss" scoped>
.editor-workspace {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  background: var(--pe-workspace-bg);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 24px;
  -webkit-overflow-scrolling: touch;

  &__status {
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    color: var(--pe-text-muted);
    font-size: 14px;
    padding: 16px;
    text-align: center;

    p {
      margin: 0;
      max-width: 28ch;
      word-break: break-word;
    }
  }

  &__fit {
    flex-shrink: 0;
    position: relative;
  }

  &__stage {
    transform-origin: top left;

    &--placeholder {
      transform: none;
      width: 100%;
      max-width: 420px;
    }
  }

  &__page {
    width: min(100%, 620px);
    aspect-ratio: 210 / 297;
    background: var(--pe-surface);
    border-radius: 2px;
    box-shadow: var(--pe-shadow);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;

    &--live {
      width: auto;
      aspect-ratio: auto;
      min-width: 200px;
      overflow: visible;
      align-items: stretch;
      justify-content: flex-start;
    }
  }

  &__canvas-el {
    position: absolute;
    inset: 0;
    display: block;
    width: 100% !important;
    height: 100% !important;
  }

  &__page-loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.45);
    z-index: 3;
    pointer-events: none;
  }

  &__placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 24px;
    gap: 4px;
  }

  &__placeholder-title {
    margin: 12px 0 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--pe-text);
  }

  &__placeholder-text {
    margin: 0;
    font-size: 13px;
    color: var(--pe-text-muted);
  }
}

@media (max-width: 1023px) {
  .editor-workspace {
    padding: 16px 12px;
  }
}

@media (max-width: 599px) {
  .editor-workspace {
    padding: 10px 8px;
  }

  .editor-workspace__page:not(.editor-workspace__page--live) {
    width: 100%;
    max-width: none;
  }
}
</style>
