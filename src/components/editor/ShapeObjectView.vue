<template>
  <svg
    class="shape-object-view"
    :viewBox="`0 0 ${object.width} ${object.height}`"
    preserveAspectRatio="none"
    :style="{ opacity: data.opacity }"
    aria-hidden="true"
  >
    <defs v-if="data.shapeType === 'arrow'">
      <marker
        :id="markerId"
        markerWidth="8"
        markerHeight="8"
        refX="6"
        refY="4"
        orient="auto"
        markerUnits="strokeWidth"
      >
        <path d="M0,0 L8,4 L0,8 Z" :fill="data.strokeColor" />
      </marker>
    </defs>

    <rect
      v-if="data.shapeType === 'rectangle'"
      :x="inset"
      :y="inset"
      :width="Math.max(object.width - inset * 2, 0)"
      :height="Math.max(object.height - inset * 2, 0)"
      :fill="data.fillColor"
      :stroke="data.strokeColor"
      :stroke-width="data.strokeWidth"
    />

    <ellipse
      v-else-if="data.shapeType === 'circle'"
      :cx="object.width / 2"
      :cy="object.height / 2"
      :rx="Math.max(object.width / 2 - inset, 0)"
      :ry="Math.max(object.height / 2 - inset, 0)"
      :fill="data.fillColor"
      :stroke="data.strokeColor"
      :stroke-width="data.strokeWidth"
    />

    <line
      v-else-if="data.shapeType === 'line' || data.shapeType === 'arrow'"
      :x1="line.x1"
      :y1="line.y1"
      :x2="line.x2"
      :y2="line.y2"
      fill="none"
      :stroke="data.strokeColor"
      :stroke-width="data.strokeWidth"
      stroke-linecap="round"
      :marker-end="data.shapeType === 'arrow' ? `url(#${markerId})` : undefined"
    />
  </svg>
</template>

<script setup>
import { computed } from 'vue'
import { DEFAULT_SHAPE_DATA } from '@/utils/editorObjects'

const props = defineProps({
  object: {
    type: Object,
    required: true,
  },
})

const data = computed(() => ({
  ...DEFAULT_SHAPE_DATA,
  ...(props.object.data ?? {}),
}))

const inset = computed(() => Number(data.value.strokeWidth || 0) / 2)

const markerId = computed(() => `shape-arrow-${props.object.id}`)

const line = computed(() => {
  const w = props.object.width || 1
  const h = props.object.height || 1
  return {
    x1: (data.value.x1 ?? 0) * w,
    y1: (data.value.y1 ?? 0) * h,
    x2: (data.value.x2 ?? 1) * w,
    y2: (data.value.y2 ?? 1) * h,
  }
})
</script>

<style lang="scss" scoped>
.shape-object-view {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}
</style>
