<template>
  <!-- 歌单详情：封面虚化铺满整窗，左栏信息 + 右栏条形曲目列表 -->
  <div class="collection-expanded" :class="{ 'with-queue': queueOpen, 'wall-mode': wallView, 'no-transition': wallToggling }" :style="accentVars">
    <div
      v-if="cover"
      class="collection-backdrop"
      :style="{ backgroundImage: `url('${cover}')` }"
      aria-hidden="true"
    ></div>
    <button class="collection-back" title="返回（ESC）" aria-label="返回（ESC）" @click="emit('close')">
      <ChevronLeft :size="16" />
    </button>

    <!-- 照片墙快捷操作：定位正在播放 / 切换照片墙与列表 -->
    <div v-if="wall" class="collection-actions">
      <button
        v-if="wallView && playingCell"
        class="collection-action"
        title="定位正在播放"
        aria-label="定位正在播放"
        @click="locatePlaying"
      >
        <LocateFixed :size="16" />
      </button>
      <button
        class="collection-action"
        :title="wallView ? '切回列表' : '切换照片墙'"
        :aria-label="wallView ? '切回列表' : '切换照片墙'"
        @click="toggleWallView"
      >
        <RefreshCw :size="16" :key="spinKey" :class="{ 'action-spin': spinKey > 0 }" />
      </button>
    </div>

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
            <p v-if="kind === 'playlist'" class="collection-label mono">PLAYLIST</p>
            <h2>{{ name }}</h2>
            <p class="collection-count" aria-live="polite">{{ `${tracks.length} 首 · 点击歌曲播放` }}</p>
          </div>
        </template>
      </header>

      <div class="collection-body">
        <div v-if="skeleton" class="collection-list collection-skeleton" aria-hidden="true">
          <WallSkeleton v-if="wallView" :pitch="180" label="正在载入封面墙" />
          <template v-else>
            <div v-for="n in 9" :key="n" class="track-row skeleton-row">
              <span class="sk-index"></span>
              <span class="sk-art"></span>
              <span class="sk-copy"><i></i><i></i></span>
              <span class="sk-time"></span>
            </div>
          </template>
        </div>

        <div v-else-if="error" class="collection-list collection-status">
          <p class="collection-error">{{ error }}</p>
        </div>

        <div v-else-if="!tracks.length" class="collection-list collection-status">
          <p class="collection-empty">这个歌单还没有可播放的歌曲</p>
        </div>

        <div v-else-if="wallView" ref="wallBoardEl" class="wall-board">
          <div ref="wallTrackEl" class="wall-track">
            <div
              v-for="tile in wallCanvases"
              :key="tile.key"
              class="wall-canvas"
              :style="wallCanvasStyle()"
            >
              <button
                v-for="cell in wallCells"
                :key="cell.key"
                class="wall-tile"
                :class="{ empty: !cell.track, playing: isPlayingCell(cell), unavailable: cell.track?.unavailable, 'no-source': cell.track?.noSource }"
                :style="wallCellStyle(cell)"
                :disabled="!cell.track"
                :aria-label="cell.track ? (cell.track.noSource ? `${cell.track.name}（暂无音源）` : `播放 ${cell.track.name}`) : ''"
                @click="playWallTrack(cell)"
              >
                <template v-if="cell.track">
                  <img
                    v-if="cell.track.img"
                    :src="neteaseThumb(cell.track.img, '300y300')"
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable="false"
                    @error="onCoverError"
                  />
                  <span v-if="isPlayingCell(cell) && playing" class="wall-eq" aria-hidden="true">
                    <i></i><i></i><i></i><i></i><i></i><i></i>
                  </span>
                  <i v-if="cell.track.vip" class="vip-tag wall-vip" :class="[cell.track.vip, { soda: cell.track.platform === 'soda' && cell.track.vip === 'vip' }]">{{ cell.track.vip === 'paid' ? '付费' : 'VIP' }}</i>
                  <i v-else-if="cell.track.unavailable" class="offline-tag wall-vip">版权受限</i>
                  <i v-else-if="cell.track.noSource" class="offline-tag wall-vip">暂无音源</i>
                  <span class="wall-tile-name">
                    <b>{{ cell.track.name }}</b>
                    <small v-if="cell.track.singer">{{ cell.track.singer }}</small>
                  </span>
                </template>
              </button>
            </div>
          </div>
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
            <!-- 只有播放中才用均衡器替换序号，暂停后回到普通序号 -->
            <span v-if="isPlayingCell({ track }) && playing" class="track-eq" role="img" aria-label="正在播放">
              <i></i><i></i><i></i><i></i><i></i><i></i>
            </span>
            <span v-else class="track-index mono">{{ String(index + 1).padStart(2, '0') }}</span>
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
                <i v-else-if="track.noSource" class="offline-tag">暂无音源</i>
                <i v-else-if="track.vip" class="vip-tag" :class="[track.vip, { soda: track.platform === 'soda' && track.vip === 'vip' }]">{{ track.vip === 'paid' ? '付费' : 'VIP' }}</i>
              </span>
              <small class="track-singer">{{ track.singer }}<template v-if="track.album"> · {{ track.album }}</template></small>
            </span>
            <span v-if="track.duration" class="track-duration mono">{{ formatDuration(track.duration) }}</span>
            <span
              class="track-play"
              :class="{ live: isPlayingCell({ track }) }"
              :aria-label="isPlayingCell({ track }) ? (playing ? '暂停' : '继续播放') : `播放 ${track.name}`"
              @click.stop="onPlayButton(track, index)"
            >
              <Pause v-if="isPlayingCell({ track }) && playing" :size="15" />
              <Play v-else :size="15" />
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { MusicInfo } from '../composables/useNetease'
import gsap from 'gsap'
import { Draggable } from 'gsap/Draggable'
import { InertiaPlugin } from 'gsap/InertiaPlugin'
import { ChevronLeft, Disc3, Heart, LocateFixed, Pause, Play, RefreshCw } from '@lucide/vue'
import { loadCover, neteaseThumb } from '../utils/cover'
import WallSkeleton from './WallSkeleton.vue'

gsap.registerPlugin(Draggable, InertiaPlugin)

const props = defineProps<{
  name: string
  cover: string
  kind: 'playlist' | 'favorites'
  tracks: MusicInfo[]
  loading: boolean
  error?: string
  // 播放队列展开时整块详情给右侧队列让位，左栏与列表按比例收缩
  queueOpen?: boolean
  // 照片墙：歌曲改用封面格阵展示，而不是条形列表
  wall?: boolean
  // 当前播放歌曲的 songmid，照片墙上给正在播放的那张封面加动态标记
  currentSongmid?: string
  // 当前是否正在播放：暂停时列表均衡器静止，避免误导
  playing?: boolean
  fallbackCover: string
  accent: string
  glow: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'play-track', track: MusicInfo, index: number): void
  (e: 'toggle-play'): void
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

/* ============ 照片墙：封面无缝平铺 + 无限拖动 ============ */
// 与探索页同一套做法：一套格阵复制成 3×3，拖动时让每份在 3 倍画布范围内环回，
// 视觉上就是没有边界的封面墙；封面之间不留间距。
const WALL_PITCH = 180
// 与探索页的无缝封面墙一致：封面多画 1px 叠压，避免相邻之间出现发丝缝
const WALL_TILE = WALL_PITCH + 1
const WALL_OFFSETS = [-1, 0, 1]

const wallBoardEl = ref<HTMLElement | null>(null)
const wallTrackEl = ref<HTMLElement | null>(null)
// 画布按详情页实际大小铺满，并至少能装下全部歌曲，歌单不大时基本不出现重复封面
// 先用窗口尺寸起算：墙是整窗铺满的，这样首次渲染就是对的列数，不会量一次再整块重排
const wallViewport = ref({
  w: Math.max(320, window.innerWidth || 1280),
  h: Math.max(240, window.innerHeight || 720)
})
let wallDraggable: Draggable | null = null
let wallMoved = false

// 照片墙视图可以在当前页面临时切回列表，不改动全局设置
const wallLocal = ref(true)
const wallView = computed(() => Boolean(props.wall) && wallLocal.value)
watch(() => props.wall, (on) => { if (on) wallLocal.value = true })
// 每次切换让图标重新挂载，刷新式地转一圈
const spinKey = ref(0)
// 切换后的半秒内不跑 padding 过渡，避免列表/封面墙跟着右侧留白做缓慢平移
const wallToggling = ref(false)
let wallToggleTimer = 0
function toggleWallView() {
  const next = !wallLocal.value
  // 切回墙之前先按窗口尺寸把格阵定好，避免挂载后量出旧尺寸再整块重排
  if (next) wallViewport.value = { w: Math.max(320, window.innerWidth), h: Math.max(240, window.innerHeight) }
  wallLocal.value = next
  spinKey.value += 1
  wallToggling.value = true
  window.clearTimeout(wallToggleTimer)
  wallToggleTimer = window.setTimeout(() => { wallToggling.value = false }, 600)
}

const wallGrid = computed(() => {
  const count = Math.max(1, props.tracks.length)
  const cols = Math.min(12, Math.max(4, Math.ceil(wallViewport.value.w / WALL_PITCH)))
  // rows 至少铺满视口，同时要能装下全部歌曲（不循环重复，歌曲多时画布向下加高）
  const rows = Math.max(Math.ceil(wallViewport.value.h / WALL_PITCH), Math.ceil(count / cols), 1)
  return { cols, rows, width: cols * WALL_PITCH, height: rows * WALL_PITCH }
})

const wallCanvases = computed(() => WALL_OFFSETS.flatMap((ty, yi) =>
  WALL_OFFSETS.map((tx, xi) => ({
    key: `${xi}-${yi}`,
    index: yi * 3 + xi,
    x: tx * wallGrid.value.width,
    y: ty * wallGrid.value.height
  }))
))

// 画布位移直接写 DOM，不走 Vue 响应式，拖起来不会每帧重渲染几百个格子
function wallCanvasNodes(): HTMLElement[] {
  return wallTrackEl.value ? Array.from(wallTrackEl.value.children) as HTMLElement[] : []
}

// 按列铺满整格：歌曲不够时接着循环，宁可复用封面也不留空白格子；
// 每列再错开一个偏移，避免整列完全一样显得像复制粘贴
const wallCells = computed(() => {
  const { cols, rows } = wallGrid.value
  const tracks = props.tracks
  if (!tracks.length) return []
  const count = tracks.length
  const cells: { key: number; index: number; track: MusicInfo | null; x: number; y: number }[] = []
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const i = col * rows + row
      // 复用封面时把真实歌曲序号一起带出去，点重复的那张也能跳到正确的队列位置
      const idx = (i + col) % count
      cells.push({ key: i, index: idx, track: tracks[idx] ?? null, x: col * WALL_PITCH, y: row * WALL_PITCH })
    }
  }
  return cells
})

function measureWall() {
  const el = wallBoardEl.value
  if (!el) return
  const w = el.clientWidth
  const h = el.clientHeight
  if (w < 1 || h < 1) return
  if (w !== wallViewport.value.w || h !== wallViewport.value.h) wallViewport.value = { w, h }
}

function wallCanvasStyle() {
  const { width, height } = wallGrid.value
  return {
    width: `${width}px`,
    height: `${height}px`,
    marginLeft: `${-width / 2}px`,
    marginTop: `${-height / 2}px`
  }
}

function wallCellStyle(cell: { x: number; y: number }) {
  return {
    transform: `translate3d(${cell.x}px, ${cell.y}px, 0)`,
    width: `${WALL_TILE}px`,
    height: `${WALL_TILE}px`
  }
}

function wrapWallOffset(value: number, size: number) {
  const period = size * 3
  return ((value + size * 1.5) % period + period) % period - size * 1.5
}

// 把画布位移换算成每份的相对位移：视觉位置环回，DOM 只保留 9 份
function syncWallCanvases() {
  if (!wallTrackEl.value) return
  const tx = Number(gsap.getProperty(wallTrackEl.value, 'x')) || 0
  const ty = Number(gsap.getProperty(wallTrackEl.value, 'y')) || 0
  const { width, height } = wallGrid.value
  const nodes = wallCanvasNodes()
  wallCanvases.value.forEach((tile, i) => {
    const node = nodes[i]
    if (!node) return
    gsap.set(node, {
      x: wrapWallOffset(tile.x + tx, width) - tx,
      y: wrapWallOffset(tile.y + ty, height) - ty,
      force3D: true
    })
  })
}

function playWallTrack(cell: { track: MusicInfo | null; index: number }) {
  // 拖动画布时松手也会触发 click，这里要挡掉；空占位没有歌，直接忽略
  if (wallMoved || !cell.track) return
  emit('play-track', cell.track, cell.index)
}

// 行尾按钮：当前正在播放的曲目点一下暂停/继续，其它曲目保持原来的播放行为
function onPlayButton(track: MusicInfo, index: number) {
  if (isPlayingCell({ track })) {
    emit('toggle-play')
    return
  }
  emit('play-track', track, index)
}

function isPlayingCell(cell: { track: MusicInfo | null }) {
  return Boolean(cell.track && props.currentSongmid && cell.track.songmid === props.currentSongmid)
}

// 当前播放的歌曲在这一墙封面里吗？不在就没必要显示定位按钮
const playingCell = computed(() => wallCells.value.find(item => isPlayingCell(item)) || null)

// 把正在播放的那张封面平移到视口中央；9 份副本视觉一致，挑离当前位置最近的一份
function locatePlaying() {
  const trackEl = wallTrackEl.value
  const cell = playingCell.value
  if (!trackEl || !cell) return
  const { width, height } = wallGrid.value
  // 拖动时 trackEl 的 x/y 会一直累加，先折算回环回区间，才能按视觉距离挑最近的副本
  const curX = wrapWallOffset(Number(gsap.getProperty(trackEl, 'x')) || 0, width)
  const curY = wrapWallOffset(Number(gsap.getProperty(trackEl, 'y')) || 0, height)
  let bestX = 0
  let bestY = 0
  let bestDistance = Infinity
  for (const tile of wallCanvases.value) {
    const x = -(tile.x + cell.x + WALL_TILE / 2 - width / 2)
    const y = -(tile.y + cell.y + WALL_TILE / 2 - height / 2)
    const distance = (x - curX) ** 2 + (y - curY) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      bestX = x
      bestY = y
    }
  }
  gsap.killTweensOf(trackEl)
  wallDraggable?.disable()
  gsap.to(trackEl, {
    x: bestX,
    y: bestY,
    duration: 0.55,
    ease: 'power3.out',
    onUpdate: syncWallCanvases,
    onComplete() {
      wallDraggable?.enable()
      wallDraggable?.update()
      syncWallCanvases()
    }
  })
}

function setupWallDrag(prevX = 0, prevY = 0) {
  wallDraggable?.kill()
  wallDraggable = null
  measureWall()
  if (!wallTrackEl.value) return
  gsap.set(wallTrackEl.value, { x: prevX, y: prevY })
  wallDraggable = Draggable.create(wallTrackEl.value, {
    type: 'x,y',
    inertia: true,
    cursor: 'grab',
    activeCursor: 'grabbing',
    allowNativeTouchScrolling: false,
    dragClickables: true,
    onPress() { wallMoved = false },
    onDrag() { wallMoved = true; syncWallCanvases() },
    onThrowUpdate: syncWallCanvases,
    onDragEnd: syncWallCanvases,
    onThrowComplete: syncWallCanvases
  })[0]
  syncWallCanvases()
}

// 窗口尺寸变化时重算格阵，避免画布小于视口露出重复的那一份
let wallResizeTimer = 0
function handleWallResize() {
  window.clearTimeout(wallResizeTimer)
  wallResizeTimer = window.setTimeout(() => {
    if (!wallView.value) return
    // 记住当前拖到的位置，重算格阵后恢复，避免 resize 时画布跳回原点
    const trackEl = wallTrackEl.value
    const prevX = trackEl ? Number(gsap.getProperty(trackEl, 'x')) || 0 : 0
    const prevY = trackEl ? Number(gsap.getProperty(trackEl, 'y')) || 0 : 0
    measureWall()
    void nextTick(() => setupWallDrag(prevX, prevY))
  }, 160)
}

watch(
  () => props.wall,
  (on) => {
    if (!on) {
      wallDraggable?.kill()
      wallDraggable = null
    }
  },
  { immediate: true }
)

// 骨架屏留到封面解码完再撤，避免真实行出现后封面还一张张补上；
// 只预取首屏时滚动会看到下面的封面逐张冒出，所以覆盖到 100 行（兜底超大歌单）
const FIRST_SCREEN_COVERS = 100
const coversDone = ref(false)
let coverToken = 0
let coverTimer = 0
watch(
  [() => props.tracks, () => props.loading, () => props.wall],
  ([tracks, loading]) => {
    const token = ++coverToken
    window.clearTimeout(coverTimer)
    if (loading) { coversDone.value = false; return }
    const size = props.wall ? '300y300' : '120y120'
    const urls = [...new Set(
      tracks
        .slice(0, FIRST_SCREEN_COVERS)
        .map(track => track.img)
        .filter((url): url is string => Boolean(url))
        .map(url => neteaseThumb(url, size))
    )]
    if (!urls.length) { coversDone.value = true; return }
    // 个别封面卡住或 CDN 限流时不能一直挡着列表：最多等 4 秒就揭开，未完成的封面自行淡入
    coverTimer = window.setTimeout(() => {
      if (token === coverToken) coversDone.value = true
    }, 4000)
    void Promise.all(urls.map(loadCover)).then(() => {
      window.clearTimeout(coverTimer)
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

// 画布只在骨架撤下、真实 tile 挂载后才开始拖拽；尺寸变化后重建一次
watch(
  () => `${wallView.value}-${skeleton.value}-${wallGrid.value.cols}x${wallGrid.value.rows}-${wallCells.value.length}`,
  () => {
    if (wallView.value && !skeleton.value && wallCells.value.length > 0) {
      void nextTick(setupWallDrag)
      return
    }
    wallDraggable?.kill()
    wallDraggable = null
  },
  { immediate: true }
)

const accentVars = computed(() => ({
  '--ex-accent': props.accent,
  '--ex-glow': props.glow
}))

// 封面、骨架和列表作为一整块入场，避免各闪各的
const panelEl = ref<HTMLElement | null>(null)
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

onMounted(() => {
  minTimer = window.setTimeout(() => { minElapsed.value = true }, SKELETON_MIN_MS)
  window.addEventListener('resize', handleWallResize)
  if (reduceMotion || !panelEl.value) return
  gsap.fromTo(panelEl.value, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.32, ease: 'power2.out' })
})

onBeforeUnmount(() => {
  window.clearTimeout(minTimer)
  window.clearTimeout(coverTimer)
  window.clearTimeout(wallResizeTimer)
  window.clearTimeout(wallToggleTimer)
  window.removeEventListener('resize', handleWallResize)
  wallDraggable?.kill()
  wallDraggable = null
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
/* 照片墙模式：铺满整页，去掉留白与左栏，画布直接贴边 */
.collection-expanded.wall-mode,
.collection-expanded.wall-mode.with-queue { padding: 0; }
/* 进照片墙要立刻铺满：padding 若走 0.45s 过渡，前几帧会被右侧留白挤歪，看着就是"整体往右推" */
.collection-expanded.wall-mode { transition: none; }
/* 列表 ↔ 照片墙切换期间也不做 padding 过渡，两边都不跟着留白横移 */
.collection-expanded.no-transition { transition: none; }
.wall-mode .collection-panel { gap: 0; }
.wall-mode .collection-hero { display: none; }
.wall-mode .collection-body { border-radius: 0; }
.wall-mode .collection-back { z-index: 2; }
.wall-mode .wall-board {
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
.wall-mode .collection-skeleton {
  border: 0;
  border-radius: 0;
  padding: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

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

/* 右上角快捷操作：定位正在播放、切换照片墙/列表 */
.collection-actions {
  position: absolute;
  top: 51px;
  right: 22px;
  z-index: 3;
  display: flex;
  gap: 8px;
}
.collection-action {
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
  transition: color var(--t-fast), border-color var(--t-fast), background var(--t-fast), transform var(--t-fast);
}
.collection-action:hover {
  color: #000;
  border-color: var(--glass-border-hover);
  background: rgba(255, 255, 255, 0.6);
}
.collection-action:active { transform: scale(0.94); }
/* 切换视图时刷新图标转一圈 */
.collection-action .action-spin { animation: action-spin 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
@keyframes action-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

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
  position: relative;
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

/* ---- 照片墙：封面无缝平铺，整块画布可无限拖动（参考探索页） ---- */
.wall-board {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--glass-border);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.42);
  box-shadow: var(--shadow-glass);
  backdrop-filter: blur(28px) saturate(1.3);
  -webkit-backdrop-filter: blur(28px) saturate(1.3);
  touch-action: none;
}
.wall-track { position: absolute; inset: 0; will-change: transform; }
.wall-canvas {
  position: absolute;
  left: 50%;
  top: 50%;
  will-change: transform;
  contain: layout style paint;
}
.wall-tile {
  position: absolute;
  top: 0;
  left: 0;
  padding: 0;
  overflow: hidden;
  background: rgba(70, 55, 110, 0.08);
  cursor: pointer;
}
/* 歌曲占不满格阵时的空位：只留一层极淡的格子底，不重复贴封面 */
.wall-tile.empty {
  background: rgba(116, 100, 150, 0.05);
  box-shadow: inset 0 0 0 1px rgba(116, 100, 150, 0.05);
  cursor: default;
}
/* 正在播放：封面微微浮起、accent 描边柔光，底部信息常驻 */
.wall-tile.playing {
  z-index: 3;
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--ex-accent, #6d5df0) 85%, transparent),
    0 12px 30px rgba(10, 8, 20, 0.42),
    0 0 26px color-mix(in srgb, var(--ex-accent, #6d5df0) 38%, transparent);
}
.wall-tile.playing img {
  transform: scale(1.05);
  transition: transform 0.3s ease;
}
/* 封面底部一层 accent 染色，让它从格阵里"热"起来 */
.wall-tile.playing::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    transparent 42%,
    color-mix(in srgb, var(--ex-accent, #6d5df0) 26%, transparent)
  );
}
/* 封面正中的跳动均衡器，最直观的"正在播"信号 */
/* 封面正中的跳动均衡器，只留白条本身，不垫底色 */
.wall-eq {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 4;
  display: flex;
  align-items: flex-end;
  gap: 5px;
  height: 48px;
  padding: 0;
  filter: drop-shadow(0 2px 8px rgba(6, 4, 12, 0.55));
}
.wall-eq i {
  display: block;
  width: 7px;
  height: 100%;
  border-radius: 3px;
  background: #fff;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.75);
  transform-origin: bottom;
  animation: wall-eq-bounce 0.86s ease-in-out infinite;
}
.wall-eq i:nth-child(1) { animation-delay: -0.52s; }
.wall-eq i:nth-child(2) { animation-delay: -0.26s; }
.wall-eq i:nth-child(3) { animation-delay: -0.72s; }
.wall-eq i:nth-child(4) { animation-delay: -0.08s; }
.wall-eq i:nth-child(5) { animation-delay: -0.62s; }
.wall-eq i:nth-child(6) { animation-delay: -0.38s; }
@keyframes wall-eq-bounce {
  0%, 100% { transform: scaleY(0.24); }
  50% { transform: scaleY(1); }
}
.wall-tile img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
  animation: cover-in 0.35s ease;
}
.wall-tile-name {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 22px 10px 8px;
  overflow: hidden;
  background: linear-gradient(180deg, transparent, rgba(10, 8, 20, 0.78));
  color: #fff;
  opacity: 0;
  z-index: 2;
  transition: opacity 0.16s ease;
}
.wall-tile-name b {
  font-size: 14px;
  line-height: 1.25;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wall-tile-name small {
  font-size: 11px;
  line-height: 1.2;
  color: rgba(255, 255, 255, 0.72);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wall-tile:hover .wall-tile-name { opacity: 1; }
.wall-vip { position: absolute; top: 6px; right: 6px; z-index: 2; }
/* 版权受限：彻底压成黑白，并加深对比，一眼看出不可播 */
.wall-tile.unavailable img { filter: grayscale(1) brightness(0.82) contrast(1.15); opacity: 0.55; }
.wall-tile.no-source img { filter: grayscale(1); opacity: 0.55; }

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
/* 列表左侧的播放标识：与照片墙同一语义，尺寸收进序号列 */
.track-eq {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
  height: 15px;
  color: var(--text-primary);
}
.track-eq i {
  display: block;
  width: 2.5px;
  height: 100%;
  border-radius: 1.5px;
  background: currentColor;
  transform-origin: bottom;
  animation: track-eq-bounce 0.86s ease-in-out infinite;
}
.track-eq i:nth-child(1) { animation-delay: -0.52s; }
.track-eq i:nth-child(2) { animation-delay: -0.26s; }
.track-eq i:nth-child(3) { animation-delay: -0.72s; }
.track-eq i:nth-child(4) { animation-delay: -0.08s; }
.track-eq i:nth-child(5) { animation-delay: -0.62s; }
.track-eq i:nth-child(6) { animation-delay: -0.38s; }
@keyframes track-eq-bounce {
  0%, 100% { transform: scaleY(0.24); }
  50% { transform: scaleY(1); }
}
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
  .track-art img,
  .wall-tile img,
  .wall-eq i { animation: none; }
  .track-eq i { animation: none; transform: scaleY(0.6); }
  .wall-tile.playing img { transition: none; }
  .wall-tile-name { transition: none; }
  .collection-action .action-spin { animation: none; }
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
/* 正在播放的行常显暂停键，右侧也能直接看出当前放的是哪首 */
.track-play.live { opacity: 1; color: var(--ex-accent); }
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
/* 汽水列表会员标：借网易云的方角描边样式，配色保留汽水绿 */
.vip-tag.soda {
  padding: 0 4px;
  border: 1px solid rgba(4, 120, 60, 0.55);
  border-radius: 4px;
  background: linear-gradient(180deg, #02803f, #187f4c 58%, #3d9e6f);
  color: #51f53c;
  font-weight: 700;
  
  letter-spacing: 0.02em;
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-row::after,
  .sk-block::after,
  .collection-art.sk-cover::after { animation: none; opacity: 0; }
}</style>