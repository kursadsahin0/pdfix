<template>
  <footer class="editor-bottom-bar">
    <div class="editor-bottom-bar__zoom">
      <q-btn flat dense round icon="remove" aria-label="Zoom out" @click="editorStore.zoomOut()" />
      <button type="button" class="editor-bottom-bar__zoom-value" @click="editorStore.resetZoom()">
        {{ zoom }}%
      </button>
      <q-btn flat dense round icon="add" aria-label="Zoom in" @click="editorStore.zoomIn()" />
    </div>

    <div class="editor-bottom-bar__page">
      Page {{ currentDisplayIndex || 0 }} / {{ visiblePageCount || 1 }}
    </div>
  </footer>
</template>

<script setup>
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/stores/editor'

const editorStore = useEditorStore()
const { zoom, currentDisplayIndex, visiblePageCount } = storeToRefs(editorStore)
</script>

<style lang="scss" scoped>
.editor-bottom-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--pe-bottombar-height);
  padding: 0 max(12px, var(--pe-safe-right)) 0 max(12px, var(--pe-safe-left));
  background: var(--pe-surface);
  border-top: 1px solid var(--pe-border);
  flex-shrink: 0;
  gap: 12px;

  &__zoom {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  &__zoom-value {
    min-width: 52px;
    padding: 4px 8px;
    border: 1px solid var(--pe-border);
    border-radius: 6px;
    background: var(--pe-bg);
    color: var(--pe-text);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    text-align: center;

    &:hover {
      border-color: var(--pe-accent);
    }
  }

  &__page {
    font-size: 13px;
    font-weight: 500;
    color: var(--pe-text-muted);
    white-space: nowrap;
  }
}

@media (max-width: 599px) {
  .editor-bottom-bar {
    padding: 0 max(8px, var(--pe-safe-right)) 0 max(8px, var(--pe-safe-left));
    gap: 8px;

    &__zoom-value {
      min-width: 48px;
      font-size: 12px;
      padding: 4px 6px;
    }

    &__page {
      font-size: 12px;
    }
  }
}
</style>
