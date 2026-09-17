<template>
  <div v-if="visible" class="shape-style-toolbar">
    <div class="shape-style-toolbar__group shape-style-toolbar__types">
      <button
        v-for="option in shapeOptions"
        :key="option.id"
        type="button"
        class="shape-style-toolbar__type"
        :class="{ 'shape-style-toolbar__type--active': currentShapeType === option.id }"
        :aria-label="option.label"
        :title="option.label"
        @click="onShapeType(option.id)"
      >
        <q-icon :name="option.icon" size="18px" />
      </button>
    </div>

    <div class="shape-style-toolbar__group">
      <label class="shape-style-toolbar__label">Stroke</label>
      <input
        class="shape-style-toolbar__color"
        type="color"
        :value="strokeColor"
        aria-label="Stroke color"
        @input="onStrokeColor($event.target.value)"
      />
    </div>

    <div v-if="showFill" class="shape-style-toolbar__group">
      <label class="shape-style-toolbar__label">Fill</label>
      <input
        class="shape-style-toolbar__color"
        type="color"
        :value="fillColor"
        aria-label="Fill color"
        @input="onFillColor($event.target.value)"
      />
    </div>

    <div class="shape-style-toolbar__group">
      <label class="shape-style-toolbar__label">Width</label>
      <div class="shape-style-toolbar__widths">
        <button
          v-for="width in widthOptions"
          :key="width"
          type="button"
          class="shape-style-toolbar__width"
          :class="{ 'shape-style-toolbar__width--active': strokeWidth === width }"
          @click="onStrokeWidth(width)"
        >
          {{ width }}px
        </button>
      </div>
    </div>

    <div class="shape-style-toolbar__group shape-style-toolbar__group--opacity">
      <label class="shape-style-toolbar__label">Opacity</label>
      <q-slider
        :model-value="opacity"
        :min="0.1"
        :max="1"
        :step="0.05"
        color="primary"
        class="shape-style-toolbar__slider"
        @update:model-value="onOpacity"
      />
      <span class="shape-style-toolbar__opacity-value">{{ Math.round(opacity * 100) }}%</span>
    </div>

    <div v-if="isShapeSelected" class="shape-style-toolbar__group">
      <label class="shape-style-toolbar__label">Rotate</label>
      <q-input
        :model-value="Math.round(rotation)"
        type="number"
        dense
        outlined
        class="shape-style-toolbar__rotate"
        @update:model-value="onRotation"
      />
    </div>

    <div class="shape-style-toolbar__spacer" />

    <q-btn
      v-if="isShapeSelected"
      flat
      dense
      no-caps
      color="negative"
      icon="delete"
      label="Delete"
      class="shape-style-toolbar__delete"
      @click="onDelete"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/stores/editor'
import {
  DEFAULT_SHAPE_DATA,
  SHAPE_TYPE_OPTIONS,
  STROKE_WIDTH_OPTIONS,
} from '@/utils/editorObjects'

const editorStore = useEditorStore()
const {
  activeTool,
  selectedObject,
  shapeType,
  shapeStrokeColor,
  shapeFillColor,
  shapeStrokeWidth,
  shapeOpacity,
} = storeToRefs(editorStore)

const isShapeSelected = computed(() => selectedObject.value?.type === 'shape')
const isShapeTool = computed(() => activeTool.value === 'shape')
const visible = computed(() => isShapeTool.value || isShapeSelected.value)

const shapeOptions = SHAPE_TYPE_OPTIONS
const widthOptions = STROKE_WIDTH_OPTIONS

const selectedData = computed(() => ({
  ...DEFAULT_SHAPE_DATA,
  ...(selectedObject.value?.data ?? {}),
}))

const currentShapeType = computed(() =>
  isShapeSelected.value ? selectedData.value.shapeType : shapeType.value,
)

const showFill = computed(() => {
  const type = currentShapeType.value
  return type === 'rectangle' || type === 'circle'
})

const strokeColor = computed(() =>
  isShapeSelected.value ? selectedData.value.strokeColor : shapeStrokeColor.value,
)

const fillColor = computed(() =>
  isShapeSelected.value ? selectedData.value.fillColor : shapeFillColor.value,
)

const strokeWidth = computed(() =>
  isShapeSelected.value
    ? Number(selectedData.value.strokeWidth)
    : shapeStrokeWidth.value,
)

const opacity = computed(() =>
  isShapeSelected.value ? Number(selectedData.value.opacity) : shapeOpacity.value,
)

const rotation = computed(() =>
  isShapeSelected.value ? Number(selectedObject.value?.rotation ?? 0) : 0,
)

function onShapeType(type) {
  editorStore.setShapeType(type)
  if (isShapeSelected.value) {
    editorStore.updateObjectData(selectedObject.value.id, { shapeType: type })
  }
}

function onStrokeColor(value) {
  editorStore.setShapeStrokeColor(value)
  if (isShapeSelected.value) {
    editorStore.updateObjectData(selectedObject.value.id, { strokeColor: value })
  }
}

function onFillColor(value) {
  editorStore.setShapeFillColor(value)
  if (isShapeSelected.value) {
    editorStore.updateObjectData(selectedObject.value.id, { fillColor: value })
  }
}

function onStrokeWidth(width) {
  editorStore.setShapeStrokeWidth(width)
  if (isShapeSelected.value) {
    editorStore.updateObjectData(selectedObject.value.id, { strokeWidth: width })
  }
}

function onOpacity(value) {
  editorStore.setShapeOpacity(value)
  if (isShapeSelected.value) {
    editorStore.updateObjectData(selectedObject.value.id, { opacity: Number(value) })
  }
}

function onRotation(value) {
  if (!isShapeSelected.value) return
  const deg = Number(value)
  if (Number.isNaN(deg)) return
  editorStore.updateObject(selectedObject.value.id, { rotation: deg })
}

function onDelete() {
  if (!selectedObject.value) return
  editorStore.removeObject(selectedObject.value.id)
}
</script>

<style lang="scss" scoped>
.shape-style-toolbar {
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

  &__types {
    gap: 4px;
  }

  &__type {
    width: 34px;
    height: 34px;
    border: 1px solid var(--pe-border);
    border-radius: 8px;
    background: var(--pe-bg);
    color: var(--pe-text);
    display: inline-flex;
    align-items: center;
    justify-content: center;
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
    gap: 4px;
  }

  &__width {
    padding: 6px 8px;
    border: 1px solid var(--pe-border);
    border-radius: 8px;
    background: var(--pe-bg);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    color: var(--pe-text);

    &--active {
      border-color: var(--pe-accent);
      background: var(--pe-accent-soft);
      color: var(--pe-accent);
    }
  }

  &__slider {
    width: 90px;
  }

  &__opacity-value {
    min-width: 36px;
    font-size: 12px;
    color: var(--pe-text-muted);
  }

  &__rotate {
    width: 72px;
    background: var(--pe-bg);
    border-radius: 8px;
  }

  &__spacer {
    flex: 1;
  }

  &__delete {
    font-weight: 500;
  }
}

@media (max-width: 1023px) {
  .shape-style-toolbar {
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

    &__spacer {
      display: none;
    }

    &__delete :deep(.block) {
      display: none;
    }
  }
}
</style>
