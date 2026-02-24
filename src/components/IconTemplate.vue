<template >
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    :viewBox="viewBox"
    :class="addClass"
    :stroke="color"
    :stroke-width="filled ? '0' : weight"
    :fill="filled ? color : ''">
    <slot></slot>
  </svg>
</template>

<script  setup lang="ts">

const props = defineProps({
    size: {
      type: Number,
      default: 48,
    },
    color: {
      type: String,
      default: '#000000',
    },
    weight: {
      type: Number,
      default: 16,
    },
    filled: {
      type: Boolean,
      default: false,
    },
    addClass: {
      type: String,
      default: '',
    },
    viewBox: {
      type: String,
      default: '0 0 48 48',
    },
  },
)
</script>

<style scoped>
</style>