import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { App } from '@capacitor/app'

/**
 * Capacitor native shell bootstrap (no-op on web).
 * Native splash is shown by the OS / Capacitor (launchAutoHide: false)
 * and dismissed from App.vue via hideAppSplash().
 */
export default async () => {
  if (!Capacitor.isNativePlatform()) return

  try {
    await StatusBar.setStyle({ style: Style.Light })
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#f4f6f8' })
    }
  } catch (error) {
    console.warn('StatusBar setup skipped', error)
  }

  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back()
    } else {
      App.exitApp()
    }
  })
}
