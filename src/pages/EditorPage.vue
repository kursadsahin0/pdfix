<template>
  <q-layout view="hHh LpR lFf" class="editor-page" tabindex="0" @keydown="onKeydown">
    <q-header class="editor-page__header" :elevated="false">
      <PdfToolbar @toggle-pages="pagesDrawerOpen = true" />
    </q-header>

    <q-drawer
      v-if="$q.screen.lt.md"
      v-model="pagesDrawerOpen"
      side="right"
      bordered
      overlay
      :width="Math.min(280, $q.screen.width - 24)"
      behavior="mobile"
    >
      <PageSidebar @page-selected="pagesDrawerOpen = false" />
    </q-drawer>

    <q-page-container class="editor-page__container">
      <q-page class="editor-page__body">
        <TextStyleToolbar />
        <DrawStyleToolbar />
        <ShapeStyleToolbar />
        <ImageStyleToolbar />
        <SignatureDialog />

        <div class="editor-page__main">
          <EditorToolbar v-if="!$q.screen.lt.md" />
          <EditorWorkspace />
          <PageSidebar v-if="!$q.screen.lt.md" />
        </div>

        <EditorBottomBar />
        <EditorToolbar v-if="$q.screen.lt.md" mobile />
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { storeToRefs } from 'pinia'
import PdfToolbar from '@/components/editor/PdfToolbar.vue'
import EditorToolbar from '@/components/editor/EditorToolbar.vue'
import EditorWorkspace from '@/components/editor/EditorWorkspace.vue'
import PageSidebar from '@/components/editor/PageSidebar.vue'
import EditorBottomBar from '@/components/editor/EditorBottomBar.vue'
import TextStyleToolbar from '@/components/editor/TextStyleToolbar.vue'
import DrawStyleToolbar from '@/components/editor/DrawStyleToolbar.vue'
import ShapeStyleToolbar from '@/components/editor/ShapeStyleToolbar.vue'
import ImageStyleToolbar from '@/components/editor/ImageStyleToolbar.vue'
import SignatureDialog from '@/components/editor/SignatureDialog.vue'
import { useEditorStore } from '@/stores/editor'

const pagesDrawerOpen = ref(false)
const editorStore = useEditorStore()
const { editingObjectId } = storeToRefs(editorStore)

function onKeydown(event) {
  if (editingObjectId.value) return

  const tag = event.target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) {
    return
  }

  const mod = event.metaKey || event.ctrlKey
  if (mod && event.key.toLowerCase() === 'z' && !event.shiftKey) {
    event.preventDefault()
    editorStore.undo()
    return
  }
  if (mod && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
    event.preventDefault()
    editorStore.redo()
    return
  }

  if (event.key === 'Delete' || event.key === 'Backspace') {
    const deleted = editorStore.deleteSelectedObject()
    if (deleted) event.preventDefault()
  }

  if (event.key === 'Escape') {
    editorStore.clearSelection()
  }
}

function onWindowKeydown(event) {
  onKeydown(event)
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown)
  void editorStore.restorePdfSession()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown)
})
</script>

<style lang="scss" scoped>
.editor-page {
  height: 100%;
  background: var(--pe-bg);
  outline: none;

  &__header {
    background: var(--pe-surface);
    color: var(--pe-text);
    box-shadow: none;
    border-bottom: none;
  }

  &__container {
    height: 100%;
  }

  &__body {
    display: flex;
    flex-direction: column;
    height: calc(100dvh - var(--pe-toolbar-height) - var(--pe-safe-top));
    min-height: 0;
    max-height: calc(100dvh - var(--pe-toolbar-height) - var(--pe-safe-top));
    overflow: hidden;
  }

  &__main {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
}

:deep(.q-drawer__content) {
  .page-sidebar {
    border-left: none;
    width: 100%;
  }
}
</style>
