import { ref } from 'vue'
import { useQuasar } from 'quasar'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/stores/editor'
import { saveFile, shareFile, DEFAULT_PDF_FILENAME } from '@/services/fileService'

/**
 * Build / save / share the edited PDF through fileService.
 */
export function usePdfExport() {
  const $q = useQuasar()
  const editorStore = useEditorStore()
  const {
    pdfFile,
    pdfDoc,
    pageOrder,
    pageLayout,
    objectsByPage,
    pdfTextByPage,
  } = storeToRefs(editorStore)

  const isExporting = ref(false)
  const isSharing = ref(false)

  /**
   * @param {unknown} error
   * @param {string} title
   */
  function notifyError(error, title = 'Export failed') {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Could not complete the PDF action. Please try again.'

    $q.dialog({
      title,
      message,
      ok: { label: 'OK', flat: true, color: 'primary' },
    })

    $q.notify({
      type: 'negative',
      message,
      position: 'top',
      timeout: 4500,
    })
  }

  function ensurePdfReady() {
    if (!pdfFile.value || !pdfDoc.value) {
      $q.notify({
        type: 'warning',
        message: 'Open a PDF before continuing.',
        position: 'top',
      })
      return false
    }
    return true
  }

  /**
   * @returns {Promise<Uint8Array>}
   */
  async function buildBytes() {
    const { buildEditedPdf } = await import('@/services/pdfExportService')
    return buildEditedPdf({
      pdfFile: pdfFile.value,
      pdfJsDoc: pdfDoc.value,
      pageOrder: [...pageOrder.value],
      rotations: { ...(pageLayout.value?.rotations ?? {}) },
      objectsByPage: objectsByPage.value,
      pdfTextByPage: pdfTextByPage.value,
    })
  }

  /**
   * Save / download the edited PDF.
   */
  async function exportPdf() {
    if (isExporting.value) return false
    if (!ensurePdfReady()) return false

    isExporting.value = true
    const dismiss = $q.notify({
      type: 'ongoing',
      message: 'Saving PDF…',
      position: 'top',
      timeout: 0,
      spinner: true,
    })

    try {
      const bytes = await buildBytes()
      const result = await saveFile({
        data: bytes,
        filename: DEFAULT_PDF_FILENAME,
        mimeType: 'application/pdf',
      })

      dismiss()
      $q.notify({
        type: 'positive',
        message:
          result.method === 'filesystem'
            ? `Saved ${result.filename}`
            : `Downloaded ${result.filename}`,
        position: 'top',
        timeout: 2500,
      })
      return true
    } catch (error) {
      console.error('PDF save failed', error)
      dismiss()
      notifyError(error, 'Save failed')
      return false
    } finally {
      isExporting.value = false
    }
  }

  /**
   * Share the edited PDF (system share sheet / Web Share API).
   */
  async function sharePdf() {
    if (isSharing.value || isExporting.value) return false
    if (!ensurePdfReady()) return false

    isSharing.value = true
    const dismiss = $q.notify({
      type: 'ongoing',
      message: 'Preparing PDF…',
      position: 'top',
      timeout: 0,
      spinner: true,
    })

    try {
      const bytes = await buildBytes()
      const result = await shareFile({
        data: bytes,
        filename: DEFAULT_PDF_FILENAME,
        mimeType: 'application/pdf',
        title: 'Share PDF',
        text: DEFAULT_PDF_FILENAME,
      })

      dismiss()
      if (result.cancelled) return false

      $q.notify({
        type: 'positive',
        message:
          result.method === 'download'
            ? `Downloaded ${result.filename}`
            : 'PDF ready to share',
        position: 'top',
        timeout: 2500,
      })
      return true
    } catch (error) {
      console.error('PDF share failed', error)
      dismiss()
      notifyError(error, 'Share failed')
      return false
    } finally {
      isSharing.value = false
    }
  }

  return {
    isExporting,
    isSharing,
    exportPdf,
    savePdf: exportPdf,
    sharePdf,
  }
}
