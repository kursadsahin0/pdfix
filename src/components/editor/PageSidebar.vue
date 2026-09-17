<template>
  <aside class="page-sidebar">
    <div class="page-sidebar__header">
      <span class="page-sidebar__label">Pages</span>
      <span v-if="visiblePageCount > 0" class="page-sidebar__count">{{ visiblePageCount }}</span>
    </div>

    <div v-if="!pdfDoc" class="page-sidebar__empty">
      <q-icon name="description" size="28px" color="grey-5" />
      <p>Open a PDF to see pages</p>
    </div>

    <div v-else ref="listRef" class="page-sidebar__list">
      <PageThumbnail
        v-for="(sourcePage, index) in pageOrder"
        :key="`${pdfKey}-${sourcePage}`"
        :ref="(el) => setThumbRef(sourcePage, el)"
        :source-page="sourcePage"
        :display-index="index + 1"
        :active="currentPage === sourcePage"
        :rotation="editorStore.getPageRotation(sourcePage)"
        :can-delete="visiblePageCount > 1"
        :dragging="dragFromIndex === index"
        :drag-over="dragOverIndex === index && dragFromIndex !== index"
        @select="onSelectPage"
        @rotate="onRotatePage"
        @delete="onDeletePage"
        @drag-start="onDragStart"
        @drag-over="onDragOver"
        @drop="onDrop"
        @drag-end="onDragEnd"
      />
    </div>
  </aside>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import PageThumbnail from '@/components/pdf/PageThumbnail.vue'
import { useEditorStore } from '@/stores/editor'

const emit = defineEmits(['page-selected'])

const editorStore = useEditorStore()
const { currentPage, visiblePageCount, pageOrder, pdfDoc, pdfFile } = storeToRefs(editorStore)

const listRef = ref(null)
const thumbRefs = new Map()
const dragFromIndex = ref(-1)
const dragOverIndex = ref(-1)

const pdfKey = computed(() => pdfFile.value?.name ?? 'pdf')

function setThumbRef(page, el) {
  if (el) {
    thumbRefs.set(page, el)
  } else {
    thumbRefs.delete(page)
  }
}

function onSelectPage(page) {
  editorStore.setCurrentPage(page)
  emit('page-selected')
}

function onRotatePage(page) {
  void editorStore.rotatePage(page)
}

function onDeletePage(page) {
  editorStore.deletePage(page)
}

function onDragStart(index) {
  dragFromIndex.value = index
  dragOverIndex.value = index
}

function onDragOver(index) {
  if (dragFromIndex.value < 0) return
  dragOverIndex.value = index
}

function onDrop(toIndex) {
  const fromIndex = dragFromIndex.value
  if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
    editorStore.reorderPages(fromIndex, toIndex)
  }
  onDragEnd()
}

function onDragEnd() {
  dragFromIndex.value = -1
  dragOverIndex.value = -1
}

watch(currentPage, async (page) => {
  await nextTick()
  const entry = thumbRefs.get(page)
  const rootEl = entry?.$el ?? entry
  rootEl?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
})
</script>

<style lang="scss" scoped>
.page-sidebar {
  display: flex;
  flex-direction: column;
  width: var(--pe-sidebar-width);
  background: var(--pe-surface);
  border-left: 1px solid var(--pe-border);
  padding: 16px 10px;
  flex-shrink: 0;
  overflow: hidden;
  height: 100%;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px 12px;
    flex-shrink: 0;
  }

  &__label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--pe-text-muted);
  }

  &__count {
    font-size: 11px;
    font-weight: 600;
    color: var(--pe-text-muted);
    background: var(--pe-bg);
    border-radius: 999px;
    padding: 2px 8px;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    padding-right: 2px;
  }

  &__empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-align: center;
    color: var(--pe-text-muted);
    padding: 16px 8px;

    p {
      margin: 0;
      font-size: 12px;
      line-height: 1.4;
    }
  }
}
</style>
