<template>
  <!-- 桌面歌词：独立置顶悬浮条 -->
  <div class="lyric-stage">
    <section class="lyric-card" :style="accentVars" aria-label="DaFen Radio 桌面歌词">
      <button class="lyric-cover" type="button" aria-label="显示主窗口" @click="openMain">
        <img v-if="state.cover && !coverBroken" :src="state.cover" alt="" @error="coverBroken = true" />
        <span v-else class="cover-fallback"><Music2 :size="15" /></span>
      </button>

      <div class="lyric-meta">
        <span class="lyric-title">
          <strong>{{ state.title || '让音乐开始' }}</strong>
          <i v-if="vipLabel" class="lyric-vip">{{ vipLabel }}</i>
          <em v-if="state.artist">- {{ state.artist }}</em>
        </span>
        <span class="lyric-line">
          <transition name="line-swap" mode="out-in">
            <i :key="lineText">{{ lineText }}</i>
          </transition>
        </span>
      </div>

      <div class="lyric-controls">
        <button type="button" aria-label="上一首" :disabled="!state.hasTrack" @click="control('prev')"><SkipBack :size="15" /></button>
        <button
          type="button"
          class="lyric-play"
          :aria-label="state.playing ? '暂停' : '播放'"
          :disabled="!state.hasTrack"
          @click="control('toggle')"
        >
          <TransportIcon :playing="state.playing" :size="15" />
        </button>
        <button type="button" aria-label="下一首" :disabled="!state.hasTrack" @click="control('next')"><SkipForward :size="15" /></button>
        <button
          type="button"
          class="lyric-like"
          :class="{ on: state.favorite }"
          :aria-label="state.favorite ? '取消喜欢' : '喜欢'"
          :disabled="!state.hasTrack"
          @click="control('like')"
        >
          <Heart :size="16" :fill="state.favorite ? 'currentColor' : 'none'" />
        </button>
      </div>

      <button type="button" class="lyric-close" aria-label="关闭桌面歌词" @click="hide"><X :size="10" /></button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Heart, Music2, SkipBack, SkipForward, X } from '@lucide/vue'
import TransportIcon from './TransportIcon.vue'

interface LyricBarState {
  title: string
  artist: string
  cover: string
  playing: boolean
  hasTrack: boolean
  platform: 'netease' | 'soda'
  vip: string
  lyric: string
  favorite: boolean
}

const EMPTY: LyricBarState = {
  title: '',
  artist: '',
  cover: '',
  playing: false,
  hasTrack: false,
  platform: 'netease',
  vip: '',
  lyric: '',
  favorite: false
}

const state = ref<LyricBarState>({ ...EMPTY })
const coverBroken = ref(false)
let offLyricState: (() => void) | null = null

const accentVars = computed(() => ({
  '--lyric-accent': state.value.platform === 'soda' ? '#12a05a' : '#cf2e3f',
  '--lyric-accent-soft': state.value.platform === 'soda' ? 'rgba(18, 160, 90, 0.14)' : 'rgba(207, 46, 63, 0.12)'
}))

const vipLabel = computed(() => state.value.vip === 'paid' ? '付费' : state.value.vip === 'vip' ? 'VIP' : '')

const lineText = computed(() => {
  if (!state.value.hasTrack) return '在主窗口里挑一首歌'
  if (state.value.lyric) return state.value.lyric
  return '这首歌暂时没有歌词'
})

watch(() => state.value.cover, () => { coverBroken.value = false })

function applyState(next: Partial<LyricBarState> | null) {
  state.value = { ...EMPTY, ...(next || {}) }
  // 独立窗口没有主界面的根节点状态，自己把平台强调色切过来
  const platform = state.value.platform === 'soda' ? 'soda' : 'netease'
  if (document.documentElement.dataset.platform !== platform) document.documentElement.dataset.platform = platform
}

function control(action: 'prev' | 'toggle' | 'next' | 'like') {
  window.api.lyricControl(action)
}

function openMain() {
  window.api.lyricShowMain()
}

function hide() {
  window.api.lyricHide()
}

onMounted(async () => {
  offLyricState = window.api.onLyricState(applyState)
  try {
    applyState(await window.api.lyricGetState())
  } catch { /* 主进程还没记录播放状态时保持空条 */ }
})

onBeforeUnmount(() => {
  offLyricState?.()
})
</script>

<style scoped>
.lyric-stage {
  width: 100%;
  height: 100%;
  padding: 8px 8px 6px;
  user-select: none;
  -webkit-user-select: none;
}

/* 独立窗口的 backdrop-filter 采不到桌面，玻璃只会变成全透明；这里直接用白底 */
.lyric-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  height: 100%;
  padding: 7px 9px 7px 7px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 22px;
  background: #fff;
  /* 透明窗口按窗口矩形裁投影，大投影会露出方框，收小到边距以内 */
  box-shadow:
    0 2px 6px rgba(70, 55, 110, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
  -webkit-app-region: drag;
}

.lyric-cover {
  position: relative;
  flex: none;
  width: 44px;
  height: 44px;
  overflow: hidden;
  border-radius: 12px;
  background: linear-gradient(150deg, rgba(78, 62, 112, 0.12), rgba(78, 62, 112, 0.04));
  box-shadow: 0 4px 12px rgba(52, 38, 80, 0.16), inset 0 0 0 1px rgba(255, 255, 255, 0.5);
  transition: transform 0.24s cubic-bezier(0.34, 1.4, 0.64, 1);
  -webkit-app-region: no-drag;
}

.lyric-cover:hover { transform: translateY(-1px) scale(1.03); }

.lyric-cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-fallback {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: #191722;
}

/* 中段是唯一够大的拖动区：封面和四个控件都退出拖拽，这里再不让拖条就挪不动了 */
.lyric-meta {
  display: grid;
  flex: 1;
  gap: 3px;
  min-width: 0;
  -webkit-app-region: drag;
}

.lyric-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.lyric-title strong {
  overflow: hidden;
  color: var(--text-cream);
  font: 500 12.5px/1.3 var(--font-body);
  letter-spacing: 0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lyric-title em {
  flex: none;
  overflow: hidden;
  max-width: 40%;
  color: var(--text-muted);
  font: 400 10.5px/1.3 var(--font-body);
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 会员字样按平台区分：网易云红、汽水绿 */
.lyric-vip {
  flex: none;
  padding: 0 4px;
  border: 1px solid currentColor;
  border-radius: 4px;
  background: var(--lyric-accent-soft);
  color: var(--lyric-accent);
  font: 600 8px/1.6 var(--font-mono);
  font-style: normal;
}

/* 当前歌词和播放条一样用平台强调色 */
.lyric-line {
  display: block;
  overflow: hidden;
  color: var(--lyric-accent);
  font: 500 11px/1.35 var(--font-body);
  letter-spacing: 0.04em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lyric-line i { font-style: normal; }

.lyric-controls {
  display: flex;
  align-items: center;
  flex: none;
  gap: 2px;
  -webkit-app-region: no-drag;
}

.lyric-controls > button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: #191722;
  transition: color 0.18s, background 0.18s, transform 0.18s;
}

.lyric-controls > button:hover:not(:disabled) {
  background: rgba(70, 55, 110, 0.07);
  color: #000;
}

.lyric-controls > button:active:not(:disabled) { transform: scale(0.94); }

.lyric-controls > button:disabled { opacity: 0.35; cursor: default; }

.lyric-controls > .lyric-play {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--lyric-accent);
  box-shadow: 0 5px 12px var(--lyric-accent-soft), inset 0 1px 0 rgba(255, 255, 255, 0.25);
  color: #fff;
}

.lyric-controls > .lyric-play:hover:not(:disabled) {
  background: color-mix(in srgb, var(--lyric-accent) 88%, #000);
  color: #fff;
}

.lyric-controls > .lyric-like.on { color: var(--rose); }

/* 关闭固定在卡片右上角，压在圆角上但避开下面一排按钮 */
.lyric-close {
  position: absolute;
  top: 3px;
  right: 3px;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border: 1px solid rgba(70, 55, 110, 0.08);
  border-radius: 50%;
  background: rgba(70, 55, 110, 0.06);
  color: #191722;
  transition: color 0.18s, background 0.18s;
  -webkit-app-region: no-drag;
}

.lyric-close:hover { background: rgba(70, 55, 110, 0.12); color: var(--rose); }

.line-swap-enter-active { transition: opacity 0.24s ease, transform 0.24s ease; }
.line-swap-leave-active { transition: opacity 0.16s ease, transform 0.16s ease; }
.line-swap-enter-from { opacity: 0; transform: translateY(5px); }
.line-swap-leave-to { opacity: 0; transform: translateY(-5px); }

@media (prefers-reduced-motion: reduce) {
  .lyric-cover, .lyric-controls > button, .line-swap-enter-active, .line-swap-leave-active { transition: none; }
}
</style>
