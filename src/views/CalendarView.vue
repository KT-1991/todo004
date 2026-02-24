<script setup lang="ts">
import CalendarTodo from '@/components/CalendarTodo.vue'
</script>

<template>
  <main class="view_base">
    <CalendarTodo />
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
