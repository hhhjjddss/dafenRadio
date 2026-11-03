<template>
  <!-- 右侧播放队列：当前播放列表 + 下一首预览 -->
  <aside class="queue-panel">
    <header class="queue-head">
      <p class="queue-title">当前播放 <span class="mono">({{ tracks.length }})</span></p>
    </header>

    <div class="queue-list" v-if="tracks.length">
      <button
        v-for="(track, index) in tracks"
        :key="track.songmid + index"
        class="queue-item"
        :class="{ current: index === currentIndex }"
        @click="emit('play', index)"
      >
        <span class="item-cover">
          <img v-if="track.img" :src="track.img" alt="" loading="lazy" @error="fallbackCoverOnError" />
          <Music2 v-else :size="13" />
          <span v-if="index === currentIndex && playing" class="item-live" aria-hidden="true"><AudioLines :size="17" /></span>
        </span>
        <span class="item-copy">
          <span class="item-title">
            <strong>{{ track.name }}</strong>
            <i v-if="track.vip" class="vip-tag" :class="track.vip">{{ track.vip === 'paid' ? '付费' : 'VIP' }}</i>
          </span>
          <small>{{ track.singer }}</small>
        </span>
        <span class="item-tail">
          <span v-if="track.duration" class="item-duration mono">{{ formatDuration(track.duration) }}</span>
          <span class="item-arrow"><ChevronRight :size="14" /></span>
        </span>
      </button>
    </div>

    <div class="queue-empty" v-else>
      <Music2 :size="26" />
      <p>播放队列还是空的<br />选一首歌，旅程由此开始</p>
    </div>

    <button class="up-next" v-if="nextTrack" @click="emit('play', nextIndex)">
      <span class="next-cover"><img v-if="nextTrack.img" :src="nextTrack.img" alt="" @error="fallbackCoverOnError" /></span>
      <span class="next-copy">
        <small>下一首播放</small>
        <span class="item-title">
          <strong>{{ nextTrack.name }}</strong>
          <i v-if="nextTrack.vip" class="vip-tag" :class="nextTrack.vip">{{ nextTrack.vip === 'paid' ? '付费' : 'VIP' }}</i>
        </span>
        <em>{{ nextTrack.singer }}</em>
      </span>
    </button>
  </aside>
</template>

<script setup lang="ts">
import type { MusicInfo } from '../composables/useNetease'
import { AudioLines, ChevronRight, Music2 } from '@lucide/vue'
import { fallbackCoverOnError } from '../utils/cover'

defineProps<{
  tracks: MusicInfo[]
  currentIndex: number
  nextTrack: MusicInfo | null
  nextIndex: number
  playing: boolean
}>()

const emit = defineEmits<{ (e: 'play', index: number): void }>()

// MusicInfo.duration 由主进程换算成秒
function formatDuration(duration?: number) {
  if (!duration) return ''
  const total = Math.round(duration)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
</script>

<style scoped>
.queue-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}

.queue-head {
  padding: 0 6px;
}

.queue-title {
  color: var(--text-secondary);
  font-size: 12px;
  letter-spacing: 0.08em;
}

.queue-title .mono {
  color: var(--text-ghost);
  font-size: 10px;
}

.queue-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 6px;
  margin: 0 -6px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.queue-list::-webkit-scrollbar { display: none; }

.queue-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border-radius: var(--r-md);
  text-align: left;
  transition: background var(--t-fast);
}

.queue-item:hover {
  background: var(--glass-bg-hover);
}

.queue-item.current {
  background: var(--amber-glass);
}

.item-cover {
  position: relative;
  width: 38px;
  height: 38px;
  flex: none;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 10px;
  background: var(--bg-elevated);
  color: #191722;
  font-size: 13px;
}

.item-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.item-live {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(43, 39, 56, 0.36);
  color: #fff;
}

.item-live svg {
  animation: live-breathe 1.8s ease-in-out infinite;
}

@keyframes live-breathe {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .item-live svg { animation: none; }
}

.item-copy {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 3px;
}

.item-title {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.item-copy strong {
  min-width: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vip-tag {
  flex: none;
  padding: 0 4px;
  border-radius: 4px;
  font: 600 8px/1.6 var(--font-mono);
  font-style: normal;
  letter-spacing: 0.02em;
}

.vip-tag.vip { color: #a9770c; border: 1px solid rgba(169, 119, 12, 0.35); background: rgba(212, 168, 83, 0.14); }
.vip-tag.paid { color: var(--copper); border: 1px solid rgba(185, 98, 120, 0.32); background: rgba(185, 98, 120, 0.1); }

.item-copy small {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-item.current .item-copy strong {
  color: var(--amber-bright);
}

.item-tail {
  position: relative;
  flex: none;
  width: 34px;
  display: grid;
  place-items: center;
}

.item-duration {
  color: var(--text-ghost);
  font-size: 10px;
  letter-spacing: 0;
  transition: opacity var(--t-fast);
}

.item-arrow {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #191722;
  font-size: 14px;
  opacity: 0;
  transition: opacity var(--t-fast);
}

.queue-item:hover .item-arrow {
  opacity: 1;
}

.queue-item:hover .item-duration {
  opacity: 0;
}

.queue-empty {
  flex: 1;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 12px;
  border: 1px dashed var(--border-warm);
  border-radius: var(--r-lg);
  text-align: center;
}

.queue-empty > svg {
  color: #191722;
}

.queue-empty p {
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.9;
}

.up-next {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--glass-border);
  border-radius: var(--r-lg);
  background: var(--glass-bg);
  backdrop-filter: blur(var(--blur-glass));
  -webkit-backdrop-filter: blur(var(--blur-glass));
  text-align: left;
  transition: border-color var(--t-fast), background var(--t-fast);
}

.up-next:hover {
  border-color: var(--glass-border-hover);
  background: var(--glass-bg-hover);
}

.next-cover {
  width: 46px;
  height: 46px;
  flex: none;
  overflow: hidden;
  border-radius: 10px;
  background: var(--bg-elevated);
}

.next-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.next-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.next-copy small {
  color: var(--text-ghost);
  font-size: 9px;
  letter-spacing: 0.14em;
}

.next-copy strong {
  min-width: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.next-copy em {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 10px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
