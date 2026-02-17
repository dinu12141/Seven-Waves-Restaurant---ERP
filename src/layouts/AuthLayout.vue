<template>
  <q-layout view="hHh lpR fFf" class="bg-dark auth-layout">
    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup>
// Auth layout for Login / Register / Forgot Password pages
</script>

<style scoped lang="scss">
.auth-layout {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}
</style>
