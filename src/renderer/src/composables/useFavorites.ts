import { shallowRef } from 'vue'
import type { MusicInfo } from './useNetease'

// 收藏只走线上红心，不落本地盘。这里的内存列表是「在线同步结果」的镜像：
// 启动时为空，登录后由 replaceFavorites 用账号红心填充，点亮/取消也必须先在线成功。
const favorites = shallowRef<MusicInfo[]>([])

// 两个平台的歌曲 id 各自独立，收藏必须以「平台 + id」区分，避免互相顶掉
const platformOf = (track: MusicInfo) => track.platform || 'netease'
const favoriteKey = (track: MusicInfo) => `${platformOf(track)}:${track.songmid}`

// 刚点亮的曲目在服务端列表里可能还查不到，短时间内保留，避免后台刷新把新收藏刷掉；
// 刚取消的曲目同理，服务端列表滞后时不要在刷新后自己冒回来
const recentlyAdded = new Map<string, number>()
const recentlyRemoved = new Map<string, number>()
const RECENT_CHANGE_GRACE_MS = 20_000

function pruneChanges(now: number) {
  for (const [key, at] of recentlyAdded) {
    if (now - at > RECENT_CHANGE_GRACE_MS) recentlyAdded.delete(key)
  }
  for (const [key, at] of recentlyRemoved) {
    if (now - at > RECENT_CHANGE_GRACE_MS) recentlyRemoved.delete(key)
  }
}

export function useFavorites() {
  const isFavorite = (songmid: string, platform: 'netease' | 'soda' = 'netease') => {
    return favorites.value.some(t => t.songmid === songmid && platformOf(t) === platform)
  }

  const toggleFavorite = (track: MusicInfo) => {
    const key = favoriteKey(track)
    const idx = favorites.value.findIndex(t => favoriteKey(t) === key)
    if (idx >= 0) {
      recentlyAdded.delete(key)
      recentlyRemoved.set(key, Date.now())
      favorites.value = favorites.value.filter((_, index) => index !== idx)
    } else {
      recentlyAdded.set(key, Date.now())
      recentlyRemoved.delete(key)
      favorites.value = [track, ...favorites.value]
    }
  }

  const addFavorite = (track: MusicInfo) => {
    if (!isFavorite(track.songmid, platformOf(track))) {
      const key = favoriteKey(track)
      recentlyAdded.set(key, Date.now())
      recentlyRemoved.delete(key)
      favorites.value = [track, ...favorites.value]
    }
  }

  // 同步在线红心：只替换指定平台，另一平台原样保留。
  // 顺序以账号歌单为准（我喜欢的音乐最新收藏在最前），在别的设备上换了第一首，
  // 客户端返回主页时封面也要跟着换；本机刚点亮、服务端列表还没排到前面的曲目，
  // 在 20 秒宽限期内先钉在最前面，避免刚点亮就被后台刷新挤回去
  const replaceFavorites = (tracks: MusicInfo[], platform: 'netease' | 'soda' = 'netease') => {
    const now = Date.now()
    pruneChanges(now)
    const current = favorites.value
    const prefix = `${platform}:`
    const serverAll = new Set(tracks.map(track => `${prefix}${track.songmid}`))
    // 服务端已经不再返回的曲目，取消记录就可以撤掉了
    for (const key of [...recentlyRemoved.keys()]) {
      if (key.startsWith(prefix) && !serverAll.has(key)) recentlyRemoved.delete(key)
    }
    const incoming = tracks
      .filter(track => !recentlyRemoved.has(`${prefix}${track.songmid}`))
      .map(track => ({ ...track, platform }))
    const pending = current.filter(t => platformOf(t) === platform && recentlyAdded.has(favoriteKey(t)))
    const pendingKeys = new Set(pending.map(favoriteKey))
    const others = current.filter(t => platformOf(t) !== platform)
    favorites.value = [
      ...pending,
      ...incoming.filter(track => !pendingKeys.has(favoriteKey(track))),
      ...others
    ]
  }

  const removeFavorite = (songmid: string, platform: 'netease' | 'soda' = 'netease') => {
    if (isFavorite(songmid, platform)) {
      const key = `${platform}:${songmid}`
      recentlyAdded.delete(key)
      recentlyRemoved.set(key, Date.now())
      favorites.value = favorites.value.filter(t => !(t.songmid === songmid && platformOf(t) === platform))
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