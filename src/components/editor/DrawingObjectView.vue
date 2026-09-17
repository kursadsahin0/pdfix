<template>
  <svg
    class="drawing-object-view"
    :viewBox="`0 0 ${object.width} ${object.height}`"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <polyline
      v-if="pointsAttr"
      fill="none"
      :points="pointsAttr"
      :stroke="color"
      :stroke-width="strokeWidth"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <circle
      v-else-if="singlePoint"
      :cx="singlePoint.x"
      :cy="singlePoint.y"
      :r="strokeWidth / 2"
      :fill="color"
    />
  </svg>
</template>

<script setup>
import { computed } from 'vue'
import { DEFAULT_DRAWING_DATA } from '@/utils/editorObjects'

const props = defineProps({
  object: {
    type: Object,
    required: true,
  },
})

const data = computed(() => ({
  ...DEFAULT_DRAWING_DATA,
  ...(props.object.data ?? {}),
}))

const color = computed(() => data.value.color)
const strokeWidth = computed(() => data.value.strokeWidth)

const points = computed(() =>
  Array.isArray(data.value.points) ? data.value.points : [],
)

const pointsAttr = computed(() => {
  if (points.value.length < 2) return ''
  return points.value.map((p) => `${p.x},${p.y}`).join(' ')
})

const singlePoint = computed(() =>
  points.value.length === 1 ? points.value[0] : null,
)
</script>

<style lang="scss" scoped>
.drawing-object-view {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}
</style>
