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
              :style="tileStyle()"
            >
            <div class="galaxy">
            <!-- 网格线：横平竖直，落在格子边界上，不穿过封面 -->
            <svg v-if="!isSquareWall" class="galaxy-map" :viewBox="`0 0 ${galaxyW} ${galaxyH}`" aria-hidden="true">
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
                  <span v-else-if="card.favorite || card.liked" class="cover-fallback liked-fallback"><Heart :size="30" /></span>
                  <img v-else :src="fallbackCover" alt="" loading="lazy" decoding="async" draggable="false" />
                  <span v-if="card.liked && card.item.cover" class="liked-badge" aria-hidden="true"><Heart :size="11" fill="currentColor" /></span>
                  <span v-if="card.mine" class="mine-badge mono" aria-hidden="true">MINE</span>
                  <span v-if="isPlayingCard(card) && playing" class="card-eq" aria-hidden="true">
                    <i></i><i></i><i></i><i></i><i></i><i></i>
                  </span>
                </span>
              </button>
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
                        <span v-else-if="card.favorite || card.liked" class="cover-fallback liked-fallback"><Heart :size="30" /></span>
                        <img v-else :src="fallbackCover" alt="" loading="lazy" decoding="async" draggable="false" />
                        <span v-if="card.liked && card.item.cover" class="liked-badge" aria-hidden="true"><Heart :size="11" fill="currentColor" /></span>
                        <span v-if="card.mine" class="mine-badge mono" aria-hidden="true">MINE</span>
                        <span v-if="isPlayingCard(card) && playing" class="card-eq" aria-hidden="true">
                          <i></i><i></i><i></i><i></i><i></i><i></i>
                        </span>
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
        :wall="collectionWall"
        :current-songmid="currentSongmid"
        :playing="playing"
        :fallback-cover="fallbackCover"
        :accent="stagePalette.accent"
        :glow="stagePalette.glow"
        @close="collapse()"
        @play-track="playFromCollection"
        @toggle-play="emit('toggle-play')"
      />

      <!-- 载入：整面骨架格盖住画布，真实封面全部解码完再一次性揭开 -->
      <transition name="loading-fade">
        <WallSkeleton
          v-if="wallLoading && !active"
          class="explore-skeleton"
          :pitch="WALL_GAP"
          :tile="isSquareWall ? WALL_GAP + 1 : WALL_COVER"
          :variant="isSquareWall ? 'square' : 'dot'"
          :scale="galaxyScale"
          backdrop
          label="正在载入音乐空间"
          status-kicker="SYNCING LIBRARY"
          :status-title="syncTitle"
          :status-hint="syncHint"
        />
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
        <template v-if="connected">
          <span class="void-kicker mono">EMPTY SPACE</span>
          <p>音乐空间暂时安静</p>
        </template>
        <span v-else class="void-link-off" role="img" aria-label="未连接音乐平台">
          <Unplug :size="16" :stroke-width="1.8" />
        </span>
        <small v-if="connected || platformKey === 'soda'">{{ connected ? '去发现页搜一首喜欢的歌，它会留在收藏里' : '登录汽水音乐后，歌单、收藏与推荐会在这里铺开' }}</small>
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
import { ArrowDownRight, ArrowUpRight, Circle, Disc3, Heart, LayoutGrid, Rows3, Square, Unplug } from '@lucide/vue'
import CollectionDetail from './CollectionDetail.vue'
import WallSkeleton from './WallSkeleton.vue'
import { loadCover } from '../utils/cover'
import { isLikedPlaylistName, mergeLikedTracks } from '../utils/liked'
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
  // 汽水把「我喜欢的音乐」当普通歌单返回，用这个标记补上爱心角标
  liked: boolean
  // 用户自建歌单：封面右下角挂 MINE 角标，和推荐歌单区分开
  mine: boolean
  tag: string
  x: number
  y: number
}
// 动态排布只用到歌单本身，不需要格阵里的坐标
type WallPick = Omit<WallCard, 'x' | 'y'>

const props = defineProps<{
  mine: ExplorePlaylist[]
  platform: ExplorePlaylist[]
  albums?: ExplorePlaylist[]
  // 当前是否正在播放：详情列表的均衡器据此决定跳动还是静止
  playing?: boolean
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
  // 歌单详情用封面格阵展示
  collectionWall?: boolean
  // 当前播放歌曲的 songmid，传给详情页标记正在播放的封面
  currentSongmid?: string
  // 当前播放歌曲所属的歌单 id：格阵里给那张歌单封面标正在播放
  playingCollectionId?: string
}>()

const emit = defineEmits<{
  (e: 'play-track', track: MusicInfo, queue: MusicInfo[], index: number, collectionId: string): void
  (e: 'toggle-play'): void
  (e: 'accent', palette: { accent: string; glow: string } | null): void
  (e: 'open-platform'): void
  (e: 'collection-open', name: string, kind: 'favorites' | 'playlist'): void
  (e: 'collection-close'): void
  // 打开红心页时让父组件在后台同步账号红心
  (e: 'refresh-favorites'): void
  (e: 'open-login'): void
  (e: 'auth-error', message: string): void
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
// 红心页先展示本机收藏，账号歌单里的曲目后台补进来后并在这里保持稳定
const likedServerTracks = ref<MusicInfo[]>([])
const loadingTracks = ref(false)
const trackError = ref('')
const localPalette = ref<{ accent: string; glow: string } | null>(null)
const dragged = ref(false)
const driftDragging = ref(false)
// 行云 / 斜列的纵向拖动位移。故意不做成响应式：拖动时每帧改 ref 会让整面封面墙重渲染，
// 位移统一由 syncDriftRows 直接写 DOM。
let driftDragY = 0
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
  const rawRows = tilted
    ? Math.min(28, Math.max(4, Math.ceil(span / pitch) + 1))
    // 行云保持疏朗排布，窗口更高时补足行数，保证竖向环回不露白
    : Math.max(2, rowsFit < 5 ? rowsFit + 1 : rowsFit)
  // 行轨首尾相接成环：只有偶数行，绕回接缝两侧才会继续保持反向；
  // 奇数行会让最后一行贴着第一行，出现相邻两列同向流动
  const rowCount = rawRows % 2 ? rawRows + 1 : rawRows
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
  const { tilted, rowCount, sequenceLength, pitch, rotorSize } = driftGeometry.value
  // 整个池子按顺序切成连续的窗口，每行一段：先让每张封面都各出现一次，用完了才绕回重复。
  // 旧做法是每行各取一段窗口、起点按黄金比例错开，相邻窗口大面积重叠——
  // 于是同一屏里同一张封面出现好几次，而池子里另一些卡始终没露过面。
  // 步长就是一行长度，相邻行首尾相接、互不重叠。池子比一行还短时退化成逐行错开一张，
  // 至少相邻两行内容不同。
  const stride = cards.length >= sequenceLength ? sequenceLength : 1
  // 先铺离屏幕中心最近的行，往外依次排：池子够用时正中几行保证互不重复，
  // 绕回只落在旋转后贴着屏幕四角、几乎看不见的最外圈行上。
  const centerY = tilted ? rotorSize / 2 : 0
  const rowCenterY = (index: number) =>
    tilted ? index * pitch + pitch / 2 : (index - (rowCount - 1) / 2) * pitch
  const rankOf = new Map(
    Array.from({ length: rowCount }, (_, index) => index)
      .sort((a, b) => Math.abs(rowCenterY(a) - centerY) - Math.abs(rowCenterY(b) - centerY) || a - b)
      .map((row, position) => [row, position])
  )
  return Array.from({ length: rowCount }, (_, index) => {
    const rowCards: WallPick[] = []
    const base = (rankOf.get(index) ?? index) * stride
    for (let i = 0; i < sequenceLength; i++) {
      rowCards.push(cards[(base + i) % cards.length])
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
  const y = wrapSigned(row.baseY + driftDragY, period)
  return { transform: `translateY(${y}px)` }
}

/* ============ 布局：横平竖直的歌单格 ============ */
// 封面尺寸与间距固定；格阵的行列数按实际拿到的封面数量算（见 wallGrid），
// 拿到多少铺多少，不循环复制凑满，超出画面的部分靠 3×3 平铺在拖动时自然出现。
const WALL_GAP = 180
const WALL_COVER = 140

/* ============ 无限画布 ============ */
// 把同一套星空平铺成 3×3。拖动时让每个 tile 在 3 倍画布范围内环回，
// 视觉上就是没有边界的星空；歌单只有几个也能一直拖下去。
const TILE_OFFSETS = [-1, 0, 1]
const galaxyTiles = computed(() => TILE_OFFSETS.flatMap((ty, yi) =>
  TILE_OFFSETS.map((tx, xi) => ({
    key: `${xi}-${yi}`,
    index: yi * 3 + xi,
    x: tx * galaxyW.value,
    y: ty * galaxyH.value
  }))
))

function wrapOffset(value: number, size: number) {
  const period = size * 3
  return ((value + size * 1.5) % period + period) % period - size * 1.5
}

function tileStyle() {
  // tile 盒子必须与画布尺寸同步：硬编码的旧尺寸会让 3×3 副本之间留出
  // 与卡片网格错位的缝隙，表现为边缘半张封面 + 中央空白带
  return {
    width: `${galaxyW.value}px`,
    height: `${galaxyH.value}px`,
    marginLeft: `${-galaxyW.value / 2}px`,
    marginTop: `${-galaxyH.value / 2}px`
  }
}

// 9 块平铺靠 transform 环回，位移直接写 DOM：
// 每帧去改 reactive 会让几百张封面的整棵树重渲染，拖起来就是那种一卡一卡的手感
let tileNodes: HTMLElement[] = []
function refreshTileNodes() {
  tileNodes = fieldEl.value
    ? Array.from(fieldEl.value.querySelectorAll<HTMLElement>('.galaxy-tile'))
    : []
}

// 把 track 的位移换算成每个 tile 的相对位移：视觉位置环回，DOM 只保留 9 份。
function syncTiles() {
  if (!trackEl.value) return
  if (tileNodes.length !== galaxyTiles.value.length) refreshTileNodes()
  const tx = Number(gsap.getProperty(trackEl.value, 'x')) || 0
  const ty = Number(gsap.getProperty(trackEl.value, 'y')) || 0
  galaxyTiles.value.forEach((tile, i) => {
    const node = tileNodes[i]
    if (!node) return
    gsap.set(node, {
      x: wrapOffset(tile.x + tx, galaxyW.value) - tx,
      y: wrapOffset(tile.y + ty, galaxyH.value) - ty,
      force3D: true
    })
  })
}

// 进入歌单详情时把画布归位，保证「返回」和曲目始终在视野正中心。
function resetTrack() {
  if (!trackEl.value) return
  gsap.killTweensOf(trackEl.value)
  gsap.set(trackEl.value, { x: 0, y: 0, scale: 1 })
  syncTiles()
}

let draggables: Draggable[] = []
// 本次按下是否真的拖动过：拖动松手也会触发 click，不能顺带打开歌单
let dragMoved = false
let animating = false
let paletteToken = 0
let recenterTween: gsap.core.Tween | null = null

/* ============ 布局：横平竖直的歌单格 ============ */

// 墙上「我喜欢的音乐」和详情页同一条规则：封面严格取收藏列表第一首
const likedCover = computed(() =>
  props.favorites[0]?.img
  || props.likedCover
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

// 全量歌单卡：格阵按顺序循环取用，行云/斜列需要更长的序列，用满所有歌单来摊薄重复
const cardPicks = computed<WallPick[]>(() => {
  const picks: Omit<WallCard, 'x' | 'y'>[] = []
  const seen = new Set<string>()
  const seenNames = new Set<string>()
  const seenCovers = new Set<string>()
  const nameKey = (name: string) => String(name || '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()
  const coverKey = (url: string) => String(url || '').split('?')[0].replace(/~[^/]*$/, '')
  const add = (item: ExplorePlaylist, tag: string, favorite = false) => {
    if (!item?.id || seen.has(item.id)) return
    // 不同来源（自建 / 推荐 / 收藏）常有同名歌单，墙面只留一个入口
    const key = nameKey(item.name)
    if (key && seenNames.has(key)) return
    // 不同歌单会复用同一张封面，按图再挡一次，相邻格才不会成对重复
    const cover = coverKey(item.cover)
    if (cover && seenCovers.has(cover)) return
    seen.add(item.id)
    if (key) seenNames.add(key)
    if (cover) seenCovers.add(cover)
    const liked = isLikedPlaylistName(item.name)
    picks.push({ key: item.id, item, favorite, liked, mine: tag === 'MINE' && !liked, tag })
  }

  if (props.connected && props.showFavorites !== false) {
    add({ id: 'liked', name: '我喜欢的音乐', cover: likedCover.value, kind: 'favorites' }, 'FAVORITES', true)
  }
  // 网易用独立的心形节点锚定正中央；汽水把「我喜欢的音乐」当普通歌单返回，
  // 这里把红心歌单排到自建歌单最前面，两个平台都让「我喜欢的音乐」落在画布正中央
  const minePicks = [...props.mine]
    .sort((a, b) => Number(isLikedPlaylistName(b.name)) - Number(isLikedPlaylistName(a.name)))
    .slice(0, 24)
  const firstFavoriteCover = likedCover.value
  for (const item of minePicks) {
    // 汽水红心歌单的封面来自账号资料，换了第一首收藏也不会跟着变；
    // 墙上这张卡改成按收藏第一首取图，和详情页保持一致
    const likedItem = isLikedPlaylistName(item.name)
    add(likedItem && firstFavoriteCover ? { ...item, cover: firstFavoriteCover } : item, 'MINE')
  }

  const platformTag = props.platformKey === 'soda' ? 'SODA' : 'FOR YOU'
  for (const item of props.platform) add(item, platformTag)

  // 最新专辑拉回来就别闲置：挂在墙尾丰富封面池（歌单详情打开专辑用同一套入口）
  for (const item of props.albums ?? []) add(item, 'ALBUM')

  return picks
})

// 与详情页照片墙同一套铺法：格距固定 180，列数按视口宽度取，行数先铺满视口、
// 再保证装得下全部歌单。格阵始终大于等于视口，缩放到 1，封面尺寸和详情页一致。
const wallGrid = computed(() => {
  const count = Math.max(1, cardPicks.value.length)
  const cols = Math.min(12, Math.max(4, Math.ceil(viewportSize.value.w / WALL_GAP)))
  const rows = Math.max(Math.ceil(viewportSize.value.h / WALL_GAP), Math.ceil(count / cols), 1)
  return { cols, rows }
})

// 画布尺寸 = 格阵尺寸，3×3 平铺靠它做环回
const galaxyW = computed(() => wallGrid.value.cols * WALL_GAP)
const galaxyH = computed(() => wallGrid.value.rows * WALL_GAP)

const wallCells = computed(() => {
  const { cols, rows } = wallGrid.value
  const cells: { x: number; y: number; ring: number; angle: number }[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = (col - (cols - 1) / 2) * WALL_GAP
      const y = (row - (rows - 1) / 2) * WALL_GAP
      cells.push({
        x,
        y,
        // 切比雪夫半径 = 离中心第几圈；同圈再按极角排，格子才会一圈圈绕着中心铺开。
        // 用欧氏距离在等距方格上会出现斜向插队（如 3.5,0.5 与 2.5,2.5 同距），
        // 视觉上像从中心斜着扩散，而不是环绕。
        ring: Math.max(Math.abs(x), Math.abs(y)),
        angle: Math.atan2(y, x)
      })
    }
  }
  // 由内向外：第一格必定是最中心，留给「我喜欢的音乐」，其余自建歌单逐圈围上去
  cells.sort((a, b) => a.ring - b.ring || a.angle - b.angle)
  return cells.map(({ x, y }) => ({ x, y }))
})

const wallCards = computed<WallCard[]>(() => {
  const picks = cardPicks.value
  if (!picks.length) return []
  // 格位仍按「由内向外」排序，让喜欢的音乐与自建歌单落在中央；
  // 封面按格循环取，歌单不够铺满视口时继续从头补，整面墙不留空格
  return wallCells.value.map((cell, index) => {
    // 每绕完一轮就把起点挪一格（同详情页按列错开）：相邻格不会是同一张封面，
    // 重复的「我喜欢的音乐」也会落到更外圈，而不是紧贴着正中央
    const pick = picks[(index + Math.floor(index / picks.length)) % picks.length]
    // key 不能再用歌单 id：循环补满时同一张卡会出现多次
    return { ...pick, ...cell, key: `${pick.key}-${index}` }
  })
})

// 封面数量或视口变化会改格阵行列，tile 盒子尺寸随之变化，环回位移与缩放都要按新尺寸重算
watch([galaxyW, galaxyH], () => {
  updateScale()
  void nextTick(syncTiles)
})

// 歌单被清空或进入详情时关闭排布菜单，避免遮罩留在没有入口的界面上
watch(cardPicks, cards => {
  if (!cards.length) layoutOpen.value = false
})

// 切平台或同步时先等所有歌单封面解码完再揭开画布，避免先露出一片空白封面色块。
const coverReady = ref(true)
const readyCovers = new Set<string>()
let coverReadyToken = 0
let coverReadyTimer = 0
watch(cardPicks, (cards) => {
  const urls = [...new Set(
    cards.map(card => wallCover(card.item.cover)).filter((url): url is string => Boolean(url))
  )]
  const pending = urls.filter(url => !readyCovers.has(url))
  window.clearTimeout(coverReadyTimer)
  if (!pending.length) { coverReady.value = true; return }
  const token = ++coverReadyToken
  coverReady.value = false
  // 封面加载慢时最多等 4 秒，不能让骨架一直盖住已经返回的歌单
  coverReadyTimer = window.setTimeout(() => {
    if (token === coverReadyToken) coverReady.value = true
  }, 4000)
  void Promise.all(pending.map(loadCover)).then(() => {
    window.clearTimeout(coverReadyTimer)
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
  if (dragMoved) { dragMoved = false; return }
  if (card.favorite) void expandFavorites(card.item)
  // 汽水的「我喜欢的音乐」是账号歌单：先展示本机收藏，再后台补全账号列表
  else if (card.liked) void expandFavorites(card.item)
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

/* ============ 网格线 ============ */
// 线条落在格子边界（间距的一半）上，与卡片同心，不会压到封面。
const MAP_LINES = computed(() => {
  const width = galaxyW.value
  const height = galaxyH.value
  const vertical: number[] = []
  const horizontal: number[] = []
  for (let x = WALL_GAP / 2; x <= width / 2; x += WALL_GAP) vertical.push(x, -x)
  for (let y = WALL_GAP / 2; y <= height / 2; y += WALL_GAP) horizontal.push(y, -y)
  return [
    ...vertical.map(x => ({
      key: `v${x}`,
      x1: x + width / 2, y1: 0,
      x2: x + width / 2, y2: height
    })),
    ...horizontal.map(y => ({
      key: `h${y}`,
      x1: 0, y1: y + height / 2,
      x2: width, y2: y + height / 2
    }))
  ]
})
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
  likedServerTracks.value = []
  activeTracks.value = []
  trackError.value = ''
  loadingTracks.value = true
  emit('collection-open', item.name, 'playlist')
  await nextTick()
  if (token !== openToken) return
  void paintFromCover(item.cover)
  try {
    // 最新专辑也挂在探索墙上，展开时要用 album 接口，否则会拿专辑 id 去查歌单
    const result = props.platformKey === 'soda'
      ? await window.api.sodaPlaylist(item.id)
      : await window.api.neteaseCollection(item.kind === 'album' ? 'album' : 'playlist', item.id)
    if (token !== openToken) return
    if (!result.success) throw new Error(result.error || '暂时无法打开这份歌单')
    activeTracks.value = result.data as MusicInfo[]
  } catch (error: any) {
    if (token !== openToken) return
    const message = String(error?.message || '')
    // 凭据失效交给父组件统一处理（清资料 + 过期提示），这里不再展示普通错误
    if (/登录已失效|请先连接|请先登录/.test(message)) {
      emit('auth-error', message)
      return
    }
    trackError.value = message || '歌单读取失败'
  } finally {
    if (token === openToken) loadingTracks.value = false
  }
  if (token !== openToken) return
  animating = false
}

async function expandFavorites(account?: ExplorePlaylist) {
  if (animating || active.value) return
  const token = ++openToken
  animating = true
  draggables.forEach(handle => handle.disable())
  const field = fieldEl.value
  if (!reduceMotion && field) {
    await gsap.to(field, { autoAlpha: 0, duration: 0.26, ease: 'power2.in' })
    if (token !== openToken) return
  }
  // 封面跟列表第一首走；本机收藏还没同步时先借账号歌单自己的封面，不能落到空心占位
  const cover = likedCover.value || account?.cover || ''
  active.value = { id: account?.id || 'favorites', name: '我喜欢的音乐', cover, kind: 'favorites' }
  resetTrack()
  likedServerTracks.value = []
  activeTracks.value = [...props.favorites]
  trackError.value = ''
  loadingTracks.value = true
  emit('collection-open', active.value.name, 'favorites')
  await nextTick()
  if (token !== openToken) return
  void paintFromCover(cover)
  syncFavoritesCover()
  // 本机收藏已经能立刻显示，账号歌单只是后台补全，不挡打开动画
  if (!account || props.favorites.length) loadingTracks.value = false
  animating = false
  if (account) void syncLikedAccount(account, token)
  emit('refresh-favorites')
}

// 左栏封面始终跟随列表第一首：收藏增删会动态刷新列表，封面和配色要一起换
function syncFavoritesCover() {
  if (active.value?.kind !== 'favorites') return
  const cover = activeTracks.value[0]?.img
  if (!cover || cover === active.value.cover) return
  active.value = { ...active.value, cover }
  void paintFromCover(cover)
}

// 账号歌单读取失败不打断已打开的列表：本机收藏仍可播放，登录过期照旧交给父组件处理
async function syncLikedAccount(account: ExplorePlaylist, token: number) {
  try {
    const result = props.platformKey === 'soda'
      ? await window.api.sodaPlaylist(account.id)
      : await window.api.neteaseCollection('playlist', account.id)
    if (token !== openToken || active.value?.kind !== 'favorites') return
    if (!result.success) throw new Error(result.error || '暂时无法刷新我喜欢的音乐')
    likedServerTracks.value = result.data as MusicInfo[]
    activeTracks.value = mergeLikedTracks(props.favorites, likedServerTracks.value)
    syncFavoritesCover()
  } catch (error: any) {
    if (token !== openToken) return
    const message = String(error?.message || '')
    if (/登录已失效|请先连接|请先登录/.test(message)) emit('auth-error', message)
  } finally {
    if (token === openToken) loadingTracks.value = false
  }
}

// 后台刷新收藏后，已经打开的喜欢页立即跟着换列表（新点亮的最前面）
watch(() => props.favorites, list => {
  if (active.value?.kind !== 'favorites') return
  activeTracks.value = mergeLikedTracks(list, likedServerTracks.value)
  syncFavoritesCover()
})

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
  likedServerTracks.value = []
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

/* ============ 定位回中心（就近原则） ============ */
// 喜欢卡在画布里有固定坐标，画布按整数倍环回，所以屏幕上存在多份副本。
// 归位时从当前位置挑最近的那份，只走最短的一段，而不是一律回到原点穿过整面墙。
function focusFavorites() {
  if (!isWall.value) setLayout('grid')
  if (active.value || animating) collapse()
  const track = trackEl.value
  if (!track) return
  gsap.killTweensOf(track)
  recenterTween = null
  const x = Number(gsap.getProperty(track, 'x')) || 0
  const y = Number(gsap.getProperty(track, 'y')) || 0
  dragged.value = false
  // 喜欢卡在格阵里的落点：行列都是奇数时才正好是原点
  const anchor = wallCards.value.find(card => card.favorite || card.liked) || wallCards.value[0]
  const anchorX = anchor?.x || 0
  const anchorY = anchor?.y || 0
  // 目标位移与当前位移同余（相差整数个画布周期），取距离最近的那个等效落点
  const targetX = Math.round((x + anchorX) / galaxyW.value) * galaxyW.value - anchorX
  const targetY = Math.round((y + anchorY) / galaxyH.value) * galaxyH.value - anchorY
  const dx = targetX - x
  const dy = targetY - y
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
    syncTiles()
    return
  }
  if (reduceMotion) {
    gsap.set(track, { x: targetX, y: targetY })
    syncTiles()
    draggables.forEach(handle => handle.update())
    applyFlow()
    return
  }
  draggables.forEach(handle => handle.disable())
  recenterTween = gsap.to(track, {
    x: targetX,
    y: targetY,
    // 走多少时间按距离给：只挪半格时不该和跨整面墙一样慢
    duration: gsap.utils.clamp(0.32, 0.7, Math.hypot(dx, dy) / 1200),
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
  emit('play-track', track, [...activeTracks.value], index, active.value?.id || '')
}

// 这张歌单里正在播放：封面中央挂跳动均衡器
function isPlayingCard(card: { item?: ExplorePlaylist }) {
  if (!props.playingCollectionId || !card.item?.id) return false
  // 网易云接口部分链路返回的 id 是 number，播放来源是 string，统一转换后再比
  return String(card.item.id) === String(props.playingCollectionId)
}

/* ============ 拖拽与缩放 ============ */
// 画布为无限拖拽做了 3×3 平铺：只要一块格阵盖不满视口，边上就会露出隔壁副本的同名封面，
// 看着就像歌单重复了一半。格阵为 60 格（画布 1800×1080），视口更高时靠下面的 raw 缩放兜住，
// 缩放下限 1：常规视口下封面保持原始 140px，同屏 40 余张，其余拖动翻看。
function updateScale() {
  const view = viewportEl.value?.getBoundingClientRect()
  if (!view) return
  const raw = Math.max(view.width / galaxyW.value, view.height / galaxyH.value)
  galaxyScale.value = Math.min(1.6, Math.max(1, raw))
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
  // 空画布没有行云/斜列内容，直接拖格阵底图，避免整屏静止
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
    onPress() { dragMoved = false; dragged.value = true; hideCardLabel() },
    onDrag() { dragMoved = true; syncTiles() },
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

// 每行的纵向错位直接写 DOM：拖动时每帧调 gsap.set，和格阵的 3×3 环回同一套思路，
// 上百张封面不会跟着重渲染。
let driftRowNodes: HTMLElement[] = []
function refreshDriftRowNodes() {
  driftRowNodes = driftPlaneEl.value
    ? Array.from(driftPlaneEl.value.querySelectorAll<HTMLElement>('.drift-row'))
    : []
}

function syncDriftRows() {
  const rows = driftRows.value
  if (driftRowNodes.length !== rows.length) refreshDriftRowNodes()
  const { period } = driftGeometry.value
  rows.forEach((row, index) => {
    const node = driftRowNodes[index]
    if (!node) return
    node.style.transform = `translateY(${wrapSigned(row.baseY + driftDragY, period)}px)`
  })
}

function syncDrift() {
  if (!driftDraggable) return
  const { groupWidth } = driftGeometry.value
  const local = driftLocalShift(driftDraggable.x, driftDraggable.y)
  const shift = wrapSigned(local.x, groupWidth)
  driftPlaneEl.value?.style.setProperty('--drift-shift', `${shift}px`)
  driftDragY = local.y
  syncDriftRows()
}

function setupDriftDraggable() {
  driftDraggable?.kill()
  driftDraggable = null
  driftDragging.value = false
  driftDragY = 0
  driftRowNodes = []
  const target = driftProxyEl.value
  const plane = driftPlaneEl.value
  if (!target || !plane) {
    applyFlow()
    return
  }
  gsap.set(target, { x: 0, y: 0 })
  plane.style.setProperty('--drift-shift', '0px')
  // 排布切换 / 尺寸变化后按新的行数重新取节点，并把归零后的位置写回去
  syncDriftRows()
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
      dragMoved = false
      driftDragging.value = true
      dragged.value = true
      hideCardLabel()
    },
    onDrag() { dragMoved = true; syncDrift() },
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
  window.clearTimeout(coverReadyTimer)
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
  /* 盒子尺寸由 tileStyle 内联绑定 GALAXY_W/H，这里不再硬编码 */
  will-change: transform;
  /* 3×3 平铺会产生几百张封面，离屏 tile 跳过布局与绘制，登录后同步不再卡主线程 */
  content-visibility: auto;
  contain-intrinsic-size: 1800px 1080px;
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
  position: relative;
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
/* 两个平台的「我喜欢的音乐」用同一枚爱心角标，统一盖在封面右上角 */
.liked-badge {
  position: absolute;
  right: 8%;
  top: 8%;
  width: 30%;
  min-width: 20px;
  max-width: 34px;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 3px 10px rgba(70, 55, 110, 0.26), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  color: var(--ruby);
  pointer-events: none;
}
.liked-badge svg { width: 62%; height: 62%; }
/* 自建歌单的 MINE 角标：和爱心角标同一套玻璃底，同样固定在右上角 */
.mine-badge {
  position: absolute;
  right: 8%;
  top: 8%;
  padding: 4px 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 3px 10px rgba(70, 55, 110, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  color: #4e4173;
  font-family: var(--font-mono);
  font-size: 9px;
  font-style: normal;
  font-weight: 600;
  letter-spacing: 0.1em;
  line-height: 1;
  text-indent: 0.1em;
  pointer-events: none;
}

/* ---- 正在播放：封面正中 6 根跳动白条，与歌单详情页同一套信号 ---- */
.card-eq {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 4;
  display: flex;
  align-items: flex-end;
  gap: 5px;
  height: 48px;
  filter: drop-shadow(0 2px 8px rgba(6, 4, 12, 0.55));
  pointer-events: none;
}
.card-eq i {
  display: block;
  width: 7px;
  height: 100%;
  border-radius: 3px;
  background: #fff;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.75);
  transform-origin: bottom;
  animation: card-eq-bounce 0.86s ease-in-out infinite;
}
.card-eq i:nth-child(1) { animation-delay: -0.52s; }
.card-eq i:nth-child(2) { animation-delay: -0.26s; }
.card-eq i:nth-child(3) { animation-delay: -0.72s; }
.card-eq i:nth-child(4) { animation-delay: -0.08s; }
.card-eq i:nth-child(5) { animation-delay: -0.62s; }
.card-eq i:nth-child(6) { animation-delay: -0.38s; }
@keyframes card-eq-bounce {
  0%, 100% { transform: scaleY(0.24); }
  50% { transform: scaleY(1); }
}
/* 斜列排布下画布整体旋转，均衡器跟封面一起转回正 */
.drift-plane.tilted-left .card-eq { transform: translate(-50%, -50%) rotate(45deg); }
.drift-plane.tilted-right .card-eq { transform: translate(-50%, -50%) rotate(-45deg); }

/* ---- 载入：整面骨架格盖住画布，等真实封面全部解码后再揭开（复用 WallSkeleton 组件） ---- */
.explore-skeleton { z-index: 15; cursor: default; }

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

/* 未连接：用断开连接的图标替代 KICKER + 标题文案 */
.void-link-off {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  margin-top: 2px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.75);
  background: rgba(255, 255, 255, 0.6);
  color: var(--text-muted);
  box-shadow:
    0 8px 18px rgba(70, 55, 110, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
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
  /* 居中偏移放进静态定位：行内 transform 只留拖动位移，逐帧写 DOM 时不用再拼 calc */
  top: calc(50% - var(--drift-row) / 2);
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
  .card-eq i { animation: none; }
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