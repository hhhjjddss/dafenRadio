export type NeteaseQuality = 'standard' | 'exhigh' | 'lossless' | 'jyeffect' | 'vivid'
export type SodaQuality = 'highest' | 'higher'
export type VipTier = '' | 'vip' | 'svip'
export type QualityIcon = 'vivid' | 'spatial' | 'sq' | 'hq' | 'std'

export interface QualityOption<T extends string> {
  value: T
  label: string
  // 官方客户端里的英文标识与副标题
  alias?: string
  hint?: string
  // 该档位要求的会员等级，界面据此标注并拦截
  vip?: 'vip' | 'svip'
  icon?: QualityIcon
}

const VIP_RANK: Record<VipTier, number> = { '': 0, vip: 1, svip: 2 }

export function meetsVip(required: 'vip' | 'svip' | undefined, current: VipTier) {
  return !required || VIP_RANK[current] >= VIP_RANK[required]
}

export function vipBadge(required: 'vip' | 'svip' | undefined) {
  return required === 'svip' ? 'SVIP' : required === 'vip' ? 'VIP' : ''
}

// 与官方客户端一致的五个播放档位；全景声 / 高清臻音需会员，歌曲没有该档位时服务端会自动降级
export const NETEASE_QUALITY_OPTIONS: QualityOption<NeteaseQuality>[] = [
  { value: 'vivid', label: '臻音全景声', alias: 'Audio Vivid', hint: '沉浸三维空间音频，最高 7.1.4 声道', vip: 'svip', icon: 'vivid' },
  { value: 'jyeffect', label: '高清臻音', alias: 'Spatial Audio', hint: '高频细节还原与清晰沉浸感，96kHz/24bit', vip: 'vip', icon: 'spatial' },
  { value: 'lossless', label: '无损', alias: 'SQ', hint: '高保真无损音质，最高 48kHz/16bit', vip: 'vip', icon: 'sq' },
  { value: 'exhigh', label: '极高', alias: 'HQ', hint: '近 CD 音质的细节体验，最高 320kbps', icon: 'hq' },
  { value: 'standard', label: '标准', hint: '128kbps', icon: 'std' }
]

// 车机协议只下发未加密的标准 / 高音质两档；全景声 / 录音室 / 无损在接口里是加密条目
export const SODA_QUALITY_OPTIONS: QualityOption<SodaQuality>[] = [
  { value: 'highest', label: '极高音质', hint: 'AAC 约 256kbps', icon: 'hq' },
  { value: 'higher', label: '标准音质', hint: 'AAC 约 128kbps', icon: 'std' }
]

export const NETEASE_QUALITY_STORAGE = 'dafen:quality-netease'
export const SODA_QUALITY_STORAGE = 'dafen:quality-soda'

export function readStoredQuality<T extends string>(key: string, options: QualityOption<T>[], fallback: T): T {
  try {
    const saved = localStorage.getItem(key)
    return options.some(option => option.value === saved) ? saved as T : fallback
  } catch {
    return fallback
  }
}

export function qualityLabel<T extends string>(options: QualityOption<T>[], value: string) {
  return options.find(option => option.value === value)?.label || value
}