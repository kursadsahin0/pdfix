<template>
  <aside class="editor-toolbar" :class="{ 'editor-toolbar--mobile': mobile }">
    <div v-if="!mobile" class="editor-toolbar__label">Tools</div>

    <div class="editor-toolbar__list">
      <button
        v-for="tool in tools"
        :key="tool.id"
        type="button"
        class="editor-toolbar__item"
        :class="{ 'editor-toolbar__item--active': activeTool === tool.id }"
        :aria-label="tool.label"
        :aria-pressed="activeTool === tool.id"
        :disabled="tool.id === 'image' && isAddingImage"
        @click="editorStore.setActiveTool(tool.id)"
      >
        <q-spinner v-if="tool.id === 'image' && isAddingImage" size="20px" color="primary" />
        <q-icon v-else :name="tool.icon" size="22px" />
        <span class="editor-toolbar__item-label">{{ tool.label }}</span>
      </button>
    </div>
  </aside>
</template>

<script setup>
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/stores/editor'

defineProps({
  mobile: {
    type: Boolean,
    default: false,
  },
})

const editorStore = useEditorStore()
const { activeTool, isAddingImage } = storeToRefs(editorStore)

const tools = [
  { id: 'select', label: 'Select', icon: 'near_me' },
  { id: 'text', label: 'Text', icon: 'text_fields' },
  { id: 'draw', label: 'Draw', icon: 'brush' },
  { id: 'shape', label: 'Shape', icon: 'category' },
  { id: 'image', label: 'Image', icon: 'image' },
  { id: 'signature', label: 'Signature', icon: 'draw' },
]
</script>

<style lang="scss" scoped>
.editor-toolbar {
  display: flex;
  flex-direction: column;
  width: var(--pe-sidebar-width);
  background: var(--pe-surface);
  border-right: 1px solid var(--pe-border);
  padding: 16px 10px;
  flex-shrink: 0;
  overflow-y: auto;

  &__label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--pe-text-muted);
    padding: 0 8px 12px;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--pe-text);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
    transition:
      background 0.15s ease,
      color 0.15s ease;

    &:hover:not(:disabled) {
      background: var(--pe-bg);
    }

    &:disabled {
      opacity: 0.55;
      cursor: wait;
    }

    &--active {
      background: var(--pe-accent-soft);
      color: var(--pe-accent);
    }
  }

  &--mobile {
    width: 100%;
    flex-direction: row;
    border-right: none;
    border-top: 1px solid var(--pe-border);
    padding: 6px 8px calc(6px + var(--pe-safe-bottom));
    height: calc(var(--pe-mobile-tools-height) + var(--pe-safe-bottom));
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    flex-shrink: 0;

    .editor-toolbar__list {
      flex-direction: row;
      width: 100%;
      justify-content: space-around;
      gap: 2px;
    }

    .editor-toolbar__item {
      flex-direction: column;
      gap: 2px;
      padding: 6px 4px;
      min-width: 0;
      flex: 1 1 0;
      font-size: 10px;
    }

    .editor-toolbar__item-label {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
  }
}

@media (max-width: 399px) {
  .editor-toolbar--mobile {
    .editor-toolbar__item-label {
      display: none;
    }

    .editor-toolbar__item {
      padding: 8px 4px;
    }
  }
}
</style>
