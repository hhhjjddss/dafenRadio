import type { MusicInfo } from '../composables/useNetease'

// 网易云和汽水都用「我喜欢的音乐」命名红心歌单，个别账号会显示成「我喜欢的歌曲」
export function isLikedPlaylistName(name: unknown): boolean {
  return /^我喜欢的(音乐|歌曲)$/.test(String(name || '').trim())
}

// 本机收藏在前（刚点亮的歌排第一），账号歌单里多出来的曲目补在后面
export function mergeLikedTracks(local: MusicInfo[], server: MusicInfo[]): MusicInfo[] {
  const key = (track: MusicInfo) => `${track.platform || 'netease'}:${track.songmid}`
  const seen = new Set(local.map(key))
  return [...local, ...server.filter(track => !seen.has(key(track)))]
}
