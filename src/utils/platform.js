import { Capacitor } from '@capacitor/core'

/**
 * Platform helpers — keep Capacitor checks out of UI components.
 */

export function isNativePlatform() {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export function getPlatform() {
  try {
    return Capacitor.getPlatform()
  } catch {
    return 'web'
  }
}
