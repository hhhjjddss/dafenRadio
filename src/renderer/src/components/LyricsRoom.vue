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
        <div class="lyrics-controls">
          <button aria-label="上一首" @click="emit('prev')"><SkipBack :size="18" /></button>
          <button class="lyrics-play" :aria-label="playing ? '暂停' : '播放'" @click="emit('toggle-play')">
            <TransportIcon :playing="playing" :size="19" />
          </button>
          <button aria-label="下一首" @click="emit('next')"><SkipForward :size="18" /></button>
        </div>
        <button class="lyrics-fav" :class="{ loved: favorite }" @click="emit('toggle-favorite')">
          <Heart :size="14" :fill="favorite ? 'currentColor' : 'none'" />
          {{ favorite ? '已收藏' : '收藏这首歌' }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { AudioLines, ChevronLeft, Heart, Maximize2, Minimize2, Music2, SkipBack, SkipForward, Subtitles } from '@lucide/vue'
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
}>()

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
.lyrics-back, .lyrics-full { display: inline-flex; align-items: center; gap: 5px; -webkit-app-region: no-drag; color: #191722; font-size: 12px; letter-spacing: 0.06em; transition: color var(--t-fast); }
.lyrics-back:hover, .lyrics-full:hover { color: #000; }
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
.lyrics-side { display: grid; justify-items: center; gap: 26px; }
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
.lyrics-controls { display: flex; align-items: center; gap: 30px; }
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
.lyrics-fav { display: inline-flex; align-items: center; gap: 5px; color: #191722; font-size: 11.5px; letter-spacing: 0.1em; transition: color var(--t-fast); }
.lyrics-fav:hover { color: #000; }
.lyrics-fav.loved { color: var(--rose); }

@media (max-width: 860px) {
  .lyrics-layout { grid-template-columns: 1fr; gap: 4vh; align-content: start; padding-top: 2vh; }
  .lyrics-side { display: none; }
}
</style>
