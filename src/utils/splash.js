/**
 * Hide the HTML splash overlay and the native Capacitor splash (when present).
 */

const SPLASH_ID = 'pdfix-splash'
const HIDE_CLASS = 'pdfix-splash--hide'
const REMOVE_MS = 420

export function hideAppSplash() {
  const el = typeof document !== 'undefined' ? document.getElementById(SPLASH_ID) : null
  if (el && !el.classList.contains(HIDE_CLASS)) {
    el.classList.add(HIDE_CLASS)
    window.setTimeout(() => {
      el.remove()
    }, REMOVE_MS)
  }

  void hideNativeSplash()
}

async function hideNativeSplash() {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return
    const { SplashScreen } = await import('@capacitor/splash-screen')
    await SplashScreen.hide({ fadeOutDuration: 280 })
  } catch (error) {
    console.warn('Native splash hide skipped', error)
  }
}
