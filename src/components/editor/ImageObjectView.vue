<template>
  <div
    class="image-object-view"
    :class="{ 'image-object-view--transparent': object.type === 'signature' }"
  >
    <img
      v-if="src"
      class="image-object-view__img"
      :src="src"
      alt=""
      draggable="false"
    />
    <div v-else class="image-object-view__empty">
      <q-icon name="broken_image" size="28px" color="grey-5" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  object: {
    type: Object,
    required: true,
  },
})

const src = computed(() => props.object.data?.src || '')
</script>

<style lang="scss" scoped>
.image-object-view {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: repeating-conic-gradient(#f1f5f9 0% 25%, #fff 0% 50%) 50% / 16px 16px;

  &--transparent {
    background: transparent;
  }

  &__img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: fill;
    pointer-events: none;
    user-select: none;
    -webkit-user-drag: none;
  }

  &__empty {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--pe-bg);
  }
}
</style>
