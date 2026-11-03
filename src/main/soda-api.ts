/* 汽水音乐（Soda）数据层。
   逆向细节参考开源项目 guowenye/qishui-api（MIT），这里只保留浏览、登录、试听与歌词所需的最小集合。 */

import { app, safeStorage, webContents } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, statSync } from 'fs'
import { createHash, randomBytes, randomUUID } from 'crypto'
import { closeSignerSession, signerCookies, signerRequest } from './soda-signer'

const LUNA_API = 'https://beta-luna.douyin.com'
const PC_API = 'https://api.qishui.com'
const APP_UA = 'Luna/19.1.0 Android'
const PC_UA = 'LunaPC/3.0.0(290101097)'
const WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

const APP_HEADERS = { 'User-Agent': APP_UA, 'Content-Type': 'application/json; charset=utf-8' }
const PC_HEADERS = { 'User-Agent': PC_UA, 'Content-Type': 'application/json; charset=utf-8' }
// PC 端详情接口会校验这几个请求头，缺了会返回空列表或 403
const PC_APP_HEADERS = {
  ...PC_HEADERS,
  'x-luna-background-type': 'foreground',
  'x-luna-is-background-req': '0',
  'x-luna-is-local-user': '1'
}
const WEB_HEADERS = { 'User-Agent': WEB_UA }

// 统一账号登录（汽水与主账号共用凭据）
const PASSPORT = {
  aid: '386088',
  iid: '27960026095955',
  version_code: '30020100',
  passport_jssdk_version: '2.4.13',
  passport_jssdk_type: 'normal',
  is_from_ttaccountsdk: '1',
  next: 'https://api.qishui.com'
}

const randomDigits = (length: number) => Array.from({ length: length }, () => Math.floor(Math.random() * 10)).join('')
const randomHex = (length: number) => randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length)
// 参考实现：88 字节 base64url（118 字符）+ `==`
const randomMsToken = () => `${randomBytes(88).toString('base64url')}==`
const deviceId = randomDigits(16)
const installId = randomDigits(16)

interface RequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: unknown
  query?: Record<string, string | number>
  redirect?: RequestRedirect
}

interface RequestResult {
  body: any
  headers: Headers
  status: number
  text: string
}

async function request(path: string, options: RequestOptions = {}): Promise<RequestResult> {
  const url = new URL(path)
  for (const [key, value] of Object.entries(options.query || {})) url.searchParams.set(key, String(value))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: { Accept: 'application/json, text/plain, */*', ...(options.headers || {}) },
      body: options.body === undefined
        ? undefined
        : typeof options.body === 'string' ? options.body : JSON.stringify(options.body),
      redirect: options.redirect,
      signal: controller.signal
    })
    const text = await response.text()
    // 手动重定向时 3xx 本身就是结果：登录确认的 Set-Cookie 常常挂在这一跳上，不能让 fetch 自动跟走
    if (options.redirect === 'manual' && response.status >= 300 && response.status < 400) {
      return { body: null, headers: response.headers, status: response.status, text }
    }
    if (response.status === 401 || response.status === 403) throw new Error('汽水登录已失效，请重新登录')
    if (!response.ok) throw new Error(`汽水接口请求失败（HTTP ${response.status}）`)
    let body: any = null
    try { body = text ? JSON.parse(text) : null } catch { body = null }
    return { body, headers: response.headers, status: response.status, text }
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new Error('汽水接口请求超时')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function requestJson(path: string, options: RequestOptions = {}) {
  return (await request(path, options)).body
}

/* ============ 登录态（完整 cookie 只落盘加密，绝不回传渲染进程） ============ */
let sodaStorageRoot = ''
// 汽水确认后的登录态由多个 cookie 组成（sessionid_ss / sid_guard / session_tlb_tag…），
// 只存 sessionid 会拿到空值；这里保存整份 cookie 头，兼容旧版只存 sessionid 的文件。
let sodaCookie = ''
let sodaSessionLoaded = false

// 与网易云一致：登录态统一放在 userData/data，
// 某些 Windows 安全策略拒绝写入时开发环境回退到项目目录
function sodaDataDir() {
  return join(app.getPath('userData'), 'data')
}

function resolveSodaStorageRoot() {
  if (sodaStorageRoot) return sodaStorageRoot
  const candidates = [sodaDataDir()]
  if (is.dev) candidates.push(app.getAppPath())
  for (const dir of candidates) {
    try {
      mkdirSync(dir, { recursive: true })
      const probe = join(dir, '.soda-write-test')
      writeFileSync(probe, '')
      try { unlinkSync(probe) } catch { /* 探测文件删不掉也不影响写入 */ }
      sodaStorageRoot = dir
      return dir
    } catch (error) {
      console.warn('[汽水] 数据目录不可写，尝试下一个', dir, error)
    }
  }
  throw new Error('无法创建汽水数据目录，请检查安全软件的文件夹保护设置')
}

function sodaSessionFile() {
  return join(resolveSodaStorageRoot(), 'soda-session.bin')
}

// 凭据可能落在多个目录：当前可写目录、userData、开发期项目目录（旧版位置）。
// 只要其中一处有有效凭据就能恢复登录，避免可写目录变化后像是被退出登录。
function sodaSessionRoots(): string[] {
  const roots = new Set<string>()
  try { roots.add(resolveSodaStorageRoot()) } catch { /* 可写目录不可用时仍检查旧位置 */ }
  roots.add(sodaDataDir())
  if (is.dev) roots.add(app.getAppPath())
  roots.add(app.getPath('userData'))
  return [...roots]
}

function sodaSessionFiles(): string[] {
  return sodaSessionRoots().map((dir) => join(dir, 'soda-session.bin'))
}

// 旧凭据可能删不掉；退出标记写进所有目录，下次启动读到任意一处就忽略残留
function sodaLogoutMarkers(): string[] {
  return sodaSessionRoots().map((dir) => join(dir, 'soda-session.logged-out'))
}

function newestSodaLogoutMarker() {
  let newest = 0
  for (const marker of sodaLogoutMarkers()) {
    try {
      if (existsSync(marker)) newest = Math.max(newest, statSync(marker).mtimeMs)
    } catch { /* 标记读不到就当作没有 */ }
  }
  return newest
}

function clearSodaLogoutMarkers() {
  for (const marker of sodaLogoutMarkers()) {
    try { if (existsSync(marker)) unlinkSync(marker) } catch (error) { console.warn('[汽水] 清除退出标记失败', marker, error) }
  }
}

function loadSodaSession() {
  if (sodaSessionLoaded) return
  sodaSessionLoaded = true
  if (!safeStorage.isEncryptionAvailable()) return
  // 只忽略退出之前保存的凭据：标记删不掉（EPERM）时，之后重新登录的凭据仍然有效。
  // 多目录都有文件时取最新的那份，避免切到旧目录时把已经退出的账号又读回来。
  const loggedOutAt = newestSodaLogoutMarker()
  const candidates: Array<{ file: string; mtime: number }> = []
  for (const file of sodaSessionFiles()) {
    try {
      const mtime = statSync(file).mtimeMs
      if (!loggedOutAt || mtime > loggedOutAt) candidates.push({ file, mtime })
    } catch { /* 文件不存在或不可读，跳过 */ }
  }
  candidates.sort((a, b) => b.mtime - a.mtime)
  for (const { file } of candidates) {
    try {
      const value = safeStorage.decryptString(readFileSync(file))
      if (value) {
        sodaCookie = value.includes('=') ? value : `sessionid=${value}`
        return
      }
    } catch (error) {
      console.warn('[汽水] 读取登录状态失败', error)
    }
  }
}

function saveSodaSession(cookie: string) {
  const normalized = cookie.trim().replace(/;+$/, '')
  if (!normalized) throw new Error('没有拿到汽水登录凭据')
  if (!safeStorage.isEncryptionAvailable()) {
    sodaCookie = normalized
    sodaSessionLoaded = true
    console.warn('[汽水] 安全存储不可用，登录只在本次运行内有效')
    return
  }
  try {
    writeFileSync(sodaSessionFile(), safeStorage.encryptString(normalized))
    sodaCookie = normalized
    sodaSessionLoaded = true
    clearSodaLogoutMarkers()
    recommendCache = null
  } catch (error: any) {
    sodaCookie = ''
    sodaSessionLoaded = true
    throw new Error(`汽水登录凭据无法保存：${error?.message || error}`)
  }
}

function requireSodaSession() {
  loadSodaSession()
  if (!sodaCookie) throw new Error('请先登录汽水音乐')
  return sodaCookie.endsWith(';') ? sodaCookie : `${sodaCookie};`
}

function withSession(headers: Record<string, string>) {
  loadSodaSession()
  return sodaCookie ? { ...headers, Cookie: sodaCookie } : headers
}

export function hasSodaSession() {
  loadSodaSession()
  return Boolean(sodaCookie)
}

/* ============ 扫码登录：轮询放主进程，浮层关掉也不丢确认 ============ */
export type SodaLoginPhase = 'idle' | 'waiting' | 'scanned' | 'success' | 'expired' | 'error'

export interface SodaLoginState {
  phase: SodaLoginPhase
  qrImage: string
  message: string
  error: string
  updatedAt: number
}

let sodaLoginState: SodaLoginState = { phase: 'idle', qrImage: '', message: '', error: '', updatedAt: 0 }
let sodaLoginSeq = 0
let sodaLoginPollTimer: ReturnType<typeof setTimeout> | null = null
let sodaLoginFailures = 0
let sodaLoginLastSignal = ''
const SODA_POLL_INTERVAL = 3000
// 参考实现：error_code=7 只是临时限流，冷却 5 秒继续轮询。写成 60 秒会把
// 「扫码后确认」的窗口整段跳过，表现为一直卡在 scanned。
const SODA_RATE_LIMIT_COOLDOWN = 5000
const SODA_LOGIN_COOKIES = ['sessionid', 'sessionid_ss', 'sid_guard', 'sid_tt']

interface SodaQrSession {
  key: string
  token: string
  deviceId: string
  installId: string
  msToken: string
  verifyPortraitId: string
  expireAt: number
  cooldownUntil: number
}

let sodaQrSession: SodaQrSession | null = null

function publishSodaLoginState(patch: Partial<SodaLoginState>) {
  sodaLoginState = { ...sodaLoginState, ...patch, updatedAt: Date.now() }
  for (const contents of webContents.getAllWebContents()) {
    if (!contents.isDestroyed()) contents.send('soda:login-state', sodaLoginState)
  }
}

export function getSodaLoginState(): SodaLoginState {
  return { ...sodaLoginState }
}

function stopSodaLoginPoll() {
  if (sodaLoginPollTimer) clearTimeout(sodaLoginPollTimer)
  sodaLoginPollTimer = null
}

function scheduleSodaLoginPoll(seq: number, delay = SODA_POLL_INTERVAL) {
  stopSodaLoginPoll()
  if (!sodaQrSession?.token || seq !== sodaLoginSeq) return
  sodaLoginPollTimer = setTimeout(() => { void pollSodaLogin(seq) }, delay)
}

function failSodaLogin(phase: SodaLoginPhase, message: string) {
  const session = sodaQrSession
  sodaQrSession = null
  sodaLoginFailures = 0
  sodaLoginLastSignal = ''
  if (session) closeSignerSession(session.key)
  publishSodaLoginState({ phase, qrImage: '', message: '', error: message })
}

function createQrSession(): SodaQrSession {
  return {
    // 每个二维码一个独立浏览器分区与设备身份，避免设备身份复用被护照服务限流
    key: `qr-${randomHex(16)}`,
    token: '',
    deviceId: randomDigits(16),
    installId: randomDigits(15),
    msToken: randomMsToken(),
    verifyPortraitId: `${randomUUID()}.login`,
    expireAt: 0,
    cooldownUntil: 0
  }
}

function sodaCommonParams(session: SodaQrSession, bizTraceId: string) {
  return new URLSearchParams({
    passport_jssdk_version: '2.4.13',
    passport_jssdk_type: 'normal',
    is_from_ttaccountsdk: '1',
    aid: PASSPORT.aid,
    language: 'zh',
    account_sdk_source: 'web',
    p_js_v: '2.4.13',
    p_js_t: 'pro',
    p_zt: '3.3.5',
    p_ver: '1.0.29',
    request_host: 'app://resources',
    p_bd: '1.0.0.41',
    is_new_login: '1',
    is_from_iesaccountsaas: '1',
    device_platform: 'PC',
    version_code: '3.5.2',
    account_sdk_source_info: '00',
    biz_trace_id: bizTraceId,
    device_id: session.deviceId,
    install_id: session.installId,
    did: session.deviceId,
    iid: session.installId,
    msToken: session.msToken
  })
}

async function passportRequest(
  session: SodaQrSession,
  method: 'GET' | 'POST',
  path: string,
  extra: Record<string, string>,
  body?: string
) {
  const trace = randomHex(8)
  const params = sodaCommonParams(session, trace)
  for (const [key, value] of Object.entries(extra)) params.set(key, value)
  const headers: Record<string, string> = {
    Accept: 'application/json, text/javascript',
    'x-tt-passport-verify-portrait': session.verifyPortraitId,
    'x-tt-passport-trace-id': trace
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    headers['x-ss-stub'] = createHash('md5').update(body).digest('hex').toUpperCase()
  }
  const response = await signerRequest(session.key, {
    method,
    url: `${PC_API}${path}?${params}`,
    headers,
    body: body ?? null
  })
  let envelope: any = {}
  try { envelope = response.body ? JSON.parse(response.body) : {} } catch { envelope = {} }
  return { response, envelope }
}

function hasLoginCookie(cookie: string) {
  const names = new Set(cookie.split(';').map(part => part.trim().split('=')[0]).filter(Boolean))
  return SODA_LOGIN_COOKIES.some(name => names.has(name))
}

function mergeCookies(current: string, extra: string[]) {
  const jar = new Map<string, string>()
  for (const raw of [current, ...extra]) {
    for (const part of String(raw || '').split(';')) {
      const pair = part.trim()
      const eq = pair.indexOf('=')
      if (eq <= 0) continue
      jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1))
    }
  }
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
}

function finishSodaLogin(cookie: string, key: string) {
  try {
    saveSodaSession(cookie)
  } catch (error: any) {
    failSodaLogin('error', error?.message || '登录状态保存失败')
    return
  }
  closeSignerSession(key)
  sodaQrSession = null
  sodaLoginFailures = 0
  sodaLoginLastSignal = ''
  publishSodaLoginState({ phase: 'success', qrImage: '', message: '扫码成功，正在同步歌单…', error: '' })
}

async function pollSodaLogin(seq: number) {
  sodaLoginPollTimer = null
  const session = sodaQrSession
  if (!session?.token || seq !== sodaLoginSeq) return
  const now = Date.now()
  if (session.expireAt && now > session.expireAt) {
    failSodaLogin('expired', '二维码已过期，请重新获取')
    return
  }
  if (session.cooldownUntil > now) {
    scheduleSodaLoginPoll(seq, session.cooldownUntil - now)
    return
  }
  try {
    const body = new URLSearchParams({
      need_logo: 'false',
      need_short_url: 'false',
      is_frontier: 'true',
      token: session.token,
      is_new_login: '1',
      next: PC_API
    }).toString()
    const { response, envelope } = await passportRequest(session, 'POST', '/passport/web/check_qrconnect/', {}, body)
    if (seq !== sodaLoginSeq || sodaQrSession !== session) return
    const data = envelope.data || {}
    const status = String(data.status ?? '').toLowerCase()
    const errorCode = Number(data.error_code || 0)
    const message = String(data.description || data.extra || envelope.message || '')
    const signal = `${response.status}|${status}|${errorCode}`
    if (signal !== sodaLoginLastSignal) {
      sodaLoginLastSignal = signal
      console.info('[汽水] 扫码轮询', signal)
    }
    // 只看服务端状态判断确认；本地 jar 可能残留上一次登录的 cookie，不能作为依据
    const confirmed = status === '3' || status === 'confirmed' || status === 'success' ||
      data.logged_in === true || Boolean(data.session_cookie)

    // 2046：官方二次验证组件才能闭环；当前 Electron 会话没有验证窗口，明确告知而不是反复重试
    if (errorCode === 2046) {
      failSodaLogin('error', '汽水要求二次安全验证，请改用汽水音乐官方客户端登录后再试')
      return
    }
    if (errorCode === 2 || status === 'expired' || status === 'expire' || status === 'timeout') {
      failSodaLogin('expired', '二维码已过期，请重新获取')
      return
    }
    // 7 号是临时限流（官方文案「访问太频繁」）：冷却 5 秒继续，绝不判失败
    if (!confirmed && (errorCode === 7 || /访问太频繁|操作频繁/.test(message))) {
      session.cooldownUntil = Date.now() + SODA_RATE_LIMIT_COOLDOWN
      const phase = sodaLoginState.phase === 'scanned' ? 'scanned' : 'waiting'
      publishSodaLoginState({
        phase,
        message: phase === 'scanned' ? '已扫码，正在确认登录…' : '等待手机扫码…'
      })
      scheduleSodaLoginPoll(seq, SODA_RATE_LIMIT_COOLDOWN)
      return
    }
    if (!confirmed && errorCode !== 0) {
      failSodaLogin('error', message || `汽水拒绝了这次登录（错误码 ${errorCode}）`)
      return
    }
    sodaLoginFailures = 0

    if (confirmed) {
      let cookie = await signerCookies(session.key)
      const redirectUrl = String(data.redirect_url || data.redirectUrl || data.redirect || '').trim()
      if (!hasLoginCookie(cookie) && redirectUrl) {
        try {
          await signerRequest(session.key, {
            method: 'GET',
            url: new URL(redirectUrl, PC_API).toString(),
            headers: { Accept: 'application/json, text/javascript' }
          })
          const harvested = await signerCookies(session.key)
          if (harvested) cookie = harvested
        } catch (error) {
          console.warn('[汽水] 跟随登录跳转失败', String((error as any)?.message || error))
        }
        if (seq !== sodaLoginSeq || sodaQrSession !== session) return
      }
      // 少数情况下响应体也会直接下发登录态，和浏览器 jar 合并
      const parts: string[] = []
      for (const key of ['session_cookie', 'cookie']) {
        if (typeof data[key] === 'string') parts.push(data[key])
        if (typeof envelope[key] === 'string') parts.push(envelope[key])
      }
      for (const key of ['sessionid', 'session_id']) {
        if (typeof data[key] === 'string') parts.push(`sessionid=${data[key]}`)
        if (typeof data.auth?.[key] === 'string') parts.push(`sessionid=${data.auth[key]}`)
      }
      cookie = mergeCookies(cookie, parts)
      if (!hasLoginCookie(cookie)) {
        failSodaLogin('error', '手机已确认，但登录凭据没有返回，请重新获取二维码再试')
        return
      }
      finishSodaLogin(cookie, session.key)
      return
    }
    if (status === '2' || status === 'scanned') {
      if (sodaLoginState.phase !== 'scanned') {
        publishSodaLoginState({ phase: 'scanned', message: '已扫码，请在手机上确认登录' })
      }
      scheduleSodaLoginPoll(seq)
      return
    }
    if (status === '4' || status === 'canceled' || status === 'cancelled') {
      failSodaLogin('expired', '已在手机上取消登录，请重新获取二维码')
      return
    }
    if (status === '5') {
      failSodaLogin('expired', '二维码已过期，请重新获取')
      return
    }
    if (status === '1' || status === 'new' || status === 'waiting' || status === '') {
      if (sodaLoginState.phase !== 'waiting') publishSodaLoginState({ phase: 'waiting', message: '等待手机扫码…' })
      scheduleSodaLoginPoll(seq)
      return
    }
    failSodaLogin('error', `汽水返回了未知的扫码状态（${status}），请刷新二维码重试`)
  } catch (error: any) {
    if (seq !== sodaLoginSeq || sodaQrSession !== session) return
    // 单次网络/签名页抖动不结束登录流程，继续等下一轮；连续失败才报错
    sodaLoginFailures++
    console.warn('[汽水] 查询扫码状态失败', String(error?.message || error))
    if (sodaLoginFailures >= 5) {
      failSodaLogin('error', String(error?.message || '') || '登录状态查询失败，请刷新二维码')
      return
    }
    scheduleSodaLoginPoll(seq, Math.min(SODA_POLL_INTERVAL * sodaLoginFailures, 10_000))
  }
}

export async function beginSodaLogin() {
  const seq = ++sodaLoginSeq
  stopSodaLoginPoll()
  const previous = sodaQrSession
  sodaQrSession = null
  if (previous) closeSignerSession(previous.key)
  sodaLoginFailures = 0
  sodaLoginLastSignal = ''
  publishSodaLoginState({ phase: 'waiting', qrImage: '', message: '正在获取二维码…', error: '' })
  const session = createQrSession()
  sodaQrSession = session
  try {
    const { response, envelope } = await passportRequest(session, 'GET', '/passport/web/get_qrcode/', {
      next: PC_API,
      need_logo: 'false',
      need_short_url: 'false',
      is_new_login: '1'
    })
    if (seq !== sodaLoginSeq) throw new Error('登录二维码已刷新，请使用最新的二维码')
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`汽水接口请求失败（HTTP ${response.status}）`)
    }
    const data = envelope.data || {}
    const token = String(data.token || '')
    const qrImage = String(data.qrcode || '')
    if (envelope.message !== 'success' || Number(data.error_code || 0) !== 0 || !token || !qrImage.startsWith('data:image/')) {
      throw new Error(String(data.description || envelope.message || '汽水没有返回可用的二维码'))
    }
    // 二维码图片本身就是服务端下发的 qrcode_index_url；不要改写成 light/invoke/scan_login，
    // 实测改写版手机点确认后服务端永远停在 scanned。
    if (!String(data.qrcode_index_url || '').includes('token=')) {
      console.warn('[汽水] 服务端没有下发官方扫码地址，仍使用返回的二维码图片')
    }
    session.token = token
    session.expireAt = Number(data.expire_time || 0) * 1000 || Date.now() + 3 * 60_000
    publishSodaLoginState({ phase: 'waiting', qrImage, message: '等待手机扫码…', error: '' })
    scheduleSodaLoginPoll(seq)
    return { qrImage, expireAt: session.expireAt }
  } catch (error: any) {
    const errorText = String(error?.message || '') || '获取二维码失败'
    if (seq === sodaLoginSeq) failSodaLogin('error', errorText)
    throw new Error(errorText)
  }
}

export function logoutSoda() {
  loadSodaSession()
  sodaLoginSeq++
  stopSodaLoginPoll()
  const session = sodaQrSession
  sodaQrSession = null
  if (session) closeSignerSession(session.key)
  sodaLoginFailures = 0
  sodaLoginLastSignal = ''
  sodaCookie = ''
  sodaSessionLoaded = true
  recommendCache = null
  publishSodaLoginState({ phase: 'idle', qrImage: '', message: '', error: '' })
  const files = sodaSessionFiles()
  for (const file of files) {
    try {
      if (existsSync(file)) unlinkSync(file)
    } catch (error) {
      console.warn('[汽水] 删除登录凭据失败（已忽略）:', file, error)
    }
  }
  for (const marker of sodaLogoutMarkers()) {
    try {
      writeFileSync(marker, new Date().toISOString(), 'utf8')
    } catch (error) {
      console.warn('[汽水] 写入退出标记失败:', marker, error)
    }
  }
}

// 汽水封面是 ImageX 对象：只拼 base + uri 会被 CDN 拒绝（400），必须带模板缩放后缀
function pickUrl(value: any): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return pickUrl(value[0])
  if (value.uri && value.template_prefix) {
    return `https://p3-luna.douyinpic.com/img/${value.uri}~${value.template_prefix}-resize:512:512.png`
  }
  if (Array.isArray(value.urls) && value.urls.length) {
    const base = String(value.urls[0] || '')
    // 头像的 urls[0] 本身就是完整签名地址（路径里已包含 uri），再拼一次会得到畸形 URL
    return /^https?:\/\//.test(base) ? base : `${base}${value.uri || ''}`
  }
  if (Array.isArray(value.url_list) && value.url_list.length) return value.url_list[0] || ''
  return value.url || value.uri || value.template || ''
}

function mapPlaylist(raw: any) {
  if (!raw?.id) return null
  return {
    id: String(raw.id),
    name: String(raw.title || raw.name || ''),
    cover: pickUrl(raw.url_cover || raw.cover || raw.cover_url),
    count: Number(raw.count_tracks ?? raw.track_count ?? 0) || 0,
    creator: String(raw.owner?.nickname || '汽水音乐'),
    kind: 'platform'
  }
}

function mapTrack(raw: any) {
  if (!raw?.id) return null
  const album = raw.album || {}
  return {
    songmid: String(raw.id),
    name: String(raw.name || ''),
    singer: (Array.isArray(raw.artists) ? raw.artists : [])
      // 官方曲目的 artists 是对象，原创原声是 user_info，旧接口里偶尔是纯字符串
      .map((artist: any) => typeof artist === 'string' ? artist : artist?.name || artist?.user_info?.nickname || '')
      .filter(Boolean)
      .join(' / '),
    album: String(album.name || ''),
    // 汽水的时长是毫秒
    duration: Math.round(Number(raw.duration || 0) / 1000),
    img: pickUrl(album.url_cover || album.cover_url),
    // 只有“必须会员才能播放”才算 VIP；only_vip_download 只限制下载品质
    vip: raw.label_info?.only_vip_playable ? 'vip' as const : '' as const,
    // 原创原声（ugc_clip）没有可解析的播放地址，列表里保留但标灰
    noSource: raw.media_type === 'ugc_clip',
    platform: 'soda' as const
  }
}

// 一次 discover/mix 最多只给 8–10 个歌单，且不同批次有重复；歌单页要铺满 50 格，
// 所以并发多取几份再按 id 去重。
const RECOMMEND_BATCHES = 10
let recommendCache: { session: string; at: number; value: NonNullable<ReturnType<typeof mapPlaylist>>[] } | null = null

export async function getSodaRecommendations(limit = 50, force = false) {
  loadSodaSession()
  // 探索推荐只对登录账号开放，避免匿名设备拉到不属于用户的公共内容
  if (!sodaCookie) throw new Error('请先登录汽水音乐')
  const sessionKey = 'user'
  if (!force && recommendCache && recommendCache.session === sessionKey &&
      recommendCache.value.length >= limit && Date.now() - recommendCache.at < 5 * 60_000) {
    return recommendCache.value.slice(0, limit)
  }
  // 这是 App 公开接口：带上网页登录 cookie 会被判成异常设备（ERR_REQUEST_FORBIDDEN）
  const headers = APP_HEADERS
  const responses = await Promise.allSettled(
    Array.from({ length: RECOMMEND_BATCHES }, () => requestJson(`${LUNA_API}/luna/discover/mix`, {
      method: 'POST',
      headers,
      body: { count: 10 }
    }))
  )
  const seen = new Set<string>()
  const seenNames = new Set<string>()
  const playlists: NonNullable<ReturnType<typeof mapPlaylist>>[] = []
  let firstError: any = null
  for (const result of responses) {
    if (result.status === 'rejected') {
      firstError ||= result.reason
      continue
    }
    const blocks = Array.isArray(result.value?.inner_block) ? result.value.inner_block : []
    for (const block of blocks) {
      for (const resource of block?.resources || []) {
        const playlist = mapPlaylist(resource?.entity?.playlist || resource?.playlist)
        if (!playlist || !playlist.name || seen.has(playlist.id)) continue
        // 同一批里常出现换了 id 的同名歌单，按名字再挡一次
        const nameKey = playlist.name.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
        if (!nameKey || seenNames.has(nameKey)) continue
        seen.add(playlist.id)
        seenNames.add(nameKey)
        playlists.push(playlist)
      }
    }
  }
  if (!playlists.length) throw firstError || new Error('汽水推荐暂时没有返回内容')
  recommendCache = { session: sessionKey, at: Date.now(), value: playlists }
  return playlists.slice(0, limit)
}

// 官方推荐队列（/luna/feed/song-tab）：首屏一次给一页歌曲，等价客户端的自动播放。
export async function getSodaFeedTracks(limit = 50) {
  const cookie = requireSodaSession()
  const headers = { ...PC_APP_HEADERS, Cookie: cookie }
  const tracks: NonNullable<ReturnType<typeof mapTrack>>[] = []
  const played: { media_id: string; type: string; duration: number; played_mills: number }[] = []
  const seen = new Set<string>()
  const firstUse = Math.floor(Date.now() / 1000)
  let statusMsg = ''
  // 官方推荐流一次只回 6 首；带上已取到的条目继续请求，攒够一屏队列
  const maxPages = Math.max(3, Math.ceil(limit / 6))
  for (let page = 0; page < maxPages && tracks.length < limit; page += 1) {
    const payload = JSON.stringify({
      played_media: played,
      did_first_use_time: firstUse,
      is_first_request: page === 0,
      is_did_first_request: page > 0,
      feed_counts: { mix_session_count: 1 }
    })
    const body = await requestJson(`${PC_API}/luna/pc/feed/song-tab`, {
      method: 'POST',
      headers: {
        ...headers,
        'X-SS-STUB': createHash('md5').update(payload).digest('hex').toUpperCase()
      },
      query: pcAppParams(),
      body: payload
    })
    statusMsg = String(body?.status_info?.status_msg || '')
    const items = Array.isArray(body?.items) ? body.items : []
    let fresh = 0
    for (const item of items) {
      if (item?.type !== 'track') continue
      const track = mapTrack(item?.entity?.track_wrapper?.track || item?.entity?.track || item?.track)
      if (!track || !track.name || seen.has(track.songmid)) continue
      seen.add(track.songmid)
      tracks.push(track)
      played.push({ media_id: track.songmid, type: 'track', duration: track.duration, played_mills: -1 })
      fresh += 1
    }
    if (!items.length || !fresh) break
  }
  if (!tracks.length) throw new Error(statusMsg || '汽水推荐暂时没有返回歌曲')
  return tracks.slice(0, limit)
}

// 登录后走 PC 歌单详情：公开 App 接口只回可公开播放的资源（77/192 就是这么丢的），
// PC 接口会带上完整收藏，其中已下架条目才带 status 字段。
async function getPcPlaylistTracks(playlistId: string) {
  const tracks: NonNullable<ReturnType<typeof mapTrack>>[] = []
  const seen = new Set<string>()
  const seenCursors = new Set<string>()
  let cursor = ''
  for (let page = 0; page < 20; page += 1) {
    const body = await requestJson(`${PC_API}/luna/pc/playlist/detail`, {
      headers: { ...PC_APP_HEADERS, Cookie: requireSodaSession() },
      query: { ...pcAppParams(), playlist_id: String(playlistId), cursor, count: 100 }
    })
    const resources = Array.isArray(body?.media_resources) ? body.media_resources : []
    for (const resource of resources) {
      const raw = resource?.entity?.track_wrapper?.track || resource?.entity?.track || resource?.track
      if (!raw || raw.status) continue
      const track = mapTrack(raw)
      if (!track || !track.name || seen.has(track.songmid)) continue
      seen.add(track.songmid)
      tracks.push(track)
    }
    const next = body?.next_cursor ? String(body.next_cursor) : ''
    if (!resources.length || !next || next === cursor || seenCursors.has(next)) break
    seenCursors.add(next)
    cursor = next
  }
  return tracks
}

// 未登录时仍用公开接口（数量会少，只包含公开可听的曲目）
async function getPublicPlaylistTracks(playlistId: string) {
  const tracks: NonNullable<ReturnType<typeof mapTrack>>[] = []
  const seen = new Set<string>()
  let cursor = ''
  // 同上：公开歌单详情接口不接受网页登录 cookie
  const headers = APP_HEADERS
  // 接口一页最多 50 首，最多翻 5 页，够覆盖长歌单的常用部分
  for (let page = 0; page < 5; page += 1) {
    const body = await requestJson(`${LUNA_API}/luna/playlist/detail`, {
      method: 'POST',
      headers,
      body: { playlist_id: String(playlistId), count: 50, ...(cursor ? { cursor } : {}) }
    })
    const resources = Array.isArray(body?.media_resources) ? body.media_resources : []
    for (const resource of resources) {
      const track = mapTrack(resource?.entity?.track_wrapper?.track || resource?.entity?.track || resource?.track)
      if (!track || !track.name || seen.has(track.songmid)) continue
      seen.add(track.songmid)
      tracks.push(track)
    }
    cursor = body?.next_cursor ? String(body.next_cursor) : ''
    if (!cursor) break
  }
  return tracks
}

export async function getSodaPlaylistTracks(playlistId: string) {
  loadSodaSession()
  return sodaCookie ? getPcPlaylistTracks(playlistId) : getPublicPlaylistTracks(playlistId)
}

// PC 端公共查询参数（对齐桌面客户端的设备指纹）
function pcAppParams() {
  return {
    aid: '386088',
    app_name: 'luna_pc',
    region: 'cn',
    geo_region: 'cn',
    os_region: 'cn',
    sim_region: '',
    device_id: deviceId,
    cdid: '',
    iid: installId,
    version_name: '3.3.0',
    version_code: '30030000',
    channel: 'official',
    build_mode: 'master',
    network_carrier: '',
    ac: 'wifi',
    tz_name: 'Asia/Shanghai',
    resolution: '',
    device_platform: 'windows',
    device_type: 'Windows',
    os_version: 'Windows 11',
    fp: deviceId
  }
}

function pcSearchParams(keyword: string) {
  return {
    ...pcAppParams(),
    // 搜索接口沿用原版本号，避免影响已经联调通过的搜索
    version_name: '3.0.0',
    version_code: '30000000',
    q: keyword,
    cursor: 0,
    search_id: '',
    search_method: 'input',
    debug_params: '',
    from_search_id: '',
    search_scene: ''
  }
}

// 汽水匿名的歌曲搜索接口需要 App 签名，目前只开放歌单搜索
export async function searchSodaPlaylists(keyword: string) {
  const body = await requestJson(`${PC_API}/luna/pc/search/playlist`, {
    headers: withSession(PC_HEADERS),
    query: pcSearchParams(keyword)
  })
  const groups = Array.isArray(body?.result_groups) ? body.result_groups : []
  const resources = groups.flatMap((group: any) => (Array.isArray(group?.data) ? group.data : []))
  const seen = new Set<string>()
  const playlists: NonNullable<ReturnType<typeof mapPlaylist>>[] = []
  for (const resource of resources) {
    const playlist = mapPlaylist(resource?.entity?.playlist)
    if (!playlist || !playlist.name || seen.has(playlist.id)) continue
    seen.add(playlist.id)
    playlists.push(playlist)
  }
  return playlists
}

/* ============ 账号资料与我的歌单 ============ */
function mapProfile(raw: any) {
  const info = raw?.my_info || raw?.user || raw || {}
  // 汽水不提供成长等级，只给会员阶段；vip_stage 为 svip 时才标 SVIP
  const stage = String(info.vip_stage || '').toLowerCase()
  const vip: '' | 'vip' | 'svip' = stage.includes('svip') ? 'svip' : (info.is_vip || stage === 'vip') ? 'vip' : ''
  return {
    name: String(info.nickname || info.name || ''),
    avatar: pickUrl(
      info.larger_avatar_url || info.medium_avatar_url ||
      info.avatar_url || info.avatar || info.avatar_thumb || info.avatar_large || info.avatar_medium
    ),
    level: Number(info.level || 0) || 0,
    vip
  }
}

export async function getSodaLibrary() {
  const cookie = requireSodaSession()
  const headers = { ...PC_HEADERS, Cookie: cookie }
  const [me, lists] = await Promise.all([
    requestJson(`${PC_API}/luna/pc/me`, { headers, query: { aid: PASSPORT.aid } }),
    requestJson(`${PC_API}/luna/pc/me/playlist`, {
      headers,
      query: { aid: PASSPORT.aid, iid: PASSPORT.iid, version_code: PASSPORT.version_code }
    })
  ])
  const profile = mapProfile(me)
  const seen = new Set<string>()
  const playlists: NonNullable<ReturnType<typeof mapPlaylist>>[] = []
  for (const raw of Array.isArray(lists?.playlists) ? lists.playlists : []) {
    const playlist = mapPlaylist(raw)
    if (!playlist || !playlist.name || seen.has(playlist.id)) continue
    seen.add(playlist.id)
    playlists.push({ ...playlist, kind: 'mine' })
  }
  return { profile, playlists }
}

interface SodaSong {
  name: string
  artists: string[]
  album: string
  cover: string
  audioUrl: string
  lyric: string
  // 目录时长（秒），用来判断拿到的音源是不是被截断的试听片段
  duration: number
  // 试听片段在整首歌里的起点与长度（秒）；完整音源两者都是 0
  clipStart: number
  clipSeconds: number
}

const songCache = new Map<string, { at: number; value: SodaSong }>()

// 分享页 H5 只给约 30 秒的试听片段；完整音源需要登录态，先按试听接入
async function fetchSodaSong(trackId: string): Promise<SodaSong> {
  const cached = songCache.get(trackId)
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.value
  const body = await requestJson(`${LUNA_API}/luna/h5/seo_track`, {
    headers: WEB_HEADERS,
    query: { track_id: trackId, device_platform: 'web' }
  })
  const track = body?.seo_track?.track || {}
  let audioUrl = ''
  let servedVid = ''
  try {
    const video = JSON.parse(body?.track_player?.video_model || '{}')
    audioUrl = video?.video_list?.[0]?.main_url || video?.video_list?.[0]?.backup_url || ''
    servedVid = String(video?.video_id || '')
  } catch { /* 视频模型缺失时按不可播放处理 */ }
  // 免费曲目也带 audition_info，但下发的仍是完整音源；
  // 只有下发 vid 等于 preview.vid 时，音源才是从歌曲中段截出的试听片段
  const preview = track.preview || track.audition_info || {}
  const isAudition = Boolean(servedVid && preview?.vid && servedVid === String(preview.vid))
  const value: SodaSong = {
    name: String(track.name || ''),
    artists: (Array.isArray(track.artists) ? track.artists : [])
      .map((artist: any) => artist?.name || artist?.user_info?.nickname || '')
      .filter(Boolean),
    album: String(track.album?.name || ''),
    cover: pickUrl(track.album?.url_cover || track.album?.cover_url),
    audioUrl,
    lyric: String(body?.lyric?.content || ''),
    duration: Math.round(Number(track.duration || 0) / 1000),
    clipStart: isAudition ? Math.round(Number(preview.start || 0) / 1000) : 0,
    clipSeconds: isAudition ? Math.round(Number(preview.duration || 0) / 1000) : 0
  }
  songCache.set(trackId, { at: Date.now(), value })
  return value
}

// 从音源的 mp4 容器里读真实时长；读不到返回 0，交给上层按“无试听限制”处理
async function streamDuration(url: string) {
  try {
    const response = await fetch(url, { headers: { Range: 'bytes=0-16383' }, signal: AbortSignal.timeout(8000) })
    const buffer = Buffer.from(await response.arrayBuffer())
    const index = buffer.indexOf('mvhd')
    if (index >= 4) {
      const version = buffer[index + 4]
      const timescale = version === 1 ? buffer.readUInt32BE(index + 24) : buffer.readUInt32BE(index + 16)
      const duration = version === 1 ? Number(buffer.readBigUInt64BE(index + 28)) : buffer.readUInt32BE(index + 20)
      const seconds = timescale ? duration / timescale : 0
      if (seconds > 0) return Math.round(seconds)
    }
  } catch { /* 时长读不出来就不提示试听 */ }
  return 0
}

export async function getSodaSongUrl(trackId: string) {
  const song = await fetchSodaSong(trackId)
  if (!song.audioUrl) throw new Error('这首曲子暂时没有可试听的音源')
  const seconds = await streamDuration(song.audioUrl)
  // 免费歌曲拿到的是完整音源，只有明显短于目录时长的才是试听片段
  const trialSeconds = seconds > 0 && song.duration > 0 && seconds < song.duration - 5 ? seconds : 0
  return { url: song.audioUrl, trialSeconds }
}

function formatStamp(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const rest = (seconds % 60).toFixed(2).padStart(5, '0')
  return `${String(minutes).padStart(2, '0')}:${rest}`
}

function parseLrcTimeTag(tag: string): number | null {
  const m = tag.match(/^(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?$/)
  if (!m) return null
  const minutes = Number(m[1])
  const seconds = Number(m[2])
  const fraction = m[3] ? Number(m[3].padEnd(3, '0')) / 1000 : 0
  return minutes * 60 + seconds + fraction
}

// 旧 QRC：[行毫秒,行毫秒]<字相对毫秒,字时长毫秒,0>字（无闭合标签）
function qrcToLrc(content: string) {
  if (!content.trim()) return ''
  if (!/<\d+,\d+,\d+>/.test(content)) return content.trim()
  const lines: string[] = []
  for (const raw of content.split(/\r?\n/)) {
    const match = raw.trim().match(/^\[(\d+),(\d+)\](.*)$/)
    if (!match) continue
    const text = [...match[3].matchAll(/<(\d+),(\d+),\d+>([^<]*)/g)].map(word => word[3]).join('').trim()
    if (!text) continue
    lines.push(`[${formatStamp(Number(match[1]) / 1000)}]${text}`)
  }
  return lines.join('\n')
}

function qrcToYrc(content: string) {
  const lines: string[] = []
  for (const raw of content.split(/\r?\n/)) {
    const match = raw.trim().match(/^\[(\d+),(\d+)\](.*)$/)
    if (!match) continue
    const start = Number(match[1])
    const words = [...match[3].matchAll(/<(\d+),(\d+),\d+>([^<]*)/g)]
    if (!words.length) continue
    lines.push(`[${start},${match[2]}]${words.map(word => `(${start + Number(word[1])},${word[2]},0)${word[3]}`).join('')}`)
  }
  return lines.join('\n')
}

// 汽水官方格式是增强 LRC：行头 [毫秒,毫秒] 或 [mm:ss.xxx]，字用 <毫秒,毫秒>字</毫秒,毫秒>
function enhancedLrcToLyricYrc(content: string) {
  const lrcLines: string[] = []
  const yrcLines: string[] = []
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || !line.startsWith('[')) continue
    const tagMatch = line.match(/^\[([^\]]+)\](.*)$/)
    if (!tagMatch) continue
    const tag = tagMatch[1]
    const rest = tagMatch[2]
    let lineStartSec = 0
    let lineDurationMs = 0
    const msTagMatch = tag.match(/^(\d+),(\d+)$/)
    if (msTagMatch) {
      lineStartSec = Number(msTagMatch[1]) / 1000
      lineDurationMs = Number(msTagMatch[2])
    } else {
      const lrcTime = parseLrcTimeTag(tag)
      if (lrcTime === null) continue
      lineStartSec = lrcTime
    }
    const plainText = rest.replace(/<[^>]+>/g, '').trim()
    if (!plainText) continue
    lrcLines.push(`[${formatStamp(lineStartSec)}]${plainText}`)
    const words: { startMs: number; durationMs: number; text: string }[] = []
    const wordRegex = /<(\d+)\s*,\s*(\d+)>([^<]*?)<\/\1\s*,\s*\2>/g
    let wm
    while ((wm = wordRegex.exec(rest)) !== null) {
      const wStart = Number(wm[1])
      const wEndOrDur = Number(wm[2])
      const wEnd = wEndOrDur >= wStart ? wEndOrDur : wStart + wEndOrDur
      const text = wm[3]
      if (!text.trim()) continue
      words.push({ startMs: wStart, durationMs: Math.max(0, wEnd - wStart), text })
    }
    if (!words.length) continue
    if (!lineDurationMs) {
      const lastEnd = Math.max(...words.map(w => w.startMs + w.durationMs))
      lineDurationMs = Math.max(0, lastEnd - lineStartSec * 1000)
    }
    const lineStartMs = Math.round(lineStartSec * 1000)
    const yrcWords = words.map(w => `(${w.startMs},${w.durationMs},0)${w.text}`).join('')
    yrcLines.push(`[${lineStartMs},${lineDurationMs}]${yrcWords}`)
  }
  return { lyric: lrcLines.join('\n'), yrc: yrcLines.join('\n') }
}

function parseSodaLyric(content: string) {
  const trimmed = content.trim()
  if (!trimmed) return { lyric: '', yrc: '' }
  if (trimmed.includes('</')) return enhancedLrcToLyricYrc(trimmed)
  if (/<\d+,\d+,\d+>/.test(trimmed)) return { lyric: qrcToLrc(trimmed), yrc: qrcToYrc(trimmed) }
  return { lyric: trimmed, yrc: '' }
}

// 试听片段从整首歌的中段开始（如 2:47 起 30 秒），而歌词是整首时间轴：
// 裁掉片段之外的行并把时间整体前移，否则高亮行和实际听到的人声完全错位
function clipLyric(lyric: string, yrc: string, offsetSec: number, clipSeconds: number) {
  const offsetMs = Math.round(offsetSec * 1000)
  const endMs = clipSeconds > 0 ? offsetMs + clipSeconds * 1000 : Number.POSITIVE_INFINITY
  const inClip = (startMs: number) => startMs >= offsetMs - 500 && startMs <= endMs + 500
  const lrcLines: string[] = []
  for (const raw of lyric.split(/\r?\n/)) {
    const match = raw.trim().match(/^\[([^\]]+)\](.*)$/)
    if (!match) continue
    const time = parseLrcTimeTag(match[1])
    if (time === null || !inClip(time * 1000)) continue
    lrcLines.push(`[${formatStamp(Math.max(0, time - offsetSec))}]${match[2]}`)
  }
  const yrcLines: string[] = []
  for (const raw of yrc.split(/\r?\n/)) {
    const match = raw.trim().match(/^\[(\d+),(\d+)\](.*)$/)
    if (!match) continue
    const startMs = Number(match[1])
    if (!inClip(startMs)) continue
    const words = [...match[3].matchAll(/\((\d+),(\d+),\d+\)[^()]*/g)]
      .map(word => word[0].replace(/^\((\d+)/, (_, ms) => `(${Math.max(0, Number(ms) - offsetMs)}`))
      .join('')
    yrcLines.push(`[${Math.max(0, startMs - offsetMs)},${match[2]}]${words}`)
  }
  return { lyric: lrcLines.join('\n'), yrc: yrcLines.join('\n') }
}

export async function getSodaLyrics(trackId: string) {
  const song = await fetchSodaSong(trackId)
  const parsed = parseSodaLyric(song.lyric)
  const clipped = song.clipStart > 0
    ? clipLyric(parsed.lyric, parsed.yrc, song.clipStart, song.clipSeconds)
    : parsed
  return { lyric: clipped.lyric, translation: '', yrc: clipped.yrc, ytlyric: '' }
}
