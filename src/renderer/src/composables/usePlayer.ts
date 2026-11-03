import { ref, reactive } from 'vue'
import type { MusicInfo } from './useNetease'
import { usePlaylist } from './usePlaylist'

const playlist = usePlaylist()
export type PlayMode = 'sequence' | 'repeat-all' | 'repeat-one' | 'shuffle'

export interface PlayerState {
  isPlaying: boolean
  currentTime: number
  duration: number
  // 试听片段截止秒数，0 表示完整音源；时长仍按曲目原时长展示
  trialSeconds: number
  volume: number
  currentTrack: MusicInfo | null
  audioUrl: string
  coverUrl: string
  lyric: string
  tlyric: string
  yrc: string
  ytlyric: string
  isLoading: boolean
}

const state = reactive<PlayerState>({
  isPlaying: false, currentTime: 0, duration: 0, trialSeconds: 0, volume: 0.5, currentTrack: null,
  audioUrl: '', coverUrl: '', lyric: '', tlyric: '', yrc: '', ytlyric: '', isLoading: false
})
const playMode = ref<PlayMode>('sequence')
const spectrum = new Uint8Array(64)
const audio = new Audio()
audio.preload = 'none'

// 听歌计入平台时长：按真实播放进度累计，满 30 秒上报一次（目前只有网易云有可用接口）
const SCROBBLE_MIN_SECONDS = 30
let listenedSeconds = 0
let lastAudioPosition = 0
let scrobbleSent = false

function resetListening() {
  listenedSeconds = 0
  lastAudioPosition = audio.currentTime || 0
  scrobbleSent = false
}

function sendScrobble(playedSeconds: number) {
  const track = state.currentTrack
  if (scrobbleSent || !track || track.platform === 'soda') return
  scrobbleSent = true
  void window.api.neteaseScrobble?.(track.songmid, playedSeconds)
}

function trackListening() {
  const position = audio.currentTime
  const delta = position - lastAudioPosition
  lastAudioPosition = position
  if (audio.paused || !state.currentTrack || scrobbleSent) return
  // 拖动进度条会产生大跳变，只累计正常播放的秒数
  if (delta > 0 && delta < 3) listenedSeconds += delta
  const total = state.duration
  const threshold = total > 0 ? Math.min(SCROBBLE_MIN_SECONDS, total) : SCROBBLE_MIN_SECONDS
  if (listenedSeconds < threshold) return
  sendScrobble(Math.min(listenedSeconds, total || listenedSeconds))
}

function finishListening() {
  if (scrobbleSent) return
  const total = state.duration
  // 播放到结尾时才按整首补差；中途拖到结尾不算听完整首
  const finished = total > 0 && !state.trialSeconds && listenedSeconds >= total * 0.8
  const played = finished ? total : listenedSeconds
  const threshold = total > 0 ? Math.min(SCROBBLE_MIN_SECONDS, total) : SCROBBLE_MIN_SECONDS
  if (played < threshold) return
  sendScrobble(played)
}

audio.addEventListener('timeupdate', () => {
  state.currentTime = audio.currentTime
  trackListening()
})
// 曲目目录时长优先；VIP 试听音源只有 1 分钟，不能把片段时长当成整首
audio.addEventListener('loadedmetadata', () => {
  if (!state.duration) state.duration = audio.duration || 0
})
audio.addEventListener('play', () => { state.isPlaying = true })
audio.addEventListener('pause', () => { state.isPlaying = false })
audio.addEventListener('ended', () => {
  state.isPlaying = false
  finishListening()
  if (playMode.value === 'repeat-one' && state.currentTrack) {
    audio.currentTime = 0
    resetListening()
    void audio.play()
    return
  }
  const next = playlist.peekNextTrack(playMode.value)
  if (next) window.dispatchEvent(new CustomEvent('track-ended', { detail: next }))
})
audio.addEventListener('error', () => {
  if (!audio.getAttribute('src')) return
  window.dispatchEvent(new CustomEvent('audio-error', { detail: '音频加载失败，请稍后重试' }))
})

// 暂停前把音量淡到 0，避免声音被硬生生掐断
const PAUSE_FADE_MS = 280
let pauseFadeFrame = 0
let pauseFadeTimer = 0
let pauseFadeActive = false

function stopPauseFade() {
  if (pauseFadeFrame) { cancelAnimationFrame(pauseFadeFrame); pauseFadeFrame = 0 }
  if (pauseFadeTimer) { clearTimeout(pauseFadeTimer); pauseFadeTimer = 0 }
  pauseFadeActive = false
}

function completePauseFade() {
  stopPauseFade()
  audio.pause()
  audio.volume = state.volume
}

function pauseWithFade() {
  stopPauseFade()
  state.isPlaying = false
  audio.volume = state.volume
  const from = audio.volume
  // 主窗口隐藏/最小化时 rAF 完全停跑、定时器被压到 1Hz：淡出根本走不动，
  // 反而把暂停拖后近一秒（桌面歌词条暂停就踩这个坑），这种情况直接停
  if (audio.paused || from <= 0 || document.hidden) {
    audio.pause()
    return
  }
  pauseFadeActive = true
  const startedAt = performance.now()
  const step = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / PAUSE_FADE_MS)
    // 余弦曲线：起收都柔和，末端不会突然断开
    audio.volume = from * (0.5 + 0.5 * Math.cos(Math.PI * progress))
    if (progress >= 1) { completePauseFade(); return }
    pauseFadeFrame = requestAnimationFrame(step)
  }
  pauseFadeFrame = requestAnimationFrame(step)
  // 淡出途中才切走窗口时 rAF 会停，用定时器兜底保证一定暂停
  pauseFadeTimer = window.setTimeout(completePauseFade, PAUSE_FADE_MS + 120)
}

// play() 拒绝时抛的是浏览器英文 DOMException，统一换成中文提示
function playErrorMessage(error: any) {
  const name = String(error?.name || '')
  if (name === 'AbortError') return ''
  if (name === 'NotAllowedError') return '播放被系统拦截，请再次点击播放'
  return '音频加载失败，请稍后重试'
}

export function usePlayer() {
  let playRequestId = 0

  const play = async (track: MusicInfo) => {
    const requestId = ++playRequestId
    state.isLoading = true
    try {
      const result = await window.api.playerPlay(track.songmid, track.platform || 'netease')
      if (requestId !== playRequestId) return
      if (!result?.success) throw new Error(result?.error || '歌曲播放失败')
      const { url, trialSeconds = 0 } = result.data as { url: string; trialSeconds?: number }
      // 切歌时取消还在进行的暂停淡出，否则旧音源可能刚被淡停、新音源又被它掐掉
      stopPauseFade()
      audio.src = url
      audio.volume = state.volume
      try {
        await audio.play()
      } catch (error) {
        if (requestId !== playRequestId) return
        const message = playErrorMessage(error)
        if (!message) return
        throw new Error(message)
      }
      if (requestId !== playRequestId) { audio.pause(); return }
      state.currentTrack = track
      resetListening()
      state.currentTime = 0
      state.duration = Number(track.duration) || trialSeconds || 0
      state.trialSeconds = trialSeconds
      state.audioUrl = url
      state.coverUrl = track.img || ''
      if (trialSeconds > 0) window.dispatchEvent(new CustomEvent('playback-trial', { detail: trialSeconds }))
    } finally {
      if (requestId === playRequestId) state.isLoading = false
    }
  }

  const stop = () => {
    playRequestId++
    stopPauseFade()
    audio.volume = state.volume
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    state.isPlaying = false
    state.isLoading = false
    state.currentTime = 0
    state.duration = 0
    state.trialSeconds = 0
    state.currentTrack = null
    state.audioUrl = ''
    state.coverUrl = ''
    state.lyric = ''
    state.tlyric = ''
    state.yrc = ''
    state.ytlyric = ''
    resetListening()
  }

  const pause = () => pauseWithFade()
  const resume = () => {
    stopPauseFade()
    audio.volume = state.volume
    // 淡出途中点回来时音频其实没停过，play() 不会再触发 play 事件，需要手动回状态
    void audio.play().then(() => { state.isPlaying = true }).catch(error => {
      const message = playErrorMessage(error)
      if (message) window.dispatchEvent(new CustomEvent('audio-error', { detail: message }))
    })
  }
  const togglePlay = () => state.isPlaying ? pause() : state.currentTrack ? resume() : undefined
  const seek = (time: number) => {
    const limit = state.trialSeconds > 0 ? state.trialSeconds : state.duration || time
    state.currentTime = Math.max(0, Math.min(limit, time))
    audio.currentTime = state.currentTime
    lastAudioPosition = state.currentTime
  }
  const setVolume = (volume: number) => {
    state.volume = Math.max(0, Math.min(1, volume))
    // 淡出途中改音量只记目标值，避免把正在下降的音量顶回去
    if (!pauseFadeActive) audio.volume = state.volume
  }
  const setCover = (url: string) => { state.coverUrl = url }
  const setLyric = (lyric: string, tlyric: string, yrc = '', ytlyric = '') => {
    state.lyric = lyric
    state.tlyric = tlyric
    state.yrc = yrc
    state.ytlyric = ytlyric
  }
  const setLoading = (loading: boolean) => { state.isLoading = loading }
  const setPlayMode = (mode: PlayMode) => { playMode.value = mode }

  return {
    state, play, pause, resume, togglePlay, stop, seek, setVolume, setCover, setLyric, setLoading,
    // 歌词染色需要比 timeupdate 更细的进度
    getCurrentTime: () => audio.currentTime,
    playMode, setPlayMode, getFrequencyData: () => spectrum, getAudioEnergy: () => 0
  }
}
