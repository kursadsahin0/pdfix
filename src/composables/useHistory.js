import { computed, ref } from 'vue'

/**
 * Generic undo/redo stack for editor state snapshots.
 * Does not store PDF binaries — only lightweight serializable state.
 *
 * @template T
 * @param {{ maxSize?: number }} [options]
 */
export function createHistory(options = {}) {
  const maxSize = Math.max(1, options.maxSize ?? 50)

  /** @type {import('vue').Ref<Array<{ state: T, label: string, at: number, coalesceKey: string | null }>>} */
  const undoStack = ref([])
  /** @type {import('vue').Ref<Array<{ state: T, label: string, at: number, coalesceKey: string | null }>>} */
  const redoStack = ref([])

  let paused = false
  /** @type {string | null} */
  let activeCoalesceKey = null

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)
  const undoLabel = computed(() => undoStack.value.at(-1)?.label ?? '')
  const redoLabel = computed(() => redoStack.value.at(-1)?.label ?? '')

  function clear() {
    undoStack.value = []
    redoStack.value = []
    activeCoalesceKey = null
  }

  function pause() {
    paused = true
  }

  function resume() {
    paused = false
  }

  /**
   * Push a snapshot that undo can restore to.
   * Call this BEFORE applying the upcoming change.
   *
   * @param {T} snapshot
   * @param {{ label?: string, coalesceKey?: string | null }} [meta]
   */
  function push(snapshot, meta = {}) {
    if (paused) return false

    const coalesceKey = meta.coalesceKey ?? null
    if (coalesceKey && activeCoalesceKey === coalesceKey && undoStack.value.length > 0) {
      // Keep the earliest before-state for this coalesced action (e.g. typing)
      return false
    }

    activeCoalesceKey = coalesceKey
    undoStack.value.push({
      state: snapshot,
      label: meta.label ?? '',
      at: Date.now(),
      coalesceKey,
    })

    while (undoStack.value.length > maxSize) {
      undoStack.value.shift()
    }

    redoStack.value = []
    return true
  }

  /**
   * End a coalesced sequence so the next edit starts a new history entry.
   */
  function endCoalesce() {
    activeCoalesceKey = null
  }

  /**
   * @param {() => T} getCurrent
   * @param {(state: T) => void} restore
   */
  function undo(getCurrent, restore) {
    if (!undoStack.value.length) return false

    const entry = undoStack.value.pop()
    if (!entry) return false

    redoStack.value.push({
      state: getCurrent(),
      label: entry.label,
      at: Date.now(),
      coalesceKey: null,
    })
    activeCoalesceKey = null

    paused = true
    try {
      restore(entry.state)
    } finally {
      paused = false
    }

    return true
  }

  /**
   * @param {() => T} getCurrent
   * @param {(state: T) => void} restore
   */
  function redo(getCurrent, restore) {
    if (!redoStack.value.length) return false

    const entry = redoStack.value.pop()
    if (!entry) return false

    undoStack.value.push({
      state: getCurrent(),
      label: entry.label,
      at: Date.now(),
      coalesceKey: null,
    })
    activeCoalesceKey = null

    paused = true
    try {
      restore(entry.state)
    } finally {
      paused = false
    }

    return true
  }

  return {
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    push,
    undo,
    redo,
    clear,
    pause,
    resume,
    endCoalesce,
  }
}

/**
 * Vue composable wrapper around {@link createHistory}.
 * Prefer store-owned history for the editor; this export is for reuse.
 *
 * @template T
 * @param {{ maxSize?: number }} [options]
 */
export function useHistory(options) {
  return createHistory(options)
}
