<template>
  <span class="karaoke-line">
    <span
      v-for="(word, index) in words"
      :key="index"
      class="lyric-word"
      :style="wordStyle(word)"
    ><span class="word-ink">{{ word.text }}</span><span class="word-sung" aria-hidden="true">{{ word.text }}</span></span>
  </span>
</template>

<script setup lang="ts">
import { inject, type Ref } from 'vue'

interface KaraokeWord {
  time: number
  duration: number
  text: string
}

defineProps<{ words: KaraokeWord[] }>()

// 时钟以 ref 注入：只有这一行歌词随 30Hz 时钟重渲染，父组件不会每帧 diff
const clock = inject<Ref<number>>('lyric-clock')!

function wordStyle(word: KaraokeWord) {
  const sung = clock.value - word.time
  const progress = word.duration > 0 ? sung / word.duration : (sung >= 0 ? 1 : 0)
  return { '--fill': `${(Math.max(0, Math.min(1, progress)) * 100).toFixed(1)}%` }
}
</script>

<style scoped>
/* 底色与已唱色都走实色文字，只有进度用 clip-path 几何裁切：
   不再用 background-clip: text，避免渐变字在 Windows 上发虚 */
.karaoke-line { white-space: pre-wrap; }
.lyric-word {
  position: relative;
  display: inline-block;
  color: rgba(43, 39, 56, 0.38);
}
.word-sung {
  position: absolute;
  inset: 0;
  color: var(--amber);
  clip-path: inset(0 calc(100% - var(--fill, 0%)) 0 0);
  pointer-events: none;
  white-space: pre;
}
</style>
