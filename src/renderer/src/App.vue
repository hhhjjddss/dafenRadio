<template>
  <div class="app-shell" :class="{ 'explore-full': activeNav === 'explore', 'detail-open': detailOpen, 'float-top': floatTop }" :style="themeVars">
    <SplashScreen v-if="showSplash" :duration-ms="3600" @complete="showSplash = false" />

    <WindowBar
      :hidden="windowBarHidden"
      :fullscreen="isFullscreen"
      :maximized="isMaximized"
      @reveal="revealWindowBar"
      @toggle-fullscreen="toggleFullscreen"
    />

    <div class="stage">
      <!-- 中央舞台 + 队列 -->
      <div class="stage-right">
        <TopBar
          :folded="toolbarFolded"
          :folding="toolbarFolding"
          :nav-open="sidebarOpen"
          :platform-open="platformOpen"
          :active-nav="activeNav"
          :active-platform="activePlatform"
          :connected="connected"
          :soda-connected="sodaConnected"
          :account="activeProfile"
          :account-connected="activeConnected"
          :account-tip="accountTip"
          @toggle-fold="foldToolbar(!toolbarFolded)"
          @toggle-nav="platformOpen = false; sidebarOpen = !sidebarOpen"
          @close-nav="sidebarOpen = false"
          @toggle-platform="sidebarOpen = false; platformOpen = !platformOpen"
          @close-platform="platformOpen = false"
          @navigate="navigateNav"
          @open-search="openSearch"
          @locate-favorites="locateFavorites"
          @open-platform="openPlatform"
          @open-settings="openSettings()"
          @open-login="openLogin()"
        />

        <div class="stage-body">
          <!-- 我的音乐 / 歌单：取这一页多张歌单封面的主色，各自在背景上晕开一团 -->
          <div
            v-if="floatTop && !collectionDetail && pageCoverColors.length"
            class="page-cover-backdrop"
            aria-hidden="true"
          >
            <i
              v-for="(color, index) in pageCoverColors"
              :key="`${index}-${color}`"
              class="page-cover-blob"
              :class="`blob-${index}`"
              :style="{ background: color }"
            ></i>
            <span class="page-cover-wash"></span>
          </div>
          <main class="stage-main">
            <!-- 网易 ↔ 汽水：整块界面先退场，新平台再从下方浮起 -->
            <transition name="stage-swap" mode="out-in">
              <div class="stage-view" :key="activePlatform">
                <ExploreStage
                  v-if="activeNav === 'explore'"
                  ref="exploreRef"
                  :mine="explorePlaylists"
                  :platform="platformPlaylists"
                  :favorites="platformFavorites"
                  :liked-cover="likedPlaylist?.cover || ''"
                  :fallback-cover="fallbackCover"
                  :palette="palette"
                  :connected="exploreConnected"
                  :show-favorites="activePlatform === 'netease'"
                  :platform-key="activePlatform"
                  :loading="exploreLoading"
                  :guide="showOnboarding"
                  :queue-open="queuePeek"
                  @play-track="playTrack"
                  @accent="handleExploreAccent"
                  @open-platform="handleExploreConnect"
                  @collection-open="handleCollectionOpen"
                  @collection-close="exploreDetailOpen = false"
                />

                <!-- 我的音乐 / 歌单：全部原页显示，歌单详情用与探索页同一块展开层 -->
                <LibraryPage
                  v-else
                  :nav="activeNav"
                  :platform="activePlatform"
                  :owned-playlists="ownedPlaylists"
                  :platform-playlists="platformPlaylists"
                  :fallback-cover="fallbackCover"
                  :soda-connected="sodaConnected"
                  :loading="exploreLoading"
                  :under-detail="Boolean(collectionDetail)"
                  @expand="expandCollection"
                />
              </div>
            </transition>

            <!-- 我的音乐 / 歌单进入歌单详情：复用探索页的展开层，铺满整窗 -->
            <CollectionDetail
              v-if="collectionDetail"
              class="page-fixed"
              :name="collectionDetail.name"
              :cover="collectionDetail.cover"
              kind="playlist"
              :tracks="collectionTracks"
              :loading="collectionLoading"
              :error="collectionError"
              :queue-open="queuePeek"
              :fallback-cover="fallbackCover"
              :accent="palette.accent"
              :glow="palette.glow"
              @close="closeCollection"
              @play-track="playCollectionTrack"
            />

            <MiniPlayer
              ref="miniRef"
              :track="playerState.currentTrack"
              :cover-url="playerState.coverUrl"
              :playing="playerState.isPlaying"
              :current-time="playerState.currentTime"
              :duration="playerState.duration"
              :trial-limit="playerState.trialSeconds"
              :current-lyric="currentLyricLine"
              :next-lyric="nextLyricLine"
              :favorite="currentIsFavorite"
              :lyric-on="lyricBarOn"
              :volume="playerState.volume"
              :queue-open="queuePeek"
              :mode="playMode"
              :mode-title="modeTitle"
              :recommend-title="recommendTitle"
              :recommend-loading="recommendLoading"
              :recommend-active="recommendActive"
              @toggle-play="togglePlay"
              @prev="playPrevious"
              @next="playNext"
              @seek="seek"
              @toggle-favorite="toggleCurrentFavorite"
              @toggle-lyric="toggleLyricBar"
              @open-lyrics="openLyrics"
              @toggle-queue="queuePeek = !queuePeek"
              @cycle-mode="cyclePlayMode"
              @recommend="startRecommendedPlayback"
              @mute="toggleMute"
              @volume="handleVolume"
            />
          </main>

          <!-- 右侧播放队列 -->
          <QueuePanel class="queue-dock" :class="{ peek: queuePeek }" :tracks="queueTracks" :current-index="queueIndex" :next-track="nextQueueTrack" :next-index="nextQueueIndex" :playing="playerState.isPlaying" @play="playQueueIndex" />
        </div><!-- /stage-body -->
      </div><!-- /stage-right -->
    </div><!-- /stage -->

    <!-- 沉浸歌词页 -->
    <transition name="veil">
      <LyricsRoom
        v-if="showLyrics"
        :lines="lyricLines"
        :active-index="activeLyricIndex"
        :track-name="playerState.currentTrack?.name || ''"
        :artist="playerState.currentTrack?.singer || ''"
        :cover-url="playerState.coverUrl"
        :playing="playerState.isPlaying"
        :favorite="currentIsFavorite"
        :lyric-bar-on="lyricBarOn"
        :fullscreen="isFullscreen"
        @close="closeLyrics"
        @toggle-lyric-bar="toggleLyricBar"
        @toggle-fullscreen="toggleFullscreen"
        @seek="seek"
        @prev="playPrevious"
        @toggle-play="togglePlay"
        @next="playNext"
        @toggle-favorite="toggleCurrentFavorite"
      />
    </transition>

    <!-- 全局搜索：主界面中央的轻量搜索框 -->
    <SearchOverlay
      :open="searchOpen"
      :platform="activePlatform"
      :keyword="keyword"
      :results="searchResults"
      :soda-results="sodaSearchResults"
      :busy="searchBusy"
      :searched="searched"
      :submitted-keyword="submittedKeyword"
      :current-songmid="playerState.currentTrack?.songmid || ''"
      :playing="playerState.isPlaying"
      @update:keyword="keyword = $event"
      @close="closeSearch"
      @submit="searchMusic"
      @clear="clearSearch"
      @play-track="playSearchTrack"
      @play-all="playSearchResults"
      @open-playlist="openSodaSearchPlaylist"
    />

    <Settings
      v-if="showSettings"
      :cover-palette="coverPaletteEnabled"
      :always-on-top="alwaysOnTop"
      :auto-play="autoPlayRecommended"
      :power-save="powerSave"
      @close="showSettings = false"
      @update:cover-palette="setCoverPalette"
      @update:always-on-top="toggleAlwaysOnTop"
      @update:auto-play="setAutoPlayRecommended"
      @update:power-save="setPowerSave"
    />
    <PlatformLogin
      v-if="showLogin"
      :key="loginPlatform"
      :platform="loginPlatform"
      :syncing="loginPlatform === 'soda' ? sodaSyncing : sessionSyncing"
      @close="showLogin = false"
      @logged-out="handleLoggedOut"
    />
    <transition name="welcome">
      <div v-if="showLoginSuccess" class="login-success" role="status" aria-live="polite" @click="dismissLoginSuccess">
        <span class="login-success-mark"><Check :size="20" :stroke-width="2.4" /></span>
        <div class="login-success-copy">
          <span class="login-success-kicker">SIGNED IN</span>
          <strong>登录成功</strong>
          <small>{{ loginProfileName ? `欢迎回来，${loginProfileName}` : '音乐空间已连接' }}</small>
        </div>
      </div>
    </transition>
    <!-- 手动开启心动模式：主页中央的小窗，队列载入完成后自动收起 -->
    <transition name="welcome">
      <div v-if="heartOpening" class="heart-window" :class="heartOpening" role="status" aria-live="polite">
        <span class="hw-mark">
          <span class="hw-ring"></span>
          <span class="hw-ring late"></span>
          <Heart :size="19" :fill="heartOpening === 'done' ? 'currentColor' : 'none'" />
        </span>
        <div class="hw-copy">
          <span class="hw-kicker mono">{{ heartOpening === 'done' ? 'READY' : 'HEART MODE' }}</span>
          <strong>{{ heartOpening === 'done' ? '心动模式已开启' : '正在开启心动模式' }}</strong>
          <small>{{ heartOpening === 'done' ? `已为你挑选 ${heartOpeningCount} 首` : '正在读懂你喜欢的歌…' }}</small>
        </div>
      </div>
    </transition>
    <OnboardingGuide v-if="showOnboarding" @close="finishOnboarding" @expand-toolbar="foldToolbar(false)" />
    <transition name="toast">
      <div v-if="toast" class="toast-message" :class="toast.type">
        <span><AlertCircle v-if="toast.type === 'error'" :size="12" /><Music2 v-else :size="12" /></span>{{ toast.message }}
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import gsap from 'gsap'
import SplashScreen from './components/SplashScreen.vue'
import ExploreStage from './components/ExploreStage.vue'
import MiniPlayer from './components/MiniPlayer.vue'
import QueuePanel from './components/QueuePanel.vue'
import CollectionDetail from './components/CollectionDetail.vue'
import WindowBar from './components/WindowBar.vue'
import TopBar from './components/TopBar.vue'
import LibraryPage from './components/LibraryPage.vue'
import LyricsRoom from './components/LyricsRoom.vue'
import SearchOverlay from './components/SearchOverlay.vue'
// 设置、登录、引导只在需要时打开：拆成异步块，首屏不为它们付出解析成本
const loadSettings = () => import('./components/Settings.vue')
const loadPlatformLogin = () => import('./components/PlatformLogin.vue')
const loadOnboardingGuide = () => import('./components/OnboardingGuide.vue')
const Settings = defineAsyncComponent(loadSettings)
const PlatformLogin = defineAsyncComponent(loadPlatformLogin)
const OnboardingGuide = defineAsyncComponent(loadOnboardingGuide)
import { useNetease, type MusicInfo } from './composables/useNetease'
import { usePlayer, type PlayMode } from './composables/usePlayer'
import { useFavorites } from './composables/useFavorites'
import { usePlaylist } from './composables/usePlaylist'
import { parseLrc, parseYrc } from './utils/lyrics'
import { FALLBACK_COVER } from './utils/cover'
import { AlertCircle, Check, Heart, Music2 } from '@lucide/vue'

interface Album { id: string; name: string; artist: string; cover: string; kind: 'album' }
interface Playlist { id: string; name: string; cover: string; count?: number; trackCount?: number; creator?: string; specialType?: number; kind: 'mine' | 'platform' }
interface KaraokeWord { time: number; duration: number; text: string }
interface LyricLine { time: number; text: string; translation: string; words: KaraokeWord[] }

const fallbackCover = FALLBACK_COVER
const appWindow = window

/* ============ 状态 ============ */
const { searchResults, searching, search } = useNetease()
const { state: playerState, play, togglePlay, seek, setVolume, setLyric, stop: stopPlayback, playMode, setPlayMode, getCurrentTime } = usePlayer()
const savedPlayMode = localStorage.getItem('dafen:play-mode') as PlayMode | null
if (savedPlayMode && (['sequence', 'repeat-all', 'repeat-one', 'shuffle'] as string[]).includes(savedPlayMode)) {
  setPlayMode(savedPlayMode)
}
watch(playMode, (mode) => {
  try { localStorage.setItem('dafen:play-mode', mode) } catch { /* 忽略存储异常 */ }
})
const { favoritesFor, isFavorite, toggleFavorite, replaceFavorites } = useFavorites()
const { setPlayQueue, commitIndex, getCurrentInfo, getPrevTrack, getNextTrack } = usePlaylist()

const albums = ref<Album[]>([])
const playlists = ref<Playlist[]>([])
const recommendations = ref<Playlist[]>([])
// 汽水推荐歌单独立缓存，来回切平台不用重拉
const sodaPlaylists = ref<Playlist[]>([])
const sodaLoading = ref(false)
type AccountVip = '' | 'vip' | 'svip'
interface AccountProfile {
  name: string
  avatar: string
  level: number
  vip: AccountVip
}
const emptyProfile = (): AccountProfile => ({ name: '', avatar: '', level: 0, vip: '' })
// 汽水账号：共用登录凭据，登录后展示个人歌单
const sodaMinePlaylists = ref<Playlist[]>([])
const sodaProfile = ref<AccountProfile>(emptyProfile())
const sodaConnected = ref(false)
const sodaSyncing = ref(false)
type PlatformKey = 'netease' | 'soda'
// 不同平台不同强调色：网易云默认红，汽水绿
const PLATFORM_PALETTES: Record<PlatformKey, { accent: string; glow: string }> = {
  netease: { accent: '#cf2e3f', glow: 'rgba(207, 46, 63, 0.25)' },
  soda: { accent: '#12a05a', glow: 'rgba(18, 160, 90, 0.25)' }
}
// 平台切换后整站数据跟着换；汽水的推荐只对登录账号开放
// 主进程保存的选择优先：localStorage 按端口分域，开发时切端口会丢
const bootPlatform: PlatformKey =
  window.api.initialPlatform === 'soda' || window.api.initialPlatform === 'netease'
    ? window.api.initialPlatform
    : localStorage.getItem('dafen.platform') === 'soda' ? 'soda' : 'netease'
const activePlatform = ref<PlatformKey>(bootPlatform)
const defaultPalette = () => PLATFORM_PALETTES[activePlatform.value]
const palette = ref({ ...defaultPalette() })
const profile = ref<AccountProfile>(emptyProfile())
const connected = ref(false)
const exploreRef = ref<InstanceType<typeof ExploreStage> | null>(null)
const miniRef = ref<InstanceType<typeof MiniPlayer> | null>(null)
const showSplash = ref(true)
// 首次安装的强制引导：完成标记由主进程落盘，localStorage 只作旧版本兜底
const onboardingDone = ref(
  Boolean(window.api.initialOnboardingDone) || localStorage.getItem('dafen:onboarding-done') === '1'
)
const showOnboarding = ref(false)
const showSettings = ref(false)
const showLogin = ref(false)
const loginPlatform = ref<PlatformKey>('netease')
const booting = ref(true)
const libraryLoading = ref(false)
const sessionSyncing = ref(false)
const sidebarOpen = ref(false)
const platformOpen = ref(false)
// 顶栏按钮组一键收起：收起后仅剩箭头按钮与头像；每次启动默认收起
const toolbarFolded = ref(true)
const coverPaletteEnabled = ref(localStorage.getItem('dafen:cover-palette') !== '0')
const alwaysOnTop = ref(localStorage.getItem('dafen:always-on-top') === '1')
// 启动后自动进入心动模式/平台推荐流；默认开启，可在设置里关掉
const autoPlayRecommended = ref(localStorage.getItem('dafen:auto-play-recommend') !== '0')
// 节能模式：窗口失去焦点时冻结常驻动画，默认开启（保持原有省电行为）
const powerSave = ref(localStorage.getItem('dafen:power-save') !== '0')
// 当前队列是否由推荐按钮载入，用于让按钮保持高亮
const recommendActive = ref(false)
const showLyrics = ref(false)
const exploreDetailOpen = ref(false)
const isFullscreen = ref(false)
const isMaximized = ref(false)
const windowBarHidden = ref(false)
let windowBarTimer: ReturnType<typeof setTimeout> | null = null
const searchOpen = ref(false)
const keyword = ref('')
const searched = ref(false)
const submittedKeyword = ref('')
const sodaSearchResults = ref<Playlist[]>([])
const sodaSearching = ref(false)
const lyricLines = ref<LyricLine[]>([])
const collectionDetail = ref<{ id: string; name: string; cover: string } | null>(null)
const collectionTracks = ref<MusicInfo[]>([])
const collectionLoading = ref(false)
const collectionError = ref('')
const queueTracks = ref<MusicInfo[]>([])
const queueIndex = ref(-1)
const queuePeek = ref(false)
const recommendLoading = ref(false)
const volumeBeforeMute = ref(0.5)
const toast = ref<{ message: string; type: 'success' | 'error' } | null>(null)
const toastTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const showLoginSuccess = ref(false)
let loginSuccessTimer: ReturnType<typeof setTimeout> | null = null
// 心动模式开启小窗：只在手动点按钮时出现，队列载入完成或失败后自动收起
const heartOpening = ref<'opening' | 'done' | null>(null)
const heartOpeningCount = ref(0)
let heartOpeningTimer: ReturnType<typeof setTimeout> | null = null

function dismissHeartOpening() {
  if (heartOpeningTimer) { clearTimeout(heartOpeningTimer); heartOpeningTimer = null }
  heartOpening.value = null
}
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const themeVars = computed(() => ({ '--accent-live': palette.value.accent, '--accent-live-glow': palette.value.glow }))
const likedPlaylist = computed(() => playlists.value.find(item =>
  item.kind === 'mine' && (item.specialType === 5 || (profile.value.name && item.name === `${profile.value.name}喜欢的音乐`))
) || null)
const ownedPlaylists = computed(() => activePlatform.value === 'soda'
  ? sodaMinePlaylists.value
  : playlists.value.filter(item => item.kind === 'mine'))
// 探索画布上由心形节点承载红心歌单，避免同一份数据出现两个入口
const explorePlaylists = computed(() => ownedPlaylists.value.filter(item => item !== likedPlaylist.value))
const platformPlaylists = computed(() => {
  if (activePlatform.value !== 'soda') return recommendations.value
  // 汽水推荐偶尔会把自己收藏过的歌单再推一遍，别再上墙占格子
  const ownedIds = new Set(sodaMinePlaylists.value.map(item => item.id))
  const ownedNames = new Set(sodaMinePlaylists.value.map(item => normalizeLyricText(item.name)))
  return sodaPlaylists.value.filter(item =>
    !ownedIds.has(item.id) && !ownedNames.has(normalizeLyricText(item.name))
  )
})
// 当前平台自己的账号状态：两个平台各自独立登录
const activeProfile = computed(() => activePlatform.value === 'soda' ? sodaProfile.value : profile.value)
const activeConnected = computed(() => activePlatform.value === 'soda' ? sodaConnected.value : connected.value)
// 汽水没有成长等级，账号区用「暂无等级」占位，悬停时说明原因
const accountTip = computed(() => {
  const name = activeProfile.value.name || '账号'
  if (!activeConnected.value || activeProfile.value.level) return name
  return `${name} · ${activePlatform.value === 'soda' ? '汽水音乐暂不提供等级' : '暂未获取到等级'}`
})
const loginProfileName = computed(() => loginPlatform.value === 'soda' ? sodaProfile.value.name : profile.value.name)
const exploreConnected = computed(() => activePlatform.value === 'soda' ? sodaConnected.value : connected.value)
const exploreLoading = computed(() =>
  activePlatform.value === 'soda' ? booting.value || sodaLoading.value : booting.value || sessionSyncing.value
)
// 收藏按平台隔离：网易云展示账号红心，汽水展示本机点亮的心
const platformFavorites = computed(() => favoritesFor(activePlatform.value))
const searchBusy = computed(() => activePlatform.value === 'soda' ? sodaSearching.value : searching.value)
const currentIsFavorite = computed(() => {
  const track = playerState.currentTrack
  return Boolean(track && isFavorite(track.songmid, track.platform || 'netease'))
})
const nextQueueTrack = computed(() => queueTracks.value[queueIndex.value + 1] || null)
const nextQueueIndex = computed(() => queueIndex.value + 1)

const playModes: PlayMode[] = ['sequence', 'repeat-all', 'repeat-one', 'shuffle']
const modeNames: Record<PlayMode, string> = { sequence: '顺序播放', 'repeat-all': '列表循环', 'repeat-one': '单曲循环', shuffle: '随机播放' }
const modeTitle = computed(() => modeNames[playMode.value])
const heartModeReady = computed(() =>
  activePlatform.value === 'netease' && playerState.currentTrack?.platform === 'netease'
)
const recommendTitle = computed(() => {
  if (recommendActive.value) return heartModeReady.value ? '心动模式进行中' : '推荐播放中'
  return heartModeReady.value ? '心动模式' : '推荐播放'
})

type NavKey = 'explore' | 'mine' | 'playlists'
const activeNav = ref<NavKey>('explore')
// 背景最多铺几团颜色，和 CSS 里的 .blob-0 ~ .blob-4 对应
const PAGE_BACKDROP_LIMIT = 5
// 我的音乐 / 歌单总览：工具带悬浮，背景由本页歌单封面的颜色弥散而成
const floatTop = computed(() => activeNav.value === 'mine' || activeNav.value === 'playlists')
// 背景取这一页真实出现的封面：我的音乐看自建歌单，歌单页看平台推荐；一个封面都没有时才退回播放封面
const pageBackdropCovers = computed(() => {
  const source = activeNav.value === 'mine' ? ownedPlaylists.value : platformPlaylists.value
  const covers: string[] = []
  for (const item of source) {
    if (!item.cover || covers.includes(item.cover)) continue
    covers.push(item.cover)
    if (covers.length === PAGE_BACKDROP_LIMIT) break
  }
  if (covers.length) return covers
  return playerState.coverUrl ? [playerState.coverUrl] : []
})// 歌单详情展开时隐藏折叠按钮与账号头像，返回键自带退出路径
const detailOpen = computed(() => exploreDetailOpen.value || Boolean(collectionDetail.value))

/* ============ 动态色彩：从封面提取主色，界面随音乐变化 ============ */
let paletteRequestId = 0

async function applyCoverPalette(cover: string) {
  const requestId = ++paletteRequestId
  if (!coverPaletteEnabled.value || !cover) { palette.value = defaultPalette(); return }
  try {
    const result = await window.api?.themePalette?.(cover)
    if (requestId !== paletteRequestId) return
    if (result?.success && result.data) palette.value = result.data
  } catch { /* 取色失败时保留当前配色 */ }
}

// 歌单详情展开期间配色跟着歌单封面走，不被换歌打断，返回后再恢复播放封面
watch(() => playerState.coverUrl, cover => {
  if (collectionDetail.value) return
  void applyCoverPalette(cover)
}, { immediate: true })

/* ---- 我的音乐 / 歌单的背景色：逐张取封面主色，再用这些主色晕开（和详情页同一套取色） ---- */
const pageCoverColors = ref<string[]>([])
const pageColorCache = new Map<string, string>()
let pageColorToken = 0

watch([pageBackdropCovers, floatTop], async ([covers, onPage]) => {
  const token = ++pageColorToken
  // 只在「我的音乐 / 歌单」页取色，停在探索页时不要白发请求
  if (!onPage || !covers.length) { pageCoverColors.value = []; return }
  const colors = await Promise.all(covers.map(async cover => {
    const cached = pageColorCache.get(cover)
    if (cached) return cached
    try {
      const result = await window.api?.themePalette?.(cover)
      const accent = result?.success ? result.data?.accent : ''
      if (accent) pageColorCache.set(cover, accent)
      return accent || ''
    } catch { return '' }
  }))
  if (token !== pageColorToken) return
  pageCoverColors.value = colors.filter(Boolean)
}, { immediate: true })
// 平台强调色由 CSS 变量接管，这里同步 html[data-platform] 并刷新无封面时的默认色
watch(activePlatform, (platform) => {
  document.documentElement.dataset.platform = platform
  void applyCoverPalette(playerState.coverUrl)
}, { immediate: true })

// 设置：动态封面配色开关
function setCoverPalette(enabled: boolean) {
  coverPaletteEnabled.value = enabled
  try { localStorage.setItem('dafen:cover-palette', enabled ? '1' : '0') } catch { /* 忽略存储异常 */ }
  if (enabled) void applyCoverPalette(playerState.coverUrl)
  else { paletteRequestId++; palette.value = defaultPalette() }
}

// 设置：窗口置顶开关
function toggleAlwaysOnTop(enabled: boolean) {
  alwaysOnTop.value = enabled
  try { localStorage.setItem('dafen:always-on-top', enabled ? '1' : '0') } catch { /* 忽略存储异常 */ }
  void window.api.setAlwaysOnTop(enabled)
}

// 设置：开机自动播放推荐（心动模式）
function setAutoPlayRecommended(enabled: boolean) {
  autoPlayRecommended.value = enabled
  try { localStorage.setItem('dafen:auto-play-recommend', enabled ? '1' : '0') } catch { /* 忽略存储异常 */ }
}

// 设置：节能模式——关掉后窗口在后台也照常转动
function setPowerSave(enabled: boolean) {
  powerSave.value = enabled
  try { localStorage.setItem('dafen:power-save', enabled ? '1' : '0') } catch { /* 忽略存储异常 */ }
  syncPowerSavePause()
}

// 详情页（歌单展开）临时接管全局配色，返回时恢复当前歌曲封面配色
function handleExploreAccent(accent: { accent: string; glow: string } | null) {
  if (!coverPaletteEnabled.value) return
  if (accent) { paletteRequestId++; palette.value = accent }
  else void applyCoverPalette(playerState.coverUrl)
}

// 进入探索页歌单详情时给一次可退出的提示
function handleCollectionOpen(name: string) {
  exploreDetailOpen.value = true
  // 详情页不显示折叠按钮，进入时先把工具组收起来，免得按钮压在列表上
  if (!toolbarFolded.value) foldToolbar(true)
  notify(`已进入「${name}」 · 按 ESC 退出`)
}

/* ============ 歌词加载与高亮 ============ */
let lyricRequestId = 0

// 没有逐字时间轴时，用字数估一个接近人声的染色时长；
// 直接取“到下一句的间隔”会把整句拖成 3–5 秒，颜色永远追不上人声
function estimateLineDuration(text: string, gap: number) {
  const cjk = (text.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length
  const latin = (text.match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g) || []).length
  const estimate = Math.min(4.2, Math.max(0.9, (cjk + latin * 1.5) * 0.28))
  return Math.min(Math.max(0.6, gap), estimate)
}

function normalizeLyricText(value: string) {
  return value.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()
}

watch(() => playerState.currentTrack?.songmid, async (songId) => {
  const requestId = ++lyricRequestId
  const track = playerState.currentTrack
  lyricLines.value = []
  setLyric('', '')
  if (!songId || !track) return
  try {
    let result = await (track.platform === 'soda'
      ? window.api.sodaLyrics(songId)
      : window.api.neteaseLyrics(songId))
    // 网易云缺歌词时按歌名 + 歌手再搜一次；汽水不能兜底，
    // 原创原声同名匹配不到，硬搜只会把别的歌的歌词贴上来
    if (track.platform !== 'soda' && (!result.success || !String(result.data?.lyric || '').trim())) {
      const fallback = await window.api.neteaseLyricsSearch(track.name, track.singer, track.duration || 0)
      if (fallback?.success) result = fallback
    }
    if (requestId !== lyricRequestId || !result?.success) return
    const data = result.data
    setLyric(data.lyric, data.translation, data.yrc || '', data.ytlyric || '')
    const translations = new Map(parseLrc(data.translation).map(line => [line.time, line.text]))
    const lines = parseLrc(data.lyric)
    const yrcLines = parseYrc(data.yrc || '')
    let yrcCursor = 0
    const pickYrc = (time: number) => {
      while (yrcCursor < yrcLines.length && yrcLines[yrcCursor].time < time - 0.6) yrcCursor++
      const candidate = yrcLines[yrcCursor]
      return candidate && Math.abs(candidate.time - time) <= 0.6 ? candidate : undefined
    }
    const songEnd = Number(track.duration) || playerState.duration || 0
    lyricLines.value = lines.map((line, index) => {
      const yrc = pickYrc(line.time)
      const yrcText = yrc ? normalizeLyricText(yrc.words.map(word => word.text).join('')) : ''
      const plain = normalizeLyricText(line.text)
      // 逐字文本和整行对不上时退回整行渐变，避免染色错位
      const matched = Boolean(yrcText) && (yrcText === plain || yrcText.includes(plain) || plain.includes(yrcText))
      const nextTime = lines[index + 1]?.time
      const gap = (nextTime ?? (songEnd > line.time ? songEnd : line.time + 4)) - line.time
      return {
        ...line,
        translation: translations.get(line.time) || '',
        words: matched && yrc ? yrc.words : [{ time: line.time, duration: estimateLineDuration(line.text, gap), text: line.text }]
      }
    })
  } catch { /* 歌词缺失不影响播放 */ }
}, { immediate: true })

// 染色进度：timeupdate 只有约 4Hz，播放时用 rAF 直接读音频时间才够顺滑。
// 时钟以 ref 注入给 KaraokeLine，只让当前这一行随 30Hz 重渲染，避免整页每帧 diff。
const lyricTime = ref(0)
provide('lyric-clock', lyricTime)
let lyricFrame = 0
let lastLyricTick = 0

function stopLyricClock() {
  if (lyricFrame) cancelAnimationFrame(lyricFrame)
  lyricFrame = 0
}

const activeLyricIndex = ref(-1)
function syncActiveLyric(time = Math.max(lyricTime.value, playerState.currentTime)) {
  let active = -1
  for (let i = 0; i < lyricLines.value.length; i++) if (lyricLines.value[i].time <= time) active = i
  if (active !== activeLyricIndex.value) activeLyricIndex.value = active
}

function pumpLyricClock(now: number) {
  // 30Hz 对逐字染色足够；换句才更新父组件
  if (now - lastLyricTick >= 33) {
    lastLyricTick = now
    lyricTime.value = getCurrentTime()
    syncActiveLyric(lyricTime.value)
  }
  lyricFrame = showLyrics.value && !document.hidden ? requestAnimationFrame(pumpLyricClock) : 0
}

function startLyricClock() {
  // 已经在跑就别再开一条 rAF：旧句柄会被覆盖，之后停不干净
  if (lyricFrame) return
  lastLyricTick = 0
  lyricFrame = requestAnimationFrame(pumpLyricClock)
}

watch([showLyrics, () => playerState.isPlaying], ([visible, playing]) => {
  stopLyricClock()
  lyricTime.value = getCurrentTime()
  syncActiveLyric(lyricTime.value)
  if (visible && playing && !document.hidden) startLyricClock()
})
// 暂停或未打开歌词页时同步进度，拖进度条后也能立刻对上
watch(() => playerState.currentTime, () => {
  if (lyricFrame) return
  lyricTime.value = getCurrentTime()
  syncActiveLyric(lyricTime.value)
})
watch(lyricLines, () => syncActiveLyric())

// 歌词页是整屏浮层，底下被盖住的探索画布和播放条没必要继续跑动画
watch(showLyrics, (open) => document.documentElement.classList.toggle('lyrics-veil', open))

// 切到其他应用时的节能暂停：唱片、歌词页封面、呼吸灯、跑马灯、画布漂移等常驻动画
// 统一由 html.app-inactive 冻结；歌词逐字刷新的 rAF 也一并停掉。关掉节能模式则照常运行。
let windowFocused = true
function syncPowerSavePause() {
  document.documentElement.classList.toggle('app-inactive', powerSave.value && !windowFocused)
}
function onWindowBlur() {
  windowFocused = false
  syncPowerSavePause()
  if (powerSave.value) stopLyricClock()
}
function onWindowFocus() {
  windowFocused = true
  syncPowerSavePause()
  if (showLyrics.value && playerState.isPlaying && !document.hidden && !lyricFrame) {
    lyricTime.value = getCurrentTime()
    syncActiveLyric(lyricTime.value)
    startLyricClock()
  }
}

// 最小化或收进托盘时彻底停掉歌词时钟，并冻结所有常驻 CSS 动画；回前台再续上
function onVisibilityChange() {
  const hidden = document.hidden
  document.documentElement.classList.toggle('app-hidden', hidden)
  if (hidden) {
    stopLyricClock()
    return
  }
  lyricTime.value = getCurrentTime()
  syncActiveLyric(lyricTime.value)
  if (showLyrics.value && playerState.isPlaying) startLyricClock()
}

// 迷你播放条上的动态歌词：当前行 + 下一行
const currentLyricLine = computed(() => {
  if (!playerState.currentTrack) return '选一首歌，开始今晚的沉浸'
  if (!lyricLines.value.length) return playerState.isLoading ? '正在调取这条音轨…' : '这首曲子没有歌词，静静听就好'
  return activeLyricIndex.value >= 0 ? lyricLines.value[activeLyricIndex.value]?.text || '' : lyricLines.value[0]?.text || ''
})
const nextLyricLine = computed(() => {
  const next = lyricLines.value[activeLyricIndex.value + 1]
  return next?.text || ''
})

watch(() => playerState.currentTrack?.songmid, async () => {
  if (reduceMotion) return
  await nextTick()
  gsap.fromTo('.mini-cover', { autoAlpha: 0.4, scale: 0.92 }, { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'power2.out', overwrite: 'auto' })
  gsap.fromTo(['.mini-title', '.mini-artist'], { autoAlpha: 0, y: 8, filter: 'blur(4px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.5, stagger: 0.06, ease: 'power2.out', overwrite: 'auto' })
})

/* ============ 账号与资料库 ============ */
// 账号切换/登出时推进 epoch，让迟到的资料与收藏请求失效，避免旧账号数据回写
let accountEpoch = 0
let libraryRequestId = 0
let likedRequestId = 0

function mapError(result: any, fallback: string) {
  if (!result?.success) throw new Error(result?.error || fallback)
  return result.data
}

async function syncLikedSongs(): Promise<boolean> {
  const epoch = accountEpoch
  const requestId = ++likedRequestId
  try {
    const result = await window.api.neteaseLiked()
    if (epoch !== accountEpoch || requestId !== likedRequestId) return false
    if (!result.success) throw new Error(result.error || '读取我喜欢的音乐失败')
    replaceFavorites(result.data as MusicInfo[])
    return true
  } catch (error: any) {
    if (epoch === accountEpoch && requestId === likedRequestId) {
      console.warn('[Favorites] 同步网易云「我喜欢的音乐」失败:', error?.message || error)
    }
    return false
  }
}

async function loadLibrary(): Promise<boolean> {
  const epoch = accountEpoch
  const requestId = ++libraryRequestId
  libraryLoading.value = true
  try {
    const data = mapError(await window.api.neteaseLibrary(), '暂时无法读取网易云音乐资料')
    if (epoch !== accountEpoch || requestId !== libraryRequestId) return false
    profile.value = { ...emptyProfile(), ...(data.profile || {}) }
    albums.value = data.albums || []
    playlists.value = data.playlists || []
    recommendations.value = data.recommendations || []
    connected.value = true
    return true
  } catch (error: any) {
    if (epoch !== accountEpoch || requestId !== libraryRequestId) return false
    if (String(error.message || '').includes('登录已失效') || String(error.message || '').includes('请先连接')) connected.value = false
    if (error.message && !error.message.includes('请先连接')) notify(error.message, 'error')
    return false
  } finally {
    if (requestId === libraryRequestId) libraryLoading.value = false
  }
}

let sodaRequestId = 0

function clearSodaRecommendations() {
  sodaRequestId++
  sodaPlaylists.value = []
  sodaLoading.value = false
}

async function loadSodaRecommendations(force = false) {
  // 未登录不展示汽水推荐，探索墙只保留账号里的内容
  if (!sodaConnected.value) { clearSodaRecommendations(); return }
  const requestId = ++sodaRequestId
  sodaLoading.value = true
  try {
    const data = mapError(await window.api.sodaRecommend(force), '暂时无法读取汽水推荐')
    if (requestId !== sodaRequestId) return
    sodaPlaylists.value = data as Playlist[]
  } catch (error: any) {
    if (requestId !== sodaRequestId) return
    notify(error.message || '汽水推荐加载失败，请稍后重试', 'error')
  } finally {
    if (requestId === sodaRequestId) sodaLoading.value = false
  }
}

let sodaAccountEpoch = 0

async function loadSodaLibrary(epoch = sodaAccountEpoch): Promise<boolean> {
  try {
    const data = mapError(await window.api.sodaLibrary(), '暂时无法读取汽水音乐资料') as {
      profile: AccountProfile
      playlists: Playlist[]
    }
    // 登出/切换账号后迟到的响应不能把界面重新标成已登录
    if (epoch !== sodaAccountEpoch) return false
    sodaProfile.value = { ...emptyProfile(), ...(data.profile || {}) }
    sodaMinePlaylists.value = data.playlists || []
    sodaConnected.value = true
    return true
  } catch (error: any) {
    if (epoch !== sodaAccountEpoch) return false
    const message = String(error?.message || '')
    if (message.includes('登录已失效') || message.includes('请先登录')) {
      sodaConnected.value = false
      sodaProfile.value = emptyProfile()
      sodaMinePlaylists.value = []
    }
    console.warn('[汽水] 同步账号资料失败:', message || error)
    return false
  }
}

async function refreshSodaConnection() {
  const epoch = sodaAccountEpoch
  try {
    const result = await window.api.sodaConfigured()
    if (epoch !== sodaAccountEpoch) return
    if (!result?.data) { sodaConnected.value = false; clearSodaRecommendations(); return }
    sodaConnected.value = true
    await loadSodaLibrary(epoch)
  } catch {
    if (epoch === sodaAccountEpoch) { sodaConnected.value = false; clearSodaRecommendations() }
  }
}

async function handleSodaConnected() {
  const epoch = ++sodaAccountEpoch
  sodaConnected.value = true
  sodaSyncing.value = true
  // 扫码确认即登录成功：先收起登录浮层并弹窗，资料与封面继续在后台同步
  showLogin.value = false
  revealLoginSuccess()
  try {
    const ok = await loadSodaLibrary(epoch)
    if (epoch !== sodaAccountEpoch) return
    if (!ok) notify('已登录汽水音乐，部分资料同步失败，稍后可重试', 'error', 4200)
    if (activePlatform.value === 'soda') void loadSodaRecommendations()
  } finally {
    if (epoch === sodaAccountEpoch) sodaSyncing.value = false
  }
}

function handleSodaLoggedOut() {
  sodaAccountEpoch++
  sodaConnected.value = false
  sodaSyncing.value = false
  sodaProfile.value = emptyProfile()
  sodaMinePlaylists.value = []
  showLogin.value = false
  dismissLoginSuccess()
  if (activePlatform.value === 'soda') {
    closeCollection()
    exploreDetailOpen.value = false
    exploreRef.value?.reset()
    resetPlayback()
    clearSodaRecommendations()
  }
  notify('已退出汽水音乐账号')
}

async function refreshConnection() {
  const epoch = accountEpoch
  try {
    const result = await window.api.neteaseConfigured()
    if (epoch !== accountEpoch) return
    connected.value = Boolean(result.data)
    if (connected.value) {
      sessionSyncing.value = true
      await Promise.all([loadLibrary(), syncLikedSongs()])
    }
  } catch {
    if (epoch === accountEpoch) connected.value = false
  } finally {
    booting.value = false
    if (epoch === accountEpoch) sessionSyncing.value = false
  }
}

async function handleConnected() {
  const epoch = ++accountEpoch
  const switching = connected.value
  connected.value = true
  if (switching) resetPlayback()
  sessionSyncing.value = true
  // 扫码确认即登录成功：先收起登录浮层并弹窗，歌单与封面继续在后台同步
  showLogin.value = false
  revealLoginSuccess()
  try {
    const [libraryOk, likedOk] = await Promise.all([loadLibrary(), syncLikedSongs()])
    if (epoch !== accountEpoch) return
    if (!libraryOk || !likedOk) notify('已登录网易云音乐，部分资料同步失败，稍后可重试', 'error', 4200)
  } finally {
    if (epoch === accountEpoch) sessionSyncing.value = false
  }
}

function resetPlayback() {
  stopPlayback()
  setPlayQueue([], -1)
  queueTracks.value = []
  queueIndex.value = -1
  queuePeek.value = false
  recommendActive.value = false
  if (showLyrics.value) void closeLyrics()
}

function handleLoggedOut(platform: PlatformKey = 'netease') {
  if (platform === 'soda') { handleSodaLoggedOut(); return }
  accountEpoch++
  libraryRequestId++
  likedRequestId++
  libraryLoading.value = false
  sessionSyncing.value = false
  connected.value = false
  profile.value = emptyProfile()
  albums.value = []
  playlists.value = []
  recommendations.value = []
  closeCollection()
  exploreDetailOpen.value = false
  exploreRef.value?.reset()
  resetPlayback()
  dismissLoginSuccess()
  showLogin.value = false
  notify('已退出网易云账号')
}

/* ============ 视图切换（原页显示，不弹浮层） ============ */
function goExplore() {
  activeNav.value = 'explore'
  exploreDetailOpen.value = false
  closeCollection()
  exploreRef.value?.reset()
}

function openSearch() {
  sidebarOpen.value = false
  platformOpen.value = false
  searchOpen.value = true
}

function closeSearch() {
  searchOpen.value = false
}

function locateFavorites() {
  sidebarOpen.value = false
  platformOpen.value = false
  closeCollection()
  if (activeNav.value !== 'explore') {
    activeNav.value = 'explore'
    exploreDetailOpen.value = false
    void nextTick().then(() => exploreRef.value?.focusFavorites())
    return
  }
  exploreRef.value?.focusFavorites()
}

function goLibrary(view: 'mine' | 'playlists') {
  activeNav.value = view
  exploreDetailOpen.value = false
  closeCollection()
  // 两页都是整页视图，给一次 ESC 可回到探索的提示
  notify(`已进入「${view === 'mine' ? '我的音乐' : '歌单'}」 · 按 ESC 退出`)
}

function navigateNav(key: NavKey) {
  if (key === 'explore') goExplore()
  else goLibrary(key)
}

/* ============ 新手引导 ============ */
let onboardingTimer: ReturnType<typeof setTimeout> | undefined

function finishOnboarding() {
  showOnboarding.value = false
  onboardingDone.value = true
  try { localStorage.setItem('dafen:onboarding-done', '1') } catch { /* 忽略存储异常 */ }
  window.api.setOnboardingDone()
}

/* ============ 设置与平台 ============ */
const toolbarFolding = ref(false)
let foldTimer: ReturnType<typeof setTimeout> | undefined

function foldToolbar(folded: boolean) {
  toolbarFolded.value = folded
  toolbarFolding.value = true
  clearTimeout(foldTimer)
  foldTimer = setTimeout(() => { toolbarFolding.value = false }, 540)
  if (folded) { sidebarOpen.value = false; platformOpen.value = false }
}

function openSettings() {
  platformOpen.value = false
  sidebarOpen.value = false
  showLogin.value = false
  showSettings.value = true
}

function openLogin(platform?: PlatformKey) {
  loginPlatform.value = platform === 'soda' ? 'soda' : platform === 'netease' ? 'netease' : activePlatform.value
  platformOpen.value = false
  sidebarOpen.value = false
  showSettings.value = false
  showLogin.value = true
}

let platformChooserTimer: ReturnType<typeof setTimeout> | undefined

// 当前就是汽水且未登录时，直接进汽水登录；其他情况仍交给平台选择
function handleExploreConnect() {
  if (activePlatform.value === 'soda' && !sodaConnected.value) { openLogin('soda'); return }
  openPlatformChooser()
}

// 空状态不预设平台：先展开工具组，等折叠动画结束再弹平台下拉
function openPlatformChooser() {
  sidebarOpen.value = false
  clearTimeout(platformChooserTimer)
  if (!toolbarFolded.value) {
    platformOpen.value = true
    return
  }
  platformOpen.value = false
  foldToolbar(false)
  platformChooserTimer = setTimeout(() => { platformOpen.value = true }, 560)
}

function openPlatform(platform: PlatformKey) {
  platformOpen.value = false
  if (platform !== activePlatform.value) {
    activePlatform.value = platform
    try { localStorage.setItem('dafen.platform', platform) } catch { /* 忽略存储异常 */ }
    window.api.setPlatform?.(platform)
    // 切平台先收起上一平台的详情与搜索；探索页整页随切换动画重建
    closeSearch()
    clearSearch()
    closeCollection()
    exploreDetailOpen.value = false
    // 队列和当前歌曲也属于原平台：不是目标平台的播放状态就直接清空，
    // 否则汽水页面上还在放网易云的歌，下一首也继续串平台
    const queuedPlatform = queueTracks.value[0]?.platform || playerState.currentTrack?.platform || 'netease'
    if ((playerState.currentTrack || queueTracks.value.length) && queuedPlatform !== platform) resetPlayback()
    notify(platform === 'soda'
      ? (sodaConnected.value ? '已切换至汽水音乐' : '已切换至汽水音乐 · 登录后查看内容')
      : '已切换至网易云音乐')
    if (platform === 'soda') {
      if (sodaConnected.value) void loadSodaRecommendations()
      else openLogin('soda')
    }
  }
  if (platform === 'netease' && !connected.value) openLogin('netease')
  if (platform === 'soda' && !sodaConnected.value) openLogin('soda')
}


/* ============ 搜索与播放 ============ */
let sodaSearchRequestId = 0

async function searchMusic(word: string) {
  if (!word || searchBusy.value) return
  keyword.value = word
  if (activePlatform.value === 'soda') {
    const requestId = ++sodaSearchRequestId
    sodaSearching.value = true
    try {
      const result = await window.api.sodaSearchPlaylists(word)
      if (requestId !== sodaSearchRequestId || activePlatform.value !== 'soda') return
      if (!result.success) throw new Error(result.error || '汽水歌单搜索失败')
      sodaSearchResults.value = result.data as Playlist[]
      submittedKeyword.value = word
      searched.value = true
    } catch (error: any) {
      if (requestId === sodaSearchRequestId) notify(error.message || '搜索失败，请稍后重试', 'error')
    } finally {
      if (requestId === sodaSearchRequestId) sodaSearching.value = false
    }
    return
  }
  try {
    await search(word)
    submittedKeyword.value = word
    searched.value = true
  } catch (error: any) { notify(error.message || '搜索失败，请稍后重试', 'error') }
}

function clearSearch() {
  keyword.value = ''
  searchResults.value = []
  sodaSearchResults.value = []
  sodaSearchRequestId++
  sodaSearching.value = false
  submittedKeyword.value = ''
  searched.value = false
}

async function openSodaSearchPlaylist(list: { id: string; name: string; cover: string; count?: number; creator?: string }) {
  closeSearch()
  activeNav.value = 'explore'
  exploreDetailOpen.value = false
  await nextTick()
  exploreRef.value?.openPlaylist(list)
}

function playSearchResults() {
  const index = searchResults.value.findIndex(item => !item.unavailable)
  if (index < 0) {
    notify('这些歌曲暂时都无法播放', 'error')
    return
  }
  void playTrack(searchResults.value[index], searchResults.value, index)
}

function playSearchTrack(track: MusicInfo, index: number) {
  void playTrack(track, searchResults.value, index)
}

async function playTrack(track: MusicInfo, queue: MusicInfo[] = [track], index = 0) {
  if (track.unavailable) {
    notify(`「${track.name}」已下架或版权受限，无法播放`, 'error')
    return
  }
  if (track.noSource) {
    notify(`「${track.name}」暂无音源，无法播放`, 'error')
    return
  }
  // 队列里跳过版权受限和没有音源的歌曲，自动下一首不会再次卡住
  const origin = queue[index]?.songmid === track.songmid ? index : Math.max(0, queue.indexOf(track))
  const playableQueue: MusicInfo[] = []
  let playIndex = 0
  queue.forEach((item, i) => {
    if (item.unavailable || item.noSource) return
    if (i === origin) playIndex = playableQueue.length
    playableQueue.push(item)
  })
  if (!playableQueue.length) {
    playableQueue.push(track)
    playIndex = 0
  }
  // 从搜索/歌单/收藏重新起队列时，推荐模式就不再是当前播放来源
  if (queue !== queueTracks.value) recommendActive.value = false
  setPlayQueue(playableQueue, playIndex)
  queueTracks.value = [...playableQueue]
  queueIndex.value = playIndex
  try {
    await play(track)
    commitIndex(playIndex)
  } catch (error: any) { notify(error.message || '歌曲暂时无法播放', 'error') }
}

function playQueueIndex(index: number) {
  const track = queueTracks.value[index]
  if (track) void playTrack(track, queueTracks.value, index)
}

async function expandCollection(collection: { id: string; name: string; cover: string }) {
  const requestId = ++collectionRequestId
  const platform = activePlatform.value
  collectionDetail.value = { id: collection.id, name: collection.name, cover: collection.cover }
  collectionTracks.value = []
  collectionError.value = ''
  collectionLoading.value = true
  notify(`已进入「${collection.name}」 · 按 ESC 退出`)
  void applyCoverPalette(collection.cover)
  try {
    const request = platform === 'soda'
      ? window.api.sodaPlaylist(collection.id)
      : window.api.neteaseCollection('playlist', collection.id)
    const tracks = mapError(await request, '暂时无法打开这份歌单') as MusicInfo[]
    if (requestId !== collectionRequestId || platform !== activePlatform.value) return
    collectionTracks.value = tracks
  } catch (error: any) {
    if (requestId !== collectionRequestId) return
    collectionError.value = error.message || '暂时无法打开这份歌单'
  } finally {
    if (requestId === collectionRequestId) collectionLoading.value = false
  }
}

let collectionRequestId = 0
function closeCollection() {
  if (!collectionDetail.value) return
  collectionRequestId++
  collectionDetail.value = null
  collectionTracks.value = []
  collectionLoading.value = false
  collectionError.value = ''
  void applyCoverPalette(playerState.coverUrl)
}

async function playCollectionTrack(track: MusicInfo, index: number) {
  await playTrack(track, collectionTracks.value, index)
}

/* ============ 推荐播放 ============ */
// 只记平台和歌曲 id：启动时没有正在播放的种子，用上一次的网易云歌曲续上心动模式
type RecommendSeed = { songmid: string; platform: 'netease' | 'soda' }

function readRecommendSeed(): RecommendSeed | null {
  try {
    const raw = localStorage.getItem('dafen:last-seed')
    if (!raw) return null
    const seed = JSON.parse(raw)
    if (seed?.songmid && (seed.platform === 'netease' || seed.platform === 'soda')) {
      return { songmid: String(seed.songmid), platform: seed.platform }
    }
  } catch { /* 种子损坏时按没有种子处理 */ }
  return null
}

watch(() => playerState.currentTrack?.songmid, () => {
  const track = playerState.currentTrack
  if (!track) return
  try {
    localStorage.setItem('dafen:last-seed', JSON.stringify({
      songmid: track.songmid,
      platform: track.platform || 'netease'
    }))
  } catch { /* 忽略存储异常 */ }
}, { immediate: true })

// 网易云优先用心动模式续种子歌曲，没有种子或心动模式失败时退回私人FM；汽水用官方推荐流
async function loadRecommendedTracks(platform: 'netease' | 'soda', seedId = ''): Promise<MusicInfo[]> {
  if (platform === 'soda') {
    return mapError(await window.api.sodaFeed(50), '推荐队列加载失败') as MusicInfo[]
  }
  const playlistId = likedPlaylist.value?.id || ownedPlaylists.value[0]?.id || ''
  if (seedId && playlistId) {
    try {
      return mapError(await window.api.neteaseHeartbeat(seedId, playlistId, 50), '心动模式加载失败') as MusicInfo[]
    } catch {
      // 心动模式依赖种子歌曲所在的歌单，失败时继续走私人FM
    }
  }
  return mapError(await window.api.neteasePersonalFm(50), '推荐播放加载失败') as MusicInfo[]
}

// 非会员的心动/推荐队列最多保留 10 首 VIP，其余留给能完整播放的歌
const RECOMMEND_VIP_LIMIT = 10
function capRecommendVip(tracks: MusicInfo[]): MusicInfo[] {
  if (activeProfile.value.vip) return tracks
  let vipCount = 0
  return tracks.filter(track => {
    if (track.vip !== 'vip') return true
    vipCount += 1
    return vipCount <= RECOMMEND_VIP_LIMIT
  })
}

async function startRecommendedPlayback(auto = false) {
  if (recommendLoading.value) return
  const platform = activePlatform.value
  const loggedIn = platform === 'soda' ? sodaConnected.value : connected.value
  if (!loggedIn) {
    if (auto) return
    notify(platform === 'soda' ? '登录汽水音乐后即可使用推荐播放' : '登录网易云音乐后即可使用推荐播放', 'error')
    openLogin()
    return
  }
  // 开机自动播放只在还没开始听歌时接管
  if (auto && (playerState.currentTrack || queueTracks.value.length)) return
  // 心动模式开启动画两个平台共用；开机自动接管时不弹窗
  const showHeartWindow = !auto
  if (showHeartWindow) heartOpening.value = 'opening'
  recommendLoading.value = true
  try {
    const currentSeed = playerState.currentTrack?.platform === platform ? playerState.currentTrack.songmid : ''
    const lastSeed = readRecommendSeed()
    // 没有正在播放的歌时，用最近播放或红心里的第一首当种子，保证启动也能进心动模式
    const seedId = currentSeed
      || (platform === 'netease' ? favoritesFor('netease')[0]?.songmid || '' : '')
      || (lastSeed?.platform === platform ? lastSeed.songmid : '')
    const data = await loadRecommendedTracks(platform, seedId)
    if (platform !== activePlatform.value) return
    // 请求期间用户已经自己点歌时，不要用推荐队列盖掉他的选择
    if (auto && (playerState.currentTrack || queueTracks.value.length)) return
    const tracks = capRecommendVip(data.filter(track => !track.unavailable && !track.noSource))
    if (!tracks.length) throw new Error(platform === 'soda' ? '推荐队列里暂时没有可播放的歌曲' : '推荐播放暂时没有可播放的歌曲')
    setPlayQueue(tracks, 0)
    queueTracks.value = [...tracks]
    queueIndex.value = 0
    await play(tracks[0])
    commitIndex(0)
    recommendActive.value = true
    if (showHeartWindow) {
      heartOpeningCount.value = tracks.length
      heartOpening.value = 'done'
      if (heartOpeningTimer) clearTimeout(heartOpeningTimer)
      heartOpeningTimer = setTimeout(dismissHeartOpening, 1200)
    }
  } catch (error: any) {
    // 启动时的网络波动不弹红色错误，手动触发才提示
    if (!auto) notify(error?.message || '推荐播放失败，请稍后重试', 'error')
  } finally {
    recommendLoading.value = false
    if (heartOpening.value === 'opening') dismissHeartOpening()
  }
}

async function toggleCurrentFavorite() {
  const track = playerState.currentTrack
  if (!track) return
  const epoch = accountEpoch
  const liked = currentIsFavorite.value
  toggleFavorite(track)
  notify(liked ? '已从收藏中移除' : '已加入我喜欢的音乐')
  // 汽水曲目没有网易云对应项，只留在本地收藏
  if (!connected.value || track.platform === 'soda') return
  // 已连接账号时，心形按钮直接同步到网易云「我喜欢的音乐」
  try {
    const result = await window.api.neteaseLike(track.songmid, !liked)
    if (!result.success) throw new Error(result.error || '网易云同步失败')
  } catch (error: any) {
    // 退出登录/切换账号后，迟到的失败结果不再改写本地收藏
    if (epoch !== accountEpoch) return
    toggleFavorite(track)
    notify(`网易云同步失败：${error.message || '请稍后重试'}`, 'error')
  }
}

function playPrevious() {
  const previous = getPrevTrack(playMode.value)
  if (previous) { queueIndex.value = getCurrentInfo().index; void play(previous).then(() => commitIndex(getCurrentInfo().index)).catch((error: any) => notify(error.message || '上一首暂时无法播放', 'error')) }
}

function playNext() {
  const next = getNextTrack(playMode.value)
  if (next) { queueIndex.value = getCurrentInfo().index; void play(next).then(() => commitIndex(getCurrentInfo().index)).catch((error: any) => notify(error.message || '下一首暂时无法播放', 'error')) }
}

function cyclePlayMode() {
  const nextIndex = (playModes.indexOf(playMode.value) + 1) % playModes.length
  setPlayMode(playModes[nextIndex])
  notify(modeNames[playModes[nextIndex]])
}

function toggleMute() {
  if (playerState.volume > 0) { volumeBeforeMute.value = playerState.volume; setVolume(0) }
  else setVolume(volumeBeforeMute.value || 0.5)
}

function handleVolume(value: number) {
  setVolume(value)
  if (value > 0) volumeBeforeMute.value = value
}

/* ============ 沉浸歌词页 ============ */
function openLyrics() {
  if (!playerState.currentTrack) { notify('先播放一首歌，再打开歌词。'); return }
  showLyrics.value = true
  notify('按 ESC 退出歌词页')
}

async function closeLyrics() {
  showLyrics.value = false
  try { await window.api.exitFullscreen() } catch { /* 忽略 */ }
  isFullscreen.value = false
}

async function toggleFullscreen() {
  try {
    // 透明窗口的原生全屏状态不可靠，切换与状态都以主进程返回值为准
    isFullscreen.value = Boolean(await window.api.toggleFullscreenWindow())
  } catch { notify('无法切换全屏模式', 'error') }
}

/* ============ 窗口栏自动隐藏 ============ */
function revealWindowBar() {
  if (windowBarTimer) { clearTimeout(windowBarTimer); windowBarTimer = null }
  windowBarHidden.value = false
}

function scheduleWindowBarHide(delay = 900) {
  if (windowBarTimer) clearTimeout(windowBarTimer)
  windowBarTimer = setTimeout(() => {
    windowBarTimer = null
    if (showOnboarding.value) return
    windowBarHidden.value = true
  }, delay)
}

function onWindowPointerMove(event: MouseEvent) {
  // 引导的高亮都落在顶栏按钮上，期间不能让窗口栏自动收起
  if (showOnboarding.value) { revealWindowBar(); return }
  if (event.clientY <= 52) revealWindowBar()
  else if (!windowBarHidden.value && !windowBarTimer) scheduleWindowBarHide()
}

/* ============ 提示 ============ */
function notify(message: string, type: 'success' | 'error' = 'success', duration?: number) {
  toast.value = { message, type }
  if (toastTimer.value) clearTimeout(toastTimer.value)
  toastTimer.value = setTimeout(() => { toast.value = null }, duration ?? (type === 'error' ? 4200 : 2600))
}

function revealLoginSuccess() {
  showLoginSuccess.value = true
  if (loginSuccessTimer) clearTimeout(loginSuccessTimer)
  loginSuccessTimer = setTimeout(() => {
    loginSuccessTimer = null
    showLoginSuccess.value = false
  }, 3200)
}

function dismissLoginSuccess() {
  showLoginSuccess.value = false
  if (loginSuccessTimer) {
    clearTimeout(loginSuccessTimer)
    loginSuccessTimer = null
  }
}

/* ============ 全局事件 ============ */
function onAudioError(event: Event) {
  const detail = (event as CustomEvent<string>).detail
  notify(detail || '播放器遇到问题，请稍后重试。', 'error')
}

function onTrackEnded(event: Event) {
  const next = (event as CustomEvent<{ track: MusicInfo; index: number }>).detail
  if (!next?.track) return
  commitIndex(next.index)
  queueIndex.value = next.index
  void play(next.track).catch((error: any) => notify(error.message || '下一首暂时无法播放', 'error'))
}

function onTrialPlayback(event: Event) {
  const seconds = Number((event as CustomEvent<number>).detail)
  // 汽水下发的试听片段取自歌曲中段，不是开头 30 秒
  if (Number.isFinite(seconds) && seconds > 0) notify(`VIP 歌曲 · 仅可试听 ${seconds} 秒片段`, 'success', 4200)
}

function onKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
  if (event.key === 'Escape') {
    // 从最上层的界面开始逐层退出
    if (searchOpen.value) { closeSearch(); return }
    if (platformOpen.value) { platformOpen.value = false; return }
    if (showLogin.value) { showLogin.value = false; return }
    if (showSettings.value) return
    if (showLyrics.value) { void closeLyrics(); return }
    if (sidebarOpen.value) { sidebarOpen.value = false; return }
    if (isMaximized.value) { appWindow.api.windowRestore(); return }
    if (isFullscreen.value) { void toggleFullscreen(); return }
    if (collectionDetail.value) { closeCollection(); return }
    if (activeNav.value === 'explore' && exploreDetailOpen.value) { exploreRef.value?.collapse(); return }
    if (activeNav.value !== 'explore') { goExplore(); return }
    return
  }
  const target = event.target as HTMLElement
  if (event.code === 'Space' && !['INPUT', 'TEXTAREA', 'BUTTON'].includes(target?.tagName)) {
    event.preventDefault()
    togglePlay()
  }
  if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(target?.tagName)) {
    event.preventDefault()
    openSearch()
  }
}

/* ============ 进场编排 ============ */
function playEntrance() {
  if (reduceMotion) return
  const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } })
  timeline
    .from('.window-brand', { autoAlpha: 0, x: -10, duration: 0.4 }, 0)
    .from('.topbar-actions > *', { autoAlpha: 0, y: -10, stagger: 0.06, duration: 0.4 }, '-=0.6')
    .from('.explore-head > *', { autoAlpha: 0, y: 12, stagger: 0.07, duration: 0.5 }, '-=0.55')
    .from('.galaxy-viewport', { autoAlpha: 0, duration: 0.8 }, '-=0.5')
  exploreRef.value?.enter()
  miniRef.value?.enter()
}

let offFullscreenChange: (() => void) | null = null
let offMaximizeChange: (() => void) | null = null
let offLoginState: (() => void) | null = null
let offSodaLoginState: (() => void) | null = null
let offTrayCommand: (() => void) | null = null

// 托盘面板是独立窗口，播放状态由主窗口主动同步过去
function syncTrayState() {
  // 热更新期间 preload 还是旧版，等整机重启后托盘桥接才可用
  window.api.traySendState?.({
    title: playerState.currentTrack?.name || '',
    artist: playerState.currentTrack?.singer || '',
    cover: playerState.coverUrl || '',
    playing: playerState.isPlaying,
    hasTrack: Boolean(playerState.currentTrack),
    platform: activePlatform.value,
    vip: playerState.currentTrack?.vip || '',
    lyric: currentLyricLine.value,
    favorite: currentIsFavorite.value
  })
}

watch(
  [
    () => playerState.currentTrack?.songmid,
    () => playerState.coverUrl,
    () => playerState.isPlaying,
    activePlatform,
    currentLyricLine,
    currentIsFavorite
  ],
  syncTrayState,
  { immediate: true }
)

// 桌面歌词条：主窗口里的开关状态跟着悬浮条本身走（从歌词条上关闭也能同步回来）
const lyricBarOn = ref(false)
let offLyricVisibility: (() => void) | null = null
let offLyricCommand: (() => void) | null = null

async function toggleLyricBar() {
  try {
    lyricBarOn.value = Boolean(await window.api.toggleLyricBar?.())
    if (lyricBarOn.value) syncTrayState()
  } catch { /* 主进程不可用时保持原状态 */ }
}

// 首屏先渲染主界面，浏览器空闲后再把按需浮层的代码取回来，打开时无需等待
function prefetchOverlays() {
  const loaders = [loadSettings, loadPlatformLogin, loadOnboardingGuide]
  const run = () => { for (const load of loaders) void load() }
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 3000 })
  } else {
    setTimeout(run, 1200)
  }
}

onMounted(() => {
  // 旧版本只把平台存在 localStorage，首次升级时补写到主进程
  if (!window.api.initialPlatform) window.api.setPlatform?.(activePlatform.value)
  if (onboardingDone.value && !window.api.initialOnboardingDone) window.api.setOnboardingDone()
  if (alwaysOnTop.value) void window.api.setAlwaysOnTop(true)
  offFullscreenChange = window.api.onFullscreenChange((fullscreen) => { isFullscreen.value = fullscreen })
  offMaximizeChange = window.api.onMaximizeChange((maximized) => { isMaximized.value = maximized })
  // 登录确认由主进程持续轮询，即使账号浮层已经关闭，这里也能收到成功并开始同步
  offLoginState = (window.api as any).onNeteaseLoginState?.((state: any) => {
    if (state?.phase === 'success') void handleConnected()
  }) ?? null
  offSodaLoginState = window.api.onSodaLoginState?.((state: any) => {
    if (state?.phase === 'success') void handleSodaConnected()
  }) ?? null
  offTrayCommand = window.api.onTrayCommand?.((action) => {
    if (action === 'toggle') togglePlay()
    else if (action === 'prev') playPrevious()
    else if (action === 'next') playNext()
    else if (action === 'like') void toggleCurrentFavorite()
  }) ?? null
  offLyricVisibility = window.api.onLyricVisibility?.((visible) => { lyricBarOn.value = visible }) ?? null
  offLyricCommand = window.api.onLyricCommand?.((action) => {
    if (action === 'toggle') togglePlay()
    else if (action === 'prev') playPrevious()
    else if (action === 'next') playNext()
    else if (action === 'like') void toggleCurrentFavorite()
  }) ?? null
  void window.api.lyricBarVisible?.().then((visible) => { lyricBarOn.value = visible }).catch(() => { /* 忽略 */ })
  void window.api.windowIsMaximized().then((maximized) => { isMaximized.value = maximized }).catch(() => { /* 忽略 */ })
  void window.api.windowIsFullscreen().then((fullscreen) => { isFullscreen.value = fullscreen }).catch(() => { /* 忽略 */ })
  // 等账号状态确认、开屏收起后再自动开播，避免未登录时弹登录或和启动动画抢时间
  void (async () => {
    await Promise.allSettled([refreshConnection(), refreshSodaConnection()])
    if (activePlatform.value === 'soda' && sodaConnected.value) await loadSodaRecommendations()
    if (showSplash.value) {
      await new Promise<void>((resolve) => {
        const stop = watch(showSplash, (visible) => {
          if (visible) return
          stop()
          resolve()
        })
      })
    }
    if (autoPlayRecommended.value && onboardingDone.value) void startRecommendedPlayback(true)
  })()
  window.addEventListener('audio-error', onAudioError)
  window.addEventListener('track-ended', onTrackEnded)
  window.addEventListener('playback-trial', onTrialPlayback)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('mousemove', onWindowPointerMove)
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('focus', onWindowFocus)
  scheduleWindowBarHide(2600)
  prefetchOverlays()
})

watch(showSplash, async (visible) => {
  if (visible) return
  await nextTick()
  playEntrance()
  // 等开屏与入场动画落定后再拉起引导，避免两层动画叠在一起
  if (!onboardingDone.value) {
    clearTimeout(onboardingTimer)
    onboardingTimer = setTimeout(() => { showOnboarding.value = true }, 700)
  }
})

watch(showOnboarding, (visible) => {
  if (visible) revealWindowBar()
  else scheduleWindowBarHide()
})

onBeforeUnmount(() => {
  offFullscreenChange?.()
  offMaximizeChange?.()
  offLoginState?.()
  offSodaLoginState?.()
  offTrayCommand?.()
  offLyricVisibility?.()
  offLyricCommand?.()
  stopLyricClock()
  if (onboardingTimer) clearTimeout(onboardingTimer)
  window.removeEventListener('audio-error', onAudioError)
  window.removeEventListener('track-ended', onTrackEnded)
  window.removeEventListener('playback-trial', onTrialPlayback)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('mousemove', onWindowPointerMove)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('blur', onWindowBlur)
  window.removeEventListener('focus', onWindowFocus)
  if (windowBarTimer) clearTimeout(windowBarTimer)
  if (toastTimer.value) clearTimeout(toastTimer.value)
  if (loginSuccessTimer) clearTimeout(loginSuccessTimer)
})
</script>

<style scoped>
.app-shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--text-cream);
  font-family: var(--font-body);
  background:
    radial-gradient(1100px 520px at 50% -12%, var(--accent-live-glow), transparent 62%),
    radial-gradient(760px 480px at 108% 88%, rgba(224, 140, 175, 0.14), transparent 60%),
    radial-gradient(720px 520px at -8% 96%, rgba(90, 116, 232, 0.12), transparent 60%),
    linear-gradient(178deg, #fcfaff 0%, #f4f0fb 58%, #ece7f6 100%);
  transition: background 1.2s ease;
}
/* ============ 探索页：全窗口画布 ============ */
.app-shell.explore-full .stage { height: 100%; }
.app-shell.explore-full .stage-body { height: 100%; }
/* 探索页：队列浮在画布右上，不挤压内容 */
.app-shell.explore-full .queue-dock {
  top: 108px;
  right: 0;
  bottom: 16px;
}
/* 歌单详情页：队列顶边抬到与曲目列表同高，两块面板上下缘对齐 */
.app-shell.detail-open .queue-dock { top: 56px; }
/* 我的音乐 / 歌单的舞台从 38px 窗口栏下面开始，队列同样对齐曲目列表顶边 */
.app-shell.detail-open:not(.explore-full) .queue-dock { top: 18px; }
/* 我的音乐 / 歌单的舞台已经顶到窗口上沿，详情页队列要补回那 38px */
.app-shell.float-top.detail-open:not(.explore-full) .queue-dock { top: 56px; }

/* ============ 三栏舞台 ============ */
.stage { flex: 1; min-height: 0; display: flex; position: relative; }

/* ---- 右侧区域（顶栏横跨主舞台+队列） ---- */
.stage-right { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.stage-body { flex: 1; min-height: 0; display: flex; position: relative; }

/* ---- 我的音乐 / 歌单：多张歌单封面的主色各自晕开一团，颜色和格子里的封面对得上 ---- */
/* 不设 z-index，靠 DOM 顺序压在主舞台下面；舞台已经包含窗口栏那块高度，铺满即可 */
.page-cover-backdrop {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.page-cover-blob {
  position: absolute;
  opacity: 0.5;
  filter: blur(6px);
  -webkit-mask-image: radial-gradient(closest-side, #000 26%, transparent 100%);
  mask-image: radial-gradient(closest-side, #000 26%, transparent 100%);
}
/* 第一团放中间，封面少的时候也不会只剩边角有颜色 */
.blob-0 { top: 10%; left: 17%; width: 66%; height: 66%; }
.blob-1 { top: -14%; left: -10%; width: 58%; height: 58%; }
.blob-2 { top: -12%; right: -10%; width: 56%; height: 56%; }
.blob-3 { bottom: -16%; left: -8%; width: 58%; height: 58%; }
.blob-4 { bottom: -14%; right: -12%; width: 56%; height: 56%; }
.page-cover-wash {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(252, 250, 255, 0.1), rgba(244, 240, 251, 0.2));
}

/* ---- 中央 ---- */
.stage-main { min-width: 0; flex: 1; display: flex; flex-direction: column; position: relative; z-index: 1; }

/* ---- 平台界面切换：旧页面迅速退场，新平台带一点回弹浮起 ---- */
.stage-view { flex: 1; min-height: 0; display: flex; flex-direction: column; position: relative; }
.stage-swap-enter-active { transition: opacity 0.42s cubic-bezier(0.22, 1, 0.36, 1), transform 0.42s cubic-bezier(0.22, 1, 0.36, 1); }
.stage-swap-leave-active { transition: opacity 0.18s ease-in, transform 0.18s ease-in; }
.stage-swap-enter-active, .stage-swap-leave-active { will-change: opacity, transform; }
.stage-swap-enter-from { opacity: 0; transform: translateY(18px); }
.stage-swap-leave-to { opacity: 0; transform: translateY(-10px); }
/* 我的音乐 / 歌单的歌单详情：和探索页共用展开层，铺满整个窗口 */
.collection-expanded.page-fixed {
  position: fixed;
  inset: 0;
  z-index: 40;
}

/* 我的音乐 / 歌单：底色跟着当前封面主色走，和歌单详情页同一套氛围 */
.app-shell.float-top {
  background:
    radial-gradient(80% 62% at 4% 0%, color-mix(in srgb, var(--accent-live) 20%, transparent), transparent 66%),
    radial-gradient(70% 58% at 98% 100%, var(--accent-live-glow), transparent 74%),
    radial-gradient(1100px 520px at 50% -12%, var(--accent-live-glow), transparent 62%),
    radial-gradient(760px 480px at 108% 88%, rgba(224, 140, 175, 0.14), transparent 60%),
    radial-gradient(720px 520px at -8% 96%, rgba(90, 116, 232, 0.12), transparent 60%),
    linear-gradient(178deg, #fcfaff 0%, #f4f0fb 58%, #ece7f6 100%);
}
.app-shell.float-top .stage { height: 100%; }
.app-shell.float-top .queue-dock { top: 108px; }

/* ============ 队列：显示与否只跟随播放栏最右侧的队列按钮 ============ */
.queue-dock {
  position: absolute;
  right: 0;
  top: 12px;
  bottom: 16px;
  z-index: 8;
  /* 271px：最小窗口 1162 下，居中的 620px 播放条两侧正好各留 271px，
     队列贴着右缘时与播放条右缘严丝合缝，底部左右宽度对称 */
  width: min(271px, calc(100vw - 32px));
  padding: 14px 14px 12px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.34);
  box-shadow:
    0 18px 44px rgba(70, 55, 110, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(34px) saturate(1.35);
  -webkit-backdrop-filter: blur(34px) saturate(1.35);
  overflow: hidden;
  transition: transform 0.45s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.45s, top 0.45s cubic-bezier(0.4, 0, 0.2, 1);
}
.queue-dock:not(.peek) {
  transform: translateX(calc(100% + 20px));
  opacity: 0;
  pointer-events: none;
}
.queue-dock.peek { transform: translateX(0); opacity: 1; }
/* 探索页：队列浮在画布右上，不挤压内容 */
/* ============ 过渡 ============ */
.veil-enter-active, .veil-leave-active { transition: opacity 0.28s ease; }
.veil-enter-from, .veil-leave-to { opacity: 0; }
.toast-message {
  position: fixed; top: 52px; left: 50%; z-index: 60;
  display: flex; align-items: center; gap: 9px;
  padding: 10px 16px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: var(--r-full);
  background: rgba(255, 255, 255, 0.34);
  box-shadow: 0 18px 44px rgba(70, 55, 110, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(34px) saturate(1.35);
  -webkit-backdrop-filter: blur(34px) saturate(1.35);
  color: var(--text-primary);
  font-size: 11.5px;
  transform: translateX(-50%);
}
.toast-message > span { width: 18px; height: 18px; display: grid; place-items: center; border-radius: 50%; background: var(--amber); color: #fff; font: 600 10px var(--font-mono); }
.toast-message.error { border-color: rgba(224, 99, 111, 0.45); }
.toast-message.error > span { background: var(--ruby); color: #fff; }
.toast-enter-active, .toast-leave-active { transition: opacity 0.2s, transform 0.2s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, -8px); }
.login-success {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 70;
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 258px;
  padding: 18px 24px 18px 18px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.34);
  color: var(--text-primary);
  box-shadow:
    0 18px 44px rgba(70, 55, 110, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(34px) saturate(1.35);
  -webkit-backdrop-filter: blur(34px) saturate(1.35);
  transform: translate(-50%, -50%);
  cursor: pointer;
}
.login-success::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(120deg, color-mix(in srgb, var(--emerald) 7%, transparent), transparent 46%, color-mix(in srgb, var(--emerald) 5%, transparent));
  pointer-events: none;
}
.login-success-mark {
  position: relative;
  width: 44px;
  height: 44px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(63, 155, 120, 0.12);
  color: var(--emerald);
  box-shadow: inset 0 0 0 1px rgba(63, 155, 120, 0.24);
  animation: success-mark 0.6s cubic-bezier(0.2, 1.5, 0.4, 1);
}
.login-success-mark::after {
  content: '';
  position: absolute;
  inset: -5px;
  border-radius: 50%;
  border: 1px solid rgba(63, 155, 120, 0.35);
  animation: success-ring 1.1s ease-out 0.12s both;
}
.login-success-copy { position: relative; display: grid; gap: 2px; }
.login-success-kicker { color: var(--emerald); font: 500 8.5px/1 var(--font-mono); letter-spacing: 0.16em; }
.login-success-copy strong { color: var(--text-primary); font: 400 17px/1.3 var(--font-display); }
.login-success-copy small { color: var(--text-muted); font-size: 10.5px; }
.welcome-enter-active { transition: opacity 0.3s ease, transform 0.42s cubic-bezier(0.2, 1.35, 0.4, 1); }
.welcome-leave-active { transition: opacity 0.24s ease, transform 0.24s ease; }
.welcome-enter-from, .welcome-leave-to { opacity: 0; transform: translate(-50%, -46%) scale(0.94); }
@keyframes success-mark { 0% { transform: scale(0.55); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@keyframes success-ring { 0% { transform: scale(0.78); opacity: 0.7; } 100% { transform: scale(1.22); opacity: 0; } }

/* ============ 心动模式开启小窗 ============ */
.heart-window {
  position: fixed;
  top: 47%;
  left: 50%;
  z-index: 71;
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 236px;
  padding: 14px 22px 14px 16px;
  border: 1px solid rgba(255, 255, 255, 0.62);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.42);
  color: var(--text-primary);
  box-shadow:
    0 18px 44px rgba(70, 55, 110, 0.15),
    0 10px 36px rgba(214, 61, 108, 0.13),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(34px) saturate(1.35);
  -webkit-backdrop-filter: blur(34px) saturate(1.35);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.heart-window::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(130% 150% at 16% 18%, rgba(214, 61, 108, 0.13), transparent 60%);
  pointer-events: none;
}
.hw-mark {
  position: relative;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex: none;
  border-radius: 50%;
  background: radial-gradient(circle at 36% 30%, rgba(255, 236, 243, 0.95), rgba(214, 61, 108, 0.16));
  color: var(--rose);
  box-shadow: inset 0 0 0 1px rgba(214, 61, 108, 0.24);
  animation: hw-beat 1.05s ease-in-out infinite;
}
.heart-window.done .hw-mark {
  color: #fff;
  background: radial-gradient(circle at 36% 30%, #e2648f, #b02752 78%);
  box-shadow: 0 6px 18px rgba(176, 39, 82, 0.28);
  animation: none;
}
.hw-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1.5px solid rgba(214, 61, 108, 0.5);
  opacity: 0;
  animation: hw-ring 1.5s cubic-bezier(0.2, 0.6, 0.3, 1) infinite;
}
.hw-ring.late { animation-delay: 0.22s; }
.heart-window.done .hw-ring { animation: none; opacity: 0; }
.hw-copy { position: relative; display: grid; gap: 2px; }
.hw-kicker { color: var(--rose); font-size: 8.5px; letter-spacing: 0.16em; }
.hw-copy strong { font: 400 16px/1.3 var(--font-display); letter-spacing: 0.01em; }
.hw-copy small { color: var(--text-muted); font-size: 10.5px; }
@keyframes hw-beat {
  0%, 100% { transform: scale(1); }
  12% { transform: scale(1.07); }
  24% { transform: scale(1); }
  36% { transform: scale(1.045); }
  52% { transform: scale(1); }
}
@keyframes hw-ring {
  0% { opacity: 0; transform: scale(0.9); }
  12% { opacity: 0.7; }
  100% { opacity: 0; transform: scale(1.7); }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
}
</style>
