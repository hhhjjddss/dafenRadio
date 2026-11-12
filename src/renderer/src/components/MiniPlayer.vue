<template>
  <!-- 悬浮迷你播放条：封面转动 + 动态歌词 + 紧凑控制 -->
  <div class="mini-player" ref="rootEl">
    <button class="mini-cover" aria-label="进入播放页" @click="emit('open-lyrics')">
      <span class="cover-disc" :class="{ spinning: spinActive }">
        <svg v-if="!coverUrl || coverBroken" class="disc-fallback" viewBox="0 0 48 48" aria-hidden="true">
          <defs>
            <radialGradient id="vinyl-body" cx="33%" cy="27%" r="85%">
              <stop offset="0%" stop-color="#5a5078" />
              <stop offset="45%" stop-color="#2a2340" />
              <stop offset="100%" stop-color="#14101e" />
            </radialGradient>
            <linearGradient id="vinyl-sheen" x1="10%" y1="0%" x2="90%" y2="100%">
              <stop offset="0%" stop-color="#fff" stop-opacity=".18" />
              <stop offset="45%" stop-color="#fff" stop-opacity="0" />
              <stop offset="100%" stop-color="#fff" stop-opacity=".07" />
            </linearGradient>
          </defs>
          <circle cx="24" cy="24" r="23" fill="url(#vinyl-body)" />
          <g fill="none" stroke="#fff">
            <circle cx="24" cy="24" r="18.5" stroke-opacity=".07" />
            <circle cx="24" cy="24" r="15.5" stroke-opacity=".05" />
            <circle cx="24" cy="24" r="12.5" stroke-opacity=".04" />
            <circle cx="24" cy="24" r="20.5" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="24 104.8" transform="rotate(-135 24 24)" stroke-opacity=".4" />
          </g>
          <circle cx="24" cy="24" r="23" fill="url(#vinyl-sheen)" />
          <circle class="vinyl-label" cx="24" cy="24" r="7" />
          <path class="vinyl-print" d="M20.6 21.3h3.6" stroke-width="1.2" stroke-linecap="round" />
          <circle class="vinyl-hole" cx="24" cy="24" r="1.7" />
        </svg>
        <template v-else>
          <img class="disc-label" :src="coverUrl" alt="" @error="coverBroken = true" />
          <span class="disc-hole" aria-hidden="true"></span>
        </template>
      </span>
      <span class="cover-hint">进入播放页</span>
    </button>

    <div class="mini-meta">
      <div class="mini-identity">
        <div class="meta-line">
          <span class="mini-title-clip" ref="titleClipEl">
            <strong
              :key="track?.name || ''"
              ref="titleEl"
              class="mini-title"
              :class="{ scrolling: titleScroll !== null, held: titleScroll !== null && !playing }"
              :style="titleStyle"
            ><span class="title-seg">{{ track?.name || '让音乐开始' }}</span><span v-if="titleScroll !== null" class="title-seg" aria-hidden="true">{{ track?.name || '让音乐开始' }}</span></strong>
          </span>
          <i v-if="track?.vip" class="vip-tag" :class="track.vip">{{ track.vip === 'paid' ? '付费' : 'VIP' }}</i>
        </div>
        <small class="mini-artist">{{ track?.singer || '挑一首喜欢的歌' }}</small>
      </div>
      <div class="mini-lyric">
        <p class="lyric-current" ref="lyricEl">{{ currentLyric }}</p>
        <p class="lyric-next" v-if="nextLyric">{{ nextLyric }}</p>
      </div>
    </div>

    <div class="mini-right">
      <div class="mini-progress">
        <span class="mono">{{ formatTime(currentTime) }}</span>
        <div class="progress-track">
          <input
            aria-label="播放进度"
            type="range"
            min="0"
            :max="duration || 100"
            step="0.5"
            :value="currentTime"
            :style="{ '--progress': progressPercent + '%' }"
            @input="onSeek"
          />
          <i v-if="trialPercent" class="trial-mark" :style="{ left: trialPercent + '%' }" aria-hidden="true"></i>
        </div>
        <span class="mono">{{ formatTime(duration) }}</span>
      </div>
      <div class="mini-controls">
        <button class="ctl tip-up" :data-tip="modeTitle" :aria-label="modeTitle" @click="emit('cycle-mode')"><component :is="modeIconComponent" :size="16" /></button>
        <button class="ctl tip-up" :class="{ loved: favorite }" :data-tip="favorite ? '取消喜欢' : '喜欢'" aria-label="收藏" @click="emit('toggle-favorite')"><Heart :size="15" :fill="favorite ? 'currentColor' : 'none'" /></button>
        <button class="ctl lyric-toggle tip-up" :class="{ on: lyricOn }" :data-tip="lyricOn ? '关闭桌面歌词' : '桌面歌词'" aria-label="桌面歌词" @click="emit('toggle-lyric')"><Subtitles :size="17" /></button>
        <button class="ctl skip tip-up" data-tip="上一首" aria-label="上一首" @click="emit('prev')"><SkipBack :size="16" /></button>
        <button class="ctl play tip-up" :data-tip="playing ? '暂停' : '播放'" :aria-label="playing ? '暂停' : '播放'" @click="emit('toggle-play')">
          <TransportIcon :playing="playing" :size="17" />
        </button>
        <button class="ctl skip tip-up" data-tip="下一首" aria-label="下一首" @click="emit('next')"><SkipForward :size="16" /></button>
        <div
          class="volume-wrap"
          @mouseenter="openVolume"
          @mouseleave="scheduleCloseVolume"
          @focusin="openVolume"
          @focusout="scheduleCloseVolume"
          @wheel.prevent="onVolumeWheel"
        >
          <button ref="volumeBtnEl" class="ctl" aria-label="静音" @click="emit('mute')">
            <Volume2 v-if="volume > 0" :size="15" />
            <VolumeX v-else :size="15" />
          </button>
        </div>
        <button class="ctl tip-up" :class="{ on: queueOpen }" data-tip="队列" aria-label="播放队列" @click="emit('toggle-queue')"><ListMusic :size="15" /></button>
        <button
          class="ctl recommend-btn tip-up"
          :class="{ loading: recommendLoading, on: recommendActive }"
          :data-tip="recommendTitle"
          :aria-label="recommendTitle"
          :disabled="recommendLoading"
          @click="emit('recommend')"
        >
          <Sparkles :size="15" />
        </button>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div
      class="volume-pop"
      :class="{ open: volumeOpen }"
      :style="volumeStyle"
      @mouseenter="openVolume"
      @mouseleave="scheduleCloseVolume"
      @focusin="openVolume"
      @focusout="scheduleCloseVolume"
      @wheel.prevent="onVolumeWheel"
    >
      <span class="volume-value mono">{{ volumePercent }}%</span>
      <input
        aria-label="音量"
        type="range"
        min="0"
        max="100"
        step="1"
        :value="volumePercent"
        :style="{ '--vol': volumePercent + '%' }"
        @input="onVolume"
        @pointerdown="volumeDragging = true"
        @change="volumeDragging = false"
      />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import gsap from 'gsap'
import type { MusicInfo } from '../composables/useNetease'
import type { PlayMode } from '../composables/usePlayer'
import { Heart, ListMusic, ListOrdered, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Sparkles, Subtitles, Volume2, VolumeX } from '@lucide/vue'
import TransportIcon from './TransportIcon.vue'

const props = defineProps<{
  track: MusicInfo | null
  coverUrl: string
  playing: boolean
  currentTime: number
  duration: number
  trialLimit: number
  currentLyric: string
  nextLyric: string
  favorite: boolean
  lyricOn: boolean
  volume: number
  queueOpen: boolean
  mode: PlayMode
  modeTitle: string
  recommendTitle: string
  recommendLoading: boolean
  recommendActive: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle-play'): void
  (e: 'prev'): void
  (e: 'next'): void
  (e: 'seek', time: number): void
  (e: 'toggle-favorite'): void
  (e: 'toggle-lyric'): void
  (e: 'open-lyrics'): void
  (e: 'toggle-queue'): void
  (e: 'cycle-mode'): void
  (e: 'recommend'): void
  (e: 'mute'): void
  (e: 'volume', value: number): void
}>()

const modeIconComponent = computed(() => {
  if (props.mode === 'shuffle') return Shuffle
  if (props.mode === 'repeat-one') return Repeat1
  if (props.mode === 'repeat-all') return Repeat
  return ListOrdered
})

const rootEl = ref<HTMLElement | null>(null)
const lyricEl = ref<HTMLElement | null>(null)
// 唱片用纯 CSS 匀速转，不经过 GSAP，也不做 3D；只在播放中转，暂停即停，系统要求减少动态时永不转
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const spinActive = computed(() => props.playing && !reduceMotion)
let entrance: gsap.core.Timeline | null = null

const progressPercent = computed(() => props.duration ? Math.min(100, props.currentTime / props.duration * 100) : 0)
// VIP 试听：在进度条上标出片段截止点（汽水为 1:00），时长仍显示原曲长
const trialPercent = computed(() => {
  if (!props.trialLimit || !props.duration) return 0
  const percent = props.trialLimit / props.duration * 100
  return percent > 0 && percent < 99.5 ? percent : 0
})
const volumePercent = computed(() => Math.round(props.volume * 100))

// 歌名放不下时单向循环滚动（无缝跑马灯），而不是来回折返
const TITLE_SEG_GAP = 30
const titleClipEl = ref<HTMLElement | null>(null)
const titleEl = ref<HTMLElement | null>(null)
const titleScroll = ref<{ duration: number } | null>(null)
const titleStyle = computed(() => titleScroll.value ? {
  '--title-duration': `${titleScroll.value.duration}s`
} : {})

function measureTitle() {
  const clip = titleClipEl.value
  const el = titleEl.value
  if (!clip || !el) { titleScroll.value = null; return }
  const seg = el.querySelector<HTMLElement>('.title-seg')
  const segWidth = seg ? seg.getBoundingClientRect().width : el.scrollWidth
  const overflow = segWidth + TITLE_SEG_GAP - clip.clientWidth
  if (reduceMotion || overflow <= 2) { titleScroll.value = null; return }
  titleScroll.value = {
    duration: Math.min(12, Math.max(4, 3 + overflow / 22))
  }
}

function onVolume(event: Event) {
  emit('volume', Number((event.target as HTMLInputElement).value) / 100)
}

function onVolumeWheel(event: WheelEvent) {
  if (!event.deltaY) return
  const step = event.deltaY < 0 ? 0.05 : -0.05
  const next = Math.round(Math.min(1, Math.max(0, props.volume + step)) * 100) / 100
  if (next !== props.volume) emit('volume', next)
}

// 音量面板挂在 body 上，避免受播放条 backdrop-filter 的隔离影响，玻璃采样与播放条一致
const volumeOpen = ref(false)
const volumeDragging = ref(false)
const volumeBtnEl = ref<HTMLElement | null>(null)
const volumeStyle = ref<Record<string, string>>({})
let volumeCloseTimer: number | null = null

function openVolume() {
  if (volumeCloseTimer !== null) {
    window.clearTimeout(volumeCloseTimer)
    volumeCloseTimer = null
  }
  const rect = volumeBtnEl.value?.getBoundingClientRect()
  if (rect) {
    volumeStyle.value = {
      left: `${rect.left + rect.width / 2}px`,
      bottom: `${window.innerHeight - rect.top + 14}px`
    }
  }
  volumeOpen.value = true
}

function scheduleCloseVolume() {
  if (volumeDragging.value) return
  if (volumeCloseTimer !== null) window.clearTimeout(volumeCloseTimer)
  volumeCloseTimer = window.setTimeout(() => { volumeOpen.value = false }, 160)
}

function handleVolumeResize() {
  if (volumeOpen.value) openVolume()
  measureTitle()
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

function onSeek(event: Event) {
  emit('seek', Number((event.target as HTMLInputElement).value))
}

// 切换平台或未登录时旧封面链接会失效，退回唱片占位而不是破图
const coverBroken = ref(false)

function enter() {
  if (reduceMotion || !rootEl.value) return
  entrance?.kill()
  entrance = gsap.timeline({ defaults: { ease: 'power3.out' } })
  // 动画收尾必须清掉 transform：残留的 scale/translate 会让合成层里的文字被重采样发虚
  entrance.fromTo(rootEl.value, { autoAlpha: 0, y: 30, scale: 0.98 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.7, clearProps: 'transform' })
  entrance.fromTo('.mini-cover', { autoAlpha: 0, scale: 0.7 }, { autoAlpha: 1, scale: 1, duration: 0.55, clearProps: 'transform' }, '-=0.45')
  entrance.fromTo('.mini-meta > *', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.4, stagger: 0.05, clearProps: 'transform' }, '-=0.5')
  entrance.fromTo('.mini-right', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.4, clearProps: 'transform' }, '-=0.45')
}

onMounted(async () => {
  window.addEventListener('resize', handleVolumeResize)
  await nextTick()
  measureTitle()
})

watch(() => props.coverUrl, () => {
  coverBroken.value = false
})
watch(() => props.track?.name, async () => {
  titleScroll.value = null
  await nextTick()
  measureTitle()
})
watch(() => props.currentLyric, async () => {
  if (reduceMotion || !lyricEl.value) return
  gsap.fromTo(lyricEl.value, { autoAlpha: 0, y: 7, filter: 'blur(4px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.45, ease: 'power2.out', overwrite: 'auto', clearProps: 'filter,transform' })
})

onBeforeUnmount(() => {
  entrance?.kill()
  window.removeEventListener('resize', handleVolumeResize)
  if (volumeCloseTimer !== null) window.clearTimeout(volumeCloseTimer)
})

defineExpose({ enter })
</script>

<style scoped>
/* 相对整个窗口水平居中（fixed + 左右撑满 + margin auto，不依赖 transform） */
.mini-player {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 16px;
  /* 歌单展开层是 40，播放条要浮在它上面，详情页里才看得见、点得到 */
  z-index: 45;
  width: min(640px, calc(100vw - 48px));
  margin-inline: auto;
  display: grid;
  /* 中列只放宽一点点给歌词，右列仍保持完整 */
  grid-template-columns: 54px 276px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 10px 14px 10px 10px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.34);
  box-shadow:
    0 18px 44px rgba(70, 55, 110, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(34px) saturate(1.35);
  -webkit-backdrop-filter: blur(34px) saturate(1.35);
}

/* ---- 封面 ---- */
.mini-cover {
  position: relative;
  width: 54px;
  height: 54px;
  z-index: 1;
}
.cover-disc {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 50%;
  background:
    repeating-radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.06) 0 1px, transparent 1px 3px),
    radial-gradient(circle at 34% 27%, #514969 0%, #2a2340 44%, #14101e 100%);
  box-shadow: 0 3px 12px rgba(70, 55, 110, 0.16);
  animation: disc-spin 8s linear infinite;
  animation-play-state: paused;
}
/* 固定高光压在转动的唱片上，转动方向更容易看出来 */
.mini-cover::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 24%, rgba(255, 255, 255, 0.22), transparent 52%);
  pointer-events: none;
}
.cover-disc.spinning { animation-play-state: running; }
@keyframes disc-spin {
  to { transform: rotate(360deg); }
}
.disc-label {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 60%;
  height: 60%;
  border-radius: 50%;
  object-fit: cover;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.16);
}
.disc-hole {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #14101e;
  box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.16);
  transform: translate(-50%, -50%);
}
.disc-fallback { display: block; width: 100%; height: 100%; }
.vinyl-label { fill: var(--amber); }
.vinyl-hole { fill: #1a1526; }
.vinyl-print { fill: none; stroke: rgba(30, 22, 10, 0.45); }
.cover-hint {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 10px);
  padding: 5px 9px;
  border-radius: 8px;
  border: 1px solid var(--glass-border);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: var(--shadow-glass);
  color: var(--text-secondary);
  font-size: 9.5px;
  letter-spacing: 0.08em;
  white-space: nowrap;
  opacity: 0;
  transform: translate(-50%, 4px);
  transition: opacity var(--t-fast), transform var(--t-fast);
  pointer-events: none;
}
.mini-cover:hover .cover-hint { opacity: 1; transform: translate(-50%, 0); }
.mini-cover:hover .cover-disc { box-shadow: 0 0 0 1px var(--amber-border), 0 0 22px var(--accent-live-glow); }

/* ---- 信息与歌词 ---- */
/* 左半边放歌名/歌手，右半边原来空着，现在让歌词填满 */
.mini-meta {
  position: relative;
  z-index: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 92px) minmax(0, 1fr);
  align-items: center;
  column-gap: 8px;
}
.mini-identity { min-width: 0; display: grid; gap: 2px; }
.meta-line { display: flex; align-items: center; gap: 6px; min-width: 0; }
.mini-title-clip { flex: 1; min-width: 0; overflow: hidden; }
.mini-title {
  display: block;
  width: 100%;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 单向无缝跑马灯：内容渲染两份并整体左移一半，滚完即回到起点，不折返 */
.mini-title.scrolling {
  display: inline-flex;
  width: max-content;
  overflow: visible;
  text-overflow: clip;
  animation: title-marquee var(--title-duration, 8s) linear 0.8s infinite;
}
.title-seg { flex: none; padding-right: 30px; }
/* 暂停时歌名停在原处，没必要继续跑 */
.mini-title.held { animation-play-state: paused; }
@keyframes title-marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
.mini-artist {
  overflow: hidden;
  color: var(--text-warm);
  font-size: 11.5px;
  font-weight: 500;
  /* 小字号 + 亚像素字距会让笔画落在半像素上，中文看起来断断续续，这里收紧为 0 */
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vip-tag {
  flex: none;
  padding: 0 4px;
  border-radius: 4px;
  font: 600 8px/1.6 var(--font-mono);
  font-style: normal;
}
.vip-tag.vip { color: #a9770c; border: 1px solid rgba(169, 119, 12, 0.35); background: rgba(212, 168, 83, 0.14); }
.vip-tag.paid { color: var(--copper); border: 1px solid rgba(185, 98, 120, 0.32); background: rgba(185, 98, 120, 0.1); }

.mini-lyric {
  position: relative;
  min-width: 0;
  display: grid;
  gap: 2px;
  padding-left: 12px;
  border-left: 1px solid rgba(70, 55, 110, 0.1);
  overflow: hidden;
}
.mini-lyric p {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 歌词固定深色，不再跟随平台强调色（网易云红 / 汽水绿）变化 */
.lyric-current { color: var(--text-primary); font-size: 14px; font-weight: 600; line-height: 1.4; letter-spacing: 0; }
.lyric-next { color: #191722; font-size: 11.5px; line-height: 1.4; letter-spacing: 0; opacity: 0.72; }

/* ---- 进度与控制 ---- */
.mini-right { position: relative; z-index: 1; display: grid; gap: 3px; }
.mini-progress { display: flex; align-items: center; gap: 4px; padding-inline: 2px; }
.mini-progress .mono { width: 30px; color: #191722; font-size: 11px; letter-spacing: 0; white-space: nowrap; }
.mini-progress .mono:last-of-type { text-align: right; }
.progress-track {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}
/* 试听截止点：压在进度条上，白圈保证压在已播放段上也看得清 */
.trial-mark {
  position: absolute;
  top: 50%;
  width: 6px;
  height: 6px;
  margin-left: -3px;
  border-radius: 50%;
  background: var(--amber);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.92), 0 0 7px var(--amber-glow);
  transform: translateY(-50%);
  pointer-events: none;
}
.mini-progress input {
  width: 100%;
  min-width: 0;
  height: 3px;
  appearance: none;
  -webkit-appearance: none;
  border-radius: 999px;
  background: linear-gradient(to right, var(--amber) 0 var(--progress), rgba(70, 55, 110, 0.12) var(--progress) 100%);
  cursor: pointer;
  transition: height 0.18s;
}
.mini-progress input:hover { height: 4px; }
.mini-progress input::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 9px; height: 9px;
  border-radius: 50%;
  background: var(--amber);
  box-shadow: 0 0 8px var(--accent-live-glow);
}
/* 推荐播放：收在控制组末尾，跟其它圆形按钮同一尺寸 */
.recommend-btn { flex: none; }
.recommend-btn:hover:not(:disabled) { color: var(--amber); }
/* 心动模式/推荐队列生效时只染图标+光晕，跟收藏心的状态语言一致，不铺整块底色 */
.recommend-btn.on { color: var(--amber); }
.recommend-btn.on :deep(svg) {
  fill: color-mix(in srgb, currentColor 22%, transparent);
  filter: drop-shadow(0 0 6px color-mix(in srgb, var(--amber) 35%, transparent));
}
.recommend-btn:disabled { cursor: wait; }
.recommend-btn.loading :deep(svg) { animation: recommend-pulse 0.9s ease-in-out infinite; }
@keyframes recommend-pulse {
  0%, 100% { opacity: 0.35; transform: scale(0.86); }
  50% { opacity: 1; transform: scale(1); }
}
.mini-controls { --tip-gap: 42px; display: flex; align-items: center; justify-content: space-between; gap: 2px; }
.ctl {
  width: 26px; height: 26px;
  display: grid; place-items: center;
  border-radius: 50%;
  color: #191722;
  transition: color var(--t-fast), transform var(--t-fast);
}
.ctl:hover { color: #000; transform: scale(1.1); }
.ctl.on { color: var(--amber); }
.ctl.loved { color: var(--rose); }
.ctl.loved :deep(svg) { fill: currentColor; filter: drop-shadow(0 0 5px var(--rose-glow)); }
.ctl.skip { color: #191722; }
.ctl.play {
  width: 38px; height: 38px;
  margin: 0 3px;
  background: linear-gradient(160deg, var(--amber), var(--amber-dim));
  color: #fff;
  box-shadow: 0 6px 18px rgba(70, 55, 110, 0.2), 0 0 18px var(--accent-live-glow);
}
.ctl.play:hover { transform: scale(1.06); color: #fff; }
.ctl.play:active { transform: scale(0.95); }
.ctl :deep(svg) { display: block; }

/* ---- 音量悬浮面板（teleport 到 body，玻璃采样与播放条一致） ---- */
.volume-wrap { display: grid; place-items: center; }
.volume-pop {
  position: fixed;
  translate: -50% 0;
  z-index: 60;
  width: 50px;
  padding: 10px 0 11px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.34);
  box-shadow: 0 18px 44px rgba(70, 55, 110, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(34px) saturate(1.35);
  -webkit-backdrop-filter: blur(34px) saturate(1.35);
  opacity: 0;
  visibility: hidden;
  transform: translateY(4px) scale(0.98);
  transform-origin: bottom center;
  transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s;
  pointer-events: none;
}
.volume-pop.open {
  opacity: 1;
  visibility: visible;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}
.volume-value { color: var(--text-primary); font-size: 10px; letter-spacing: 0; }
.volume-pop input {
  writing-mode: vertical-lr;
  direction: rtl;
  width: 14px;
  height: 92px;
  appearance: none;
  -webkit-appearance: none;
  border-radius: 999px;
  background: linear-gradient(to top, var(--amber) 0 var(--vol), rgba(70, 55, 110, 0.14) var(--vol) 100%) center / 4px 100% no-repeat;
  cursor: pointer;
}
.volume-pop input::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 11px; height: 11px;
  border-radius: 50%;
  background: var(--amber);
  border: 2px solid #fff;
  box-shadow: 0 1px 6px var(--accent-live-glow);
}

/* 窄窗口：压缩进度与控制尺寸，时长始终可见 */
@media (max-width: 1180px) {
  .mini-player {
    width: min(620px, calc(100vw - 32px));
    grid-template-columns: 48px 276px minmax(0, 1fr);
    gap: 10px;
    padding: 9px 12px 9px 9px;
  }
  .mini-meta { column-gap: 8px; }
  .mini-lyric { padding-left: 12px; }
  .mini-right { gap: 3px; min-width: 0; }
  .mini-progress { gap: 4px; }
  .mini-progress .mono { width: 30px; font-size: 11px; }
  .mini-controls { gap: 4px; }
  .ctl { width: 24px; height: 24px; }
  .ctl.play { width: 34px; height: 34px; margin: 0 1px; }
  .cover-disc { width: 48px; height: 48px; }
  .mini-cover { width: 48px; height: 48px; }
}
@media (max-width: 700px) {
  .mini-player { grid-template-columns: 44px minmax(0, 1fr) auto; }
  .mini-lyric { display: none; }
  .mini-artist { display: none; }
  .ctl.skip { display: none; }
}
</style>
