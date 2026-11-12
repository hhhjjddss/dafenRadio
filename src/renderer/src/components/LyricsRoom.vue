<template>
  <section class="lyrics-room" aria-label="沉浸歌词页">
    <div class="lyrics-backdrop" :style="{ backgroundImage: coverUrl ? `url('${coverUrl}')` : '' }"></div>
    <header class="lyrics-top">
      <button class="lyrics-back" @click="emit('close')"><ChevronLeft :size="14" /> 返回</button>
      <div class="lyrics-top-right">
        <button class="lyrics-full" :class="{ on: lyricBarOn }" @click="emit('toggle-lyric-bar')">
          <Subtitles :size="14" />
          {{ lyricBarOn ? '关闭桌面歌词' : '桌面歌词' }}
        </button>
        <button class="lyrics-full" @click="emit('toggle-fullscreen')">
          <Minimize2 v-if="fullscreen" :size="14" />
          <Maximize2 v-else :size="14" />
          {{ fullscreen ? '退出全屏' : '全屏' }}
        </button>
      </div>
    </header>
    <div class="lyrics-layout">
      <div class="lyrics-column">
        <p class="lyrics-live"><AudioLines :size="13" class="live-glyph" :class="{ still: !playing }" aria-hidden="true" />正在播放</p>
        <h1>{{ trackName || '还没有歌在播放' }}</h1>
        <p class="lyrics-artist">{{ artist }}</p>
        <div class="lyrics-scroll" ref="lyricsScroll">
          <template v-if="lines.length">
            <button v-for="(line, index) in lines" :key="index" :ref="el => lyricElements[index] = el as HTMLElement" class="lyric-line" :class="{ current: index === activeIndex, passed: index < activeIndex }" @click="emit('seek', line.time)">
              <span class="lyric-text">
                <KaraokeLine v-if="index === activeIndex" :words="line.words" />
                <template v-else>{{ line.text }}</template>
              </span><small v-if="line.translation">{{ line.translation }}</small>
            </button>
          </template>
          <p v-else class="lyrics-placeholder">{{ trackName ? '这首歌暂时没有歌词' : '先去选一首歌吧' }}</p>
        </div>
      </div>
      <div class="lyrics-side">
        <div class="lyrics-cover" :class="{ spinning: playing }">
          <img v-if="coverUrl" :src="coverUrl" alt="" @error="fallbackCoverOnError" />
          <Music2 v-else :size="34" />
        </div>
        <div class="lyrics-progress">
          <span class="mono">{{ formatTime(currentTime) }}</span>
          <div class="lyrics-track">
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
        <div class="lyrics-controls">
          <button :aria-label="modeTitle" :title="modeTitle" @click="emit('cycle-mode')">
            <component :is="modeIconComponent" :size="16" />
          </button>
          <button class="fav-btn" :class="{ loved: favorite }" :title="favorite ? '取消收藏' : '收藏这首歌'" :aria-label="favorite ? '取消收藏' : '收藏这首歌'" @click="emit('toggle-favorite')">
            <Heart :size="15" :fill="favorite ? 'currentColor' : 'none'" />
          </button>
          <button aria-label="上一首" @click="emit('prev')"><SkipBack :size="18" /></button>
          <button class="lyrics-play" :aria-label="playing ? '暂停' : '播放'" @click="emit('toggle-play')">
            <TransportIcon :playing="playing" :size="19" />
          </button>
          <button aria-label="下一首" @click="emit('next')"><SkipForward :size="18" /></button>
          <button title="播放队列" aria-label="播放队列" @click="emit('toggle-queue')"><ListMusic :size="16" /></button>
          <div
            class="volume-wrap"
            @mouseenter="openVolume"
            @mouseleave="scheduleCloseVolume"
            @focusin="openVolume"
            @focusout="scheduleCloseVolume"
            @wheel.prevent="onVolumeWheel"
          >
            <button ref="volumeBtnEl" aria-label="静音" @click="emit('mute')">
              <Volume2 v-if="volume > 0" :size="16" />
              <VolumeX v-else :size="16" />
            </button>
          </div>
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
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AudioLines, ChevronLeft, Heart, ListMusic, ListOrdered, Maximize2, Minimize2, Music2, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Subtitles, Volume2, VolumeX } from '@lucide/vue'
import type { PlayMode } from '../composables/usePlayer'
import KaraokeLine from './KaraokeLine.vue'
import TransportIcon from './TransportIcon.vue'
import { fallbackCoverOnError } from '../utils/cover'

interface KaraokeWord { time: number; duration: number; text: string }
interface LyricLine { time: number; text: string; translation: string; words: KaraokeWord[] }

const props = defineProps<{
  lines: LyricLine[]
  activeIndex: number
  trackName: string
  artist: string
  coverUrl: string
  playing: boolean
  favorite: boolean
  lyricBarOn: boolean
  fullscreen: boolean
  currentTime: number
  duration: number
  trialLimit: number
  volume: number
  mode: PlayMode
  modeTitle: string
}>()

const emit = defineEmits<{
  close: []
  'toggle-lyric-bar': []
  'toggle-fullscreen': []
  seek: [time: number]
  prev: []
  'toggle-play': []
  next: []
  'toggle-favorite': []
  'cycle-mode': []
  'toggle-queue': []
  mute: []
  volume: [value: number]
}>()

// 播放模式图标与播放条同一套映射
const modeIconComponent = computed(() => {
  if (props.mode === 'shuffle') return Shuffle
  if (props.mode === 'repeat-one') return Repeat1
  if (props.mode === 'repeat-all') return Repeat
  return ListOrdered
})

const progressPercent = computed(() => props.duration ? Math.min(100, props.currentTime / props.duration * 100) : 0)
// VIP 试听截止点与播放条一致，压在进度条上
const trialPercent = computed(() => {
  if (!props.trialLimit || !props.duration) return 0
  const percent = props.trialLimit / props.duration * 100
  return percent > 0 && percent < 99.5 ? percent : 0
})
const volumePercent = computed(() => Math.round(props.volume * 100))

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

function onSeek(event: Event) {
  emit('seek', Number((event.target as HTMLInputElement).value))
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

// 音量悬浮面板与播放条同款：teleport 到 body，悬停即出、可拖动调节
const volumeOpen = ref(false)
const volumeDragging = ref(false)
const volumeBtnEl = ref<HTMLElement | null>(null)
const volumeStyle = ref<Record<string, string>>({})
let volumeCloseTimer: ReturnType<typeof setTimeout> | null = null

function openVolume() {
  if (volumeCloseTimer !== null) {
    clearTimeout(volumeCloseTimer)
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
  if (volumeCloseTimer !== null) clearTimeout(volumeCloseTimer)
  volumeCloseTimer = setTimeout(() => { volumeOpen.value = false }, 160)
}

onBeforeUnmount(() => {
  if (volumeCloseTimer !== null) clearTimeout(volumeCloseTimer)
})

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const lyricsScroll = ref<HTMLElement | null>(null)
const lyricElements = ref<(HTMLElement | null)[]>([])

// 只滚歌词面板：scrollIntoView 会连带滚动外层，把封面一起顶上去
function scrollLyricIntoView(index: number, behavior: ScrollBehavior = 'smooth') {
  const container = lyricsScroll.value
  const line = lyricElements.value[index]
  if (!container || !line) return
  const box = container.getBoundingClientRect()
  const rect = line.getBoundingClientRect()
  container.scrollTo({
    top: container.scrollTop + rect.top - box.top - (box.height - rect.height) / 2,
    behavior: reduceMotion ? 'auto' : behavior
  })
}

watch(() => props.activeIndex, async (index) => {
  if (index < 0) return
  await nextTick()
  scrollLyricIntoView(index)
})

onMounted(async () => {
  if (props.activeIndex < 0) return
  await nextTick()
  scrollLyricIntoView(props.activeIndex, 'auto')
})
</script>

<style scoped>
/* ---- 沉浸歌词页 ---- */
.lyrics-room { position: fixed; inset: 0; z-index: 26; display: flex; flex-direction: column; overflow: clip; background: var(--bg-abyss); }
.lyrics-backdrop { position: absolute; inset: -40px; z-index: -1; background-position: center; background-size: cover; filter: blur(52px) brightness(1.05) saturate(0.92); opacity: 0.24; transform: scale(1.1); }
.lyrics-room::before { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(180deg, rgba(252, 250, 255, 0.82), rgba(242, 238, 248, 0.95)); }
.lyrics-top { height: 56px; flex: none; display: flex; align-items: center; justify-content: space-between; padding: 0 26px; -webkit-app-region: drag; }
.lyrics-top-right { display: flex; align-items: center; gap: 18px; -webkit-app-region: no-drag; }
.lyrics-back, .lyrics-full { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border: 1px solid transparent; border-radius: 999px; -webkit-app-region: no-drag; color: #191722; font-size: 12px; letter-spacing: 0.06em; transition: color var(--t-fast), border-color var(--t-fast), background var(--t-fast); }
/* 与格阵按钮同款悬停：白底提亮 + 边框加深，浅色页面上有明确反馈 */
.lyrics-back:hover, .lyrics-full:hover { color: #000; border-color: var(--glass-border-hover); background: rgba(255, 255, 255, 0.6); }
.lyrics-full.on { color: var(--accent-live); }
.lyrics-layout {
  flex: 1; min-height: 0;
  display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(240px, 0.85fr);
  grid-template-rows: minmax(0, 1fr);
  align-items: center;
  width: min(1080px, 100%);
  margin: 0 auto;
  padding: 0 6vw 5vh;
  gap: 5vw;
}
.lyrics-column { min-width: 0; display: flex; flex-direction: column; max-height: 100%; }
.lyrics-live { display: flex; align-items: center; gap: 9px; color: var(--text-muted); font-size: 10.5px; letter-spacing: 0.2em; }
.live-glyph { flex: none; color: var(--amber); opacity: 0.55; }
.live-glyph:not(.still) { animation: lyric-breathe 1.8s ease-in-out infinite; }
@keyframes lyric-breathe { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
.lyrics-column h1 { margin-top: 14px; color: var(--text-primary); font: 300 34px/1.3 var(--font-display); letter-spacing: 0.03em; }
.lyrics-artist { margin-top: 6px; color: var(--text-muted); font-size: 12px; letter-spacing: 0.14em; }
.lyrics-scroll {
  flex: 1; min-height: 0;
  overflow-y: auto;
  margin-top: 4vh;
  padding: 24px 18px 30px 0;
  scrollbar-width: none;
  mask-image: linear-gradient(transparent 0%, #000 12%, #000 88%, transparent 100%);
  -webkit-mask-image: linear-gradient(transparent 0%, #000 12%, #000 88%, transparent 100%);
}
.lyrics-scroll::-webkit-scrollbar { display: none; }
.lyric-line { display: block; width: 100%; padding: 10px 0; color: rgba(43, 39, 56, 0.34); text-align: left; font: 300 20px/1.5 var(--font-display); letter-spacing: 0.03em; transition: color 0.4s, transform 0.4s; transform-origin: left center; }
.lyric-line:hover { color: rgba(43, 39, 56, 0.68); }
.lyric-line.current { color: var(--text-primary); font-size: 25px; transform: translateX(6px); }
.lyric-line.passed { color: rgba(43, 39, 56, 0.22); }
.lyric-text { white-space: pre-wrap; }
.lyric-line small { display: block; margin-top: 4px; color: var(--text-ghost); font: 10.5px/1.5 var(--font-body); }
.lyrics-placeholder { padding-top: 20px; color: var(--text-ghost); font-size: 13px; }
/* 行间距收紧；封面与进度条之间用 margin 拉开，形成“封面 / 控制区”两组 */
.lyrics-side { display: grid; justify-items: center; gap: 12px; }
.lyrics-cover {
  width: min(24vw, 270px); aspect-ratio: 1;
  display: grid; place-items: center;
  overflow: hidden;
  border-radius: var(--r-xl);
  border: 1px solid var(--glass-border);
  background: var(--bg-elevated);
  box-shadow: 0 26px 70px rgba(70, 55, 110, 0.18), 0 0 60px var(--accent-live-glow);
  color: #191722;
  transition: border-radius 0.45s ease;
}
.lyrics-cover img { width: 100%; height: 100%; object-fit: cover; }
/* 旋转的是整个封面：圆形裁切后四个角不会被削掉 */
.lyrics-cover.spinning { border-radius: 50%; animation: cover-spin 26s linear infinite; }
@keyframes cover-spin { to { transform: rotate(360deg); } }
/* 与进度条同宽并两端撑满：上（进度）下（控制）两块边缘严格对齐 */
.lyrics-controls { display: flex; align-items: center; justify-content: space-between; width: min(24vw, 270px); }
/* 收藏心形：选中态与播放条同一语言（玫红 + 光晕） */
.fav-btn.loved { color: var(--rose); }
.fav-btn.loved svg { fill: currentColor; filter: drop-shadow(0 0 5px var(--rose-glow)); }
.lyrics-controls button { display: grid; place-items: center; color: #191722; transition: color var(--t-fast), transform var(--t-fast); }
.lyrics-controls button:hover { color: #000; transform: scale(1.1); }
.lyrics-play {
  width: 50px; height: 50px;
  display: grid; place-items: center;
  border-radius: 50%;
  background: linear-gradient(160deg, var(--amber), var(--amber-dim));
  color: #fff !important;
  box-shadow: 0 10px 26px rgba(70, 55, 110, 0.2), 0 0 22px var(--accent-live-glow);
}

/* ---- 进度条：与播放条同款填充滑轨，尺寸放大匹配沉浸页 ---- */
/* 数字贴近滑轨：间距收紧后滑轨自然更长 */
.lyrics-progress { display: flex; align-items: center; gap: 0px; width: min(24vw, 270px); margin-top: 90px; }
.lyrics-progress .mono { width: 34px; color: var(--text-primary); font-size: 11px; letter-spacing: 0; white-space: nowrap; }
.lyrics-progress .mono:last-of-type { text-align: right; }
.lyrics-track { position: relative; flex: 1; min-width: 0; display: flex; align-items: center; }
.lyrics-track input {
  width: 100%;
  min-width: 0;
  height: 4px;
  appearance: none;
  -webkit-appearance: none;
  border-radius: 999px;
  background: linear-gradient(to right, var(--amber) 0 var(--progress), rgba(70, 55, 110, 0.14) var(--progress) 100%);
  cursor: pointer;
  transition: height 0.18s;
}
.lyrics-track input:hover { height: 5px; }
.lyrics-track input::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: var(--amber);
  border: 2px solid #fff;
  box-shadow: 0 1px 6px var(--accent-live-glow);
}
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

/* ---- 音量：与播放条同款悬停弹出竖向滑条 ---- */
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
.volume-pop.open { opacity: 1; visibility: visible; transform: translateY(0) scale(1); pointer-events: auto; }
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
  width: 10px; height: 10px;
  border-radius: 50%;
  background: var(--amber);
  border: 2px solid #fff;
  box-shadow: 0 1px 6px var(--accent-live-glow);
}

@media (max-width: 860px) {
  .lyrics-layout { grid-template-columns: 1fr; gap: 4vh; align-content: start; padding-top: 2vh; }
  .lyrics-side { display: none; }
}
</style>
