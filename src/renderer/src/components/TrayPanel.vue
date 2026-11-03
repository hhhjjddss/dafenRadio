<template>
  <div class="tray-shell">
    <section class="tray-card" :style="accentVars" aria-label="DaFen Radio 播放控制">
      <button class="tray-cover" type="button" aria-label="显示主窗口" @click="openMain">
        <img v-if="state.cover && !coverBroken" :src="state.cover" alt="" @error="coverBroken = true" />
        <span v-else class="cover-fallback"><Music2 :size="22" /></span>
        <span class="cover-ring" aria-hidden="true"></span>
      </button>

      <div class="tray-body">
        <div class="tray-head">
          <span class="tray-kicker">
            <span class="eq" :class="{ live: state.playing }" aria-hidden="true"><i></i><i></i><i></i></span>
            <em>{{ state.playing ? 'NOW PLAYING' : state.hasTrack ? 'PAUSED' : 'DAFEN RADIO' }}</em>
          </span>
          <span class="tray-platform">{{ state.platform === 'soda' ? '汽水音乐' : '网易云音乐' }}</span>
        </div>
        <strong class="tray-title" :title="state.title">{{ state.title || '让音乐开始' }}</strong>
        <span class="tray-artist">{{ state.artist || (state.hasTrack ? 'DaFen Radio' : '点击封面打开主窗口') }}</span>

        <div class="tray-controls">
          <button type="button" aria-label="上一首" :disabled="!state.hasTrack" @click="control('prev')"><SkipBack :size="14" /></button>
          <button
            type="button"
            class="tray-play"
            :aria-label="state.playing ? '暂停' : '播放'"
            :disabled="!state.hasTrack"
            @click="control('toggle')"
          >
            <TransportIcon :playing="state.playing" :size="15" />
          </button>
          <button type="button" aria-label="下一首" :disabled="!state.hasTrack" @click="control('next')"><SkipForward :size="14" /></button>
          <button type="button" class="tray-open" aria-label="显示主窗口" @click="openMain"><Maximize2 :size="12" /></button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Maximize2, Music2, SkipBack, SkipForward } from '@lucide/vue'
import TransportIcon from './TransportIcon.vue'

interface TrayState {
  title: string
  artist: string
  cover: string
  playing: boolean
  hasTrack: boolean
  platform: 'netease' | 'soda'
}

const EMPTY: TrayState = { title: '', artist: '', cover: '', playing: false, hasTrack: false, platform: 'netease' }

const state = ref<TrayState>({ ...EMPTY })
const coverBroken = ref(false)
let offTrayState: (() => void) | null = null

const accentVars = computed(() => ({
  '--tray-accent': state.value.platform === 'soda' ? '#12a05a' : '#cf2e3f',
  '--tray-accent-soft': state.value.platform === 'soda' ? 'rgba(18, 160, 90, 0.16)' : 'rgba(207, 46, 63, 0.14)'
}))

watch(() => state.value.cover, () => { coverBroken.value = false })

function applyState(next: Partial<TrayState> | null) {
  state.value = { ...EMPTY, ...(next || {}) }
}

function control(action: 'prev' | 'toggle' | 'next') {
  window.api.trayControl(action)
}

function openMain() {
  window.api.trayShowMain()
}

onMounted(async () => {
  offTrayState = window.api.onTrayState(applyState)
  try {
    applyState(await window.api.trayGetState())
  } catch { /* 主进程尚未记录状态时保持空面板 */ }
})

onBeforeUnmount(() => {
  offTrayState?.()
})
</script>

<style scoped>
.tray-shell {
  width: 100%;
  height: 100%;
  padding: 8px;
  user-select: none;
  -webkit-user-select: none;
}

.tray-card {
  display: flex;
  gap: 13px;
  height: 100%;
  padding: 14px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 20px;
  background:
    radial-gradient(140% 150% at 0% 0%, var(--tray-accent-soft), transparent 56%),
    linear-gradient(150deg, rgba(255, 255, 255, 0.96), rgba(246, 242, 252, 0.9));
  box-shadow:
    0 16px 38px rgba(48, 36, 72, 0.24),
    0 2px 8px rgba(48, 36, 72, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(30px) saturate(1.25);
  -webkit-backdrop-filter: blur(30px) saturate(1.25);
}

.tray-cover {
  position: relative;
  flex: none;
  align-self: center;
  width: 92px;
  height: 92px;
  overflow: hidden;
  border-radius: 16px;
  background: linear-gradient(150deg, rgba(78, 62, 112, 0.12), rgba(78, 62, 112, 0.04));
  box-shadow: 0 8px 20px rgba(52, 38, 80, 0.22), inset 0 0 0 1px rgba(255, 255, 255, 0.5);
  transition: transform 0.28s cubic-bezier(0.34, 1.4, 0.64, 1), box-shadow 0.28s;
}

.tray-cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tray-cover:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 12px 26px rgba(52, 38, 80, 0.28), 0 0 24px var(--tray-accent-soft);
}

.cover-ring {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.28);
  pointer-events: none;
}

.cover-fallback {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: #191722;
}

.tray-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  gap: 1px;
}

.tray-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.tray-kicker {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--tray-accent);
  font: 600 8.5px/1 var(--font-mono);
  letter-spacing: 0.14em;
}

.tray-kicker em { font-style: normal; }

.eq {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 8px;
}

.eq i {
  width: 2px;
  height: 100%;
  border-radius: 1px;
  background: var(--tray-accent);
  transform: scaleY(0.3);
  transform-origin: bottom;
  opacity: 0.5;
}

.eq.live i {
  opacity: 1;
  animation: tray-eq 1.1s ease-in-out infinite;
}

.eq.live i:nth-child(2) { animation-delay: 0.18s; }
.eq.live i:nth-child(3) { animation-delay: 0.36s; }

@keyframes tray-eq {
  0%, 100% { transform: scaleY(0.3); }
  50% { transform: scaleY(1); }
}

.tray-platform {
  flex: none;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--tray-accent-soft);
  color: var(--tray-accent);
  font-size: 9px;
  letter-spacing: 0.02em;
}

.tray-title {
  overflow: hidden;
  color: var(--text-primary);
  font: 600 13.5px/1.32 var(--font-body);
  letter-spacing: 0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tray-artist {
  overflow: hidden;
  color: var(--text-muted);
  font: 400 11px/1.3 var(--font-body);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tray-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
}

.tray-controls > button {
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.66);
  box-shadow: inset 0 0 0 1px rgba(70, 55, 110, 0.1), 0 2px 6px rgba(70, 55, 110, 0.08);
  color: #191722;
  transition: color 0.18s, background 0.18s, transform 0.18s, box-shadow 0.18s;
}

.tray-controls > button:hover:not(:disabled) {
  background: #fff;
  box-shadow: inset 0 0 0 1px var(--tray-accent-soft), 0 4px 10px rgba(70, 55, 110, 0.14);
  color: var(--tray-accent);
  transform: translateY(-1px);
}

.tray-controls > button:active:not(:disabled) {
  transform: translateY(0) scale(0.96);
}

.tray-controls > button:disabled {
  opacity: 0.38;
  cursor: default;
}

.tray-controls > .tray-play {
  width: 32px;
  height: 32px;
  background: var(--tray-accent);
  box-shadow: 0 6px 14px var(--tray-accent-soft), inset 0 1px 0 rgba(255, 255, 255, 0.25);
  color: #fff;
}

.tray-controls > .tray-play:hover:not(:disabled) {
  background: color-mix(in srgb, var(--tray-accent) 88%, #000);
  color: #fff;
  transform: translateY(-1px) scale(1.03);
}

.tray-controls > .tray-open {
  width: 23px;
  height: 23px;
  margin-left: auto;
  background: transparent;
  box-shadow: none;
  color: #191722;
}

.tray-controls > .tray-open:hover:not(:disabled) {
  background: var(--tray-accent-soft);
  box-shadow: none;
  color: var(--tray-accent);
}

@media (prefers-reduced-motion: reduce) {
  .eq.live i { animation: none; }
  .tray-cover, .tray-controls > button { transition: none; }
}
</style>
