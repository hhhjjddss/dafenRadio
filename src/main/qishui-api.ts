/* 汽水音乐车机协议（qishui-music-api）。
   公开读取走独立 client_token，账号资料/收藏写入走 ticket-guard；
   会话只在本进程内使用，加密落盘，绝不回传渲染进程。 */

import { app, safeStorage, webContents } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { createQishuiApi, createQishuiDeviceId, isQishuiDeviceId } from 'qishui-music-api'
import type {
  QishuiApi,
  QishuiAudioSource,
  QishuiOperation,
  QishuiParams,
  QishuiSession,
  QishuiSessionStore,
  QishuiUser
} from 'qishui-music-api'
import { formatSodaLyric, probeAudio } from './soda-api'

let storageRoot = ''
let deviceId = ''
let session: QishuiSession | null = null
let revision = 0
let loaded = false
let api: QishuiApi | null = null

function storageDir() {
  if (storageRoot) return storageRoot
  // 用户数据目录不可写时退到系统临时目录；绝不能退到安装/源码目录，否则会话会落进仓库
  const candidates = [join(app.getPath('userData'), 'data'), join(app.getPath('temp'), 'dafen-radio-qishui')]
  for (const dir of candidates) {
    try {
      mkdirSync(dir, { recursive: true })
      const probe = join(dir, '.qishui-write-test')
      writeFileSync(probe, '')
      try { unlinkSync(probe) } catch { /* 探测文件删不掉也不影响写入 */ }
      storageRoot = dir
      return dir
    } catch (error) {
      console.warn('[汽水] 车机会话目录不可写，尝试下一个', dir, error)
    }
  }
  throw new Error('无法创建汽水数据目录，请检查安全软件的文件夹保护设置')
}

function deviceFile() {
  return join(storageDir(), 'qishui-device.txt')
}

function sessionFile() {
  return join(storageDir(), 'qishui-session.bin')
}

function logoutMarker() {
  return join(storageDir(), 'qishui-session.logged-out')
}

// 车机协议的 ticket-guard 与设备绑定：deviceId 首次生成后固定复用，
// 丢了设备标识会让已保存的会话无法续期。
function loadState() {
  if (loaded) return
  loaded = true
  try {
    const file = deviceFile()
    const saved = existsSync(file) ? readFileSync(file, 'utf8').trim() : ''
    deviceId = isQishuiDeviceId(saved) ? saved : createQishuiDeviceId()
    if (deviceId !== saved) writeFileSync(file, deviceId, 'utf8')
  } catch (error) {
    deviceId = createQishuiDeviceId()
    console.warn('[汽水] 设备标识无法落盘，本次运行使用临时设备 ID:', error)
  }
  try {
    const file = sessionFile()
    if (!existsSync(file) || !safeStorage.isEncryptionAvailable()) return
    // 退出标记比会话新时，忽略删不掉的残留凭据
    const marker = logoutMarker()
    if (existsSync(marker) && statSync(marker).mtimeMs >= statSync(file).mtimeMs) return
    const parsed = JSON.parse(safeStorage.decryptString(readFileSync(file)))
    if (parsed?.deviceId === deviceId && parsed?.userId && parsed?.ticket) session = parsed as QishuiSession
  } catch (error) {
    console.warn('[汽水] 读取车机会话失败', error)
  }
}

function persistSession(value: QishuiSession) {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('[汽水] 安全存储不可用，登录只在本次运行内有效')
      return
    }
    writeFileSync(sessionFile(), safeStorage.encryptString(JSON.stringify(value)))
    try { if (existsSync(logoutMarker())) unlinkSync(logoutMarker()) } catch { /* 标记删不掉时下次读取按时间比较 */ }
  } catch (error) {
    console.warn('[汽水] 登录凭据无法保存，本次运行内有效', error)
  }
}

function clearPersistedSession() {
  try {
    if (existsSync(sessionFile())) unlinkSync(sessionFile())
  } catch (error) {
    console.warn('[汽水] 删除车机会话失败（已写入退出标记）:', error)
  }
  try { writeFileSync(logoutMarker(), new Date().toISOString(), 'utf8') } catch { /* 目录不可写时只能内存退出 */ }
}

const sessions: QishuiSessionStore = {
  get deviceId() { return deviceId },
  get revision() { return revision },
  get: () => session,
  set(value) {
    session = value
    revision++
    persistSession(value)
  },
  clear() {
    session = null
    revision++
    clearPersistedSession()
  }
}

function client() {
  loadState()
  if (!api) {
    api = createQishuiApi({
      deviceId,
      sessions,
      log: (message) => console.info(message),
      warn: (message) => console.warn(message)
    })
  }
  return api
}

export function hasQishuiSession() {
  loadState()
  return Boolean(session)
}

function errorMessage(error: { code: string; message: string; upstreamCode?: string }) {
  if (error.code === 'auth-required') {
    return hasQishuiSession() ? '汽水登录已失效，请重新登录' : '请先登录汽水音乐'
  }
  if (error.code === 'unsupported') return '这首曲子只有受保护音源，暂时无法播放'
  if (error.code === 'not-playable') return '这首曲子暂时不能播放'
  if (error.code === 'network') return '汽水服务暂时不可达，请检查网络'
  if (error.upstreamCode) return `汽水接口返回异常（${error.upstreamCode}）`
  return error.message || '汽水接口请求失败'
}

async function request<T>(operation: QishuiOperation, params?: QishuiParams): Promise<T> {
  // 续期被服务端拒绝时库会当场清掉会话，这里要按「刚过期」提示，而不是当成未登录
  const hadSession = Boolean(session)
  const result = await client().request<T>(operation, params)
  if (result.ok) return result.data
  if (result.error.code === 'auth-required' && hadSession && !session) {
    throw new Error('汽水登录已失效，请重新登录')
  }
  throw new Error(errorMessage(result.error))
}

/* ============ 扫码登录：抖音授权，轮询放主进程 ============ */
export type QishuiLoginPhase = 'idle' | 'waiting' | 'scanned' | 'success' | 'expired' | 'error'

export interface QishuiLoginState {
  phase: QishuiLoginPhase
  qrImage: string
  message: string
  error: string
  updatedAt: number
}

const POLL_INTERVAL = 2000
let loginState: QishuiLoginState = { phase: 'idle', qrImage: '', message: '', error: '', updatedAt: 0 }
let loginSeq = 0
let loginKey = ''
let loginFailures = 0
let pollTimer: ReturnType<typeof setTimeout> | null = null

function publishLoginState(patch: Partial<QishuiLoginState>) {
  loginState = { ...loginState, ...patch, updatedAt: Date.now() }
  for (const contents of webContents.getAllWebContents()) {
    if (!contents.isDestroyed()) contents.send('soda:login-state', loginState)
  }
}

export function getQishuiLoginState(): QishuiLoginState {
  return { ...loginState }
}

function stopLoginPoll() {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = null
}

function scheduleLoginPoll(seq: number, delay = POLL_INTERVAL) {
  stopLoginPoll()
  if (seq !== loginSeq || !loginKey) return
  pollTimer = setTimeout(() => { void pollLogin(seq) }, delay)
}

async function pollLogin(seq: number) {
  if (seq !== loginSeq || !loginKey) return
  const key = loginKey
  try {
    const data = await request<{ state: string }>('login_qr_check', { key })
    if (seq !== loginSeq || key !== loginKey) return
    loginFailures = 0
    if (data.state === 'confirmed') {
      loginKey = ''
      publishLoginState({ phase: 'success', qrImage: '', message: '扫码成功，正在同步歌单…', error: '' })
      return
    }
    if (data.state === 'scanned') {
      publishLoginState({ phase: 'scanned', message: '已扫码，请在手机上确认登录' })
      scheduleLoginPoll(seq)
      return
    }
    if (data.state === 'waiting') {
      publishLoginState({ phase: 'waiting', message: '等待手机扫码…' })
      scheduleLoginPoll(seq)
      return
    }
    loginKey = ''
    if (data.state === 'expired') {
      publishLoginState({ phase: 'expired', qrImage: '', message: '', error: '二维码已过期，请重新获取' })
    } else {
      publishLoginState({ phase: 'error', qrImage: '', message: '', error: '已在手机上取消登录' })
    }
  } catch (error: any) {
    if (seq !== loginSeq) return
    loginFailures++
    const message = String(error?.message || '')
    // 鉴权/接口异常不会靠重试恢复，直接让用户刷新二维码
    if (message.includes('登录已失效') || message.includes('异常')) {
      loginKey = ''
      publishLoginState({ phase: 'expired', qrImage: '', message: '', error: message })
      return
    }
    if (loginFailures >= 5) {
      loginKey = ''
      publishLoginState({ phase: 'error', qrImage: '', message: '', error: message || '登录状态查询失败，请刷新二维码重试' })
      return
    }
    scheduleLoginPoll(seq, Math.min(POLL_INTERVAL * loginFailures, 8000))
  }
}

export async function beginQishuiLogin() {
  const seq = ++loginSeq
  stopLoginPoll()
  const previous = loginKey
  loginKey = ''
  loginFailures = 0
  if (previous) void request('login_qr_cancel', { key: previous }).catch(() => {})
  publishLoginState({ phase: 'waiting', qrImage: '', message: '正在获取二维码…', error: '' })
  try {
    const { key } = await request<{ key: string }>('login_qr_key')
    if (seq !== loginSeq) throw new Error('登录二维码已刷新，请使用最新的二维码')
    const { imageUrl } = await request<{ imageUrl: string }>('login_qr_create', { key })
    if (seq !== loginSeq) {
      void request('login_qr_cancel', { key }).catch(() => {})
      throw new Error('登录二维码已刷新，请使用最新的二维码')
    }
    loginKey = key
    publishLoginState({ phase: 'waiting', qrImage: imageUrl, message: '请使用抖音扫码授权汽水音乐', error: '' })
    scheduleLoginPoll(seq)
    return { qrImage: imageUrl }
  } catch (error: any) {
    const message = String(error?.message || '获取二维码失败')
    console.warn('[汽水] 获取车机登录二维码失败:', message)
    if (seq === loginSeq) publishLoginState({ phase: 'error', qrImage: '', message: '', error: message })
    throw new Error(message)
  }
}

export async function logoutQishui() {
  loginSeq++
  stopLoginPoll()
  const key = loginKey
  loginKey = ''
  loginFailures = 0
  if (key) void request('login_qr_cancel', { key }).catch(() => {})
  try { await request('logout') } catch (error: any) { console.warn('[汽水] 退出登录失败:', error?.message || error) }
  session = null
  revision++
  clearPersistedSession()
  publishLoginState({ phase: 'idle', qrImage: '', message: '', error: '' })
}

// 已登录时顺带续期；明确的鉴权拒绝才判定过期，断网保留登录态
export async function getQishuiSessionInfo(): Promise<{ connected: boolean; expired: boolean }> {
  loadState()
  if (!session) return { connected: false, expired: false }
  try {
    await request('login_status')
    return { connected: hasQishuiSession(), expired: false }
  } catch (error: any) {
    const message = String(error?.message || '')
    if (message.includes('登录已失效')) return { connected: false, expired: true }
    console.warn('[汽水] 登录状态校验失败，保留已保存的登录态:', message || error)
    return { connected: hasQishuiSession(), expired: false }
  }
}

/* ============ 数据映射（车机协议字段） ============ */
// 汽水封面是 ImageX 对象：base + uri 缺席时会被 CDN 拒绝，必须带模板缩放后缀
function pickImage(value: any): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return pickImage(value[0])
  if (value.uri && value.template_prefix) {
    return `https://p3-luna.douyinpic.com/img/${value.uri}~${value.template_prefix}-resize:512:512.png`
  }
  if (Array.isArray(value.urls) && value.urls.length) {
    const base = String(value.urls[0] || '')
    return /^https?:\/\//.test(base) ? base : `${base}${value.uri || ''}`
  }
  if (Array.isArray(value.url_list) && value.url_list.length) return value.url_list[0] || ''
  return value.url || value.uri || value.template || ''
}

function mapPlaylist(raw: any, kind: 'mine' | 'platform') {
  const base = raw?.base_info || raw || {}
  const id = String(base.id || '')
  const name = String(base.title || base.name || '').trim()
  if (!id || !name) return null
  const display = raw?.display_info || {}
  const owner = raw?.relation_info?.owner || {}
  // 车机歌单曲目数只在 resource_cnt 里，base_info 没有计数字段
  return {
    id,
    name,
    cover: pickImage(display.url_cover || display.cover_url),
    count: Number(raw?.resource_cnt?.track_cnt ?? base.count_tracks ?? base.track_count ?? 0) || 0,
    creator: String(owner.nickname || owner.name || '汽水音乐'),
    kind
  }
}

function mapTrack(raw: any) {
  const base = raw?.base_info || {}
  const id = String(base.id || raw?.id || '')
  // 原创原声（ugc_clip）等条目可能不给标准 name，手机端照样按条目显示。
  // 这里只按 id 过滤，缺名字给占位，避免歌单条目数比手机少。
  if (!id) return null
  const name = String(base.name || base.title || raw?.name || '').trim() || '未知曲目'
  const related = raw?.related_info || {}
  const display = raw?.display_info || {}
  const links = Array.isArray(related.artist_links)
    ? related.artist_links
    : Array.isArray(related.artists) ? related.artists : []
  const singer = links
    .map((artist: any) => typeof artist === 'string' ? artist : artist?.name || artist?.simple_display_name || artist?.user_info?.nickname || '')
    .filter(Boolean)
    .join(' / ')
  const durationMs = Number(base.duration_ms ?? base.duration ?? 0) || 0
  // 车机把会员门槛放在 commerce_info，only_vip_playable 之类的旧字段不再出现
  const condition = String(raw?.commerce_info?.playable_condition || '')
  return {
    songmid: id,
    name,
    singer,
    album: String(related.album_link?.name || related.album?.name || ''),
    duration: Math.round(durationMs / 1000),
    // 与 H5 路径、以及同文件的 mapPlaylist 对齐：车机封面两种字段都可能出现
    img: pickImage(display.url_cover || display.cover_url),
    vip: /svip|vip/i.test(condition) ? 'vip' as const : '' as const,
    noSource: false,
    platform: 'soda' as const
  }
}

type MappedTrack = NonNullable<ReturnType<typeof mapTrack>>

function collectTracks(items: any[], limit = Number.POSITIVE_INFINITY): MappedTrack[] {
  const tracks: MappedTrack[] = []
  const seen = new Set<string>()
  for (const item of items || []) {
    const track = mapTrack(item)
    if (!track || seen.has(track.songmid)) continue
    seen.add(track.songmid)
    tracks.push(track)
    if (tracks.length >= limit) break
  }
  return tracks
}

function mapProfile(user: QishuiUser) {
  return {
    name: String(user?.nickname || ''),
    avatar: pickImage(user?.avatar),
    level: 0,
    vip: user?.isVip ? 'vip' as const : '' as const,
    // 只有接口明确给了会员标识才敢收紧权限；false 不等于确认非会员
    vipKnown: user?.isVip === true
  }
}

/* ============ 账号资料与歌单 ============ */
export async function getQishuiLibrary() {
  const user = await request<QishuiUser>('login_status')
  const playlists: NonNullable<ReturnType<typeof mapPlaylist>>[] = []
  const seen = new Set<string>()
  let offset = 0
  for (let page = 0; page < 10; page++) {
    const data = await request<{ items: any[]; hasMore: boolean; nextOffset: number }>('user_playlists', { limit: 100, offset })
    for (const raw of data?.items || []) {
      const playlist = mapPlaylist(raw, 'mine')
      if (!playlist || seen.has(playlist.id)) continue
      seen.add(playlist.id)
      playlists.push(playlist)
    }
    if (!data?.hasMore || !(data.items || []).length) break
    const next = Number(data.nextOffset ?? offset + (data.items || []).length)
    if (!Number.isFinite(next) || next <= offset) break
    offset = next
  }
  return { profile: mapProfile(user), playlists }
}

export async function getQishuiPlaylistTracks(playlistId: string) {
  const tracks: MappedTrack[] = []
  let offset = 0
  for (let page = 0; page < 8; page++) {
    const data = await request<{ items: any[]; hasMore: boolean; nextOffset: number }>('playlist_tracks', {
      id: playlistId,
      limit: 100,
      offset
    })
    // 歌单里同一首歌可以被添加多次，手机端按条目全部展示。
    // 这里不按 songmid 去重，否则 4 首会被压成 3 首，与手机数量对不上。
    for (const item of data?.items || []) {
      const track = mapTrack(item)
      if (track) tracks.push(track)
    }
    if (!data?.hasMore || !(data.items || []).length) break
    const next = Number(data.nextOffset ?? offset + (data.items || []).length)
    if (!Number.isFinite(next) || next <= offset) break
    offset = next
  }
  return tracks
}

// 在线红心：车机只给 id 列表，再用 song_detail 换回完整曲目信息
export async function getQishuiLikedTracks(): Promise<MappedTrack[]> {
  const { ids } = await request<{ ids: string[]; whole: boolean; total: number }>('liked_songs')
  const tracks: MappedTrack[] = []
  // 红心可能有上千首，控制并发免得一下子打满车机接口
  const CONCURRENCY = 6
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(
      batch.map(id => request<unknown>('song_detail', { id }))
    )
    for (const result of results) {
      if (result.status !== 'fulfilled') continue
      const track = mapTrack(result.value)
      if (track) tracks.push(track)
    }
  }
  return tracks
}

export async function setQishuiLike(id: string, liked: boolean): Promise<void> {
  await request('like_song', { id, liked })
}

export async function getQishuiSearchPlaylists(keyword: string) {
  const data = await request<{ items: any[] }>('search_playlists', { query: keyword, limit: 30 })
  const playlists: NonNullable<ReturnType<typeof mapPlaylist>>[] = []
  const seen = new Set<string>()
  for (const raw of data?.items || []) {
    const playlist = mapPlaylist(raw, 'platform')
    if (!playlist || seen.has(playlist.id)) continue
    seen.add(playlist.id)
    playlists.push(playlist)
  }
  return playlists
}

export async function getQishuiFeedTracks(limit = 50) {
  // 车机推荐流一次只回一小批，沿同一队列继续取，攒够播放器需要的一屏
  const tracks: MappedTrack[] = []
  const seen = new Set<string>()
  for (let page = 0; page < Math.max(3, Math.ceil(limit / 6)); page++) {
    const data = await request<{ items: any[]; hasMore?: boolean }>('feed', {
      limit: Math.min(limit, 30),
      preference: 'familiar',
      first: page === 0,
      queue: 'fm'
    })
    let fresh = 0
    for (const track of collectTracks(data?.items || [])) {
      if (seen.has(track.songmid)) continue
      seen.add(track.songmid)
      tracks.push(track)
      fresh++
      if (tracks.length >= limit) break
    }
    if (!fresh || tracks.length >= limit) break
  }
  if (!tracks.length) throw new Error('汽水推荐暂时没有返回歌曲')
  return tracks
}

/* ============ 音源与歌词 ============ */
// 记录最近一次取流的片段信息，歌词据此裁剪时间轴
const audioMeta = new Map<string, { at: number; clipStartSec: number; preview: boolean; seconds: number }>()

export async function getQishuiAudio(trackId: string, quality = 'highest') {
  // 车机接口的档位命名与 App 端不同，界面仍按「极高/标准」两档展示
  const requested = quality === 'higher' ? 'standard' : 'high'
  let source = await request<QishuiAudioSource>('audio', { id: trackId, quality: requested })
  let probe = await probeAudio(source.url)
  // 签名链接过期时重取一次，仍然 403/404 才判定没有可播音源
  if (probe.state === 'stale') {
    source = await request<QishuiAudioSource>('audio', { id: trackId, quality: requested })
    probe = await probeAudio(source.url)
    if (probe.state === 'stale') throw new Error('这首曲子暂时没有可试听的音源')
  }
  const seconds = probe.state === 'ok' ? probe.seconds : 0
  const clipStartSec = Math.max(0, Math.round(Number(source.clipStartMs || 0) / 1000))
  // preview 标记比时长推算可靠：会员曲目下发的是中段片段，免费曲目是完整音源
  const trialSeconds = source.preview ? (seconds > 0 ? seconds : 30) : 0
  if (audioMeta.size > 200) audioMeta.clear()
  audioMeta.set(trackId, { at: Date.now(), clipStartSec, preview: Boolean(source.preview), seconds })
  return {
    url: source.url,
    trialSeconds,
    quality: {
      level: source.quality === 'standard' ? 'higher' : 'highest',
      bitrate: 0
    }
  }
}

export async function getQishuiLyrics(trackId: string) {
  const data = await request<{ lyric_entity?: { content?: string }; lang_translations?: unknown }>('lyrics', { id: trackId })
  const content = String(data?.lyric_entity?.content || '')
  // 没有歌词时返回 null，交给 H5 分享页歌词兜底
  if (!content.trim()) return null
  const meta = audioMeta.get(trackId)
  const clipStartSec = meta && Date.now() - meta.at < 30 * 60_000 ? meta.clipStartSec : 0
  const clipSeconds = meta && meta.preview ? meta.seconds : 0
  const parsed = formatSodaLyric(content, clipStartSec, clipSeconds)
  return { lyric: parsed.lyric, translation: '', yrc: parsed.yrc, ytlyric: '' }
}
