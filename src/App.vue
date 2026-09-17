<template>
  <router-view />
</template>

<script setup>
import { onMounted, watchEffect } from 'vue'
import { hideAppSplash } from '@/utils/splash'

watchEffect(() => {
  document.title = 'PDFix'
})

onMounted(() => {
  // Let the first paint settle, then fade splash (web + native).
  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      hideAppSplash()
    }, 280)
  })
})
</script>
