<template>
  <div
    class="text-object-view"
    :class="{
      'text-object-view--editing': editing,
      'text-object-view--whiteout': hasWhiteout,
      'text-object-view--flow': isFlowing,
    }"
  >
    <textarea
      v-if="editing"
      ref="inputRef"
      class="text-object-view__input"
      :style="textStyle"
      :value="content"
      spellcheck="true"
      @pointerdown.stop
      @mousedown.stop
      @click.stop
      @input="onInput"
      @keydown="onKeydown"
      @blur="onBlur"
    />
    <div v-else class="text-object-view__display" :style="textStyle">
      {{ content || ' ' }}
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { DEFAULT_TEXT_DATA } from '@/utils/editorObjects'

const props = defineProps({
  object: {
    type: Object,
    required: true,
  },
  editing: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update-content', 'stop-editing', 'resize-frame'])

const inputRef = ref(null)

const data = computed(() => ({
  ...DEFAULT_TEXT_DATA,
  ...(props.object.data ?? {}),
}))

const content = computed(() => String(data.value.content ?? ''))

const hasWhiteout = computed(
  () => Boolean(data.value.whiteout) || data.value.source === 'pdf',
)

/** PDF/promoted frames reflow like a Word text box */
const isFlowing = computed(() => hasWhiteout.value || data.value.source === 'pdf')

const lineHeight = computed(() => {
  const value = Number(data.value.lineHeight)
  return Number.isFinite(value) && value > 0 ? value : isFlowing.value ? 1.35 : 1.3
})

const textStyle = computed(() => ({
  fontSize: `${data.value.fontSize}px`,
  fontFamily: data.value.fontFamily,
  fontWeight: data.value.fontWeight,
  fontStyle: data.value.fontStyle,
  color: data.value.color,
  textAlign: data.value.textAlign,
  lineHeight: String(lineHeight.value),
  backgroundColor: hasWhiteout.value ? '#ffffff' : 'transparent',
}))

async function focusInput() {
  await nextTick()
  const el = inputRef.value
  if (!el) return
  el.focus()

  // Word-like: caret inside the frame, not select-all
  if (isFlowing.value) {
    const end = el.value.length
    el.setSelectionRange(end, end)
  } else {
    el.select()
  }

  await syncFrameHeight()
}

async function syncFrameHeight() {
  if (!isFlowing.value) return
  await nextTick()
  const el = inputRef.value
  if (!el) return

  const previous = el.style.height
  el.style.height = '0px'
  const needed = Math.ceil(el.scrollHeight + 2)
  el.style.height = previous || '100%'

  const current = Math.round(props.object.height || 0)
  if (needed > current + 1) {
    emit('resize-frame', { height: needed })
  }
}

function onInput(event) {
  emit('update-content', event.target.value)
  void syncFrameHeight()
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.target.blur()
  }
  // Keep Delete/Backspace inside the field
  event.stopPropagation()
}

function onBlur() {
  emit('stop-editing')
}

watch(
  () => props.editing,
  (value) => {
    if (value) focusInput()
  },
)

watch(
  () => props.object.height,
  () => {
    if (props.editing) void syncFrameHeight()
  },
)

onMounted(() => {
  if (props.editing) focusInput()
})
</script>

<style lang="scss" scoped>
.text-object-view {
  width: 100%;
  height: 100%;
  min-height: 100%;
  overflow: hidden;

  &--whiteout {
    background: #ffffff;
  }

  &--flow {
    .text-object-view__display,
    .text-object-view__input {
      padding: 3px 4px;
      overflow-wrap: break-word;
      word-break: normal;
      white-space: pre-wrap;
      overflow: hidden;
    }
  }

  &__display,
  &__input {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 4px 6px;
    border: none;
    outline: none;
    background: transparent;
    box-sizing: border-box;
    line-height: 1.3;
    white-space: pre-wrap;
    word-break: break-word;
    overflow: hidden;
  }

  &__input {
    resize: none;
    caret-color: var(--pe-accent);
    overflow-y: auto;
  }

  &__display {
    pointer-events: none;
    user-select: none;
  }
}
</style>
