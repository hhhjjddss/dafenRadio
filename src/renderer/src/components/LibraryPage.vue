<template>
  <section class="page-view" :class="{ 'under-detail': underDetail }">
    <!-- 我的音乐 -->
    <div v-if="nav === 'mine'" class="page-scroll library-page">
      <h1 class="float-title">我的音乐</h1>
      <section class="library-section">
        <header class="library-section-head">
          <h3>我的歌单</h3>
          <i aria-hidden="true"></i>
        </header>
        <div v-if="ownedPlaylists.length && !mineSkeleton" class="library-grid">
          <button v-for="list in ownedPlaylists" :key="list.id" class="library-card" @click="emit('expand', list)">
            <span class="library-card-art">
              <img :src="neteaseThumb(list.cover) || fallbackCover" alt="" @error="fallbackCoverOnError" />
              <span class="library-card-play"><Play :size="14" fill="currentColor" /></span>
            </span>
            <strong>{{ list.name }}</strong>
            <small>{{ list.count || list.trackCount ? `${list.count || list.trackCount} 首` : '歌单' }}</small>
          </button>
        </div>
        <div v-else-if="mineSkeleton" class="library-grid" aria-hidden="true">
          <div v-for="n in skeletonCount" :key="n" class="library-card skeleton-card">
            <span class="library-card-art sk-fill"></span>
            <span class="sk-line"></span>
            <span class="sk-line short"></span>
          </div>
        </div>
        <div v-else class="library-empty">
          <ListMusic :size="18" />
          <p>{{ platform === 'soda' ? (sodaConnected ? '汽水账号里还没有可显示的歌单' : '登录汽水音乐后，你的歌单会出现在这里') : '连接账号后，你的歌单会出现在这里' }}</p>
        </div>
      </section>
    </div>

    <!-- 歌单（平台推荐） -->
    <div v-else-if="nav === 'playlists'" class="page-scroll">
      <h1 class="float-title">歌单</h1>
      <p class="page-overline">平台推荐 <span class="mono">{{ shelfSkeleton ? '…' : platformPlaylists.length }}</span></p>
      <div class="shelf-grid">
        <template v-if="!shelfSkeleton">
          <button v-for="list in platformPlaylists" :key="list.id" class="shelf-card" @click="emit('expand', list)">
            <img :src="neteaseThumb(list.cover) || fallbackCover" alt="" @error="fallbackCoverOnError" />
            <strong>{{ list.name }}</strong>
            <small class="shelf-meta">
              <span class="shelf-owner">{{ list.creator || (platform === 'soda' ? '汽水音乐' : '网易云音乐') }}</span>
              <span v-if="list.count" class="shelf-count mono">{{ list.count }} 首</span>
            </small>
          </button>
        </template>
        <template v-if="shelfSkeleton">
          <div v-for="n in skeletonCount" :key="n" class="shelf-card skeleton-card" aria-hidden="true">
            <span class="shelf-cover sk-fill"></span>
            <span class="sk-line"></span>
            <span class="sk-line short"></span>
          </div>
        </template>
        <p v-if="!shelfSkeleton && !platformPlaylists.length" class="search-note">{{ platform === 'soda' ? (sodaConnected ? '汽水推荐暂时没有返回内容' : '登录汽水音乐后查看推荐') : '连接账号后查看每日推荐' }}</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ListMusic, Play } from '@lucide/vue'
import { fallbackCoverOnError, loadCover, neteaseThumb } from '../utils/cover'

interface Playlist {
  id: string
  name: string
  cover: string
  count?: number
  trackCount?: number
  creator?: string
}

const props = defineProps<{
  nav: string
  platform: 'netease' | 'soda'
  ownedPlaylists: Playlist[]
  platformPlaylists: Playlist[]
  fallbackCover: string
  sodaConnected: boolean
  // 歌单/推荐还在同步时先铺骨架卡片，避免空页面
  loading: boolean
  underDetail: boolean
}>()

const emit = defineEmits<{
  expand: [collection: Playlist]
}>()

// 数据往往在开屏动画期间就已同步完成，进入页面时骨架一闪而过甚至不出现；
// 和详情页一样保证每次进入都能看到至少约 900ms 的加载态
const SKELETON_MIN_MS = 900
const minElapsed = ref(false)
let minTimer = 0
watch(() => props.nav, () => {
  minElapsed.value = false
  window.clearTimeout(minTimer)
  minTimer = window.setTimeout(() => { minElapsed.value = true }, SKELETON_MIN_MS)
}, { immediate: true })

// 骨架卡片按窗口大小铺满可视区（列宽按 128px 估算，行高约 185px），而不是固定十几张
const skeletonCount = ref(24)
function measureSkeletonCount() {
  const cols = Math.max(4, Math.floor((window.innerWidth - 60 + 16) / (128 + 16)))
  const rows = Math.max(2, Math.ceil((window.innerHeight - 190) / 185) + 1)
  skeletonCount.value = Math.min(72, cols * rows)
}
measureSkeletonCount()
onMounted(() => window.addEventListener('resize', measureSkeletonCount))

// 骨架揭开前先把整页封面解码完：只预取首屏时，滚到下面的卡片图片还是会一张张冒出来
// 预取和 <img> 用同一个小图 URL，命中同一份缓存
const currentList = computed(() => (props.nav === 'mine' ? props.ownedPlaylists : props.platformPlaylists))
const currentCovers = computed(() => currentList.value.map(item => neteaseThumb(item.cover)).filter(Boolean))
const coversReady = ref(true)
let coversEpoch = 0
watch(currentCovers, async (urls) => {
  const epoch = ++coversEpoch
  const targets = [...new Set(urls)]
  if (!targets.length) { coversReady.value = true; return }
  coversReady.value = false
  await Promise.all(targets.map(loadCover))
  if (epoch === coversEpoch) coversReady.value = true
}, { immediate: true })

// 真实同步中（列表为空）始终铺骨架；有数据时骨架要撑到最短展示时间结束
// 且首屏封面解码完成，避免真实卡片提前揭开导致图片逐张补齐
const mineSkeleton = computed(() => {
  const has = props.ownedPlaylists.length > 0
  if (!has) return props.loading
  return !minElapsed.value || !coversReady.value
})
const shelfSkeleton = computed(() => {
  const has = props.platformPlaylists.length > 0
  if (!has) return props.loading
  return !minElapsed.value || !coversReady.value
})

onBeforeUnmount(() => {
  window.clearTimeout(minTimer)
  window.removeEventListener('resize', measureSkeletonCount)
})
</script>

<style scoped>
/* ---- 原页视图（我的音乐 / 歌单） ---- */
/* 底部不再为播放条预留整片空白：内容一直滚到窗口底边，播放条浮在内容上 */
.page-view {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column;
  padding: 4px 26px 0;
  transition: opacity 0.24s ease;
}
/* 歌单详情盖在上面时先让原页退场，背景只留虚化封面 */
.page-view.under-detail { opacity: 0; pointer-events: none; }
.page-overline { color: var(--text-ghost); font-size: 8.5px; letter-spacing: 0.32em; }
.page-scroll {
  flex: 1; min-height: 0;
  overflow-y: auto;
  padding: 14px 2px 104px;
  scrollbar-width: thin;
}
.page-scroll .page-overline { margin: 12px 0 12px; font: 500 9.5px var(--font-mono); letter-spacing: 0.2em; }
.page-scroll .page-overline:first-child { margin-top: 0; }
.page-scroll .page-overline .mono { margin-left: 6px; }
.search-note { padding: 26px 12px; color: var(--text-ghost); font-size: 12px; text-align: center; }

/* ---- 我的音乐 ---- */
.library-page { display: flex; flex-direction: column; gap: 24px; scrollbar-width: none; }
.library-page::-webkit-scrollbar { display: none; }

.library-section { display: flex; flex-direction: column; }
.library-section-head { display: flex; align-items: center; gap: 12px; padding: 0 2px 14px; }
.library-section-head h3 { flex: none; color: var(--text-primary); font: 500 13px/1 var(--font-body); letter-spacing: 0.06em; }
.library-section-head i { flex: 1; height: 1px; background: linear-gradient(90deg, var(--border-subtle), transparent); }

.library-grid { display: grid; grid-template-columns: repeat(auto-fill, 128px); justify-content: start; gap: 20px 16px; }
.library-card { display: grid; gap: 8px; min-width: 0; text-align: left; }
.library-card-art {
  position: relative; display: block;
  width: 100%; aspect-ratio: 1;
  overflow: hidden;
  border-radius: var(--r-lg);
  background: rgba(70, 55, 110, 0.12);
  box-shadow: 0 10px 26px rgba(70, 55, 110, 0.12);
  transition: transform var(--t-normal), box-shadow var(--t-normal);
}
.library-card-art img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1); animation: cover-in 0.35s ease; }
.library-card:hover .library-card-art { transform: translateY(-3px); box-shadow: 0 16px 34px rgba(70, 55, 110, 0.18); }
.library-card:hover .library-card-art img { transform: scale(1.04); }
.library-card-play {
  position: absolute; right: 10px; bottom: 10px;
  display: grid; place-items: center;
  width: 34px; height: 34px;
  border-radius: 50%;
  color: #fff;
  background: var(--amber);
  box-shadow: 0 8px 18px var(--amber-shadow);
  opacity: 0; transform: translateY(6px);
  transition: opacity var(--t-fast), transform var(--t-fast);
}
.library-card:hover .library-card-play,
.library-card:focus-visible .library-card-play { opacity: 1; transform: translateY(0); }
.library-card strong { overflow: hidden; color: var(--text-primary); font-size: 12.5px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.library-card small { overflow: hidden; color: var(--text-ghost); font-size: 10.5px; text-overflow: ellipsis; white-space: nowrap; }
.library-empty {
  display: grid; place-items: center; gap: 8px;
  padding: 30px 12px;
  border: 1px dashed var(--border-subtle);
  border-radius: var(--r-lg);
  color: var(--text-ghost);
  font-size: 12px;
  text-align: center;
}

.shelf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 14px; }
.shelf-card {
  display: grid; gap: 8px;
  padding: 10px;
  border-radius: var(--r-lg);
  border: 1px solid transparent;
  text-align: left;
  transition: background var(--t-fast), border-color var(--t-fast), transform var(--t-fast);
}
.shelf-card:hover { background: var(--glass-bg-hover); border-color: var(--glass-border); transform: translateY(-2px); }
/* 未加载完时用骨架同色底，不再是刺眼的白块 */
.shelf-card img { width: 100%; aspect-ratio: 1; border-radius: var(--r-md); object-fit: cover; background: rgba(70, 55, 110, 0.12); animation: cover-in 0.35s ease; }
.shelf-card strong { overflow: hidden; color: var(--text-primary); font-size: 11.5px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.shelf-card small { color: var(--text-ghost); font-size: 10px; }
.shelf-meta { display: flex; align-items: center; gap: 6px; min-width: 0; }
.shelf-owner { overflow: hidden; min-width: 0; text-overflow: ellipsis; white-space: nowrap; }
.shelf-count { flex: none; opacity: 0.75; font-size: 9.5px; }

/* ---- 同步中的骨架卡片：与真实卡片同一套网格尺寸 ---- */
.skeleton-card { pointer-events: none; }
.sk-fill {
  position: relative;
  display: block;
  overflow: hidden;
  background: rgba(70, 55, 110, 0.12);
  box-shadow: none;
}
.shelf-cover {
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--r-md);
}
.sk-fill::after {
  content: '';
  position: absolute;
  top: -20%;
  bottom: -20%;
  left: 0;
  width: 46%;
  background: linear-gradient(102deg, transparent 12%, rgba(255, 255, 255, 0.6) 48%, transparent 84%);
  transform: translateX(-160%) skewX(-12deg);
  animation: library-sheen 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
.sk-line {
  display: block;
  width: 74%;
  height: 9px;
  border-radius: 4px;
  background: rgba(70, 55, 110, 0.12);
}
.sk-line.short { width: 46%; height: 8px; background: rgba(70, 55, 110, 0.09); }
@keyframes library-sheen {
  0% { transform: translateX(-160%) skewX(-12deg); opacity: 0.9; }
  62% { transform: translateX(320%) skewX(-12deg); opacity: 0; }
  100% { transform: translateX(320%) skewX(-12deg); opacity: 0; }
}
@keyframes cover-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .sk-fill::after { animation: none; opacity: 0; }
  .shelf-card img, .library-card-art img { animation: none; }
}

/* 工具带脱离布局单独悬浮，标题和内容在它下面自由滚动 */
.app-shell.float-top .page-view { padding-top: 0; }
.app-shell.float-top .page-scroll { padding-top: 38px; scrollbar-width: none; }
.app-shell.float-top .page-scroll::-webkit-scrollbar { display: none; }
.app-shell.float-top .float-title {
  margin: 12px 2px 0;
  padding-top: 0;
  color: var(--text-primary);
  font: 300 25px/1.25 var(--font-display);
  letter-spacing: 0.03em;
}
.app-shell.float-top .page-scroll .page-overline { margin-top: 10px; }
.app-shell.float-top .library-page { gap: 18px; }
</style>
