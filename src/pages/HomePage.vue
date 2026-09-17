<template>
  <q-page class="home-page">
    <div class="home-page__content">
      <div class="home-page__hero">
        <div class="home-page__icon-wrap">
          <q-icon name="picture_as_pdf" size="40px" color="primary" />
        </div>
        <h1 class="home-page__title">PDFix</h1>
        <p class="home-page__subtitle">Edit your PDF files easily</p>
      </div>

      <div class="home-page__actions">
        <q-btn
          unelevated
          no-caps
          color="primary"
          size="lg"
          class="home-page__open-btn"
          label="Open PDF"
          icon="folder_open"
          :loading="isLoadingPdf"
          @click="openPdfPicker({ navigate: true })"
        />
      </div>

      <div
        v-if="showDropzone"
        class="home-page__dropzone"
        :class="{ 'home-page__dropzone--active': isDragging }"
        @dragenter.prevent="isDragging = true"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onDrop"
      >
        <q-icon name="upload_file" size="32px" :color="isDragging ? 'primary' : 'grey-5'" />
        <p class="home-page__dropzone-text">Drag & drop your PDF here</p>
        <p v-if="pdfError" class="home-page__error">{{ pdfError }}</p>
      </div>
      <p v-else-if="pdfError" class="home-page__error">{{ pdfError }}</p>
    </div>
  </q-page>
</template>

<script setup>
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { usePdfOpen } from '@/composables/usePdfOpen'
import { useEditorStore } from '@/stores/editor'
import { isNativePlatform } from '@/utils/platform'

const editorStore = useEditorStore()
const { isLoadingPdf, pdfError } = storeToRefs(editorStore)
const { openPdfFile, openPdfPicker } = usePdfOpen()

const isDragging = ref(false)
const showDropzone = !isNativePlatform()

async function onDrop(event) {
  isDragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  await openPdfFile(file, { navigate: true })
}
</script>

<style lang="scss" scoped>
.home-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(24px, var(--pe-safe-top)) max(24px, var(--pe-safe-right))
    max(24px, var(--pe-safe-bottom)) max(24px, var(--pe-safe-left));
  background:
    radial-gradient(ellipse at top, #e8f0fe 0%, transparent 55%),
    linear-gradient(180deg, #f8fafc 0%, var(--pe-bg) 100%);

  &__content {
    width: 100%;
    max-width: 440px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 28px;
  }

  &__hero {
    text-align: center;
  }

  &__icon-wrap {
    width: 72px;
    height: 72px;
    margin: 0 auto 20px;
    border-radius: 18px;
    background: var(--pe-surface);
    border: 1px solid var(--pe-border);
    box-shadow: var(--pe-shadow);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__title {
    margin: 0;
    font-size: clamp(28px, 6vw, 36px);
    font-weight: 700;
    letter-spacing: -0.03em;
    color: var(--pe-text);
  }

  &__subtitle {
    margin: 10px 0 0;
    font-size: 16px;
    color: var(--pe-text-muted);
    font-weight: 400;
  }

  &__actions {
    width: 100%;
    display: flex;
    justify-content: center;
  }

  &__open-btn {
    min-width: min(180px, 100%);
    width: 100%;
    max-width: 280px;
    padding: 8px 28px;
    font-weight: 600;
    border-radius: 10px;
  }

  &__dropzone {
    width: 100%;
    padding: 36px 24px;
    border: 2px dashed var(--pe-border);
    border-radius: var(--pe-radius);
    background: var(--pe-surface);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    transition:
      border-color 0.2s ease,
      background 0.2s ease;

    &--active {
      border-color: var(--pe-accent);
      background: var(--pe-accent-soft);
    }
  }

  &__dropzone-text {
    margin: 0;
    font-size: 14px;
    color: var(--pe-text-muted);
    font-weight: 500;
  }

  &__error {
    margin: 0;
    font-size: 12px;
    color: #c62828;
    text-align: center;
  }
}

@media (max-width: 599px) {
  .home-page {
    padding: max(16px, var(--pe-safe-top)) max(16px, var(--pe-safe-right))
      max(16px, var(--pe-safe-bottom)) max(16px, var(--pe-safe-left));

    &__content {
      gap: 22px;
    }

    &__icon-wrap {
      width: 64px;
      height: 64px;
      margin-bottom: 16px;
    }

    &__subtitle {
      font-size: 15px;
    }

    &__open-btn {
      max-width: none;
    }

    &__dropzone {
      padding: 24px 16px;
    }
  }
}
</style>
