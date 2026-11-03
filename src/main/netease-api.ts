import { app, safeStorage, webContents } from 'electron'
import { is } from '@electron-toolkit/utils'
import { Worker } from 'worker_threads'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, statSync } from 'fs'

const packageName = '@neteasecloudmusicapienhanced/api'
let storageRoot = ''
let sessionCookie = ''
let sessionLoaded = false
let qrKey = ''
let loginSeq = 0
let apiPort: number | null = null
let apiWorker: Worker | null = null
let starting: Promise<number> | null = null

export type NeteaseLoginPhase = 'idle' | 'waiting' | 'scanned' | 'success' | 'expired' | 'error'

export interface NeteaseLoginState {
  phase: NeteaseLoginPhase
  qrImage: string
  message: string
  error: string
  updatedAt: number
}

// 轮询放在主进程：登录浮层关掉、窗口被遮住或最小化时，扫码确认也不会丢
let loginState: NeteaseLoginState = { phase: 'idle', qrImage: '', message: '', error: '', updatedAt: 0 }
let loginPollTimer: ReturnType<typeof setTimeout> | null = null
let loginFailures = 0
let lastLoginCode = -1
let loginScannedAt = 0
// 已扫码后长时间没有确认就不再等待：网易云有时既不回 803 也不回 800
const LOGIN_CONFIRM_TIMEOUT = 60_000

function publishLoginState(patch: Partial<NeteaseLoginState>) {
  loginState = { ...loginState, ...patch, updatedAt: Date.now() }
  for (const contents of webContents.getAllWebContents()) {
    if (!contents.isDestroyed()) contents.send('netease:login-state', loginState)
  }
}

export function getNeteaseLoginState(): NeteaseLoginState {
  return { ...loginState }
}

export function stopNeteaseApi() {
  stopLoginPoll()
  void apiWorker?.terminate()
  apiWorker = null
  apiPort = null
}

// 某些 Windows 安全策略会拒绝 Electron 写入用户目录（EPERM），
// 因此先探测目录真实可写性，开发环境再回退到项目目录。
// 登录态与缓存统一放在 userData/data，旧位置仍参与登录恢复（见 sessionRoots）。
function neteaseDataDir() {
  return join(app.getPath('userData'), 'data')
}

function resolveStorageRoot() {
  if (storageRoot) return storageRoot
  const candidates = [neteaseDataDir()]
  if (is.dev) candidates.push(app.getAppPath())
  for (const dir of candidates) {
    try {
      mkdirSync(dir, { recursive: true })
      const cache = join(dir, 'netease-cache')
      mkdirSync(cache, { recursive: true })
      const probe = join(cache, '.write-test')
      writeFileSync(probe, '')
      try { unlinkSync(probe) } catch {}
      storageRoot = dir
      return dir
    } catch (error) {
      console.warn('[网易云] 数据目录不可写，尝试下一个', dir, error)
    }
  }
  throw new Error('无法创建网易云数据目录，请检查安全软件的文件夹保护设置')
}

export function neteaseCacheDir(): string {
  try {
    return join(resolveStorageRoot(), 'netease-cache')
  } catch {
    return join(neteaseDataDir(), 'netease-cache')
  }
}

function sessionFile() {
  return join(resolveStorageRoot(), 'netease-session.bin')
}

// 凭据可能落在多个目录：当前可写目录、开发期项目目录、userData。
// 只要其中一处有有效凭据就能恢复登录，避免可写目录变化后像是被退出登录。
function sessionRoots(): string[] {
  const roots = new Set<string>()
  try { roots.add(resolveStorageRoot()) } catch { /* 可写目录不可用时仍检查旧位置 */ }
  roots.add(neteaseDataDir())
  if (is.dev) roots.add(app.getAppPath())
  roots.add(app.getPath('userData'))
  return [...roots]
}

function sessionFiles(): string[] {
  return sessionRoots().map((dir) => join(dir, 'netease-session.bin'))
}

// 退出标记写在所有目录里：某些 Windows 策略下旧凭据删不掉，
// 下次启动读到任意一处标记就忽略这些残留，避免刚退出又被自动登录
function logoutMarkers(): string[] {
  return sessionRoots().map((dir) => join(dir, 'netease-session.logged-out'))
}

function newestLogoutMarker() {
  let newest = 0
  for (const marker of logoutMarkers()) {
    try {
      if (existsSync(marker)) newest = Math.max(newest, statSync(marker).mtimeMs)
    } catch { /* 标记读不到就当作没有 */ }
  }
  return newest
}

function clearLogoutMarkers() {
  for (const marker of logoutMarkers()) {
    try { if (existsSync(marker)) unlinkSync(marker) } catch (error) { console.warn('[网易云] 清除退出标记失败', marker, error) }
  }
}

function readSession() {
  if (!safeStorage.isEncryptionAvailable()) return ''
  // 只忽略退出之前保存的凭据：标记删不掉（EPERM）时，之后重新登录的凭据仍然有效。
  // 多目录都有文件时取最新的那份，避免切到旧目录时把已经退出的账号又读回来。
  const loggedOutAt = newestLogoutMarker()
  const candidates: Array<{ file: string; mtime: number }> = []
  for (const file of sessionFiles()) {
    try {
      const mtime = statSync(file).mtimeMs
      if (!loggedOutAt || mtime > loggedOutAt) candidates.push({ file, mtime })
    } catch { /* 文件不存在或不可读，跳过 */ }
  }
  candidates.sort((a, b) => b.mtime - a.mtime)
  for (const { file } of candidates) {
    try {
      return safeStorage.decryptString(readFileSync(file))
    } catch (error) {
      console.warn('[网易云] 读取登录状态失败', error)
    }
  }
  return ''
}

function loadSession() {
  if (sessionLoaded) return
  sessionLoaded = true
  sessionCookie = readSession()
}

function saveSession(cookie: string) {
  sessionCookie = cookie
  sessionLoaded = true
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[网易云] 安全存储不可用，登录只在本次运行内有效')
    return
  }
  try {
    writeFileSync(sessionFile(), safeStorage.encryptString(cookie))
    clearLogoutMarkers()
  } catch (error: any) {
    // 落盘失败时回滚内存态，避免界面显示已登录、重启后又丢失
    sessionCookie = ''
    throw new Error(`登录凭据无法保存：${error?.message || error}`)
  }
}

async function ensureApi(): Promise<number> {
  if (apiPort) return apiPort
  if (starting) return starting
  starting = new Promise<number>((resolve, reject) => {
    const workerSource = `
      const fs = require('fs');
      const path = require('path');
      const { createRequire } = require('module');
      const { parentPort, workerData } = require('worker_threads');
      const appRequire = createRequire(path.join(workerData.appPath, 'package.json'));
      const packageRoot = path.dirname(appRequire.resolve('${packageName}'));
      // 依赖会把带 cookie 的完整请求 URL 打进控制台（cookie 参数恒在末尾），统一在出口抹掉凭据
      for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
        const original = console[level].bind(console);
        console[level] = (...args) => original(...args.map((value) =>
          typeof value === 'string' ? value.replace(/cookie=[\\s\\S]*$/gi, 'cookie=***') : value));
      }
      // 系统临时目录可能被安全软件锁住（EPERM），改用应用自己的缓存目录
      const tmp = workerData.cacheDir;
      fs.mkdirSync(tmp, { recursive: true });
      const tokenPath = path.join(tmp, 'anonymous_token');
      const publicKeyPath = path.join(tmp, 'xeapi_public_key');
      (async () => {
        if (!fs.existsSync(tokenPath)) fs.writeFileSync(tokenPath, '', 'utf8');
        const util = appRequire(path.join(packageRoot, 'util/index.js'));
        global.deviceId = util.generateDeviceId();
        global.cnIp = util.generateRandomChineseIP();
        const keyModule = appRequire(path.join(packageRoot, 'util/xeapiKey.js'));
        let currentKey = {};
        try { currentKey = JSON.parse(fs.readFileSync(publicKeyPath, 'utf8')); } catch {}
        const publicKey = await keyModule.getXeapiPublicKey(currentKey, global.deviceId);
        fs.writeFileSync(publicKeyPath, JSON.stringify(publicKey), 'utf8');
        // 上游会把本机 127.0.0.1 当作来源 IP 塞进 X-Real-IP，网易云会据此拒绝扫码确认；
        // 只有显式 randomCNIP 的请求保留伪造 IP，其余交给网易云按真实出口识别
        const requestPath = appRequire.resolve(path.join(packageRoot, 'util/request.js'));
        const upstreamRequest = appRequire(requestPath);
        require.cache[requestPath].exports = (uri, data, options = {}) =>
          upstreamRequest(uri, data, options.randomCNIP ? options : { ...options, ip: '' });
        const main = appRequire(path.join(packageRoot, 'main.js'));
        // 匿名注册只是给未登录请求兜底；失败时不能拖垮整个本地服务，
        // 否则已保存账号会被当成未登录，重开程序又要扫码
        try {
          const anonymous = await main.register_anonimous();
          const anonymousCookie = anonymous?.body?.cookie;
          if (anonymousCookie) {
            const values = util.cookieToJson(anonymousCookie);
            if (values.MUSIC_A) fs.writeFileSync(tokenPath, values.MUSIC_A, 'utf8');
          }
        } catch (error) {
          console.warn('[NeteaseAPI] 匿名注册失败，继续以已保存账号启动:', error?.message || error);
        }
        const server = appRequire(path.join(packageRoot, 'server.js'));
        const api = await server.serveNcmApi({ port: '0', host: '127.0.0.1', checkVersion: false });
        const announce = () => parentPort.postMessage({ type: 'ready', port: api.server.address().port });
        if (api.server.listening) announce(); else api.server.once('listening', announce);
      })().catch((error) => parentPort.postMessage({ type: 'error', error: error?.stack || String(error) }));
    `
    const cacheDir = join(resolveStorageRoot(), 'netease-cache')
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: { appPath: app.getAppPath(), cacheDir },
      // 让依赖内部的 os.tmpdir() 也指向可写的应用缓存目录
      env: { ...process.env, TEMP: cacheDir, TMP: cacheDir, TMPDIR: cacheDir }
    })
    apiWorker = worker
    const timeout = setTimeout(() => {
      void worker.terminate()
      reject(new Error('网易云本地服务启动超时，请检查网络后重试'))
    }, 60000)
    worker.on('message', (message) => {
      if (message.type === 'ready') {
        clearTimeout(timeout)
        resolve(Number(message.port))
      } else if (message.type === 'error') {
        clearTimeout(timeout)
        void worker.terminate()
        reject(new Error(`网易云服务启动失败：${String(message.error).split('\n')[0]}`))
      }
    })
    worker.on('error', (error) => {
      clearTimeout(timeout)
      void worker.terminate()
      reject(new Error(`网易云服务线程启动失败：${error.message}`))
    })
    worker.on('exit', (code) => {
      if (apiWorker === worker) {
        apiWorker = null
        apiPort = null
      }
      if (code !== 0 && apiPort === null) reject(new Error('网易云本地服务已退出'))
    })
  }).then((port) => {
    apiPort = port
    return port
  }).finally(() => { starting = null })
  return starting
}

async function requestApi(path: string, cookie = ''): Promise<any> {
  const port = await ensureApi()
  const separator = path.includes('?') ? '&' : '?'
  const url = `http://127.0.0.1:${port}${path}${cookie ? `${separator}cookie=${encodeURIComponent(cookie)}` : ''}`
  // 本地服务默认把所有 GET 缓存 2 分钟：扫码轮询会一直读到旧的 801/802，刷新也会拿回同一张码
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: { 'x-apicache-bypass': '1' }
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(String(body?.msg || body?.message || `网易云接口请求失败（HTTP ${response.status}）`))
  return { body, response }
}

function stopLoginPoll() {
  if (loginPollTimer) clearTimeout(loginPollTimer)
  loginPollTimer = null
}

function scheduleLoginPoll(seq: number) {
  stopLoginPoll()
  if (!qrKey || seq !== loginSeq) return
  loginPollTimer = setTimeout(() => { void pollNeteaseLogin(seq) }, 2000)
}

async function pollNeteaseLogin(seq: number) {
  loginPollTimer = null
  const key = qrKey
  if (!key || seq !== loginSeq) return
  try {
    const { body, response } = await requestApi(`/login/qr/check?key=${encodeURIComponent(key)}`)
    if (seq !== loginSeq || key !== qrKey) return
    const code = Number(body?.code)
    if (code !== lastLoginCode) {
      lastLoginCode = code
      console.log('[网易云] 扫码状态', code, String(body?.message || ''))
    }
    if (Number.isFinite(code)) loginFailures = 0
    if (code === 803) {
      const cookie = String(body?.cookie || response.headers.get('set-cookie') || '')
      try {
        if (!cookie) throw new Error('网易云确认了扫码，但没有返回登录凭据，请刷新二维码重试')
        // 803 已经代表手机确认；立即落盘并通知界面，不能再等额外的状态校验，
        // 否则确认后要过几十秒界面才有反应（校验交给登录后的资料同步）
        saveSession(cookie)
      } catch (error: any) {
        qrKey = ''
        lastLoginCode = -1
        publishLoginState({ phase: 'error', qrImage: '', message: '', error: error?.message || '登录状态保存失败' })
        return
      }
      qrKey = ''
      loginScannedAt = 0
      loginState = { phase: 'success', qrImage: '', message: '扫码成功，正在同步歌单…', error: '', updatedAt: Date.now() }
      lastLoginCode = -1
      publishLoginState({})
      console.log('[网易云] 扫码登录成功，登录凭据已保存')
      return
    }
    if (code === 800) {
      qrKey = ''
      loginScannedAt = 0
      lastLoginCode = -1
      publishLoginState({ phase: 'expired', qrImage: '', message: '', error: '二维码已过期，请重新获取' })
      return
    }
    if (code === 802) {
      if (loginState.phase !== 'scanned') loginScannedAt = Date.now()
      publishLoginState({ phase: 'scanned', message: '已扫码，请在手机上确认登录' })
      if (loginScannedAt && Date.now() - loginScannedAt > LOGIN_CONFIRM_TIMEOUT) {
        qrKey = ''
        loginScannedAt = 0
        lastLoginCode = -1
        publishLoginState({ phase: 'expired', qrImage: '', message: '', error: '手机确认超时，请刷新二维码重试' })
        return
      }
      scheduleLoginPoll(seq)
      return
    }
    if (code === 801 || code === 200) {
      if (loginState.phase !== 'waiting') publishLoginState({ phase: 'waiting', message: '等待手机扫码…' })
      scheduleLoginPoll(seq)
      return
    }
    if (!Number.isFinite(code)) {
      // 本地服务偶尔会回一个空 body，重试几次再报错，避免一次抖动就作废二维码
      loginFailures++
      console.warn('[网易云] 扫码状态缺少状态码', String(body?.message || ''))
      if (loginFailures >= 3) {
        qrKey = ''
        lastLoginCode = -1
        publishLoginState({ phase: 'error', qrImage: '', message: '', error: '没有收到网易云的扫码状态，请刷新二维码重试' })
        return
      }
      scheduleLoginPoll(seq)
      return
    }
    // 8821 等风控码继续等下去只会让界面永远停在等待，直接报错让用户换一张码
    qrKey = ''
    loginScannedAt = 0
    lastLoginCode = -1
    publishLoginState({
      phase: 'error',
      qrImage: '',
      message: '',
      error: `网易云拒绝了这次登录（状态码 ${code}），请刷新二维码重试`
    })
  } catch (error: any) {
    if (seq !== loginSeq || key !== qrKey) return
    loginFailures++
    console.warn('[网易云] 查询扫码状态失败', error?.message || error)
    if (loginFailures >= 3) {
      qrKey = ''
      lastLoginCode = -1
      publishLoginState({ phase: 'error', qrImage: '', message: '', error: error?.message || '登录状态查询失败，请刷新二维码' })
      return
    }
    scheduleLoginPoll(seq)
  }
}

export async function beginNeteaseLogin() {
  const seq = ++loginSeq
  stopLoginPoll()
  qrKey = ''
  loginFailures = 0
  lastLoginCode = -1
  loginScannedAt = 0
  publishLoginState({ phase: 'waiting', qrImage: '', message: '正在获取二维码…', error: '' })
  try {
    const { body: keyResponse } = await requestApi('/login/qr/key')
    if (seq !== loginSeq) throw new Error('登录二维码已刷新，请使用最新的二维码')
    const key = String(keyResponse?.data?.unikey || '')
    if (!key) throw new Error(keyResponse?.msg || '网易云没有返回二维码密钥')
    const { body } = await requestApi(`/login/qr/create?key=${encodeURIComponent(key)}&qrimg=true`)
    if (seq !== loginSeq) throw new Error('登录二维码已刷新，请使用最新的二维码')
    const image = String(body?.data?.qrimg || '')
    if (!image.startsWith('data:image/')) throw new Error(body?.msg || '网易云没有返回二维码图片')
    qrKey = key
    publishLoginState({ phase: 'waiting', qrImage: image, message: '等待手机扫码…', error: '' })
    scheduleLoginPoll(seq)
    return image
  } catch (error: any) {
    if (seq === loginSeq) {
      qrKey = ''
      publishLoginState({ phase: 'error', qrImage: '', message: '', error: error?.message || '获取二维码失败' })
    }
    throw error
  }
}

export function logoutNetease() {
  loadSession()
  loginSeq++
  stopLoginPoll()
  loginFailures = 0
  lastLoginCode = -1
  loginScannedAt = 0
  const cookie = sessionCookie
  sessionCookie = ''
  sessionLoaded = true
  qrKey = ''
  publishLoginState({ phase: 'idle', qrImage: '', message: '', error: '' })
  const files = sessionFiles()
  for (const file of files) {
    try {
      if (existsSync(file)) unlinkSync(file)
    } catch (error) {
      // 删不掉也不能卡住退出：内存态已经清空，下一次登录会重新写入
      console.warn('[网易云] 删除登录凭据失败（已忽略）:', file, error)
    }
  }
  for (const marker of logoutMarkers()) {
    try {
      writeFileSync(marker, new Date().toISOString(), 'utf8')
    } catch (error) {
      console.warn('[网易云] 写入退出标记失败:', marker, error)
    }
  }
  // 本地状态已清除；若本地服务已启动，再顺手让它失效，不阻塞退出
  if (cookie && apiPort) {
    void requestApi('/logout', cookie).catch((error) => console.warn('[网易云] 服务端退出请求失败（忽略）', error))
  }
}

// 只有服务端明确说“未登录”才算掉线。本地服务冷启动、限流和风控返回的都不是登录结论，
// 不能据此清掉已保存的账号，否则重开程序会莫名其妙回到扫码页。
function neteaseSessionState(body: any): 'ok' | 'anonymous' | 'unknown' {
  if (body?.data?.profile?.userId || body?.data?.account?.id) return 'ok'
  if (body?.profile?.userId || body?.account?.id) return 'ok'
  // 成功响应形如 { data: { code: 200, profile } }；失败时是裸的 { code: 301, msg }
  const data = body?.data && typeof body.data === 'object' && Number.isFinite(Number(body.data.code)) ? body.data : body
  const code = Number(data?.code)
  if (code === 301 || code === 302 || code === 401 || code === 403) return 'anonymous'
  if (code === 200) return 'anonymous'
  return 'unknown'
}

export async function hasNeteaseSession() {
  loadSession()
  if (!sessionCookie) return false
  try {
    const { body } = await requestApi('/login/status', sessionCookie)
    const state = neteaseSessionState(body)
    if (state === 'unknown') console.warn('[网易云] 登录状态接口返回异常码，保留已保存的登录态:', body?.code ?? body?.data?.code)
    return state !== 'anonymous'
  } catch (error: any) {
    console.warn('[网易云] 登录状态校验失败，保留已保存的登录态:', error?.message || error)
    return true
  }
}

// 会员标识：fee=1 才是会员专享；fee=8 仅高音质/下载需会员，普通音质可免费播放，不标记
function vipTag(song: any): '' | 'vip' | 'paid' {
  const fee = Number(song?.fee ?? song?.privilege?.fee ?? 0)
  if (fee === 4) return 'paid'
  if (fee === 1) return 'vip'
  return ''
}

// 下架/版权受限：privilege.st < 0（如 -200），歌曲上还会带 noCopyrightRcmd
function isUnavailable(song: any, privilege?: any) {
  const rights = privilege || song?.privilege
  return Number(rights?.st) < 0 || Boolean(song?.noCopyrightRcmd)
}

export async function searchNetease(keyword: string) {
  loadSession()
  const { body } = await requestApi(`/cloudsearch?keywords=${encodeURIComponent(keyword)}&type=1&limit=30&offset=0`, sessionCookie)
  const songs = body?.result?.songs
  if (!Array.isArray(songs)) throw new Error(body?.msg || '网易云搜索结果为空')
  return songs.map(mapSong).filter((song: any) => song.songmid && song.name)
}

function mapSong(song: any, privilege?: any) {
  return {
    songmid: String(song.id),
    name: String(song.name || ''),
    singer: (song.ar || song.artists || []).map((artist: any) => artist.name).filter(Boolean).join(' / '),
    album: String(song.al?.name || song.album?.name || ''),
    duration: Math.floor(Number(song.dt || song.duration || 0) / 1000),
    img: String(song.al?.picUrl || song.album?.picUrl || ''),
    vip: vipTag(song),
    unavailable: isUnavailable(song, privilege),
    platform: 'netease'
  }
}

// /playlist/track/all 把版权状态单独放在 privileges 数组里，需要按 id 合并
function privilegeMap(body: any) {
  const map = new Map<string, any>()
  if (Array.isArray(body?.privileges)) {
    for (const privilege of body.privileges) map.set(String(privilege.id), privilege)
  }
  return map
}

function mapRecommendation(item: any) {
  return {
    id: String(item.id || ''),
    name: String(item.name || ''),
    cover: String(item.coverImgUrl || item.picUrl || ''),
    count: Number(item.trackCount || 0),
    creator: String(item.copywriter || item.creator?.nickname || '网易云音乐'),
    kind: 'platform'
  }
}

// /top/playlist 在不同版本的接口里既可能返回 playlists，也可能包在 result 里
function topPlaylistList(body: any) {
  if (Array.isArray(body?.playlists)) return body.playlists
  return Array.isArray(body?.result?.playlists) ? body.result.playlists : []
}

// 平台热榜里同名歌单很多（只是创建者不同），按名字去重再上墙
function normalizePlaylistName(name: string) {
  return String(name || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
}

// 推荐位统一 50 个入口：每日推荐在前，热门歌单只做补充
const RECOMMEND_LIMIT = 50

// redplus.vipCode 300 是黑胶 SVIP；associator 是普通黑胶 VIP；
// musicPackage 只是音乐包，不代表会员，不能拿来点亮 VIP 标记。
function readNeteaseVip(info: any, fallbackVipType: unknown): '' | 'vip' | 'svip' {
  const now = Date.now()
  const active = (pack: any) => {
    if (!pack) return false
    const expire = Number(pack.expireTime)
    if (Number.isFinite(expire) && expire > 0) return expire > now
    return Boolean(pack.rights)
  }
  if (Number(info?.redplus?.vipCode) === 300 && active(info.redplus)) return 'svip'
  if (active(info?.associator) || Number(info?.redVipAnnualCount) >= 1) return 'vip'
  // vip/info 取不到时退回登录态里的 vipType，至少不把会员标成普通用户
  return Number(fallbackVipType) > 0 ? 'vip' : ''
}

export async function getNeteaseLibrary() {
  loadSession()
  if (!sessionCookie) throw new Error('请先连接网易云音乐账号')
  const { body: status } = await requestApi('/login/status', sessionCookie)
  const profile = status?.data?.profile
  if (!profile?.userId) {
    if (neteaseSessionState(status) === 'anonymous') throw new Error('网易云登录已失效，请重新扫码')
    throw new Error('网易云账号状态暂时不可用，请稍后重试')
  }

  const [playlistResult, albumResult, recommendationResult, topResult, detailResult, vipResult] = await Promise.all([
    requestApi(`/user/playlist?uid=${encodeURIComponent(profile.userId)}&limit=50`, sessionCookie),
    requestApi('/album/newest?limit=24', sessionCookie).catch(() => ({ body: {} })),
    // 每日推荐只有 30 条，再混入热门歌单，保证探索页有足够多的入口
    requestApi('/personalized?limit=30', sessionCookie).catch(() => ({ body: {} })),
    requestApi(`/top/playlist?limit=30&offset=0&cat=${encodeURIComponent('全部')}&order=hot`, sessionCookie).catch(() => ({ body: {} })),
    requestApi(`/user/detail?uid=${encodeURIComponent(profile.userId)}`, sessionCookie).catch(() => ({ body: {} })),
    requestApi(`/vip/info/v2?uid=${encodeURIComponent(profile.userId)}`, sessionCookie).catch(() => ({ body: {} }))
  ])
  const level = Number(detailResult.body?.level) || 0
  const vip = readNeteaseVip(vipResult.body?.data, profile.vipType)

  const playlists = Array.isArray(playlistResult.body?.playlist)
    ? playlistResult.body.playlist.map((item: any) => ({
        id: String(item.id),
        name: String(item.name || ''),
        cover: String(item.coverImgUrl || ''),
        count: Number(item.trackCount || 0),
        creator: String(item.creator?.nickname || ''),
        specialType: Number(item.specialType || 0),
        kind: Number(item.userId) === Number(profile.userId) ? 'mine' : 'platform'
      }))
    : []
  const albums = Array.isArray(albumResult.body?.albums)
    ? albumResult.body.albums.map((item: any) => ({
        id: String(item.id),
        name: String(item.name || ''),
        artist: String(item.artist?.name || ''),
        cover: String(item.picUrl || ''),
        kind: 'album'
      }))
    : []

  const personalized = Array.isArray(recommendationResult.body?.result)
    ? recommendationResult.body.result.map(mapRecommendation)
    : []
  const topPlaylists = topPlaylistList(topResult.body).map(mapRecommendation)

  // 去重，并过滤掉已经出现在「我的歌单」里的条目
  const ownedIds = new Set(playlists.map((item: any) => item.id))
  const ownedNames = new Set(playlists.map((item: any) => normalizePlaylistName(item.name)))
  const seen = new Set<string>()
  const seenNames = new Set<string>()
  const recommendations: any[] = []
  // 两份来源交替排，推荐位截断时也不会整齐地只剩热门歌单
  const maxLength = Math.max(personalized.length, topPlaylists.length)
  for (let index = 0; index < maxLength; index++) {
    for (const item of [personalized[index], topPlaylists[index]]) {
      if (!item) continue
      const nameKey = normalizePlaylistName(item.name)
      if (!item.id || !nameKey || seen.has(item.id) || ownedIds.has(item.id) || ownedNames.has(nameKey) || seenNames.has(nameKey)) continue
      seen.add(item.id)
      seenNames.add(nameKey)
      recommendations.push(item)
    }
  }

  return { profile: { name: String(profile.nickname || ''), avatar: String(profile.avatarUrl || ''), level, vip }, playlists, albums, recommendations: recommendations.slice(0, RECOMMEND_LIMIT) }
}

export async function getNeteaseCollectionTracks(kind: string, collectionId: string) {
  loadSession()
  if (kind === 'album') {
    const { body } = await requestApi(`/album?id=${encodeURIComponent(collectionId)}`, sessionCookie)
    const songs = body?.songs
    if (!Array.isArray(songs)) throw new Error(body?.msg || '未能读取这张专辑或歌单')
    const privileges = privilegeMap(body)
    return songs
      .map((song: any) => mapSong(song, privileges.get(String(song.id))))
      .filter((song: any) => song.songmid && song.name)
  }

  // 歌单整表接口单页有限额（通常 50 首），按 offset 翻页直到取满 trackCount；
  // offset 用实际返回条数推进，这样服务端真的把 limit 压小了也不会漏歌
  let total = 0
  try {
    const detail = await requestApi(`/playlist/detail?id=${encodeURIComponent(collectionId)}`, sessionCookie)
    total = Number(detail.body?.playlist?.trackCount) || 0
  } catch {
    // 取不到总数就一直翻到空页为止
  }
  const privileges = privilegeMap({})
  const songs: any[] = []
  let offset = 0
  for (let page = 0; page < 80; page += 1) {
    const { body } = await requestApi(
      `/playlist/track/all?id=${encodeURIComponent(collectionId)}&limit=500&offset=${offset}`,
      sessionCookie
    )
    const batch = Array.isArray(body?.songs) ? body.songs : []
    if (!batch.length) break
    for (const [id, privilege] of privilegeMap(body)) privileges.set(id, privilege)
    songs.push(...batch)
    offset += batch.length
    if (total && songs.length >= total) break
  }
  if (!songs.length) throw new Error('未能读取这张专辑或歌单')
  return songs
    .map((song: any) => mapSong(song, privileges.get(String(song.id))))
    .filter((song: any) => song.songmid && song.name)
}

// 心动模式：以当前歌曲为种子，从所在歌单的偏好里续一批智能推荐
export async function getNeteaseHeartbeat(songId: string, playlistId: string, count = 30) {
  loadSession()
  if (!sessionCookie) throw new Error('请先连接网易云音乐账号')
  if (!songId) throw new Error('先播放一首歌，再开启心动模式')
  if (!playlistId) throw new Error('暂时找不到你的歌单，先收藏一首歌再试')
  const query = new URLSearchParams({
    id: songId,
    pid: playlistId,
    sid: songId,
    count: String(count)
  })
  const { body } = await requestApi(`/playmode/intelligence/list?${query.toString()}`, sessionCookie)
  const entries = Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body?.data?.songs) ? body.data.songs : []
  // 心动模式的条目是 { id, alg, recommended, songInfo }，歌曲本体在 songInfo 里
  const songs = entries.map((entry: any) => entry?.songInfo || entry?.song || entry).filter(Boolean)
  if (!songs.length) throw new Error(body?.msg || '心动模式暂时没有返回歌曲')
  return songs
    .map((song: any) => mapSong(song, song?.privilege))
    .filter((song: any) => song.songmid && song.name)
    .slice(0, count)
}

// 私人FM：登录即可的个性化推荐流，不依赖当前播放歌曲；每次只回 3 首，连续取几轮攒够一屏
export async function getNeteasePersonalFm(count = 30) {
  loadSession()
  if (!sessionCookie) throw new Error('请先连接网易云音乐账号')
  const songs: any[] = []
  const seen = new Set<string>()
  let statusMessage = ''
  for (let round = 0; round < Math.ceil(count / 3) && songs.length < count; round += 1) {
    const { body } = await requestApi('/personal_fm', sessionCookie)
    if (body?.msg) statusMessage = String(body.msg)
    const items = Array.isArray(body?.data) ? body.data : []
    let fresh = 0
    for (const item of items) {
      const song = mapSong(item, item?.privilege)
      if (!song.songmid || !song.name || seen.has(song.songmid)) continue
      seen.add(song.songmid)
      songs.push(song)
      fresh += 1
    }
    // 连续重复说明这一轮推荐已经取完，继续请求也只会拿到旧歌
    if (!fresh) break
  }
  if (!songs.length) throw new Error(statusMessage || '私人FM暂时没有返回歌曲')
  return songs.slice(0, count)
}

// 账号的「我喜欢的音乐」：按歌单分页取全量
export async function getNeteaseLikedSongs() {
  loadSession()
  if (!sessionCookie) throw new Error('请先连接网易云音乐账号')
  const { body: status } = await requestApi('/login/status', sessionCookie)
  const profile = status?.data?.profile
  if (!profile?.userId) {
    if (neteaseSessionState(status) === 'anonymous') throw new Error('网易云登录已失效，请重新扫码')
    throw new Error('网易云账号状态暂时不可用，请稍后重试')
  }
  const { body: playlistBody } = await requestApi(`/user/playlist?uid=${encodeURIComponent(profile.userId)}&limit=1000`, sessionCookie)
  const lists = Array.isArray(playlistBody?.playlist) ? playlistBody.playlist : []
  const liked = lists.find((item: any) => Number(item.specialType) === 5)
    || lists.find((item: any) => item.name === `${profile.nickname}喜欢的音乐`)
  if (!liked?.id) return []
  const songs: any[] = []
  const pageSize = 200
  while (true) {
    const { body } = await requestApi(`/playlist/track/all?id=${encodeURIComponent(liked.id)}&limit=${pageSize}&offset=${songs.length}`, sessionCookie)
    const page = Array.isArray(body?.songs) ? body.songs : []
    const privileges = privilegeMap(body)
    songs.push(...page.map((song: any) => mapSong(song, privileges.get(String(song.id)))))
    if (page.length < pageSize) break
  }
  return songs.filter((song: any) => song.songmid && song.name)
}

export async function setNeteaseLike(songId: string, like: boolean) {
  loadSession()
  if (!sessionCookie) throw new Error('请先连接网易云音乐账号')
  const { body } = await requestApi(`/like?id=${encodeURIComponent(songId)}&like=${like ? 'true' : 'false'}`, sessionCookie)
  if (Number(body?.code) !== 200) throw new Error(body?.msg || '网易云收藏操作失败，请稍后重试')
  return true
}

// 听歌打卡：把真实播放秒数写进最近播放与听歌排行，网易云据此累计听歌时长/等级
export async function scrobbleNetease(songId: string, playedSeconds: number, sourceId = '') {
  loadSession()
  if (!sessionCookie || !songId) return false
  const time = Math.max(1, Math.min(3600, Math.round(playedSeconds)))
  const query = new URLSearchParams({ id: songId, time: String(time), sourceid: sourceId || songId })
  const { body } = await requestApi(`/scrobble?${query.toString()}`, sessionCookie)
  return Number(body?.code) === 200
}

function readLyricPayload(body: any) {
  return {
    lyric: String(body?.lrc?.lyric || ''),
    translation: String(body?.tlyric?.lyric || ''),
    // 逐字歌词：[行开始, 行长](字开始, 字长, 0)字…
    yrc: String(body?.yrc?.lyric || ''),
    ytlyric: String(body?.ytlyric?.lyric || '')
  }
}

// /lyric/new 带逐字时间轴；老接口没有逐字数据，作为兜底
async function fetchLyrics(songId: string) {
  let payload = { lyric: '', translation: '', yrc: '', ytlyric: '' }
  try {
    const { body } = await requestApi(`/lyric/new?id=${encodeURIComponent(songId)}`, sessionCookie)
    payload = readLyricPayload(body)
  } catch {
    // 逐字接口不可用时回退到普通歌词
  }
  if (!payload.lyric.trim()) {
    const { body } = await requestApi(`/lyric?id=${encodeURIComponent(songId)}`, sessionCookie)
    const legacy = readLyricPayload(body)
    payload = { ...legacy, yrc: payload.yrc, ytlyric: payload.ytlyric }
  }
  return payload
}

export async function getNeteaseLyrics(songId: string) {
  loadSession()
  return fetchLyrics(songId)
}

// 按「歌名 + 歌手」搜索最匹配的歌曲，再取歌词
function normalizeMatch(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[（(【\[].*?[）)】\]]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export async function searchNeteaseLyrics(name: string, singer = '', duration = 0) {
  loadSession()
  const title = String(name || '').trim()
  if (!title) throw new Error('缺少歌曲名，无法搜索歌词')
  const keyword = [title, singer].filter(Boolean).join(' ').trim()
  const { body } = await requestApi(`/cloudsearch?keywords=${encodeURIComponent(keyword)}&type=1&limit=10`, sessionCookie)
  const songs = Array.isArray(body?.result?.songs) ? body.result.songs : []
  if (!songs.length) throw new Error('没有找到匹配的歌词')

  const targetTitle = normalizeMatch(title)
  const targetArtist = normalizeMatch(singer)
  const targetDuration = Number(duration) || 0
  const coverHints = /(cover|翻唱|原唱|伴奏|纯音乐|钢琴|吉他|dj|remix|女声|男声|深情|片段|铃声|加速|降速)/i
  const ranked = songs.map((song: any) => {
    const songTitle = normalizeMatch(song.name)
    const artist = normalizeMatch((song.ar || song.artists || []).map((item: any) => item.name).join(' '))
    let score = 0
    if (songTitle && songTitle === targetTitle) score += 6
    else if (songTitle && targetTitle && (songTitle.includes(targetTitle) || targetTitle.includes(songTitle))) score += 3
    if (targetArtist && artist.includes(targetArtist)) score += 4
    // 时长匹配能有效排除翻唱、Live、剪辑版
    if (targetDuration > 0) {
      const songDuration = Number(song.dt || song.duration || 0) / 1000
      if (songDuration > 0) {
        const diff = Math.abs(songDuration - targetDuration)
        if (diff <= 3) score += 5
        else if (diff <= 8) score += 2
        else if (diff > 25) score -= 3
      }
    }
    if (coverHints.test(String(song.name || ''))) score -= 4
    return { song, score }
  }).sort((a: any, b: any) => b.score - a.score)

  const candidates = ranked.filter((item: any) => item.score > 0).slice(0, 4)
  if (!candidates.length) candidates.push(...ranked.slice(0, 3))
  for (const item of candidates) {
    try {
      const payload = await fetchLyrics(item.song.id)
      if (payload.lyric.trim()) return payload
    } catch {
      // 换下一首候选继续找
    }
  }
  throw new Error('没有找到匹配的歌词')
}

export async function getNeteaseSongUrl(songId: string) {
  loadSession()
  const { body } = await requestApi(`/song/url/v1?id=${encodeURIComponent(songId)}&level=exhigh&randomCNIP=true&https=true`, sessionCookie)
  const song = body?.data?.[0]
  const url = String(song?.url || '')
  if (Number(body?.code) !== 200 || !url) throw new Error(body?.msg || '这首歌暂时无法播放（可能需要会员或版权受限）')
  const trialStart = Number(song?.freeTrialInfo?.start)
  const trialEnd = Number(song?.freeTrialInfo?.end)
  const trialSeconds = Number.isFinite(trialEnd) && trialEnd > 0
    ? Math.max(1, Math.round(trialEnd - (Number.isFinite(trialStart) ? trialStart : 0)))
    : 0
  return { url: url.replace(/^http:/, 'https:'), trialSeconds }
}
