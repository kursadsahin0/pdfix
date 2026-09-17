<template>
  <div v-if="visible" class="draw-style-toolbar">
    <div v-if="isDrawTool" class="draw-style-toolbar__group draw-style-toolbar__modes">
      <button
        type="button"
        class="draw-style-toolbar__mode"
        :class="{ 'draw-style-toolbar__mode--active': drawMode === 'pen' }"
        aria-label="Pen"
        @click="editorStore.setDrawMode('pen')"
      >
        <q-icon name="edit" size="18px" />
        <span>Pen</span>
      </button>
      <button
        type="button"
        class="draw-style-toolbar__mode"
        :class="{ 'draw-style-toolbar__mode--active': drawMode === 'eraser' }"
        aria-label="Eraser"
        @click="editorStore.setDrawMode('eraser')"
      >
        <q-icon name="auto_fix_off" size="18px" />
        <span>Eraser</span>
      </button>
    </div>

    <div v-if="!isEraserMode" class="draw-style-toolbar__group">
      <label class="draw-style-toolbar__label">Color</label>
      <input
        class="draw-style-toolbar__color"
        type="color"
        :value="color"
        aria-label="Stroke color"
        @input="onColor($event.target.value)"
      />
    </div>

    <div class="draw-style-toolbar__group">
      <label class="draw-style-toolbar__label">{{ isEraserMode ? 'Size' : 'Stroke' }}</label>
      <div class="draw-style-toolbar__widths">
        <button
          v-for="width in widthOptions"
          :key="width"
          type="button"
          class="draw-style-toolbar__width"
          :class="{ 'draw-style-toolbar__width--active': strokeWidth === width }"
          :aria-label="`${width}px`"
          @click="onStrokeWidth(width)"
        >
          <span
            class="draw-style-toolbar__width-dot"
            :style="{ width: `${Math.min(width, 18)}px`, height: `${Math.min(width, 18)}px` }"
          />
          <span class="draw-style-toolbar__width-label">{{ width }}px</span>
        </button>
      </div>
    </div>

    <div class="draw-style-toolbar__spacer" />

    <q-btn
      v-if="isDrawingSelected"
      flat
      dense
      no-caps
      color="negative"
      icon="delete"
      label="Delete"
      class="draw-style-toolbar__delete"
      @click="onDelete"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/stores/editor'
import { ERASER_WIDTH_OPTIONS, STROKE_WIDTH_OPTIONS } from '@/utils/editorObjects'

const editorStore = useEditorStore()
const {
  activeTool,
  selectedObject,
  drawColor,
  drawStrokeWidth,
  drawMode,
  eraserWidth,
} = storeToRefs(editorStore)

const isDrawingSelected = computed(() => selectedObject.value?.type === 'drawing')
const isDrawTool = computed(() => activeTool.value === 'draw')
const visible = computed(() => isDrawTool.value || isDrawingSelected.value)
const isEraserMode = computed(() => isDrawTool.value && drawMode.value === 'eraser')

const widthOptions = computed(() =>
  isEraserMode.value ? ERASER_WIDTH_OPTIONS : STROKE_WIDTH_OPTIONS,
)

const color = computed(() => {
  if (isDrawingSelected.value && !isDrawTool.value) {
    return selectedObject.value?.data?.color ?? drawColor.value
  }
  return drawColor.value
})

const strokeWidth = computed(() => {
  if (isEraserMode.value) return eraserWidth.value
  if (isDrawingSelected.value && !isDrawTool.value) {
    return Number(selectedObject.value?.data?.strokeWidth ?? drawStrokeWidth.value)
  }
  return drawStrokeWidth.value
})

function onColor(value) {
  editorStore.setDrawColor(value)
  if (isDrawingSelected.value) {
    editorStore.updateObjectData(selectedObject.value.id, { color: value })
  }
}

function onStrokeWidth(width) {
  if (isEraserMode.value) {
    editorStore.setEraserWidth(width)
    return
  }
  editorStore.setDrawStrokeWidth(width)
  if (isDrawingSelected.value) {
    editorStore.updateObjectData(selectedObject.value.id, { strokeWidth: width })
  }
}

function onDelete() {
  if (!selectedObject.value) return
  editorStore.removeObject(selectedObject.value.id)
}
</script>

<style lang="scss" scoped>
.draw-style-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  min-height: 48px;
  padding: 6px 12px;
  background: var(--pe-surface);
  border-bottom: 1px solid var(--pe-border);
  flex-shrink: 0;

  &__group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__label {
    font-size: 11px;
    font-weight: 600;
    color: var(--pe-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  &__modes {
    gap: 4px;
  }

  &__mode {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border: 1px solid var(--pe-border);
    border-radius: 8px;
    background: var(--pe-bg);
    color: var(--pe-text);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;

    &--active {
      border-color: var(--pe-accent);
      background: var(--pe-accent-soft);
      color: var(--pe-accent);
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

  &__widths {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  &__width {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border: 1px solid var(--pe-border);
    border-radius: 8px;
    background: var(--pe-bg);
    color: var(--pe-text);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;

    &--active {
      border-color: var(--pe-accent);
      background: var(--pe-accent-soft);
      color: var(--pe-accent);
    }
  }

  &__width-dot {
    display: inline-block;
    border-radius: 50%;
    background: currentColor;
    flex-shrink: 0;
  }

  &__spacer {
    flex: 1;
  }

  &__delete {
    font-weight: 500;
  }
}

@media (max-width: 1023px) {
  .draw-style-toolbar {
    flex-wrap: nowrap;
    overflow-x: auto;
    gap: 8px;
    padding: 6px 8px;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;

    &::-webkit-scrollbar {
      display: none;
    }

    &__label {
      display: none;
    }

    &__mode span {
      display: none;
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
