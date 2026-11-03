import { shallowRef } from 'vue'
import type { MusicInfo } from './useNetease'

// 收藏可能有上千首，浅层响应式只跟踪数组整体替换，避免深层代理开销
const favorites = shallowRef<MusicInfo[]>([])
let loaded = false
let saving = false

// 从当前数据目录的 favorites.json 加载（Electron 主进程读写）
async function loadFavorites(allowLegacy = true): Promise<void> {
  if (loaded) return
  loaded = true // 先标记为已加载，防止重复调用
  try {
    if (window.api?.favoritesLoad) {
      const data = await window.api.favoritesLoad()
      if (Array.isArray(data) && data.length > 0) {
        favorites.value = data
        console.log('[Favorites] 从文件加载了', data.length, '首歌曲')
      } else if (allowLegacy) {
        // 文件为空或不存在，尝试从旧 localStorage 迁移
        const legacy = localStorage.getItem('dafen_favorites')
        if (legacy) {
          const parsed = JSON.parse(legacy)
          if (Array.isArray(parsed) && parsed.length > 0) {
            favorites.value = parsed
            window.api.favoritesSave(parsed)
            console.log('[Favorites] 从旧存储迁移了', parsed.length, '首歌曲')
          }
        }
      }
    } else {
      const saved = localStorage.getItem('dafen_favorites')
      if (saved) favorites.value = JSON.parse(saved)
    }
  } catch (e) {
    console.warn('[Favorites] 加载失败:', e)
  }
}

// 保存到项目文件夹（JSON.parse/stringify 去掉 Vue 响应式代理）
// 并发策略：保存中再次触发只置 dirty 标记，本次完成后用最新数据补写一次，避免静默丢写
let pendingSave = false
function saveFavorites(): void {
  if (saving) {
    pendingSave = true
    return
  }
  saving = true
  try {
    if (window.api?.favoritesSave) {
      // 必须转成纯对象，Vue Proxy 对象无法通过 IPC 传输
      const plain = JSON.parse(JSON.stringify(favorites.value))
      window.api.favoritesSave(plain).then(ok => {
        console.log('[Favorites] 保存结果:', ok, '共', plain.length, '首')
        saving = false
        if (pendingSave) {
          pendingSave = false
          saveFavorites()
        }
      }).catch((e: any) => {
        console.warn('[Favorites] 保存失败:', e)
        saving = false
        if (pendingSave) {
          pendingSave = false
          saveFavorites()
        }
      })
    } else {
      localStorage.setItem('dafen_favorites', JSON.stringify(favorites.value))
      saving = false
      pendingSave = false
    }
  } catch (e) {
    console.warn('[Favorites] 保存异常:', e)
    saving = false
  }
}

// 两个平台的歌曲 id 各自独立，收藏必须以「平台 + id」区分，避免互相顶掉
const platformOf = (track: MusicInfo) => track.platform || 'netease'
const favoriteKey = (track: MusicInfo) => `${platformOf(track)}:${track.songmid}`

export function useFavorites() {
  // 首次使用时触发加载（异步，不阻塞）
  if (!loaded) loadFavorites()

  const isFavorite = (songmid: string, platform: 'netease' | 'soda' = 'netease') => {
    return favorites.value.some(t => t.songmid === songmid && platformOf(t) === platform)
  }

  const toggleFavorite = (track: MusicInfo) => {
    const key = favoriteKey(track)
    const idx = favorites.value.findIndex(t => favoriteKey(t) === key)
    favorites.value = idx >= 0
      ? favorites.value.filter((_, index) => index !== idx)
      : [...favorites.value, track]
    saveFavorites()
  }

  const addFavorite = (track: MusicInfo) => {
    if (!isFavorite(track.songmid, platformOf(track))) {
      favorites.value = [...favorites.value, track]
      saveFavorites()
    }
  }

  // 连接网易云后同步账号红心：只替换网易云曲目，汽水解锁的本地收藏原样保留
  const replaceFavorites = (tracks: MusicInfo[]) => {
    const others = favorites.value.filter(t => platformOf(t) !== 'netease')
    favorites.value = [
      ...tracks.map(track => ({ ...track, platform: 'netease' as const })),
      ...others
    ]
    saveFavorites()
  }

  const removeFavorite = (songmid: string, platform: 'netease' | 'soda' = 'netease') => {
    if (isFavorite(songmid, platform)) {
      favorites.value = favorites.value.filter(t => !(t.songmid === songmid && platformOf(t) === platform))
      saveFavorites()
    }
  }

  const favoritesFor = (platform: 'netease' | 'soda') =>
    favorites.value.filter(t => platformOf(t) === platform)

  return {
    favorites,
    favoritesFor,
    isFavorite,
    toggleFavorite,
    addFavorite,
    removeFavorite,
    replaceFavorites
  }
}
