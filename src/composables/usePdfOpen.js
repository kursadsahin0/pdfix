import { useRouter } from 'vue-router'
import { useEditorStore } from '@/stores/editor'
import { openFile } from '@/services/fileService'

/**
 * Shared PDF file open helpers for Home + toolbar.
 */
export function usePdfOpen() {
  const editorStore = useEditorStore()
  const router = useRouter()

  /**
   * @param {File} file
   * @param {{ navigate?: boolean }} [options]
   */
  async function openPdfFile(file, options = {}) {
    const ok = await editorStore.loadPdfFile(file)
    if (ok && options.navigate) {
      await router.push('/editor')
    }
    return ok
  }

  /**
   * @param {{ navigate?: boolean }} [options]
   */
  async function openPdfPicker(options = {}) {
    const picked = await openFile({ accept: 'application/pdf,.pdf' })
    if (!picked?.file) return false
    return openPdfFile(picked.file, options)
  }

  return {
    openPdfFile,
    openPdfPicker,
  }
}
