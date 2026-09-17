<template>
  <div
    class="editor-object"
    :class="{
      'editor-object--selected': selected,
      'editor-object--selectable': canMove,
      'editor-object--editing': isEditing,
      [`editor-object--${object.type}`]: true,
    }"
    :style="objectStyle"
    @pointerdown="onObjectPointerDown"
    @dblclick.prevent="onDoubleClick"
  >
    <div
      class="editor-object__body"
      :class="{
        'editor-object__body--fill':
          object.type === 'text' ||
          object.type === 'drawing' ||
          object.type === 'shape' ||
          object.type === 'image' ||
          object.type === 'signature',
      }"
    >
      <TextObjectView
        v-if="object.type === 'text'"
        :object="object"
        :editing="isEditing"
        @update-content="onUpdateContent"
        @resize-frame="onResizeFrame"
        @stop-editing="onStopEditing"
      />
      <DrawingObjectView v-else-if="object.type === 'drawing'" :object="object" />
      <ShapeObjectView v-else-if="object.type === 'shape'" :object="object" />
      <ImageObjectView
        v-else-if="object.type === 'image' || object.type === 'signature'"
        :object="object"
      />
      <span v-else class="editor-object__badge">{{ label }}</span>
    </div>

    <template v-if="selected && canMove && !isEditing">
      <template v-if="showResizeHandles">
        <span
          v-for="handle in handles"
          :key="handle"
          class="editor-object__handle"
          :class="`editor-object__handle--${handle}`"
          :data-handle="handle"
          @pointerdown.stop="onHandlePointerDown($event, handle)"
        />
      </template>

      <button
        v-if="showRotateHandle"
        type="button"
        class="editor-object__rotate"
        aria-label="Rotate"
        @pointerdown.stop="onRotatePointerDown"
      >
        <q-icon name="refresh" size="14px" />
      </button>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import DrawingObjectView from '@/components/editor/DrawingObjectView.vue'
import ImageObjectView from '@/components/editor/ImageObjectView.vue'
import ShapeObjectView from '@/components/editor/ShapeObjectView.vue'
import TextObjectView from '@/components/editor/TextObjectView.vue'
import { useEditorStore } from '@/stores/editor'
import { RESIZE_HANDLES } from '@/utils/editorObjects'

const props = defineProps({
  object: {
    type: Object,
    required: true,
  },
  selected: {
    type: Boolean,
    default: false,
  },
  selectable: {
    type: Boolean,
    default: false,
  },
  textToolActive: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['select', 'move-start', 'resize-start', 'rotate-start'])

const editorStore = useEditorStore()
const { editingObjectId } = storeToRefs(editorStore)

const handles = RESIZE_HANDLES

const isEditing = computed(
  () => props.object.type === 'text' && editingObjectId.value === props.object.id,
)

const canMove = computed(() => props.selectable && !isEditing.value)

const showResizeHandles = computed(() => props.object.type !== 'drawing')

const showRotateHandle = computed(
  () =>
    props.object.type === 'shape' ||
    props.object.type === 'text' ||
    props.object.type === 'image' ||
    props.object.type === 'signature',
)

const objectStyle = computed(() => {
  const rotation = props.object.rotation || 0
  return {
    left: `${props.object.x}px`,
    top: `${props.object.y}px`,
    width: `${props.object.width}px`,
    height: `${props.object.height}px`,
    transform: rotation ? `rotate(${rotation}deg)` : undefined,
    transformOrigin: 'center center',
  }
})

const label = computed(() => {
  const dataLabel = props.object.data?.label
  if (typeof dataLabel === 'string' && dataLabel) return dataLabel
  return props.object.type
})

function onUpdateContent(content) {
  editorStore.updateObjectData(props.object.id, { content })
}

function onResizeFrame(size) {
  const patch = {}
  if (typeof size?.height === 'number' && size.height > 0) {
    patch.height = Math.round(size.height)
  }
  if (typeof size?.width === 'number' && size.width > 0) {
    patch.width = Math.round(size.width)
  }
  if (Object.keys(patch).length === 0) return
  // Auto-grow while typing — covered by text-content history coalesce
  editorStore.updateObject(props.object.id, patch, { history: false })
}

function onStopEditing() {
  if (editingObjectId.value === props.object.id) {
    editorStore.stopEditing()
  }
}

function onDoubleClick() {
  if (props.object.type !== 'text') return
  editorStore.startEditing(props.object.id)
}

function onObjectPointerDown(event) {
  if (event.button != null && event.button !== 0) return

  if (props.textToolActive && props.object.type === 'text') {
    event.preventDefault()
    event.stopPropagation()
    emit('select', props.object.id)
    editorStore.startEditing(props.object.id)
    return
  }

  if (!props.selectable) return
  if (isEditing.value) return

  emit('select', props.object.id)
  emit('move-start', { event, object: props.object })
}

function onHandlePointerDown(event, handle) {
  if (!canMove.value) return
  if (event.button != null && event.button !== 0) return
  emit('select', props.object.id)
  emit('resize-start', { event, object: props.object, handle })
}

function onRotatePointerDown(event) {
  if (!canMove.value) return
  if (event.button != null && event.button !== 0) return
  emit('select', props.object.id)
  emit('rotate-start', { event, object: props.object })
}
</script>

<style lang="scss" scoped>
.editor-object {
  position: absolute;
  box-sizing: border-box;
  border: 1px dashed transparent;
  border-radius: 2px;
  background: transparent;
  touch-action: none;
  user-select: none;

  &--text {
    border-color: rgba(37, 99, 235, 0.2);
    background: rgba(255, 255, 255, 0.01);
  }

  &--selectable {
    cursor: move;
  }

  &--selected {
    border: 1.5px solid var(--pe-accent);
    z-index: 2;
  }

  &--editing {
    border: 1.5px solid var(--pe-accent);
    background: rgba(255, 255, 255, 0.92);
    cursor: text;
    z-index: 4;
  }

  &--drawing {
    border-color: transparent;
    background: transparent;

    &.editor-object--selected {
      border-color: var(--pe-accent);
      background: rgba(37, 99, 235, 0.04);
    }
  }

  &--image,
  &--signature {
    border-color: transparent;
    background: transparent;
    overflow: visible;

    &.editor-object--selected {
      border-color: var(--pe-accent);
    }
  }

  &--shape {
    border-color: transparent;
    background: transparent;

    &.editor-object--selected {
      border-color: var(--pe-accent);
      background: rgba(37, 99, 235, 0.04);
    }
  }

  &__body {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    padding: 0;

    &--fill {
      display: block;
      pointer-events: auto;
    }
  }

  &__badge {
    font-size: 11px;
    font-weight: 600;
    color: var(--pe-text-muted);
    text-transform: capitalize;
    letter-spacing: 0.02em;
    text-align: center;
    line-height: 1.2;
    pointer-events: none;
    padding: 4px;
  }

  &__handle {
    position: absolute;
    width: 12px;
    height: 12px;
    background: #fff;
    border: 1.5px solid var(--pe-accent);
    border-radius: 2px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
    touch-action: none;
    z-index: 3;

    &--nw {
      top: -6px;
      left: -6px;
      cursor: nwse-resize;
    }
    &--n {
      top: -6px;
      left: 50%;
      transform: translateX(-50%);
      cursor: ns-resize;
    }
    &--ne {
      top: -6px;
      right: -6px;
      cursor: nesw-resize;
    }
    &--e {
      top: 50%;
      right: -6px;
      transform: translateY(-50%);
      cursor: ew-resize;
    }
    &--se {
      bottom: -6px;
      right: -6px;
      cursor: nwse-resize;
    }
    &--s {
      bottom: -6px;
      left: 50%;
      transform: translateX(-50%);
      cursor: ns-resize;
    }
    &--sw {
      bottom: -6px;
      left: -6px;
      cursor: nesw-resize;
    }
    &--w {
      top: 50%;
      left: -6px;
      transform: translateY(-50%);
      cursor: ew-resize;
    }
  }

  &__rotate {
    position: absolute;
    top: -34px;
    left: 50%;
    transform: translateX(-50%);
    width: 24px;
    height: 24px;
    border: 1.5px solid var(--pe-accent);
    border-radius: 50%;
    background: #fff;
    color: var(--pe-accent);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
    touch-action: none;
    z-index: 4;
    padding: 0;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);

    &:active {
      cursor: grabbing;
    }

    &::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      width: 1px;
      height: 10px;
      background: var(--pe-accent);
      transform: translateX(-50%);
    }
  }
}

@media (pointer: coarse) {
  .editor-object__handle {
    width: 16px;
    height: 16px;

    &--nw,
    &--ne,
    &--n {
      top: -8px;
    }
    &--sw,
    &--se,
    &--s {
      bottom: -8px;
    }
    &--nw,
    &--sw,
    &--w {
      left: -8px;
    }
    &--ne,
    &--se,
    &--e {
      right: -8px;
    }
  }

  .editor-object__rotate {
    width: 28px;
    height: 28px;
    top: -40px;
  }
}
</style>
