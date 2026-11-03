import { ref } from 'vue'

export interface MusicInfo {
  songmid: string
  name: string
  singer: string
  album?: string
  duration?: number
  img?: string
  vip?: '' | 'vip' | 'paid'
  unavailable?: boolean
  // 汽水原创原声等没有可解析音源的条目，只在列表里展示
  noSource?: boolean
  platform?: 'netease' | 'soda'
}

export function useNetease() {
  const searchResults = ref<MusicInfo[]>([])
  const searching = ref(false)

  const search = async (keyword: string) => {
    if (!keyword.trim()) return
    searching.value = true
    try {
      const result = await window.api.neteaseSearch(keyword)
      if (!result.success) throw new Error(result.error || '网易云搜索失败')
      searchResults.value = result.data
    } finally {
      searching.value = false
    }
  }

  return { searchResults, searching, search }
}
