const DB_NAME = 'pdf-duzen-session'
const DB_VERSION = 1
const STORE_NAME = 'pdf'
const RECORD_KEY = 'current'

/**
 * @returns {Promise<IDBDatabase>}
 */
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })
}

/**
 * Persist the opened PDF so a browser refresh can restore it.
 * @param {File} file
 */
export async function savePdfSession(file) {
  if (!file || typeof indexedDB === 'undefined') return

  const buffer = await file.arrayBuffer()
  const db = await openDb()

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'))
    tx.objectStore(STORE_NAME).put(
      {
        name: file.name || 'document.pdf',
        type: file.type || 'application/pdf',
        lastModified: file.lastModified || Date.now(),
        data: buffer,
      },
      RECORD_KEY,
    )
  })

  db.close()
}

/**
 * @returns {Promise<File | null>}
 */
export async function loadPdfSession() {
  if (typeof indexedDB === 'undefined') return null

  const db = await openDb()

  /** @type {{ name: string, type: string, lastModified: number, data: ArrayBuffer } | undefined} */
  const record = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB read failed'))
    const request = tx.objectStore(STORE_NAME).get(RECORD_KEY)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB get failed'))
  })

  db.close()

  if (!record?.data) return null

  return new File([record.data], record.name || 'document.pdf', {
    type: record.type || 'application/pdf',
    lastModified: record.lastModified || Date.now(),
  })
}

export async function clearPdfSession() {
  if (typeof indexedDB === 'undefined') return

  const db = await openDb()

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB clear failed'))
    tx.objectStore(STORE_NAME).delete(RECORD_KEY)
  })

  db.close()
}
