<template>
  <div class="pdf-doc" :class="{ 'pdf-doc--active': interactive }">
    <div
      v-for="block in blocks"
      :key="block.id"
      :ref="(el) => setBlockEl(block.id, el)"
      class="pdf-doc__para"
      :class="{
        'pdf-doc__para--focus': editingId === block.id,
        'pdf-doc__para--dirty': block.dirty,
      }"
      :style="paraStyle(block)"
      :contenteditable="interactive ? 'true' : 'false'"
      spellcheck="true"
      role="textbox"
      aria-multiline="true"
      :aria-label="'Edit text'"
      @pointerdown.stop="onPointerDown(block)"
      @focus="onFocus(block)"
      @blur="onBlur(block, $event)"
      @input="onInput(block, $event)"
      @keydown="onKeydown"
    />
  </div>
</template>

<script setup>
/**
 * Word-like paragraph editing on top of the PDF.
 * Idle: invisible — original PDF design stays intact.
 * Only the paragraph being edited (or already changed) shows a whiteout.
 */
import { nextTick, onBeforeUnmount, watch } from 'vue'

const props = defineProps({
  blocks: {
    type: Array,
    default: () => [],
  },
  interactive: {
    type: Boolean,
    default: true,
  },
  editingId: {
    type: String,
    default: null,
  },
})

const emit = defineEmits(['focus-block', 'blur-block', 'update-content'])

/** @type {Map<string, HTMLElement>} */
const blockEls = new Map()

function setBlockEl(id, el) {
  if (el) blockEls.set(id, el)
  else blockEls.delete(id)
}

function paraStyle(block) {
  const fontSize = Math.max(8, Number(block.fontSize) || 13)
  return {
    left: `${block.x}px`,
    top: `${block.y}px`,
    width: `${Math.max(block.width, fontSize * 8)}px`,
    minHeight: `${Math.max(block.height, fontSize * 1.35)}px`,
    fontSize: `${fontSize}px`,
    lineHeight: '1.35',
    fontFamily: 'Helvetica, Arial, sans-serif',
  }
}

function syncDomFromBlocks() {
  for (const block of props.blocks) {
    const el = blockEls.get(block.id)
    if (!el) continue
    if (props.editingId === block.id && document.activeElement === el) continue
    const next = String(block.content ?? '')
    if (el.textContent !== next) el.textContent = next
  }
}

function onPointerDown(block) {
  if (!props.interactive) return
  emit('focus-block', block.id)
}

function onFocus(block) {
  emit('focus-block', block.id)
}

function onBlur(block, event) {
  emit('update-content', { id: block.id, content: event.target.textContent ?? '' })
  emit('blur-block', block.id)
}

function onInput(block, event) {
  emit('update-content', { id: block.id, content: event.target.textContent ?? '' })
}

function onKeydown(event) {
  event.stopPropagation()
  if (event.key === 'Escape') {
    event.preventDefault()
    event.target.blur()
  }
}

watch(
  () => props.blocks,
  async () => {
    await nextTick()
    syncDomFromBlocks()
  },
  { deep: true, immediate: true },
)

watch(
  () => props.editingId,
  async (id) => {
    if (!id) return
    await nextTick()
    const el = blockEls.get(id)
    if (el && document.activeElement !== el) {
      el.focus()
      const selection = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(el)
      range.collapse(false)
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
  },
)

onBeforeUnmount(() => {
  blockEls.clear()
})
</script>

<style lang="scss" scoped>
.pdf-doc {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;

  &--active .pdf-doc__para {
    pointer-events: auto;
  }
}

.pdf-doc__para {
  position: absolute;
  box-sizing: border-box;
  margin: 0;
  padding: 1px 2px;
  border: 1px solid transparent;
  border-radius: 2px;
  /* Idle: PDF design shows through completely */
  background: transparent;
  color: transparent;
  outline: none;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: normal;
  cursor: text;
  user-select: text;
  caret-color: #2563eb;

  &:hover:not(.pdf-doc__para--focus):not(.pdf-doc__para--dirty) {
    background: rgba(37, 99, 235, 0.1);
    border-color: rgba(37, 99, 235, 0.28);
  }

  /* Only edited / focused paragraph covers the original glyphs */
  &--focus,
  &--dirty,
  &:focus {
    background: #ffffff;
    color: #111827;
    border-color: rgba(37, 99, 235, 0.55);
    box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.16);
    z-index: 2;
  }
}
</style>
