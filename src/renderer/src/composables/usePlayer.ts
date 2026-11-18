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
// 音质偏好由歌词页的音质菜单写入，取播放地址时随平台一起传给主进程
export type QualityPlatform = 'netease' | 'soda'
const qualityPrefs: Record<QualityPlatform, string> = { netease: 'exhigh', soda: 'highest' }
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
  // 切歌取流期间旧音源仍在播，它播完不代表当前曲目结束，否则会把刚点的歌取消
  if (state.isLoading) return
  if (playMode.value === 'repeat-one' && state.currentTrack) {
    audio.currentTime = 0
    resetListening()
    void audio.play()
    return
  }
  const next = playlist.peekNextTrack(playMode.value)
  if (next) window.dispatchEvent(new CustomEvent('track-ended', { detail: next }))
})
// 播放中途音源失效（汽水签名链接过期等）：先让上层换一份新地址重试一次，再次失败才提示
let recoverPlayback: (() => void) | null = null
let recoveryAttempted = false
let lastAudioErrorAt = 0
// 首次加载失败由 play() / switchQuality() 自己重试并上报，这期间元素级报错不再重复提示
let loadingGuardUntil = 0
const LOADING_GUARD_MS = 2000

function emitAudioError(message = '音频加载失败，请稍后重试') {
  const now = Date.now()
  if (now - lastAudioErrorAt < 1000) return
  lastAudioErrorAt = now
  window.dispatchEvent(new CustomEvent('audio-error', { detail: message }))
}

audio.addEventListener('error', () => {
  // 切歌时旧音源的迟到报错会带不到 MediaError，忽略它避免误重试；
  // 只有报错的就是当前音源时才走自动换源，首次加载失败由 play() 自己重试
  if (!audio.getAttribute('src') || !audio.error) return
  if (Date.now() < loadingGuardUntil) return
  if (!recoveryAttempted && recoverPlayback && state.audioUrl && audio.getAttribute('src') === state.audioUrl) {
    recoveryAttempted = true
    recoverPlayback()
    return
  }
  emitAudioError()
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

  const play = async (track: MusicInfo): Promise<boolean> => {
    const requestId = ++playRequestId
    recoveryAttempted = false
    state.isLoading = true
    try {
      const platform = track.platform === 'soda' ? 'soda' : 'netease'
      type PlaySource = { url: string; trialSeconds?: number }
      const fetchSource = async (force: boolean): Promise<PlaySource | null> => {
        const result = await window.api.playerPlay(track.songmid, platform, qualityPrefs[platform], force)
        if (requestId !== playRequestId) return null
        if (!result?.success) throw new Error(result?.error || '歌曲播放失败')
        return result.data as PlaySource
      }
      let source = await fetchSource(false)
      if (!source) return false
      // 切歌时取消还在进行的暂停淡出，否则旧音源可能刚被淡停、新音源又被它掐掉
      stopPauseFade()
      loadingGuardUntil = Date.now() + LOADING_GUARD_MS
      audio.src = source.url
      audio.volume = state.volume
      try {
        await audio.play()
      } catch (error) {
        if (requestId !== playRequestId) return false
        const name = String((error as any)?.name || '')
        // 汽水的签名音源可能拿到后立刻失效：绕过缓存换一份新地址再试一次
        if (platform !== 'soda' || name === 'NotAllowedError' || name === 'AbortError') {
          const message = playErrorMessage(error)
          if (!message) return false
          throw new Error(message)
        }
        const retry = await fetchSource(true)
        if (!retry) return false
        audio.src = retry.url
        audio.volume = state.volume
        try {
          await audio.play()
        } catch (retryError) {
          if (requestId !== playRequestId) return false
          const message = playErrorMessage(retryError)
          if (!message) return false
          throw new Error(message)
        }
        source = retry
      }
      // 序号失配说明已有更新的播放请求接管，这里不要暂停共享的 audio，否则会掐掉新歌
      if (requestId !== playRequestId) return false
      const trialSeconds = source.trialSeconds || 0
      state.currentTrack = track
      resetListening()
      state.currentTime = 0
      state.duration = Number(track.duration) || trialSeconds || 0
      state.trialSeconds = trialSeconds
      state.audioUrl = source.url
      state.coverUrl = track.img || ''
      if (trialSeconds > 0) window.dispatchEvent(new CustomEvent('playback-trial', { detail: trialSeconds }))
      return true
    } finally {
      if (requestId === playRequestId) state.isLoading = false
    }
  }

  // 播放中途音源报错：汽水换一份新地址从当前进度续上，其它平台直接提示
  const recoverCurrentSource = async () => {
    const track = state.currentTrack
    if (!track || track.platform !== 'soda') { emitAudioError(); return }
    const requestId = playRequestId
    const resumeAt = audio.currentTime || 0
    const wasPlaying = !audio.paused
    state.isLoading = true
    try {
      const result = await window.api.playerPlay(track.songmid, 'soda', qualityPrefs.soda, true)
      if (requestId !== playRequestId) return
      if (!result?.success) throw new Error(result?.error || '歌曲播放失败')
      const source = result.data as { url: string; trialSeconds?: number }
      audio.src = source.url
      audio.volume = state.volume
      state.audioUrl = source.url
      state.trialSeconds = source.trialSeconds || 0
      if (resumeAt > 0) {
        const apply = () => {
          if (requestId !== playRequestId) return
          try { audio.currentTime = resumeAt } catch { /* 元数据未就绪时忽略 */ }
        }
        if (audio.readyState >= 1) apply()
        else audio.addEventListener('loadedmetadata', apply, { once: true })
      }
      if (wasPlaying) await audio.play()
    } catch {
      if (requestId === playRequestId) emitAudioError()
    } finally {
      if (requestId === playRequestId) state.isLoading = false
    }
  }
  recoverPlayback = () => { void recoverCurrentSource() }

  // 切换音质：记住偏好；正在播放同一平台时重新拉流并从原位置续播
  const setQualityPreference = (platform: QualityPlatform, value: string) => { qualityPrefs[platform] = value }
  const switchQuality = async (platform: QualityPlatform, value: string) => {
    setQualityPreference(platform, value)
    const track = state.currentTrack
    if (!track || !state.audioUrl) return null
    if ((track.platform === 'soda' ? 'soda' : 'netease') !== platform) return null

    const requestId = ++playRequestId
    recoveryAttempted = false
    state.isLoading = true
    try {
      const result = await window.api.playerPlay(track.songmid, platform, value)
      if (requestId !== playRequestId) return null
      if (!result?.success) throw new Error(result?.error || '音质切换失败')
      const { url, trialSeconds = 0, quality = null } = result.data as {
        url: string
        trialSeconds?: number
        quality?: { level: string; bitrate: number } | null
      }
      // 平台只有更低档位时地址可能完全一致，避免无谓地重新加载
      if (url !== state.audioUrl) {
        // 取流期间歌还在继续播，位置和播放状态要按换源这一刻重新取
        const position = audio.currentTime
        const wasPlaying = !audio.paused
        const previousUrl = state.audioUrl
        const previousTrialSeconds = state.trialSeconds
        const previousDuration = state.duration
        stopPauseFade()
        loadingGuardUntil = Date.now() + LOADING_GUARD_MS
        audio.src = url
        audio.volume = state.volume
        state.audioUrl = url
        const applyPosition = () => {
          if (requestId !== playRequestId) return
          const limit = trialSeconds > 0 ? trialSeconds : state.duration
          const target = limit > 0 ? Math.min(position, limit) : position
          try { audio.currentTime = target } catch { /* 元数据未就绪时跳过，播放后仍从 0 开始 */ }
          lastAudioPosition = target
          state.currentTime = target
        }
        if (audio.readyState >= 1) applyPosition()
        else audio.addEventListener('loadedmetadata', applyPosition, { once: true })
        if (wasPlaying) {
          try {
            await audio.play()
          } catch (error) {
            // 新音源不可用：回到原地址与原进度，音质偏好保留给下一首
            if (requestId !== playRequestId) throw error
            audio.src = previousUrl
            audio.volume = state.volume
            state.audioUrl = previousUrl
            state.trialSeconds = previousTrialSeconds
            state.duration = previousDuration
            lastAudioPosition = position
            state.currentTime = position
            loadingGuardUntil = Date.now() + LOADING_GUARD_MS
            if (audio.readyState >= 1) { try { audio.currentTime = position } catch { /* 忽略 */ } }
            else audio.addEventListener('loadedmetadata', () => { try { audio.currentTime = position } catch { /* 忽略 */ } }, { once: true })
            await audio.play().catch(() => { /* 原音源恢复失败时保持暂停 */ })
            throw error
          }
        }
      }
      state.trialSeconds = trialSeconds
      return quality
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
    state, play, pause, resume, togglePlay, stop, seek, setVolume, setCover, setLyric, setLoading, switchQuality, setQualityPreference,
    // 歌词染色需要比 timeupdate 更细的进度
    getCurrentTime: () => audio.currentTime,
    playMode, setPlayMode, getFrequencyData: () => spectrum, getAudioEnergy: () => 0
  }
}
