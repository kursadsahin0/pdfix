<template>
  <router-view />
</template>

<script setup>
import { watchEffect } from 'vue'

watchEffect(() => {
  document.title = 'PDFix'
})
</script>
