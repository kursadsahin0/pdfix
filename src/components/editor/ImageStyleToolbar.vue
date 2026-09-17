<template>
  <div v-if="visible" class="image-style-toolbar">
    <div class="image-style-toolbar__group">
      <q-icon :name="isSignature ? 'draw' : 'image'" size="20px" color="primary" />
      <span class="image-style-toolbar__title">{{ isSignature ? 'Signature' : 'Image' }}</span>
    </div>

    <div class="image-style-toolbar__group">
      <label class="image-style-toolbar__label">Rotate</label>
      <q-input
        :model-value="Math.round(rotation)"
        type="number"
        dense
        outlined
        class="image-style-toolbar__rotate"
        @update:model-value="onRotation"
      />
    </div>

    <q-btn
      v-if="isSignature"
      flat
      dense
      no-caps
      icon="gesture"
      label="Redraw"
      class="image-style-toolbar__btn"
      @click="onRedraw"
    />
    <q-btn
      v-else
      flat
      dense
      no-caps
      icon="photo_library"
      label="Replace"
      class="image-style-toolbar__btn"
      :loading="isAddingImage"
      @click="onReplace"
    />

    <div class="image-style-toolbar__spacer" />

    <q-btn
      flat
      dense
      no-caps
      color="negative"
      icon="delete"
      label="Delete"
      class="image-style-toolbar__btn"
      @click="onDelete"
    />

    <p v-if="imageError" class="image-style-toolbar__error">{{ imageError }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/stores/editor'
import { IMAGE_ACCEPT } from '@/utils/imageAsset'

const editorStore = useEditorStore()
const { selectedObject, isAddingImage, imageError } = storeToRefs(editorStore)

const visible = computed(
  () => selectedObject.value?.type === 'image' || selectedObject.value?.type === 'signature',
)
const isSignature = computed(() => selectedObject.value?.type === 'signature')
const rotation = computed(() => Number(selectedObject.value?.rotation ?? 0))

function onRotation(value) {
  if (!selectedObject.value) return
  const deg = Number(value)
  if (Number.isNaN(deg)) return
  editorStore.updateObject(selectedObject.value.id, { rotation: deg })
}

function onReplace() {
  if (!selectedObject.value || isSignature.value) return
  const id = selectedObject.value.id
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = IMAGE_ACCEPT
  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    if (!file) return
    await editorStore.replaceImageFromFile(id, file)
  })
  input.click()
}

function onRedraw() {
  if (!selectedObject.value || !isSignature.value) return
  editorStore.openSignatureDialog(selectedObject.value.id)
}

function onDelete() {
  if (!selectedObject.value) return
  editorStore.removeObject(selectedObject.value.id)
}
</script>

<style lang="scss" scoped>
.image-style-toolbar {
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

  &__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--pe-text);
  }

  &__label {
    font-size: 11px;
    font-weight: 600;
    color: var(--pe-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  &__rotate {
    width: 72px;
    background: var(--pe-bg);
    border-radius: 8px;
  }

  &__btn {
    font-weight: 500;
  }

  &__spacer {
    flex: 1;
  }

  &__error {
    width: 100%;
    margin: 0;
    font-size: 12px;
    color: #c62828;
  }
}

@media (max-width: 1023px) {
  .image-style-toolbar {
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

    &__spacer {
      display: none;
    }

    &__btn :deep(.block) {
      display: none;
    }
  }
}
</style>
