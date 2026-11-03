<template>
  <!-- 探索页：歌单按行列铺开，整块可拖动 -->
  <section class="explore-stage" ref="rootEl" :style="stageVars">
    <div class="galaxy-viewport" ref="viewportEl" :class="{ 'sync-loading': wallLoading }">
      <div class="galaxy-aurora" aria-hidden="true"></div>

      <!-- 整体缩放层（拖拽在子层进行，避免 transform 冲突） -->
      <div v-show="isWall || !wallCards.length" class="galaxy-scale" :style="{ scale: String(galaxyScale) }">
          <div class="galaxy-track" ref="trackEl" :class="{ locked: !flowOn }">
          <!-- ============ 主视图：3×3 平铺，拖动时环回，歌单少也能一直拖 ============ -->
          <div class="galaxy-field" ref="fieldEl" :class="{ 'square-wall': isSquareWall }" v-show="!active">
            <div
              v-for="tile in galaxyTiles"
              :key="tile.key"
              class="galaxy-tile"
              :style="tileStyle(tile)"
            >
            <div class="galaxy">
            <!-- 网格线：横平竖直，落在格子边界上，不穿过封面 -->
            <svg v-if="!isSquareWall" class="galaxy-map" :viewBox="`0 0 ${GALAXY_W} ${GALAXY_H}`" aria-hidden="true">
              <line
                v-for="line in MAP_LINES"
                :key="line.key"
                class="map-line"
                :x1="line.x1"
                :y1="line.y1"
                :x2="line.x2"
                :y2="line.y2"
              />
            </svg>

            <!-- 歌单：横平竖直一格一张，我喜欢的音乐与自建歌单占住正中央 -->
            <div
              v-for="card in wallCards"
              :key="card.key"
              class="orbit-node wall-node"
              :style="cardStyle(card)"
            >
              <button
                class="node-card playlist-card"
                :aria-label="card.item.name"
                @mouseenter="showCardLabel(card, $event)"
                @mouseleave="hideCardLabel"
                @click="openCard(card)"
              >
                <span class="node-cover">
                  <img v-if="card.item.cover" :src="wallCover(card.item.cover)" alt="" loading="lazy" decoding="async" draggable="false" @error="onCoverError" />
                  <span v-else-if="card.favorite" class="cover-fallback liked-fallback"><Heart :size="30" /></span>
                  <img v-else :src="fallbackCover" alt="" loading="lazy" decoding="async" draggable="false" />
                </span>
              </button>
            </div>

            <!-- 空着的格子用空唱片套补齐，不留下整格的空白 -->
            <div
              v-if="emptyGhosts.length"
              class="ghost-wall"
              :class="{ breathing: loading }"
              aria-hidden="true"
            >
              <span
                v-for="ghost in emptyGhosts"
                :key="ghost.key"
                class="ghost-sleeve"
                :class="{ blank: ghost.blank }"
                :style="ghostStyle(ghost)"
              >
                <component :is="ghost.icon" :size="26" />
              </span>
            </div>
            </div>
            </div>
          </div>

        </div>
      </div>

      <!-- ============ 动态排布：行云 / 左右 45° 斜列 ============ -->
      <div
        v-if="!isWall && !active && wallCards.length"
        ref="driftPlaneEl"
        class="drift-plane"
        :style="driftVars"
        :class="{
          still: !flowOn || reduceMotion,
          locked: !flowOn,
          dragging: driftDragging,
          'tilted-left': layoutMode === 'tilt-left',
          'tilted-right': layoutMode === 'tilt-right'
        }"
      >
        <!-- 不可见的拖拽代理：GSAP 只记录指针位移，真正的位移由行轨道环回消费 -->
        <div ref="driftProxyEl" class="drift-proxy" aria-hidden="true"></div>
        <!-- 拖拽层独立于旋转层，避免 GSAP 的位移覆盖 rotate 变换 -->
        <div class="drift-drag">
          <div class="drift-rotor" :style="rotorStyle">
            <div
              v-for="row in driftRows"
              :key="row.key"
              class="drift-row"
              :style="driftRowStyle(row)"
            >
              <div class="drift-shift">
                <div
                  class="drift-track"
                  :class="{ reverse: row.reverse }"
                  :style="{ animationDuration: `${row.duration}s`, animationDelay: `${row.delay}s` }"
                >
                  <div v-for="copy in 3" :key="copy" class="drift-group">
                    <button
                      v-for="(card, index) in row.cards"
                      :key="`${copy}-${index}-${card.key}`"
                      class="drift-card"
                      :aria-label="card.item.name"
                      @mouseenter="showCardLabel(card, $event)"
                      @mouseleave="hideCardLabel"
                      @click="openCard(card)"
                    >
                      <span class="node-cover">
                        <img v-if="card.item.cover" :src="wallCover(card.item.cover)" alt="" loading="lazy" decoding="async" draggable="false" @error="onCoverError" />
                        <span v-else-if="card.favorite" class="cover-fallback liked-fallback"><Heart :size="30" /></span>
                        <img v-else :src="fallbackCover" alt="" loading="lazy" decoding="async" draggable="false" />
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ============ 详情视图：与「我的音乐 / 歌单」共用同一套展开层 ============ -->
      <CollectionDetail
        v-if="active"
        :name="active.name"
        :cover="active.cover"
        :kind="active.kind"
        :tracks="activeTracks"
        :loading="loadingTracks"
        :error="trackError"
        :queue-open="queueOpen"
        :fallback-cover="fallbackCover"
        :accent="stagePalette.accent"
        :glow="stagePalette.glow"
        @close="collapse()"
        @play-track="playFromCollection"
      />

      <!-- 载入：整面骨架格盖住画布，真实封面全部解码完再一次性揭开 -->
      <transition name="loading-fade">
        <div
          v-if="wallLoading && !active"
          class="skeleton-wall"
          role="status"
          aria-live="polite"
          aria-label="正在载入音乐空间"
        >
          <div class="skeleton-field" :style="{ scale: String(galaxyScale) }" aria-hidden="true">
            <div
              v-for="tile in galaxyTiles"
              :key="tile.key"
              class="skeleton-tile-layer"
              :style="{ transform: `translate3d(${tile.x}px, ${tile.y}px, 0)` }"
            >
              <svg v-if="!isSquareWall" class="galaxy-map" :viewBox="`0 0 ${GALAXY_W} ${GALAXY_H}`" aria-hidden="true">
                <line
                  v-for="line in MAP_LINES"
                  :key="line.key"
                  class="map-line"
                  :x1="line.x1"
                  :y1="line.y1"
                  :x2="line.x2"
                  :y2="line.y2"
                />
              </svg>
              <span
                v-for="cell in wallCells"
                :key="`${cell.x}-${cell.y}`"
                class="skeleton-tile"
                :class="{ square: isSquareWall }"
                :style="skeletonStyle(cell)"
              ></span>
            </div>
          </div>
          <div class="skeleton-status">
            <span class="skeleton-dot" aria-hidden="true"></span>
            <span class="skeleton-copy">
              <span class="skeleton-kicker mono">SYNCING LIBRARY</span>
              <strong>{{ syncTitle }}</strong>
              <small>{{ syncHint }}</small>
            </span>
          </div>
        </div>
      </transition>
      <div v-if="isEmpty && !active && !wallLoading" class="galaxy-empty galaxy-void">
        <span class="void-medallion" aria-hidden="true">
          <template v-if="!connected">
            <span class="void-orbit">
              <span
                v-for="(logo, index) in PLATFORM_LOGOS"
                :key="logo.name"
                class="void-orbit-item"
                :style="platformLogoStyle(index)"
              >
                <img :src="logo.src" alt="" />
              </span>
            </span>
            <span class="void-orbit-hub"></span>
          </template>
          <Disc3 v-else :size="30" />
        </span>
        <span class="void-kicker mono">{{ connected ? 'EMPTY SPACE' : 'NOT CONNECTED' }}</span>
        <p>{{ connected ? '音乐空间暂时安静' : '还没有你的音乐' }}</p>
        <small>{{ connected ? '去发现页搜一首喜欢的歌，它会留在收藏里' : platformKey === 'soda' ? '登录汽水音乐后，歌单、收藏与推荐会在这里铺开' : '连接网易云音乐或汽水音乐，歌单、收藏与推荐会在这里铺开' }}</small>
        <button v-if="!connected" class="empty-cta" @click="emit('open-platform')">{{ platformKey === 'soda' ? '登录汽水音乐' : '选择音乐平台' }}</button>
      </div>

      <!-- 排布切换：格阵 / 行云 / 左右倾斜，可切换自动流动或静止 -->
      <div v-if="!active && (loading || wallCards.length || guide)" class="layout-dock" :class="{ open: layoutOpen }">
        <button
          class="layout-trigger"
          :aria-expanded="layoutOpen"
          aria-label="切换歌单排布"
          :data-tip="layoutLabel"
          @click="layoutOpen = !layoutOpen"
        >
          <component :is="currentLayoutIcon" :size="15" />
        </button>
        <transition name="dock-pop">
          <div v-if="layoutOpen" class="layout-menu" role="menu" aria-label="歌单排布">
            <p class="layout-menu-kicker mono">ARRANGEMENT</p>
            <div class="layout-options">
              <button
                v-for="option in LAYOUT_OPTIONS"
                :key="option.value"
                class="layout-option"
                :class="{ active: layoutMode === option.value }"
                role="menuitemradio"
                :aria-checked="layoutMode === option.value"
                @click="setLayout(option.value)"
              >
                <component :is="option.icon" :size="15" />
                <span>{{ option.label }}</span>
              </button>
            </div>
            <div v-if="isWall" class="shape-block">
              <p class="layout-menu-kicker mono">COVER</p>
              <div class="layout-options" role="radiogroup" aria-label="封面形状">
                <button
                  class="layout-option"
                  :class="{ active: !squareCovers }"
                  role="radio"
                  :aria-checked="!squareCovers"
                  @click="setSquareCovers(false)"
                >
                  <Circle :size="15" />
                  <span>圆形</span>
                </button>
                <button
                  class="layout-option"
                  :class="{ active: squareCovers }"
                  role="radio"
                  :aria-checked="squareCovers"
                  @click="setSquareCovers(true)"
                >
                  <Square :size="15" />
                  <span>方形</span>
                </button>
              </div>
            </div>
            <button class="flow-row" role="switch" :aria-checked="flowOn" @click="toggleFlow">
              <span class="flow-copy">
                <strong>可移动</strong>
                <small>{{ flowHint }}</small>
              </span>
              <i class="flow-switch" :class="{ on: flowOn }"><i></i></i>
            </button>
          </div>
        </transition>
      </div>
      <div v-if="layoutOpen" class="layout-veil" @click="layoutOpen = false"></div>

      <p v-if="!wallLoading && (active || wallCards.length)" class="galaxy-hint mono" :class="{ faded: dragged && !active }">
        {{ hintText }}
      </p>
    </div>

    <!-- 悬停标签放在缩放层外，避免缩放重采样把文字弄糊 -->
    <Teleport to="body">
      <span
        v-if="hoverLabel"
        class="wall-tooltip"
        :style="{
          left: hoverLabel.x + 'px',
          top: hoverLabel.y + 'px',
          transform: `translate(-50%, ${hoverLabel.above ? '-100%' : '0'})`
        }"
      >{{ hoverLabel.name }}<i class="wall-tag mono">{{ hoverLabel.tag }}</i></span>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Component } from 'vue'
import type { MusicInfo } from '../composables/useNetease'
import gsap from 'gsap'
import { Draggable } from 'gsap/Draggable'
import { InertiaPlugin } from 'gsap/InertiaPlugin'
import { ArrowDownRight, ArrowUpRight, Circle, Disc3, Headphones, Heart, LayoutGrid, ListMusic, Music2, Radio, Rows3, Square } from '@lucide/vue'
import CollectionDetail from './CollectionDetail.vue'
import { loadCover } from '../utils/cover'
import neteaseLogo from '../assets/platforms/netease.png'
import qqLogo from '../assets/platforms/qq.png'
import sodaLogo from '../assets/platforms/soda.png'

gsap.registerPlugin(Draggable, InertiaPlugin)

// 空状态徽章把已接入 / 即将接入的平台标识一起摆在环上，整圈缓慢旋转
const PLATFORM_LOGOS = [
  { name: '网易云音乐', src: neteaseLogo },
  { name: 'QQ 音乐', src: qqLogo },
  { name: '汽水音乐', src: sodaLogo }
]
const ORBIT_RADIUS = 26

function platformLogoStyle(index: number) {
  const angle = (index / PLATFORM_LOGOS.length) * Math.PI * 2 - Math.PI / 2
  return {
    transform: `translate(${Math.cos(angle) * ORBIT_RADIUS}px, ${Math.sin(angle) * ORBIT_RADIUS}px)`
  }
}

interface ExplorePlaylist {
  id: string
  name: string
  cover: string
  count?: number
  trackCount?: number
  creator?: string
  kind?: string
}

interface WallCard {
  key: string
  item: ExplorePlaylist
  favorite: boolean
  tag: string
  x: number
  y: number
}
// 动态排布只用到歌单本身，不需要格阵里的坐标
type WallPick = Omit<WallCard, 'x' | 'y'>

const props = defineProps<{
  mine: ExplorePlaylist[]
  platform: ExplorePlaylist[]
  favorites: MusicInfo[]
  likedCover: string
  fallbackCover: string
  palette: { accent: string; glow: string }
  connected: boolean
  // 汽水没有账号，心形收藏节点只属于网易云
  showFavorites?: boolean
  platformKey?: 'netease' | 'soda'
  loading: boolean
  // 新手引导期间即使还没歌单也把排布按钮亮出来，作为引导的落点
  guide?: boolean
  // 播放队列展开时详情页要给右侧队列让位，左栏与列表按比例收缩
  queueOpen?: boolean
}>()

const emit = defineEmits<{
  (e: 'play-track', track: MusicInfo, queue: MusicInfo[], index: number): void
  (e: 'accent', palette: { accent: string; glow: string } | null): void
  (e: 'open-platform'): void
  (e: 'collection-open', name: string): void
  (e: 'collection-close'): void
}>()

function onCoverError(event: Event) {
  const image = event.target as HTMLImageElement | null
  if (!image || image.src === props.fallbackCover) return
  image.src = props.fallbackCover
}

const rootEl = ref<HTMLElement | null>(null)
const viewportEl = ref<HTMLElement | null>(null)
const trackEl = ref<HTMLElement | null>(null)
const fieldEl = ref<HTMLElement | null>(null)
const driftPlaneEl = ref<HTMLElement | null>(null)
const driftProxyEl = ref<HTMLElement | null>(null)

const active = ref<{ id: string; name: string; cover: string; kind: 'playlist' | 'favorites' } | null>(null)
const activeTracks = ref<MusicInfo[]>([])
const loadingTracks = ref(false)
const trackError = ref('')
const localPalette = ref<{ accent: string; glow: string } | null>(null)
const dragged = ref(false)
const driftDragging = ref(false)
const driftDragY = ref(0)
const galaxyScale = ref(1)

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ============ 排布：格阵 / 行云 / 45° 斜列，封面另分圆形与方形 ============ */
// 行云的每一行反方向缓慢平移；左右倾斜把整块行云转 45°，
// 行内位移落在平面对角线上，视觉上就是沿 y=±x 直线流动。
type LayoutMode = 'grid' | 'rows' | 'tilt-left' | 'tilt-right'

interface LayoutOption {
  value: LayoutMode
  label: string
  icon: Component
}

const LAYOUT_OPTIONS: LayoutOption[] = [
  { value: 'grid', label: '格阵', icon: LayoutGrid },
  { value: 'rows', label: '行云', icon: Rows3 },
  { value: 'tilt-left', label: '左倾', icon: ArrowUpRight },
  { value: 'tilt-right', label: '右倾', icon: ArrowDownRight }
]

const LAYOUT_STORAGE = 'dafen.explore.layout'
const FLOW_STORAGE = 'dafen.explore.flow'
const SHAPE_STORAGE = 'dafen.explore.square'

function readStored(key: string, fallback: string) {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}

const storedLayout = readStored(LAYOUT_STORAGE, 'grid')
const layoutMode = ref<LayoutMode>(
  LAYOUT_OPTIONS.some(option => option.value === storedLayout) ? storedLayout as LayoutMode : 'grid'
)
const flowOn = ref(readStored(FLOW_STORAGE, '1') !== '0')
// 旧版本把「方形」当成一种排布；读到时落到格阵，形状保持方形
const squareCovers = ref(storedLayout === 'square' || readStored(SHAPE_STORAGE, '1') !== '0')
const layoutOpen = ref(false)
const viewportSize = ref({ w: 1280, h: 760 })

const isTilted = computed(() => layoutMode.value === 'tilt-left' || layoutMode.value === 'tilt-right')
// 只有格阵有圆形/方形之分：方形把封面撑满整格、四边相接
const isWall = computed(() => layoutMode.value === 'grid')
const isSquareWall = computed(() => isWall.value && squareCovers.value)
const layoutLabel = computed(() => LAYOUT_OPTIONS.find(option => option.value === layoutMode.value)?.label || '格阵')
const currentLayoutIcon = computed(() => LAYOUT_OPTIONS.find(option => option.value === layoutMode.value)?.icon || LayoutGrid)
const flowHint = computed(() => {
  if (isWall.value) return flowOn.value ? '拖动自由移动画布' : '画布锁定在当前位置'
  if (layoutMode.value === 'rows') return flowOn.value ? '拖动挪动画布 · 左右交替流动' : '冻结当前排布'
  return flowOn.value ? '拖动挪动画布 · 沿 45° 对角线流动' : '冻结当前排布'
})
const hintText = computed(() => {
  if (active.value) return '按 ESC 或点击返回退出'
  if (layoutMode.value === 'grid') return flowOn.value ? '拖动探索 · 自由移动' : '格阵 · 画布已锁定'
  if (layoutMode.value === 'rows') return flowOn.value ? '行云 · 拖动探索 · 交替流动' : '行云 · 静止排布'
  return flowOn.value ? `${layoutLabel.value} · 拖动探索 · 对角线流动` : `${layoutLabel.value} · 静止排布`
})

const DRIFT_COVER = 140
const DRIFT_GAP = 40
const DRIFT_SPEED = 18

// 沿用格阵的 140 封面 + 40 空隙（180 间距），并叠加同一套画布缩放，
// 切到行云/斜列时封面大小和疏密不跳变，只是原来的格子开始流动
const driftMetrics = computed(() => {
  const cover = Math.round(DRIFT_COVER * galaxyScale.value)
  const gap = Math.round(DRIFT_GAP * galaxyScale.value)
  return { cover, gap, pitch: cover + gap }
})
const driftGeometry = computed(() => {
  const { w, h } = viewportSize.value
  const pitch = driftMetrics.value.pitch
  const tilted = isTilted.value
  // 45° 旋转后视口在轨道坐标里的投影最多 span，转子再留一圈余量即可
  const span = (w + h) / Math.SQRT2
  const rotorSize = Math.ceil(span + pitch * 2)
  // 每行正好一个 pitch 高，环回后整圈无缝铺满，比 span 多一行就够盖住接缝
  const rowsFit = Math.ceil(h / pitch)
  const rowCount = tilted
    ? Math.min(28, Math.max(4, Math.ceil(span / pitch) + 1))
    // 行云保持 5 行的疏朗排布，窗口更高时补足行数，保证竖向环回不露白
    : Math.max(2, rowsFit < 5 ? rowsFit + 1 : rowsFit)
  const rowWidth = tilted ? rotorSize : w + pitch
  // 三份轨道还要兜住 ±半组的拖拽相位，序列按可见宽度再留一个 pitch
  const sequenceWidth = tilted ? span + pitch : rowWidth
  const sequenceLength = Math.max(4, Math.ceil(sequenceWidth / pitch))
  const groupWidth = sequenceLength * pitch
  return { tilted, span, rotorSize, rowCount, rowWidth, period: rowCount * pitch, sequenceLength, groupWidth, pitch }
})

const driftVars = computed(() => ({
  '--drift-cover': `${driftMetrics.value.cover}px`,
  '--drift-gap': `${driftMetrics.value.gap}px`,
  '--drift-row': `${driftMetrics.value.pitch}px`,
  '--drift-group': `${driftGeometry.value.groupWidth}px`
}))

interface DriftRow {
  key: string
  baseY: number
  cards: WallPick[]
  duration: number
  reverse: boolean
  delay: number
}

const driftRows = computed<DriftRow[]>(() => {
  const cards = cardPicks.value
  if (!cards.length) return []
  const { tilted, rowCount, sequenceLength, pitch } = driftGeometry.value
  return Array.from({ length: rowCount }, (_, index) => {
    // 每行从全量歌单里取一段等距错开的连续窗口：一行内封面互不重复，
    // 行与行之间也彼此错开，不会每几张就绕回同一小组
    const rowCards: WallPick[] = []
    const offset = Math.round((index * cards.length) / rowCount)
    for (let i = 0; i < sequenceLength; i++) {
      rowCards.push(cards[(offset + i) % cards.length])
    }
    return {
      key: `row-${index}`,
      // 行云以视口中心对称排开，两种排布都按整圈行数做竖向环回
      baseY: tilted ? index * pitch : (index - (rowCount - 1) / 2) * pitch,
      cards: rowCards,
      duration: Math.max(40, Math.round((sequenceLength * pitch) / DRIFT_SPEED) + index * 4),
      // 相邻行反向流动，并给每行一个错开的相位，避免整块画布像一张纸同向平移
      reverse: index % 2 === 1,
      delay: -(index * 5.5 + (index % 3) * 1.7)
    }
  })
})

const rotorStyle = computed(() => {
  const { tilted, rotorSize, rowWidth } = driftGeometry.value
  if (!tilted) {
    return {
      width: `${rowWidth}px`,
      height: '100%',
      transform: 'translate(-50%, -50%)'
    }
  }
  const angle = layoutMode.value === 'tilt-left' ? -45 : 45
  return {
    width: `${rotorSize}px`,
    height: `${rotorSize}px`,
    transform: `translate(-50%, -50%) rotate(${angle}deg)`
  }
})

function wrapSigned(value: number, period: number) {
  return ((value + period / 2) % period + period) % period - period / 2
}

function driftRowStyle(row: DriftRow) {
  const { period } = driftGeometry.value
  const y = wrapSigned(row.baseY + driftDragY.value, period)
  return { transform: `translateY(calc(-50% + ${y}px))` }
}

// 画布尺寸必须正好等于歌单格阵列的整数倍：七列五行就是 7×5 个格子。
// 之前留了半格边距，平铺后块与块之间会空出一整列/一整行「空白格子」。
const GALAXY_W = 1260
const GALAXY_H = 900

/* ============ 无限画布 ============ */
// 把同一套星空平铺成 3×3。拖动时让每个 tile 在 3 倍画布范围内环回，
// 视觉上就是没有边界的星空；歌单只有几个也能一直拖下去。
const TILE_OFFSETS = [-1, 0, 1]
const galaxyTiles = TILE_OFFSETS.flatMap((ty, yi) =>
  TILE_OFFSETS.map((tx, xi) => ({
    key: `${xi}-${yi}`,
    index: yi * 3 + xi,
    x: tx * GALAXY_W,
    y: ty * GALAXY_H
  }))
)
const tileOffsets = ref(galaxyTiles.map(({ x, y }) => ({ x, y })))

function wrapOffset(value: number, size: number) {
  const period = size * 3
  return ((value + size * 1.5) % period + period) % period - size * 1.5
}

function tileStyle(tile: (typeof galaxyTiles)[number]) {
  const offset = tileOffsets.value[tile.index]
  return { transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }
}

// 把 track 的位移换算成每个 tile 的相对位移：视觉位置环回，DOM 只保留 9 份。
function syncTiles() {
  if (!trackEl.value) return
  const tx = Number(gsap.getProperty(trackEl.value, 'x')) || 0
  const ty = Number(gsap.getProperty(trackEl.value, 'y')) || 0
  for (const tile of galaxyTiles) {
    const offset = tileOffsets.value[tile.index]
    offset.x = wrapOffset(tile.x + tx, GALAXY_W) - tx
    offset.y = wrapOffset(tile.y + ty, GALAXY_H) - ty
  }
}

// 进入歌单详情时把画布归位，保证「返回」和曲目始终在视野正中心。
function resetTrack() {
  if (!trackEl.value) return
  gsap.killTweensOf(trackEl.value)
  gsap.set(trackEl.value, { x: 0, y: 0, scale: 1 })
  syncTiles()
}

let draggables: Draggable[] = []
let animating = false
let paletteToken = 0
let recenterTween: gsap.core.Tween | null = null

/* ============ 布局：横平竖直的歌单格 ============ */
// 七列五行，封面严格按行列对齐；离中心越近越属于你自己，
// 因此排序后喜欢和自建歌单会落在正中央的 3×3 里。
const WALL_COLS = 7
const WALL_ROWS = 5
const WALL_GAP = 180
const WALL_COVER = 140

const wallCells = (() => {
  const cells: { x: number; y: number }[] = []
  for (let row = 0; row < WALL_ROWS; row++) {
    for (let col = 0; col < WALL_COLS; col++) {
      cells.push({
        x: (col - (WALL_COLS - 1) / 2) * WALL_GAP,
        y: (row - (WALL_ROWS - 1) / 2) * WALL_GAP
      })
    }
  }
  // 以正中心为原点由内向外分配：正中心一定留给自己的歌单
  return cells.sort((a, b) => (a.x * a.x + a.y * a.y) - (b.x * b.x + b.y * b.y))
})()

const likedCover = computed(() =>
  props.likedCover
  || props.favorites.find(track => !track.unavailable)?.img
  || props.favorites[0]?.img
  || ''
)

// 墙上的封面在屏幕里最大不到 210px，按 480px 取图即可，别让网易原图白占显存
const wallCoverCache = new Map<string, string>()
function wallCover(url: string) {
  if (!url) return url
  const cached = wallCoverCache.get(url)
  if (cached) return cached
  let next = url
  try {
    const parsed = new URL(url)
    if (/(^|\.)music\.126\.net$/i.test(parsed.hostname)) {
      parsed.searchParams.set('param', '480y480')
      next = parsed.toString()
    }
  } catch {
    // 非绝对地址或本地兜底图保持原样
  }
  wallCoverCache.set(url, next)
  return next
}

// 全量歌单卡：格阵只铺前 35 个，行云/斜列需要更长的序列，用满所有歌单来摊薄重复
const cardPicks = computed<WallPick[]>(() => {
  const picks: Omit<WallCard, 'x' | 'y'>[] = []
  const seen = new Set<string>()
  const seenNames = new Set<string>()
  const nameKey = (name: string) => String(name || '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()
  const add = (item: ExplorePlaylist, tag: string, favorite = false) => {
    if (!item?.id || seen.has(item.id)) return
    // 不同来源（自建 / 推荐 / 收藏）常有同名歌单，墙面只留一个入口
    const key = nameKey(item.name)
    if (key && seenNames.has(key)) return
    seen.add(item.id)
    if (key) seenNames.add(key)
    picks.push({ key: item.id, item, favorite, tag })
  }

  if (props.connected && props.showFavorites !== false) {
    add({ id: 'liked', name: '我喜欢的音乐', cover: likedCover.value, kind: 'favorites' }, 'FAVORITES', true)
  }
  for (const item of props.mine.slice(0, 8)) add(item, 'MINE')

  const platformTag = props.platformKey === 'soda' ? 'SODA' : 'FOR YOU'
  for (const item of props.platform) add(item, platformTag)

  return picks
})

const wallCards = computed<WallCard[]>(() =>
  cardPicks.value.slice(0, wallCells.length).map((pick, index) => ({ ...pick, ...wallCells[index] }))
)

// 歌单被清空或进入详情时关闭排布菜单，避免遮罩留在没有入口的界面上
watch(cardPicks, cards => {
  if (!cards.length) layoutOpen.value = false
})

// 切平台或同步时先等所有歌单封面解码完再揭开画布，避免先露出一片空白封面色块。
const coverReady = ref(true)
const readyCovers = new Set<string>()
let coverReadyToken = 0
watch(cardPicks, (cards) => {
  const urls = [...new Set(
    cards.map(card => wallCover(card.item.cover)).filter((url): url is string => Boolean(url))
  )]
  const pending = urls.filter(url => !readyCovers.has(url))
  if (!pending.length) return
  const token = ++coverReadyToken
  coverReady.value = false
  void Promise.all(pending.map(loadCover)).then(() => {
    if (token !== coverReadyToken) return
    for (const url of pending) readyCovers.add(url)
    coverReady.value = true
  })
}, { immediate: true })

const wallLoading = computed(() => props.loading || !coverReady.value)
const syncTitle = computed(() => props.loading ? '正在同步音乐空间' : '正在整理封面')
const syncHint = computed(() => {
  if (!props.loading) return '封面正在逐一解码，马上铺满这面墙'
  return props.connected ? '账号里的歌单与封面正在逐一就位' : '推荐歌单与封面正在逐一就位'
})
watch(active, value => {
  if (value) layoutOpen.value = false
})

/* ============ 空画布的幽灵封面 ============ */
// 沿画布外圈摆一圈空唱片套，登录前/同步中也有「悬浮封面」的空间感。
const GHOST_ICONS = [Music2, Heart, ListMusic, Radio, Headphones] as const

interface GhostNode {
  key: string
  x: number
  y: number
  icon: Component
  blank: boolean
  delay: number
}

const ghostNodes = (() => {
  const nodes: GhostNode[] = []
  for (let row = 0; row < WALL_ROWS; row++) {
    for (let col = 0; col < WALL_COLS; col++) {
      const seed = row * WALL_COLS + col
      const blank = seed % 6 === 5
      nodes.push({
        key: `ghost-${seed}`,
        x: (col - (WALL_COLS - 1) / 2) * WALL_GAP,
        y: (row - (WALL_ROWS - 1) / 2) * WALL_GAP,
        // 每个空套子都放图标，空白格也要有内容可看
        icon: GHOST_ICONS[(row + col * 2) % GHOST_ICONS.length],
        blank,
        delay: (seed % 5) * 0.34
      })
    }
  }
  return nodes
})()

// 只给没有真实歌单的格子铺幽灵套：歌单不足 35 张时，方形墙也不会露底
const emptyGhosts = computed(() => {
  const taken = new Set(wallCards.value.map(card => `${card.x},${card.y}`))
  return ghostNodes.filter(ghost => !taken.has(`${ghost.x},${ghost.y}`))
})

function ghostStyle(ghost: GhostNode) {
  return {
    left: `calc(50% + ${ghost.x}px)`,
    top: `calc(50% + ${ghost.y}px)`,
    animationDelay: `${ghost.delay}s`
  }
}

const hoverLabel = ref<{ name: string; tag: string; x: number; y: number; above: boolean } | null>(null)

function showCardLabel(card: WallPick, event: MouseEvent) {
  if (driftDragging.value) return
  const cover = (event.currentTarget as HTMLElement | null)?.querySelector('.node-cover')
  if (!cover) return
  const rect = cover.getBoundingClientRect()
  const above = rect.bottom + 34 > window.innerHeight
  hoverLabel.value = {
    name: card.item.name,
    tag: card.tag,
    x: Math.min(Math.max(rect.left + rect.width / 2, 140), window.innerWidth - 140),
    y: above ? rect.top - 6 : rect.bottom + 6,
    above
  }
}

function hideCardLabel() {
  hoverLabel.value = null
}

function openCard(card: WallPick) {
  hideCardLabel()
  if (card.favorite) void expandFavorites()
  else void expand(card.item)
}

function cardStyle(card: WallCard) {
  // 方形封面撑到整格（再加 1px 叠压），相邻封面之间不会出现发丝缝
  const width = isSquareWall.value ? WALL_GAP + 1 : WALL_COVER
  return {
    left: `calc(50% + ${card.x}px)`,
    top: `calc(50% + ${card.y}px)`,
    width: `${width}px`,
    zIndex: '8'
  }
}

function skeletonStyle(cell: { x: number; y: number }) {
  const size = isSquareWall.value ? WALL_GAP + 1 : WALL_COVER
  return {
    left: `calc(50% + ${cell.x}px)`,
    top: `calc(50% + ${cell.y}px)`,
    width: `${size}px`,
    height: `${size}px`
  }
}

/* ============ 网格线 ============ */
// 线条落在格子边界（间距的一半）上，与卡片同心，不会压到封面。
const MAP_LINES = (() => {
  const vertical: number[] = []
  const horizontal: number[] = []
  for (let x = WALL_GAP / 2; x <= GALAXY_W / 2; x += WALL_GAP) vertical.push(x, -x)
  for (let y = WALL_GAP / 2; y <= GALAXY_H / 2; y += WALL_GAP) horizontal.push(y, -y)
  return [
    ...vertical.map(x => ({
      key: `v${x}`,
      x1: x + GALAXY_W / 2, y1: 0,
      x2: x + GALAXY_W / 2, y2: GALAXY_H
    })),
    ...horizontal.map(y => ({
      key: `h${y}`,
      x1: 0, y1: y + GALAXY_H / 2,
      x2: GALAXY_W, y2: y + GALAXY_H / 2
    }))
  ]
})()
// 未连接时即使本地还留着收藏缓存，画布也算空：只展示连接引导。
const isEmpty = computed(() => !wallCards.value.length)

/* ============ 动态色彩 ============ */
const stagePalette = computed(() => localPalette.value || props.palette)
const stageVars = computed(() => ({
  '--ex-accent': stagePalette.value.accent,
  '--ex-glow': stagePalette.value.glow
}))

async function paintFromCover(url: string) {
  if (!url) return
  const token = ++paletteToken
  try {
    const result = await window.api?.themePalette?.(url)
    if (token !== paletteToken) return
    if (result?.success && result.data) {
      localPalette.value = result.data
      emit('accent', result.data)
    }
  } catch { /* 取色失败时沿用当前配色 */ }
}

/* ============ 展开 / 收起 ============ */
// 每次展开/收起都换一个 token，迟到的网络结果或动画回调直接丢弃。
// 这样即使歌单还在加载（接口很慢或挂起），返回 / ESC 也能立刻生效。
let openToken = 0

async function expand(item: ExplorePlaylist) {
  if (animating || active.value) return
  const token = ++openToken
  animating = true
  draggables.forEach(handle => handle.disable())
  const field = fieldEl.value
  if (!reduceMotion && field) {
    await gsap.to(field, { autoAlpha: 0, duration: 0.26, ease: 'power2.in' })
    if (token !== openToken) return
  }
  active.value = { id: item.id, name: item.name, cover: item.cover, kind: 'playlist' }
  resetTrack()
  activeTracks.value = []
  trackError.value = ''
  loadingTracks.value = true
  emit('collection-open', item.name)
  await nextTick()
  if (token !== openToken) return
  void paintFromCover(item.cover)
  try {
    const result = props.platformKey === 'soda'
      ? await window.api.sodaPlaylist(item.id)
      : await window.api.neteaseCollection('playlist', item.id)
    if (token !== openToken) return
    if (!result.success) throw new Error(result.error || '暂时无法打开这份歌单')
    activeTracks.value = result.data as MusicInfo[]
  } catch (error: any) {
    if (token !== openToken) return
    trackError.value = error.message || '歌单读取失败'
  } finally {
    if (token === openToken) loadingTracks.value = false
  }
  if (token !== openToken) return
  animating = false
}

async function expandFavorites() {
  if (animating || active.value) return
  const token = ++openToken
  animating = true
  draggables.forEach(handle => handle.disable())
  const field = fieldEl.value
  if (!reduceMotion && field) {
    await gsap.to(field, { autoAlpha: 0, duration: 0.26, ease: 'power2.in' })
    if (token !== openToken) return
  }
  active.value = { id: 'favorites', name: '我喜欢的音乐', cover: likedCover.value, kind: 'favorites' }
  resetTrack()
  activeTracks.value = [...props.favorites]
  trackError.value = ''
  loadingTracks.value = true
  emit('collection-open', active.value.name)
  await nextTick()
  if (token !== openToken) return
  void paintFromCover(likedCover.value)
  loadingTracks.value = false
  animating = false
}

function collapse(reveal = true) {
  if (!active.value) {
    // 还在入场动画 / 请求中：让发起方在下一个 await 后自动放弃
    openToken++
    if (animating) {
      animating = false
      if (fieldEl.value) {
        gsap.killTweensOf(fieldEl.value)
        gsap.set(fieldEl.value, { autoAlpha: 1 })
      }
      resetTrack()
    }
    applyFlow()
    return
  }
  openToken++
  animating = false
  active.value = null
  activeTracks.value = []
  trackError.value = ''
  loadingTracks.value = false
  localPalette.value = null
  paletteToken++
  emit('accent', null)
  emit('collection-close')
  resetTrack()
  applyFlow()
  if (reveal) void nextTick().then(() => playGalaxyIn())
}

function playGalaxyIn() {
  if (reduceMotion) {
    if (fieldEl.value) gsap.set(fieldEl.value, { autoAlpha: 1, scale: 1 })
    return
  }
  if (!fieldEl.value) return
  gsap.fromTo(fieldEl.value, { autoAlpha: 0 }, {
    autoAlpha: 1, duration: 0.6, ease: 'power2.out', overwrite: 'auto'
  })
}

/* ============ 定位回中心 ============ */
// 喜欢节点固定在画布原点，归位即回到屏幕中心
function focusFavorites() {
  if (!isWall.value) setLayout('grid')
  if (active.value || animating) collapse()
  const track = trackEl.value
  if (!track) return
  gsap.killTweensOf(track)
  const x = Number(gsap.getProperty(track, 'x')) || 0
  const y = Number(gsap.getProperty(track, 'y')) || 0
  dragged.value = false
  if (!x && !y) {
    syncTiles()
    return
  }
  if (reduceMotion) {
    gsap.set(track, { x: 0, y: 0 })
    syncTiles()
    draggables.forEach(handle => handle.update())
    applyFlow()
    return
  }
  draggables.forEach(handle => handle.disable())
  recenterTween = gsap.to(track, {
    x: 0,
    y: 0,
    duration: 0.75,
    ease: 'power3.inOut',
    onUpdate: syncTiles,
    onComplete() {
      syncTiles()
      recenterTween = null
      draggables.forEach(handle => handle.update())
      if (!active.value && !animating) applyFlow()
    }
  })
}

function playFromCollection(track: MusicInfo, index: number) {
  emit('play-track', track, [...activeTracks.value], index)
}

/* ============ 拖拽与缩放 ============ */
// 画布为无限拖拽做了 3×3 平铺：只要一块格阵盖不满视口，边上就会露出隔壁副本的同名封面，
// 看着就像歌单重复了一半。按「刚好盖满」的比例缩放，静止时视野里只有一块格阵。
function updateScale() {
  const view = viewportEl.value?.getBoundingClientRect()
  if (!view) return
  const raw = Math.max(view.width / GALAXY_W, view.height / GALAXY_H)
  galaxyScale.value = Math.min(1.6, Math.max(0.75, raw))
}

function updateViewportSize() {
  const rect = viewportEl.value?.getBoundingClientRect()
  if (!rect) return
  viewportSize.value = {
    w: Math.max(320, Math.round(rect.width)),
    h: Math.max(320, Math.round(rect.height))
  }
}

function handleResize() {
  hideCardLabel()
  updateViewportSize()
  updateScale()
}

function applyFlow() {
  // 空画布没有行云/斜列内容，直接拖格阵底图（幽灵封面），避免整屏静止
  const canDragGrid = !active.value && (isWall.value || !wallCards.value.length) && flowOn.value
  draggables.forEach(handle => {
    if (canDragGrid) handle.enable()
    else handle.disable()
  })
  if (!driftDraggable) return
  if (!isWall.value && !active.value && flowOn.value && wallCards.value.length) driftDraggable.enable()
  else driftDraggable.disable()
}

function setLayout(mode: LayoutMode) {
  layoutOpen.value = false
  hideCardLabel()
  dragged.value = false
  if (layoutMode.value !== mode) {
    layoutMode.value = mode
    try { localStorage.setItem(LAYOUT_STORAGE, mode) } catch { /* 本地存储不可用时仅本次生效 */ }
  }
  if (mode === 'grid') {
    void nextTick().then(() => {
      updateScale()
      applyFlow()
    })
  } else {
    applyFlow()
  }
}

function setSquareCovers(value: boolean) {
  if (squareCovers.value === value) return
  squareCovers.value = value
  try { localStorage.setItem(SHAPE_STORAGE, value ? '1' : '0') } catch { /* 本地存储不可用时仅本次生效 */ }
  hideCardLabel()
}

function toggleFlow() {
  flowOn.value = !flowOn.value
  try { localStorage.setItem(FLOW_STORAGE, flowOn.value ? '1' : '0') } catch { /* 本地存储不可用时仅本次生效 */ }
  applyFlow()
  hideCardLabel()
}

function setupDraggable() {
  if (!trackEl.value) return
  // 热更新后保留旧的拖拽位移会让新布局莫名偏出视野，进入时先归位
  gsap.set(trackEl.value, { x: 0, y: 0 })
  if (fieldEl.value) gsap.set(fieldEl.value, { autoAlpha: 1 })
  draggables = Draggable.create(trackEl.value, {
    type: 'x,y',
    inertia: true,
    cursor: 'grab',
    activeCursor: 'grabbing',
    allowNativeTouchScrolling: false,
    dragClickables: true,
    onPress() { dragged.value = true; hideCardLabel() },
    onDrag: syncTiles,
    onThrowUpdate: syncTiles,
    onDragEnd: syncTiles,
    onThrowComplete: syncTiles
  })
  syncTiles()
}

let driftDraggable: Draggable | null = null

// 横向位移环回进每条轨道的错位，斜列的竖向位移环回进行序：
// 画布可以一直拖下去，而不是被此前 ±一格 的 bounds 拦住。
function driftLocalShift(x: number, y: number) {
  const angle = layoutMode.value === 'tilt-left' ? -Math.PI / 4 : layoutMode.value === 'tilt-right' ? Math.PI / 4 : 0
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return {
    x: x * cos + y * sin,
    y: -x * sin + y * cos
  }
}

function syncDrift() {
  if (!driftDraggable) return
  const { groupWidth } = driftGeometry.value
  const local = driftLocalShift(driftDraggable.x, driftDraggable.y)
  const shift = wrapSigned(local.x, groupWidth)
  driftPlaneEl.value?.style.setProperty('--drift-shift', `${shift}px`)
  driftDragY.value = local.y
}

function setupDriftDraggable() {
  driftDraggable?.kill()
  driftDraggable = null
  driftDragging.value = false
  driftDragY.value = 0
  const target = driftProxyEl.value
  const plane = driftPlaneEl.value
  if (!target || !plane) {
    applyFlow()
    return
  }
  gsap.set(target, { x: 0, y: 0 })
  plane.style.setProperty('--drift-shift', '0px')
  driftDraggable = Draggable.create(target, {
    // 用固定的画布做触发区，画面被拖走后仍可从原位置继续抓住
    trigger: plane,
    type: 'x,y',
    inertia: true,
    cursor: 'grab',
    activeCursor: 'grabbing',
    allowNativeTouchScrolling: false,
    dragClickables: true,
    onPress() {
      driftDragging.value = true
      dragged.value = true
      hideCardLabel()
    },
    onDrag: syncDrift,
    onThrowUpdate: syncDrift,
    onRelease() { driftDragging.value = false },
    onDragEnd() { driftDragging.value = false },
    onThrowComplete() { driftDragging.value = false }
  })[0]
  applyFlow()
}

// 动态排布由 v-if 控制，切换排布、进出歌单或歌单从无到有后都要重建拖拽实例
watch([layoutMode, active, () => cardPicks.value.length], () => {
  void nextTick().then(setupDriftDraggable)
})
// 尺寸变化会改写封面间距与整圈行数，归位后重新建立环回参数
watch(viewportSize, () => {
  void nextTick().then(setupDriftDraggable)
})

let viewportObserver: ResizeObserver | null = null

onMounted(() => {
  updateViewportSize()
  updateScale()
  setupDraggable()
  setupDriftDraggable()
  applyFlow()
  if (viewportEl.value) {
    viewportObserver = new ResizeObserver(() => {
      updateViewportSize()
      updateScale()
    })
    viewportObserver.observe(viewportEl.value)
  }
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  openToken++
  window.removeEventListener('resize', handleResize)
  viewportObserver?.disconnect()
  viewportObserver = null
  recenterTween?.kill()
  recenterTween = null
  draggables.forEach(item => item.kill())
  draggables = []
  driftDraggable?.kill()
  driftDraggable = null
  gsap.killTweensOf('.galaxy-field')
})

// 搜索结果等外部入口：弹掉当前详情后直接打开指定歌单
function openPlaylist(item: ExplorePlaylist) {
  // 不先播放画布入场，否则会和紧接着的详情淡出抢同一层透明度
  if (active.value || animating) collapse(false)
  void expand(item)
}

defineExpose({
  enter: () => { if (!active.value) playGalaxyIn() },
  reset: () => { collapse() },
  collapse,
  focusFavorites,
  openPlaylist
})
</script>

<style scoped>
.explore-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /* 内容从窗口最上沿开始，顶部控件由外层做成浮层 */
  padding: 0;
  position: relative;
  z-index: 1;
}

/* ---- 画布视口 ---- */
.galaxy-viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  touch-action: none;
}
.galaxy-aurora {
  position: absolute;
  inset: -14%;
  pointer-events: none;
  background:
    radial-gradient(380px 300px at 50% 42%, var(--ex-glow), transparent 68%),
    radial-gradient(280px 220px at 24% 76%, rgba(90, 116, 232, 0.16), transparent 70%),
    radial-gradient(300px 240px at 78% 22%, rgba(224, 140, 175, 0.14), transparent 70%);
  transition: background 1.1s ease;
}
.galaxy-scale { position: absolute; inset: 0; }
.galaxy-track {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 2500px;
  height: 1700px;
  margin-left: -1250px;
  margin-top: -850px;
  cursor: grab;
  will-change: transform;
}
.galaxy-track:active { cursor: grabbing; }
.galaxy-field { position: absolute; inset: 0; transform-origin: 50% 50%; }
.galaxy-tile {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 1260px;
  height: 900px;
  margin-left: -630px;
  margin-top: -450px;
  will-change: transform;
  /* 3×3 平铺会产生几百张封面，离屏 tile 跳过布局与绘制，登录后同步不再卡主线程 */
  content-visibility: auto;
  contain-intrinsic-size: 1260px 900px;
}

/* ---- 分区线：贯穿画布的 45° 细线网格 ---- */
.galaxy-map {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  pointer-events: none;
}
.map-line {
  stroke: rgba(86, 74, 120, 0.2);
  stroke-width: 1;
}
/* ---- 节点通用 ---- */
/* 不要给每个节点都加 will-change：一百多个封面各自合成一层，
   GPU 显存和每帧的图层合成都会明显变重。只有动画圆片保留图层。 */
.orbit-node {
  position: absolute;
  translate: -50% -50%;
}
/* 悬停时把当前封面提到最上层 */
.orbit-node:hover { z-index: 60 !important; }
.node-card { position: relative; display: block; width: 100%; text-align: center; }
.node-cover {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 50%;
  border: 1px solid rgba(70, 55, 110, 0.12);
  background: rgba(78, 62, 112, 0.07);
  box-shadow: 0 12px 30px rgba(70, 55, 110, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.7);
  transition: transform 0.38s cubic-bezier(0.34, 1.4, 0.64, 1), box-shadow 0.38s, border-color 0.38s;
}
.node-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
/* 悬停标签 teleport 到缩放层外，按原始字号绘制，避免缩放后发虚 */
.wall-tooltip {
  position: fixed;
  z-index: 70;
  max-width: 280px;
  padding: 3px 8px;
  border: 1px solid var(--glass-border);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: var(--shadow-glass);
  color: #191722;
  font-size: 11.5px;
  letter-spacing: 0.03em;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
  animation: wall-tip-in 0.14s ease;
}
@keyframes wall-tip-in {
  from { opacity: 0; }
}
.playlist-card:hover .node-cover {
  transform: translateY(-5px) scale(1.045);
  border-color: var(--glass-border-hover);
  box-shadow: 0 20px 44px rgba(70, 55, 110, 0.18), 0 0 30px var(--ex-glow);
}

/* ---- 方形：封面撑满整格，去圆角与描边，拼成一整面无缝封面墙 ---- */
.square-wall .node-cover {
  border: 0;
  border-radius: 0;
  background: rgba(78, 62, 112, 0.08);
  box-shadow: none;
}
.square-wall .playlist-card:hover .node-cover {
  transform: scale(1.035);
  border-color: transparent;
  box-shadow:
    0 18px 40px rgba(70, 55, 110, 0.26),
    0 0 0 1px rgba(255, 255, 255, 0.45);
}

/* ---- 歌单卡片 ---- */
.wall-tag {
  margin-left: 6px;
  color: var(--text-ghost);
  font-family: var(--font-mono);
  font-size: 0.74em;
  font-style: normal;
  letter-spacing: 0.12em;
}
.cover-fallback {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: #191722;
}
.liked-fallback {
  color: #ffe6ef;
  background: radial-gradient(circle at 34% 28%, #e2648f, #6d1738 72%);
}

/* ---- 幽灵封面：空画布外圈的空唱片套 ---- */
.ghost-wall {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.ghost-sleeve {
  position: absolute;
  translate: -50% -50%;
  display: grid;
  place-items: center;
  width: 140px;
  height: 140px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.32);
  box-shadow:
    0 12px 30px rgba(70, 55, 110, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.64);
  color: rgba(25, 23, 34, 0.32);
}
.ghost-sleeve.blank {
  border-style: dashed;
  border-color: rgba(86, 74, 120, 0.16);
  background: rgba(255, 255, 255, 0.16);
  box-shadow: none;
}
/* 方形空画布：幽灵套同样铺满整格，不加任何缝 */
.square-wall .ghost-sleeve {
  /* 幽灵套是半透明的，用正好一格而不是 181px 叠压，避免接缝处颜色加深 */
  width: 180px;
  height: 180px;
  border: 0;
  border-radius: 0;
  background: rgba(255, 255, 255, 0.2);
  box-shadow: none;
  color: rgba(25, 23, 34, 0.24);
}
.square-wall .ghost-sleeve:nth-child(3n) { background: rgba(255, 255, 255, 0.26); }
.square-wall .ghost-sleeve:nth-child(4n + 1) { background: rgba(255, 255, 255, 0.14); }
.square-wall .ghost-sleeve.blank {
  border: 0;
  background: rgba(255, 255, 255, 0.11);
}
.ghost-wall.breathing .ghost-sleeve {
  animation: ghost-breathe 3.6s ease-in-out infinite;
}
@keyframes ghost-breathe {
  0%, 100% { opacity: 0.48; transform: translateY(0); }
  50% { opacity: 0.9; transform: translateY(-4px); }
}
/* 方形是整面铺满的，不能上下浮动，否则会露出缝；只做明暗呼吸 */
.square-wall .ghost-wall.breathing .ghost-sleeve {
  animation-name: ghost-glow;
}
@keyframes ghost-glow {
  0%, 100% { opacity: 0.48; }
  50% { opacity: 0.9; }
}

/* ---- 载入：整面骨架格盖住画布，等真实封面全部解码后再揭开 ---- */
.skeleton-wall {
  position: absolute;
  inset: 0;
  z-index: 15;
  overflow: hidden;
  background:
    radial-gradient(58% 48% at 50% 42%, color-mix(in srgb, var(--ex-accent) 10%, transparent), transparent 74%),
    linear-gradient(178deg, #fcfaff 0%, #f4f0fb 58%, #ece7f6 100%);
  cursor: default;
}
/* 单条高光扫过整面墙，比为每张骨架各跑一条动画省得多 */
.skeleton-wall::after {
  content: '';
  position: absolute;
  inset: -20% -45%;
  z-index: 2;
  background: linear-gradient(105deg, transparent 42%, rgba(255, 255, 255, 0.46) 50%, transparent 58%);
  transform: translateX(-55%);
  animation: skeleton-sweep 2.3s ease-in-out infinite;
  pointer-events: none;
}
.skeleton-field {
  position: absolute;
  inset: 0;
  z-index: 1;
  transform-origin: 50% 50%;
}
/* 每块骨架 tile 与真实画布同尺寸、同平铺间距，窗口再宽也不会只铺中间一块 */
.skeleton-tile-layer {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 1260px;
  height: 900px;
  margin-left: -630px;
  margin-top: -450px;
}
.skeleton-tile {
  position: absolute;
  translate: -50% -50%;
  border-radius: 50%;
  background: linear-gradient(145deg, rgba(116, 100, 150, 0.14), rgba(116, 100, 150, 0.06));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
}
.skeleton-tile.square {
  border-radius: 0;
  background: linear-gradient(145deg, rgba(116, 100, 150, 0.1), rgba(116, 100, 150, 0.05));
  box-shadow: none;
}
/* 方形无缝铺满时用淡淡的棋盘差区分格子 */
.skeleton-tile.square:nth-child(even) {
  background: linear-gradient(145deg, rgba(116, 100, 150, 0.07), rgba(116, 100, 150, 0.03));
}
.skeleton-status {
  position: absolute;
  left: 50%;
  bottom: 22px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 15px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.68);
  border: 1px solid rgba(255, 255, 255, 0.82);
  box-shadow: 0 10px 26px rgba(70, 55, 110, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(18px) saturate(1.3);
  -webkit-backdrop-filter: blur(18px) saturate(1.3);
  translate: -50% 0;
}
.skeleton-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ex-accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ex-accent) 14%, transparent);
  animation: skeleton-dot 1.8s ease-in-out infinite;
}
.skeleton-copy {
  display: grid;
  gap: 1px;
}
.skeleton-kicker {
  color: var(--ex-accent);
  font-size: 8px;
  letter-spacing: 0.22em;
}
.skeleton-copy strong {
  color: var(--text-primary);
  font: 600 12px/1.35 var(--font-body);
  letter-spacing: 0.04em;
}
.skeleton-copy small {
  color: var(--text-ghost);
  font-size: 10px;
  letter-spacing: 0.03em;
}
@keyframes skeleton-sweep {
  0% { transform: translateX(-55%); }
  100% { transform: translateX(55%); }
}
@keyframes skeleton-dot {
  0%, 100% { opacity: 0.55; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1); }
}
/* 骨架进入必须瞬时不透明：淡入的那几帧旧封面会从底下漏出来 */
.loading-fade-leave-active { transition: opacity 0.42s ease; }
.loading-fade-leave-to { opacity: 0; }
/* 骨架就位前也不让旧画布先露一帧 */
.galaxy-viewport.sync-loading .galaxy-scale,
.galaxy-viewport.sync-loading .drift-plane { visibility: hidden; }

/* ---- 空状态：玻璃卡 ---- */
.galaxy-empty {
  position: absolute;
  left: 50%;
  top: 46%;
  z-index: 20;
  translate: -50% -50%;
  display: grid;
  justify-items: center;
  gap: 8px;
  width: min(356px, 84%);
  padding: 30px 28px 28px;
  border: 1px solid rgba(255, 255, 255, 0.62);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.46);
  box-shadow:
    0 26px 60px rgba(70, 55, 110, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
  text-align: center;
  backdrop-filter: blur(30px) saturate(1.3);
  -webkit-backdrop-filter: blur(30px) saturate(1.3);
}
.galaxy-empty p { color: var(--text-primary); font-size: 14px; letter-spacing: 0.05em; }
.galaxy-empty small { max-width: 252px; color: var(--text-ghost); font-size: 10.5px; line-height: 1.8; }

.void-kicker {
  color: var(--text-ghost);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.3em;
}

/* 未连接 / 无数据：所有平台标识一起缓慢环绕 */
.void-medallion {
  position: relative;
  display: grid;
  place-items: center;
  width: 92px;
  height: 92px;
  margin-bottom: 2px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.72);
  background: radial-gradient(circle at 36% 28%, #fff, rgba(255, 255, 255, 0.6));
  box-shadow:
    0 16px 34px rgba(70, 55, 110, 0.13),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  color: #191722;
}
.void-orbit {
  position: absolute;
  inset: 0;
  animation: void-orbit-spin 20s linear infinite;
}
.void-orbit-item {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 30px;
  height: 30px;
  margin: -15px 0 0 -15px;
}
.void-orbit-item img {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 9px;
  box-shadow: 0 6px 14px rgba(70, 55, 110, 0.18);
  /* 抵消环的旋转，图标始终正立 */
  animation: void-orbit-upright 20s linear infinite;
}
.void-orbit-hub {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--amber), var(--ex-accent));
  box-shadow: 0 0 10px color-mix(in srgb, var(--amber) 22%, transparent);
  opacity: 0.72;
}
@keyframes void-orbit-spin {
  to { transform: rotate(360deg); }
}
@keyframes void-orbit-upright {
  to { transform: rotate(-360deg); }
}
.empty-cta {
  margin-top: 8px;
  height: 32px;
  padding: 0 20px;
  border-radius: var(--r-full);
  background: linear-gradient(135deg, var(--amber-bright), var(--amber-dim));
  color: #fff;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  box-shadow:
    0 10px 22px color-mix(in srgb, var(--amber) 24%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.28);
  transition: filter var(--t-fast), transform var(--t-fast), box-shadow var(--t-fast);
}
.empty-cta:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
  box-shadow:
    0 14px 26px color-mix(in srgb, var(--amber) 30%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.28);
}
.empty-cta:active { filter: brightness(0.97); transform: translateY(0); }
@media (prefers-reduced-motion: reduce) {
  .skeleton-wall::after,
  .skeleton-dot { animation: none; }
  .skeleton-wall::after { opacity: 0; }
  .ghost-wall.breathing .ghost-sleeve,
  .square-wall .ghost-wall.breathing .ghost-sleeve,
  .void-orbit,
  .void-orbit-item img { animation: none; }
}

.galaxy-hint {
  position: absolute;
  right: 8px;
  bottom: 6px;
  color: var(--text-muted);
  font-size: 8px;
  letter-spacing: 0.16em;
  opacity: 0.8;
  transition: opacity 0.6s;
  pointer-events: none;
}
.galaxy-hint.faded { opacity: 0; }

/* ---- 动态排布：行云 / 45° 斜列 ---- */
.drift-plane {
  position: absolute;
  inset: 0;
  z-index: 2;
  overflow: hidden;
  cursor: grab;
  animation: drift-in 0.45s ease both;
}
.drift-plane.locked { cursor: default; }
.drift-plane.dragging { cursor: grabbing; }
.drift-plane.dragging .drift-track { animation-play-state: paused; }
.drift-proxy {
  position: absolute;
  left: 0;
  top: 0;
  width: 1px;
  height: 1px;
  visibility: hidden;
  pointer-events: none;
}
.drift-drag {
  position: absolute;
  inset: 0;
  touch-action: none;
}
@keyframes drift-in {
  from { opacity: 0; }
}
.drift-rotor {
  position: absolute;
  left: 50%;
  top: 50%;
  transform-origin: 50% 50%;
}
.drift-row {
  position: absolute;
  left: 0;
  top: 50%;
  width: 100%;
  height: var(--drift-row);
  overflow: hidden;
}
/* 每行轨道都是独立合成层，悬停行必须抬层，否则会被后绘制的行盖住 */
.drift-row:hover {
  z-index: 5;
  overflow: visible;
}
/* 拖拽错位单独一层，不能和轨道自身的 marquee transform 抢同一个元素 */
.drift-shift {
  display: flex;
  width: max-content;
  height: 100%;
  margin-left: calc(var(--drift-group) / -2);
  transform: translate3d(var(--drift-shift, 0px), 0, 0);
}
/* 拖拽才需要单独合成一层，静止时不多占一整行的大图层 */
.drift-plane.dragging .drift-shift { will-change: transform; }
.drift-track {
  display: flex;
  width: max-content;
  animation-name: drift-marquee;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  will-change: transform;
}
/* 冻结排布时动画不再跑，顺手收回轨道的常驻图层 */
.drift-plane.still .drift-track { will-change: auto; }
/* 相邻行反向流动，整面画布不再像一块板同向滑动 */
.drift-track.reverse { animation-direction: reverse; }
.drift-group {
  display: flex;
  align-items: center;
  gap: var(--drift-gap);
  height: 100%;
  padding-right: var(--drift-gap);
}
.drift-card {
  position: relative;
  flex: none;
  width: var(--drift-cover);
  height: var(--drift-cover);
  padding: 0;
  border: 0;
  background: transparent;
}
.drift-card:hover {
  z-index: 2;
}
.drift-card:hover .node-cover {
  transform: translateY(-4px) scale(1.06);
  border-color: var(--glass-border-hover);
  box-shadow: 0 20px 44px rgba(70, 55, 110, 0.18), 0 0 30px var(--ex-glow);
}
/* 斜列只旋转排布平面，封面里的画面反向转回，保持专辑图上正 */
.drift-plane.tilted-left .node-cover img,
.drift-plane.tilted-left .cover-fallback { transform: rotate(45deg); }
.drift-plane.tilted-right .node-cover img,
.drift-plane.tilted-right .cover-fallback { transform: rotate(-45deg); }
.drift-plane.still .drift-track { animation-play-state: paused; }
.drift-row:hover .drift-track { animation-play-state: paused; }
/* 轨道由三份相同序列组成：每次循环正好平移一份，接回时画面完全一致 */
@keyframes drift-marquee {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(-33.3333%, 0, 0); }
}
.galaxy-track.locked,
.galaxy-track.locked:active { cursor: default; }
@media (prefers-reduced-motion: reduce) {
  .drift-plane { animation: none; }
  .drift-track { animation: none; }
}

/* ---- 排布切换 ---- */
.layout-veil {
  position: absolute;
  inset: 0;
  z-index: 24;
}
.layout-dock {
  position: absolute;
  left: 22px;
  top: 51px;
  z-index: 26;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.layout-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 50%;
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
.layout-trigger:hover,
.layout-dock.open .layout-trigger { color: #000; border-color: var(--glass-border-hover); background: rgba(255, 255, 255, 0.6); }

.layout-menu {
  width: 226px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.42);
  box-shadow:
    0 18px 44px rgba(70, 55, 110, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(34px) saturate(1.35);
  -webkit-backdrop-filter: blur(34px) saturate(1.35);
}
.layout-menu-kicker {
  margin: 0;
  color: var(--text-ghost);
  font-size: 8.5px;
  letter-spacing: 0.22em;
}
.layout-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 9px;
}
.layout-option {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 38px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 11px;
  color: #191722;
  font-size: 11.5px;
  letter-spacing: 0.04em;
  transition: background var(--t-fast), border-color var(--t-fast), color var(--t-fast);
}
.layout-option:hover { background: rgba(255, 255, 255, 0.55); color: #000; }
.layout-option.active {
  border-color: rgba(70, 55, 110, 0.14);
  background: rgba(255, 255, 255, 0.66);
  color: #000;
  box-shadow: 0 4px 12px rgba(70, 55, 110, 0.06);
}
.layout-option.active svg { color: var(--ex-accent); }

/* 圆形 / 方形封面：与排布分开，默认方形 */
.shape-block {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(70, 55, 110, 0.08);
}

.flow-row {
  width: 100%;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(70, 55, 110, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  text-align: left;
}
.flow-copy { display: grid; gap: 2px; }
.flow-copy strong { color: var(--text-primary); font-size: 11.5px; font-weight: 500; }
.flow-copy small { color: #191722; font-size: 9.5px; }
.flow-switch {
  flex: none;
  display: block;
  width: 32px;
  height: 18px;
  padding: 2px;
  border-radius: 999px;
  background: rgba(70, 55, 110, 0.16);
  transition: background var(--t-fast);
}
.flow-switch i {
  display: block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(70, 55, 110, 0.22);
  transition: transform var(--t-fast);
}
.flow-switch.on { background: var(--accent-live, var(--amber)); }
.flow-switch.on i { transform: translateX(14px); }

.dock-pop-enter-active,
.dock-pop-leave-active { transition: opacity 0.16s ease, transform 0.2s cubic-bezier(0.3, 1.2, 0.6, 1); transform-origin: top left; }
.dock-pop-enter-from,
.dock-pop-leave-to { opacity: 0; transform: translateY(-6px) scale(0.98); }

@media (max-width: 720px) {
  .layout-dock { left: 14px; top: 51px; }
  .layout-menu { width: 204px; }
}

</style>
