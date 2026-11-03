<template>
  <!-- 歌单详情：封面虚化铺满整窗，左栏信息 + 右栏条形曲目列表 -->
  <div class="collection-expanded" :class="{ 'with-queue': queueOpen }" :style="accentVars">
    <div
      v-if="cover"
      class="collection-backdrop"
      :style="{ backgroundImage: `url('${cover}')` }"
      aria-hidden="true"
    ></div>
    <button class="collection-back" title="返回（ESC）" aria-label="返回（ESC）" @click="emit('close')">
      <ChevronLeft :size="16" />
    </button>

    <div ref="panelEl" class="collection-panel">
      <header class="collection-hero">
        <template v-if="skeleton">
          <span class="collection-art sk-cover" aria-hidden="true"></span>
          <div class="collection-meta" aria-hidden="true">
            <span class="sk-block sk-kicker"></span>
            <span class="sk-block sk-name"></span>
            <span class="sk-block sk-name short"></span>
            <span class="sk-block sk-sub"></span>
          </div>
        </template>
        <template v-else>
          <span class="collection-art">
            <Disc3 v-if="cover" :size="26" class="collection-art-glyph" />
            <Heart v-else :size="30" />
            <img v-if="cover" :src="cover" alt="" @error="onCoverError" />
          </span>
          <div class="collection-meta">
            <p class="collection-label mono">{{ kind === 'favorites' ? 'MY FAVORITES' : 'PLAYLIST' }}</p>
            <h2>{{ name }}</h2>
            <p class="collection-count" aria-live="polite">{{ `${tracks.length} 首 · 点击歌曲播放` }}</p>
          </div>
        </template>
      </header>

      <div class="collection-body">
        <div v-if="skeleton" class="collection-list collection-skeleton" aria-hidden="true">
          <div v-for="n in 9" :key="n" class="track-row skeleton-row">
            <span class="sk-index"></span>
            <span class="sk-art"></span>
            <span class="sk-copy"><i></i><i></i></span>
            <span class="sk-time"></span>
          </div>
        </div>

        <div v-else-if="error" class="collection-list collection-status">
          <p class="collection-error">{{ error }}</p>
        </div>

        <div v-else-if="!tracks.length" class="collection-list collection-status">
          <p class="collection-empty">这个歌单还没有可播放的歌曲</p>
        </div>

        <div v-else class="collection-list">
          <button
            v-for="(track, index) in tracks"
            :key="'t' + track.songmid + index"
            class="track-row"
            :class="{ unavailable: track.unavailable, 'no-source': track.noSource }"
            :aria-label="track.noSource ? `${track.name}（暂无音源）` : `播放 ${track.name}`"
            @click="emit('play-track', track, index)"
          >
            <span class="track-index mono">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="track-art">
              <img
                v-if="track.img"
                :src="neteaseThumb(track.img, '120y120')"
                alt=""
                loading="lazy"
                decoding="async"
                @error="onCoverError"
              />
            </span>
            <span class="track-copy">
              <span class="track-name">
                {{ track.name }}
                <i v-if="track.unavailable" class="offline-tag">版权受限</i>
                <i v-else-if="track.vip" class="vip-tag" :class="track.vip">{{ track.vip === 'paid' ? '付费' : 'VIP' }}</i>
              </span>
              <small class="track-singer">{{ track.singer }}<template v-if="track.album"> · {{ track.album }}</template></small>
            </span>
            <span v-if="track.duration" class="track-duration mono">{{ formatDuration(track.duration) }}</span>
            <span class="track-play"><Play :size="15" /></span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { MusicInfo } from '../composables/useNetease'
import gsap from 'gsap'
import { ChevronLeft, Disc3, Heart, Play } from '@lucide/vue'
import { loadCover, neteaseThumb } from '../utils/cover'

const props = defineProps<{
  name: string
  cover: string
  kind: 'playlist' | 'favorites'
  tracks: MusicInfo[]
  loading: boolean
  error?: string
  // 播放队列展开时整块详情给右侧队列让位，左栏与列表按比例收缩
  queueOpen?: boolean
  fallbackCover: string
  accent: string
  glow: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'play-track', track: MusicInfo, index: number): void
}>()

// MusicInfo.duration 由主进程换算成秒，这里直接用
function formatDuration(duration?: number) {
  if (!duration) return ''
  const total = Math.round(duration)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function onCoverError(event: Event) {
  const image = event.target as HTMLImageElement | null
  if (!image || image.src === props.fallbackCover) return
  image.src = props.fallbackCover
}

// 骨架屏留到封面解码完再撤，避免真实行出现后封面还一张张补上；
// 只预取首屏时滚动会看到下面的封面逐张冒出，所以覆盖到 100 行（兜底超大歌单）
const FIRST_SCREEN_COVERS = 100
const coversDone = ref(false)
let coverToken = 0
watch(
  [() => props.tracks, () => props.loading],
  ([tracks, loading]) => {
    const token = ++coverToken
    if (loading) { coversDone.value = false; return }
    const urls = [...new Set(
      tracks
        .slice(0, FIRST_SCREEN_COVERS)
        .map(track => track.img)
        .filter((url): url is string => Boolean(url))
        .map(url => neteaseThumb(url, '120y120'))
    )]
    if (!urls.length) { coversDone.value = true; return }
    void Promise.all(urls.map(loadCover)).then(() => {
      if (token === coverToken) coversDone.value = true
    })
  },
  { immediate: true }
)
// 缓存命中时列表和封面会瞬间就位，骨架只闪一帧反而像没加载；
// 至少完整显示近一秒，让加载态真正看得见
const SKELETON_MIN_MS = 900
const minElapsed = ref(false)
let minTimer = 0
const skeleton = computed(() => props.loading || !coversDone.value || !minElapsed.value)

const accentVars = computed(() => ({
  '--ex-accent': props.accent,
  '--ex-glow': props.glow
}))

// 封面、骨架和列表作为一整块入场，避免各闪各的
const panelEl = ref<HTMLElement | null>(null)
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

onMounted(() => {
  minTimer = window.setTimeout(() => { minElapsed.value = true }, SKELETON_MIN_MS)
  if (reduceMotion || !panelEl.value) return
  gsap.fromTo(panelEl.value, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.32, ease: 'power2.out' })
})

onBeforeUnmount(() => {
  window.clearTimeout(minTimer)
  if (panelEl.value) gsap.killTweensOf(panelEl.value)
})
</script>

<style scoped>
/* ---- 详情视图：屏幕空间的条形列表（不参与画布缩放） ---- */
.collection-expanded {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* 左右留白一致：左缘对齐返回键之后，右缘与左缘同宽 */
  padding: 56px 84px 16px 84px;
  transition: padding-right 0.45s cubic-bezier(0.4, 0, 0.2, 1);
}
/* 队列展开：右侧吃掉 271px 队列宽度，只留 8px 窄缝 */
.collection-expanded.with-queue { padding-right: 279px; }

/* 详情背景：封面虚化打底，再叠一层封面主色（饱和版）与白色纱罩，避免只剩一层灰白 */
.collection-backdrop {
  position: absolute;
  inset: -40px;
  z-index: -2;
  background-position: center;
  background-size: cover;
  filter: blur(64px) brightness(1.02) saturate(1.25);
  opacity: 0.6;
  transform: scale(1.1);
  pointer-events: none;
}
.collection-expanded::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(75% 65% at 8% 4%, color-mix(in srgb, var(--ex-accent) 26%, transparent), transparent 66%),
    radial-gradient(70% 65% at 94% 98%, var(--ex-glow), transparent 72%),
    linear-gradient(180deg, rgba(252, 250, 255, 0.42), rgba(242, 238, 248, 0.6));
  pointer-events: none;
}

/* 与右上角操作按钮同一条水平轴：top 38 + (58 - 32) / 2 = 51 */
.collection-back {
  position: absolute;
  top: 51px;
  left: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: var(--r-full);
  border: 1px solid rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.34);
  box-shadow:
    0 6px 18px rgba(70, 55, 110, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(34px) saturate(1.35);
  -webkit-backdrop-filter: blur(34px) saturate(1.35);
  color: #191722;
  transition: color var(--t-fast), border-color var(--t-fast), background var(--t-fast);
}
.collection-back:hover { color: #000; border-color: var(--glass-border-hover); background: rgba(255, 255, 255, 0.6); }

.collection-panel {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 60px;
  transition: gap 0.45s cubic-bezier(0.4, 0, 0.2, 1);
}
.collection-expanded.with-queue .collection-panel { gap: 50px; }

/* 信息区收成左栏：封面在上，歌名与数量在下；相对列表面板垂直居中 */
.collection-hero {
  flex: none;
  align-self: center;
  width: 330px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 16px;
  padding: 4px 0 0;
  transition: width 0.45s cubic-bezier(0.4, 0, 0.2, 1);
}
.collection-expanded.with-queue .collection-hero { width: 274px; }
.collection-art {
  position: relative;
  flex: none;
  display: grid;
  place-items: center;
  width: 100%;
  height: auto;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 22px;
  border: 1px solid rgba(70, 55, 110, 0.12);
  background: linear-gradient(145deg, rgba(78, 62, 112, 0.1), rgba(78, 62, 112, 0.04));
  color: rgba(25, 23, 34, 0.42);
  box-shadow: 0 18px 40px rgba(70, 55, 110, 0.16), 0 0 40px var(--ex-glow);
}
.collection-art-glyph { position: absolute; }
/* 左栏封面放大了，占位符号按比例跟着长 */
.collection-art svg { width: 36%; height: 36%; }
.collection-art img { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; object-fit: cover; }
.collection-meta { width: 100%; min-width: 0; display: grid; gap: 5px; }
.collection-label { color: var(--text-ghost); font-size: 9.5px; letter-spacing: 0.26em; }
.collection-meta h2 {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  color: var(--text-primary);
  font: 300 21px/1.32 var(--font-display);
  letter-spacing: 0.02em;
  overflow-wrap: anywhere;
}
.collection-count { color: var(--text-muted); font-size: 12px; letter-spacing: 0.04em; }

.collection-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 8px 120px;
  border: 1px solid var(--glass-border);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.42);
  box-shadow: var(--shadow-glass);
  backdrop-filter: blur(28px) saturate(1.3);
  -webkit-backdrop-filter: blur(28px) saturate(1.3);
  scrollbar-width: none;
}
.collection-list::-webkit-scrollbar { width: 0; height: 0; }
/* 详情列表：数据回来前用骨架行占位，不放任何假封面 */
.collection-body {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.collection-skeleton {
  overflow: hidden;
}
/* 骨架直接复用 .track-row 的网格与内边距，加载前后位置逐像素一致 */
.skeleton-row {
  overflow: hidden;
  pointer-events: none;
}
.skeleton-row::after {
  content: '';
  position: absolute;
  top: -30%;
  bottom: -30%;
  left: 0;
  width: 42%;
  background: linear-gradient(102deg, transparent 12%, rgba(255, 255, 255, 0.7) 48%, transparent 84%);
  transform: translateX(-160%) skewX(-12deg);
  animation: skeleton-sheen 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  pointer-events: none;
}
/* 封面与信息区同样走骨架，扫光与列表同一时间启程 */
.collection-art.sk-cover {
  background: rgba(70, 55, 110, 0.14);
  border-color: transparent;
  box-shadow: none;
}
.sk-block {
  position: relative;
  overflow: hidden;
  border-radius: 8px;
  background: rgba(70, 55, 110, 0.14);
}
.sk-block::after,
.collection-art.sk-cover::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(102deg, transparent 12%, rgba(255, 255, 255, 0.62) 48%, transparent 84%);
  transform: translateX(-160%) skewX(-12deg);
  animation: skeleton-sheen 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  pointer-events: none;
}
.sk-kicker { width: 58px; height: 9px; border-radius: 5px; }
.sk-name { width: 100%; height: 23px; }
.sk-name.short { width: 62%; }
.sk-sub { width: 96px; height: 11px; border-radius: 6px; margin-top: 2px; }
@keyframes skeleton-sheen {
  0% { transform: translateX(-160%) skewX(-12deg); opacity: 0.9; }
  62% { transform: translateX(320%) skewX(-12deg); opacity: 0; }
  100% { transform: translateX(320%) skewX(-12deg); opacity: 0; }
}
.sk-index { width: 18px; height: 8px; margin: 0 auto; border-radius: 4px; background: rgba(70, 55, 110, 0.16); }
.sk-art {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(145deg, rgba(78, 62, 112, 0.18), rgba(78, 62, 112, 0.1));
}
.sk-copy {
  display: grid;
  grid-template-rows: 21px 17.5px;
  align-items: center;
  gap: 2px;
}
.sk-copy i { display: block; justify-self: start; height: 9px; border-radius: 4px; background: rgba(70, 55, 110, 0.15); }
.sk-copy i:first-child { width: 44%; }
.sk-copy i:last-child { width: 26%; background: rgba(70, 55, 110, 0.1); }
.skeleton-row:nth-child(2n) .sk-copy i:first-child { width: 34%; }
.skeleton-row:nth-child(3n) .sk-copy i:first-child { width: 56%; }
.sk-time { width: 30px; height: 8px; justify-self: end; border-radius: 4px; background: rgba(70, 55, 110, 0.12); }

.collection-status { display: grid; place-items: center; }
.collection-error { color: var(--copper); font-size: 12.5px; }
.collection-empty { color: var(--text-muted); font-size: 12.5px; }

.track-row {
  position: relative;
  display: grid;
  grid-template-columns: 26px 40px minmax(0, 1fr) auto 26px;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 7px 9px;
  border-radius: 12px;
  text-align: left;
  transition: background var(--t-fast), box-shadow var(--t-fast);
}
.track-row + .track-row::before {
  content: '';
  position: absolute;
  top: 0;
  left: 47px;
  right: 9px;
  height: 1px;
  background: rgba(70, 55, 110, 0.07);
}
.track-row:hover { background: rgba(255, 255, 255, 0.72); box-shadow: 0 6px 18px rgba(70, 55, 110, 0.07); }
.track-index { color: var(--text-ghost); font-size: 11.5px; text-align: center; }
.track-art {
  position: relative;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  overflow: hidden;
  border-radius: 50%;
  border: 1px solid rgba(70, 55, 110, 0.12);
  background: transparent;
  box-shadow: 0 4px 12px rgba(70, 55, 110, 0.12);
}
.track-art img {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* 兜底：个别封面超时或超预取范围时，淡入而不是硬生生出现 */
  animation: cover-in 0.35s ease;
}
@keyframes cover-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .track-art img { animation: none; }
}
.track-copy { min-width: 0; display: grid; gap: 2px; }
.track-name {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 15px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.track-singer {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 12.5px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.track-duration { color: var(--text-ghost); font-size: 12.5px; letter-spacing: 0.04em; }
.track-play {
  display: grid;
  place-items: center;
  color: #191722;
  opacity: 0;
  transition: opacity var(--t-fast), color var(--t-fast);
}
.track-row:hover .track-play { opacity: 1; color: var(--ex-accent); }
.track-row.unavailable .track-art { filter: grayscale(1); opacity: 0.42; }
.track-row.unavailable .track-name { color: var(--text-muted); }
/* 汽水原创原声没有音源：整行包括文字都转黑白，点击仍给出提示 */
.track-row.no-source { cursor: pointer; opacity: 0.55; filter: grayscale(1); }
.track-row.no-source .track-name,
.track-row.no-source .track-singer,
.track-row.no-source .track-duration { color: var(--text-ghost); }
.track-row.no-source .track-play { display: none; }
.track-row.no-source:hover { background: rgba(255, 255, 255, 0.72); box-shadow: 0 6px 18px rgba(70, 55, 110, 0.07); }

.offline-tag {
  flex: none;
  padding: 0 4px;
  border-radius: 4px;
  color: var(--ruby);
  border: 1px solid rgba(201, 79, 92, 0.35);
  background: rgba(201, 79, 92, 0.1);
  font: 600 10px/1.6 var(--font-mono);
  font-style: normal;
}
.vip-tag {
  flex: none;
  padding: 0 4px;
  border-radius: 4px;
  font: 600 10px/1.6 var(--font-mono);
  font-style: normal;
}
.vip-tag.vip { color: #a9770c; border: 1px solid rgba(169, 119, 12, 0.35); background: rgba(212, 168, 83, 0.14); }
.vip-tag.paid { color: var(--copper); border: 1px solid rgba(185, 98, 120, 0.32); background: rgba(185, 98, 120, 0.1); }

@media (prefers-reduced-motion: reduce) {
  .skeleton-row::after,
  .sk-block::after,
  .collection-art.sk-cover::after { animation: none; opacity: 0; }
}
</style>
