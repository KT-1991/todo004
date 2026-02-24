<script setup lang="ts">
import ListTodo from '@/components/ListTodo.vue'
</script>

<template>
  <main class="view_base">
    <ListTodo />
  </main>
</template>

<style scoped>
.view_base {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
