<template>
  <div v-if="visible" class="text-style-toolbar">
    <div class="text-style-toolbar__group text-style-toolbar__group--font">
      <label class="text-style-toolbar__label">Font</label>
      <q-select
        :model-value="fontFamily"
        :options="fontOptions"
        dense
        outlined
        emit-value
        map-options
        options-dense
        class="text-style-toolbar__select text-style-toolbar__select--font"
        @update:model-value="patch({ fontFamily: $event })"
      />
    </div>

    <div class="text-style-toolbar__group">
      <label class="text-style-toolbar__label">Size</label>
      <q-select
        :model-value="fontSize"
        :options="sizeOptions"
        dense
        outlined
        emit-value
        options-dense
        class="text-style-toolbar__select text-style-toolbar__select--size"
        @update:model-value="patch({ fontSize: Number($event) })"
      />
    </div>

    <div class="text-style-toolbar__group text-style-toolbar__group--toggles">
      <q-btn
        flat
        dense
        round
        icon="format_bold"
        :color="isBold ? 'primary' : undefined"
        :class="{ 'text-style-toolbar__toggle--on': isBold }"
        aria-label="Bold"
        @click="toggleBold"
      />
      <q-btn
        flat
        dense
        round
        icon="format_italic"
        :color="isItalic ? 'primary' : undefined"
        :class="{ 'text-style-toolbar__toggle--on': isItalic }"
        aria-label="Italic"
        @click="toggleItalic"
      />
    </div>

    <div class="text-style-toolbar__group">
      <label class="text-style-toolbar__label">Color</label>
      <input
        class="text-style-toolbar__color"
        type="color"
        :value="color"
        aria-label="Color"
        @input="patch({ color: $event.target.value })"
      />
    </div>

    <div class="text-style-toolbar__group text-style-toolbar__group--align">
      <q-btn
        v-for="align in alignments"
        :key="align.value"
        flat
        dense
        round
        :icon="align.icon"
        :color="textAlign === align.value ? 'primary' : undefined"
        :aria-label="align.label"
        @click="patch({ textAlign: align.value })"
      />
    </div>

    <div class="text-style-toolbar__spacer" />

    <q-btn
      flat
      dense
      no-caps
      color="negative"
      icon="delete"
      label="Delete"
      class="text-style-toolbar__delete"
      @click="onDelete"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/stores/editor'
import {
  DEFAULT_TEXT_DATA,
  TEXT_FONT_OPTIONS,
  TEXT_SIZE_OPTIONS,
} from '@/utils/editorObjects'

const editorStore = useEditorStore()
const { selectedObject } = storeToRefs(editorStore)

const visible = computed(() => selectedObject.value?.type === 'text')

const textData = computed(() => ({
  ...DEFAULT_TEXT_DATA,
  ...(selectedObject.value?.data ?? {}),
}))

const fontFamily = computed(() => textData.value.fontFamily)
const fontSize = computed(() => textData.value.fontSize)
const color = computed(() => textData.value.color || '#000000')
const textAlign = computed(() => textData.value.textAlign || 'left')
const isBold = computed(() => textData.value.fontWeight === 'bold')
const isItalic = computed(() => textData.value.fontStyle === 'italic')

const fontOptions = TEXT_FONT_OPTIONS
const sizeOptions = TEXT_SIZE_OPTIONS

const alignments = [
  { value: 'left', icon: 'format_align_left', label: 'Align left' },
  { value: 'center', icon: 'format_align_center', label: 'Align center' },
  { value: 'right', icon: 'format_align_right', label: 'Align right' },
]

function patch(dataPatch) {
  if (!selectedObject.value) return
  editorStore.updateObjectData(selectedObject.value.id, dataPatch)
}

function toggleBold() {
  patch({ fontWeight: isBold.value ? 'normal' : 'bold' })
}

function toggleItalic() {
  patch({ fontStyle: isItalic.value ? 'normal' : 'italic' })
}

function onDelete() {
  if (!selectedObject.value) return
  editorStore.removeObject(selectedObject.value.id)
}
</script>

<style lang="scss" scoped>
.text-style-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-height: 48px;
  padding: 6px 12px;
  background: var(--pe-surface);
  border-bottom: 1px solid var(--pe-border);
  flex-shrink: 0;

  &__group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  &__label {
    font-size: 11px;
    font-weight: 600;
    color: var(--pe-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  &__select {
    min-width: 72px;
    background: var(--pe-bg);
    border-radius: 8px;

    &--font {
      min-width: 120px;
    }

    &--size {
      min-width: 72px;
    }
  }

  &__color {
    width: 34px;
    height: 30px;
    padding: 0;
    border: 1px solid var(--pe-border);
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
  }

  &__toggle--on {
    background: var(--pe-accent-soft);
  }

  &__spacer {
    flex: 1;
  }

  &__delete {
    font-weight: 500;
  }
}

@media (max-width: 1023px) {
  .text-style-toolbar {
    gap: 8px;
    padding: 6px 8px;
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;

    &::-webkit-scrollbar {
      display: none;
    }

    &__label {
      display: none;
    }

    &__select--font {
      min-width: 100px;
    }

    &__spacer {
      display: none;
    }

    &__delete :deep(.block) {
      display: none;
    }
  }
}
</style>
