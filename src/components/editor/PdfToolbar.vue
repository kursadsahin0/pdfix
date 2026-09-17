<template>
  <header class="pdf-toolbar">
    <router-link to="/" class="pdf-toolbar__brand" aria-label="Go to home">
      <q-icon name="picture_as_pdf" size="22px" color="primary" />
      <span class="pdf-toolbar__title">PDFix</span>
    </router-link>

    <div class="pdf-toolbar__actions">
      <q-btn
        flat
        dense
        no-caps
        class="pdf-toolbar__btn"
        icon="undo"
        label="Undo"
        aria-label="Undo"
        :disable="!canUndo"
        @click="editorStore.undo()"
      >
        <q-tooltip v-if="canUndo">Undo</q-tooltip>
      </q-btn>
      <q-btn
        flat
        dense
        no-caps
        class="pdf-toolbar__btn"
        icon="redo"
        label="Redo"
        aria-label="Redo"
        :disable="!canRedo"
        @click="editorStore.redo()"
      >
        <q-tooltip v-if="canRedo">Redo</q-tooltip>
      </q-btn>

      <q-separator vertical inset class="pdf-toolbar__sep pdf-toolbar__sep--desktop" />

      <q-btn
        v-if="$q.screen.lt.md"
        flat
        dense
        no-caps
        icon="view_agenda"
        label="Pages"
        class="pdf-toolbar__btn"
        aria-label="Pages"
        @click="$emit('toggle-pages')"
      />
      <q-btn
        flat
        dense
        no-caps
        class="pdf-toolbar__btn"
        label="Open"
        icon="folder_open"
        :loading="isLoadingPdf"
        @click="openPdfPicker()"
      />
      <q-btn
        flat
        dense
        no-caps
        class="pdf-toolbar__btn"
        label="Save"
        icon="save"
        :loading="isExporting"
        :disable="!pdfDoc || isExporting || isSharing"
        @click="savePdf()"
      />
      <q-btn
        flat
        dense
        no-caps
        class="pdf-toolbar__btn"
        label="Share"
        icon="share"
        :loading="isSharing"
        :disable="!pdfDoc || isExporting || isSharing"
        @click="sharePdf()"
      />
      <q-btn
        unelevated
        dense
        no-caps
        color="primary"
        class="pdf-toolbar__btn pdf-toolbar__btn--primary"
        label="Export"
        icon="file_download"
        :loading="isExporting"
        :disable="!pdfDoc || isExporting || isSharing"
        @click="exportPdf()"
      />
    </div>
  </header>
</template>

<script setup>
import { storeToRefs } from 'pinia'
import { usePdfOpen } from '@/composables/usePdfOpen'
import { usePdfExport } from '@/composables/usePdfExport'
import { useEditorStore } from '@/stores/editor'

defineEmits(['toggle-pages'])

const editorStore = useEditorStore()
const { isLoadingPdf, canUndo, canRedo, pdfDoc } = storeToRefs(editorStore)
const { openPdfPicker } = usePdfOpen()
const { isExporting, isSharing, exportPdf, savePdf, sharePdf } = usePdfExport()
</script>

<style lang="scss" scoped>
.pdf-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: calc(var(--pe-toolbar-height) + var(--pe-safe-top));
  height: calc(var(--pe-toolbar-height) + var(--pe-safe-top));
  padding: var(--pe-safe-top) max(12px, var(--pe-safe-right)) 0 max(12px, var(--pe-safe-left));
  background: var(--pe-surface);
  border-bottom: 1px solid var(--pe-border);
  flex-shrink: 0;

  &__brand {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex-shrink: 0;
    color: inherit;
    text-decoration: none;
    cursor: pointer;
    border-radius: 8px;
    padding: 4px 6px;
    margin-left: -6px;

    &:hover {
      background: var(--pe-bg);
    }
  }

  &__title {
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.01em;
    white-space: nowrap;
  }

  &__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  &__sep {
    height: 24px;
    margin: 0 4px;
    background: var(--pe-border);
    flex-shrink: 0;
  }

  &__btn {
    font-weight: 500;
    flex-shrink: 0;

    &--primary {
      margin-left: 2px;
    }
  }
}

@media (max-width: 1023px) {
  .pdf-toolbar {
    &__sep--desktop {
      display: none;
    }

    &__btn :deep(.q-btn__content) {
      .q-icon {
        margin-right: 0;
      }

      .block {
        display: none;
      }
    }
  }
}

@media (max-width: 599px) {
  .pdf-toolbar {
    padding-right: max(6px, var(--pe-safe-right));
    padding-left: max(6px, var(--pe-safe-left));
    gap: 4px;

    &__title {
      font-size: 15px;
    }

    &__brand {
      padding: 4px;
      margin-left: -4px;
    }
  }
}

@media (max-width: 359px) {
  .pdf-toolbar__title {
    display: none;
  }
}
</style>
