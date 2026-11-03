<template>
  <svg
    :key="playing ? 'pause' : 'play'"
    class="transport-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <g v-if="playing" fill="currentColor">
      <rect x="6.2" y="3.4" width="4.6" height="17.2" rx="2.3" />
      <rect x="13.2" y="3.4" width="4.6" height="17.2" rx="2.3" />
    </g>
    <path
      v-else
      fill="currentColor"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linejoin="round"
      d="M7 6.05c0-1.35 1.46-2.19 2.62-1.5l9.9 5.85a1.73 1.73 0 0 1 0 2.99l-9.9 5.86A1.73 1.73 0 0 1 7 17.75V6.05Z"
    />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ playing: boolean; size?: number }>(), { size: 18 })
</script>

<style scoped>
.transport-icon {
  display: block;
  transform-origin: 50% 50%;
  animation: transport-glyph-in 0.18s ease-out;
}
@keyframes transport-glyph-in {
  from {
    opacity: 0.2;
    transform: scale(0.82);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .transport-icon {
    animation: none;
  }
}
</style>
