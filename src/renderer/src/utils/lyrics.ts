export interface ParsedLyricLine {
  time: number
  text: string
}

/**
 * 解析 LRC。
 * 兼容：
 * - [mm:ss]、[mm:ss.x]、[mm:ss.xx]、[mm:ss.xxx]
 * - 一行多个时间戳（同一句歌词重复出现）
 * - \r\n / \n 换行、前后空白
 */
export function parseLrc(value: string): ParsedLyricLine[] {
  if (!value) return []
  const result: ParsedLyricLine[] = []
  for (const rawLine of value.split(/\r?\n/)) {
    const stamps = [...rawLine.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)]
    if (!stamps.length) continue
    const text = rawLine.replace(/\[[^\]]*\]/g, '').trim()
    if (!text) continue
    for (const stamp of stamps) {
      const minutes = Number(stamp[1])
      const seconds = Number(stamp[2])
      const fraction = stamp[3] ? Number(stamp[3].padEnd(3, '0')) / 1000 : 0
      result.push({ time: minutes * 60 + seconds + fraction, text })
    }
  }
  return result.sort((a, b) => a.time - b.time)
}

export interface YrcWord {
  time: number
  duration: number
  text: string
}

export interface YrcLine {
  time: number
  duration: number
  words: YrcWord[]
}

// 逐字歌词：[行开始ms,行时长ms](字开始ms,字长ms,0)字…
export function parseYrc(value: string): YrcLine[] {
  if (!value) return []
  const lines: YrcLine[] = []
  for (const rawLine of value.split(/\r?\n/)) {
    const match = rawLine.trim().match(/^\[(\d+),(\d+)\](.*)$/)
    if (!match) continue
    const words: YrcWord[] = []
    for (const word of match[3].matchAll(/\((\d+),(\d+),\d+\)([^()]*)/g)) {
      if (!word[3].trim()) continue
      words.push({ time: Number(word[1]) / 1000, duration: Number(word[2]) / 1000, text: word[3] })
    }
    if (words.length) {
      lines.push({ time: Number(match[1]) / 1000, duration: Number(match[2]) / 1000, words })
    }
  }
  return lines.sort((a, b) => a.time - b.time)
}
