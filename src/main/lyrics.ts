export interface LyricResult {
  lyric: string
  translation: string
  yrc?: string
  ytlyric?: string
}

/**
 * 用 LRCLIB 按「歌名 + 歌手」查歌词。
 * 对本地文件来说，这比拿一个不存在的网易云 id 去查要可靠得多；
 * 时长还会参与匹配，避免拿到翻唱 / Live / 剪辑版的歌词。
 */
export async function searchOnlineLyrics(name: string, singer = '', duration = 0): Promise<LyricResult | null> {
  const title = String(name || '').trim()
  if (!title) return null
  try {
    const url = new URL('https://lrclib.net/api/search')
    url.searchParams.set('track_name', title)
    if (String(singer || '').trim()) url.searchParams.set('artist_name', String(singer).trim())
    const response = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'DaFenRadio/1.1.3 (local lyrics lookup)' }
    })
    if (!response.ok) return null
    const data: any = await response.json()
    if (!Array.isArray(data)) return null
    const candidates = data.filter((item: any) => typeof item?.syncedLyrics === 'string' && item.syncedLyrics.includes('['))
    if (!candidates.length) return null

    const target = Number(duration) || 0
    if (target > 0) {
      candidates.sort((a: any, b: any) => {
        const diffA = Math.abs(Number(a.duration || 0) - target)
        const diffB = Math.abs(Number(b.duration || 0) - target)
        return diffA - diffB
      })
    }
    return { lyric: String(candidates[0].syncedLyrics || ''), translation: '' }
  } catch {
    return null
  }
}
