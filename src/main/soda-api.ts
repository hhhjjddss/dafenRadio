/* 汽水音乐（Soda）协议层。
   歌单详情走 App 接口（与手机客户端条目一致）；登录、资料、歌单、红心走 PC 客户端接口
   （抖音 App 扫码拿 sessionid，和手机同一套账号体系）；公开推荐/搜索/试听/H5 也在这里。
   音源仍在车机协议（qishui-api）。 */

import { app, safeStorage, webContents } from 'electron'
import { is } from '@electron-toolkit/utils'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, statSync } from 'fs'
import { join } from 'path'
import {
  signerRequest, signerCookies, closeSignerSession, openSignerVerifyWindow,
  registerSecondVerify, isSecondVerifyDone, ackSecondVerify, getSecondVerifyDecision
} from './soda-signer'

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

// PC 扫码登录固定参数（账号接口仍沿用这套 aid/iid）
const PASSPORT = {
  aid: '386088',
  iid: '27960026095955',
  version_code: '30020100',
  passport_ssdk_version: '2.4.13',
  passport_ssdk_type: 'normal',
  is_from_taccountsdk: '1',
  next: 'https://api.qishui.com',
  need_logo: 'false',
  need_short_url: 'false',
  is_frontend: 'true',
  is_new_login: '1'
}

// 汽水确认后的登录态由多个 cookie 组成（sessionid_ss / sid_guard / session_tlb_tag…），
// 只存 sessionid 会拿到空值；这里保存整份 cookie 头，加密落盘，绝不回传渲染进程之外的组件。
let sodaCookie = ''
let sodaSessionLoaded = false

const SESSION_FILE = 'soda-session.bin'
const SESSION_MARKER = 'soda-session.logged-out'
// 历史版本用过 soda-pc-session.*，读取时要兼容，否则老用户每次启动都像没登录
const LEGACY_SESSION_FILE = 'soda-pc-session.bin'
const LEGACY_SESSION_MARKER = 'soda-pc-session.logged-out'

function sodaDataDir() {
  return join(app.getPath('userData'), 'data')
}

// 挑一个真正可写的目录存凭据；Windows 某些安全策略会拒绝写 userData/data
let sodaStorageRoot = ''
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
  return sodaDataDir()
}

// 凭据可能落在多个目录：可写目录、userData、开发期项目目录。任一处有有效凭据都能恢复登录，
// 避免目录变化、迁移、版本升级后被误判为未登录而每次都要扫码。
function sodaSessionRoots(): string[] {
  const roots = new Set<string>([resolveSodaStorageRoot(), sodaDataDir(), app.getPath('userData')])
  if (is.dev) roots.add(app.getAppPath())
  return [...roots]
}

function sessionNameVariants(name: 'session' | 'marker'): string[] {
  if (name === 'session') return [SESSION_FILE, LEGACY_SESSION_FILE]
  return [SESSION_MARKER, LEGACY_SESSION_MARKER]
}

function sodaSessionFiles(): string[] {
  const files: string[] = []
  for (const root of sodaSessionRoots()) {
    for (const name of sessionNameVariants('session')) files.push(join(root, name))
  }
  return files
}

function sodaLogoutMarkers(): string[] {
  const files: string[] = []
  for (const root of sodaSessionRoots()) {
    for (const name of sessionNameVariants('marker')) files.push(join(root, name))
  }
  return files
}

function newestLogoutMarker(): number {
  let newest = 0
  for (const marker of sodaLogoutMarkers()) {
    try {
      if (existsSync(marker)) newest = Math.max(newest, statSync(marker).mtimeMs)
    } catch { /* 标记读不到就当作没有 */ }
  }
  return newest
}

function clearLogoutMarkers() {
  for (const marker of sodaLogoutMarkers()) {
    try { if (existsSync(marker)) unlinkSync(marker) } catch (error) { console.warn('[汽水] 清除退出标记失败', marker, error) }
  }
}

function loadSodaSession() {
  if (sodaSessionLoaded) return
  sodaSessionLoaded = true
  if (!safeStorage.isEncryptionAvailable()) return
  // 只忽略退出标记之前保存的凭据：标记删不掉时，之后重新登录的凭据仍然有效。
  // 多目录都有文件时取最新的那份，避免读到已退出的旧账号。
  const loggedOutAt = newestLogoutMarker()
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
      const raw = safeStorage.decryptString(readFileSync(file))
      if (!raw) continue
      let value = raw
      try {
        // 兼容旧版只存 {"sessionid":"..."} 的文件
        const json = JSON.parse(raw)
        if (json && typeof json === 'object' && typeof json.sessionid === 'string' && json.sessionid) value = json.sessionid
      } catch { /* 不是 JSON，按整份 cookie 字符串处理 */ }
      if (value) { sodaCookie = value.includes('=') ? value : `sessionid=${value}`; return }
    } catch (error) {
      console.warn('[汽水] 读取登录态失败', file, error)
    }
  }
}

function saveSodaSession(cookie: string) {
  const normalized = cookie.trim().replace(/;+$/, '')
  if (!normalized) throw new Error('没有拿到汽水登录凭据')
  sodaCookie = normalized
  sodaSessionLoaded = true
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('[汽水] 安全存储不可用，PC 登录只在本次运行内有效')
      return
    }
    // 写到所有候选目录（标准文件名），任一处成功即可恢复；同时清掉退出标记。
    // 这样即使某个目录被安全软件拦截或启动目录变化，也不会丢登录态。
    const encrypted = safeStorage.encryptString(normalized)
    let saved = false
    for (const root of sodaSessionRoots()) {
      try { writeFileSync(join(root, SESSION_FILE), encrypted); saved = true } catch { /* 换下一个目录 */ }
    }
    if (!saved) console.warn('[汽水] 所有目录都不可写，登录只在本次运行内有效')
    clearLogoutMarkers()
    recommendCache = null
  } catch (error) {
    console.warn('[汽水] PC 登录凭据无法保存，本次运行内有效', error)
  }
}

function clearPcSession() {
  sodaCookie = ''
  sodaSessionLoaded = true
  for (const file of sodaSessionFiles()) {
    try { if (existsSync(file)) unlinkSync(file) } catch (error) { console.warn('[汽水] 删除登录凭据失败（已忽略）', file, error) }
  }
  const stamp = new Date().toISOString()
  for (const marker of sodaLogoutMarkers()) {
    try { writeFileSync(marker, stamp, 'utf8') } catch { /* 目录不可写时内存退出即可 */ }
  }
}

function requireSodaSession() {
  loadSodaSession()
  if (!sodaCookie) throw new Error('请先登录汽水音乐')
  return sodaCookie.endsWith(';') ? sodaCookie : `${sodaCookie};`
}

const randomDigits = (length: number) => Array.from({ length: length }, () => Math.floor(Math.random() * 10)).join('')
const MS_TOKEN_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
// libresoda 实测 msToken = 88 字节 base64url + '=='，共 120 字符
const randomMsToken = () => Array.from({ length: 118 }, () => MS_TOKEN_CHARS[Math.floor(Math.random() * MS_TOKEN_CHARS.length)]).join('') + '=='
const randomHex = (length: number) => Array.from({ length: length }, () => Math.floor(Math.random() * 16).toString(16)).join('')
const deviceId = randomDigits(16)
const installId = randomDigits(15)

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
    // 公开接口（推荐/搜索/歌单）被风控拒绝时也会返回 401/403，不能据此判定账号登录失效
    if (!response.ok) throw new Error(`汽水接口请求失败（HTTP ${response.status}）`)
    let body: any = null
    try { body = text ? JSON.parse(text) : null } catch { body = null }
    // 汽水凭据失效时仍返回 HTTP 200，只在 body 里给 status_code；
    // 不在这里拦下，界面就会把空资料当成「已登录但没有等级」
    const bizCode = Number(body?.status_code ?? 0)
    if (bizCode !== 0) {
      const statusMsg = String(body?.status_info?.status_msg || body?.message || '')
      if (/登录.*(失效|过期|重新登录)|未登录|请先登录/.test(statusMsg)) {
        throw new Error('汽水登录已失效，请重新登录')
      }
      throw new Error(statusMsg || `汽水接口返回异常（code ${bizCode}）`)
    }
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

// passport 接口要看 Set-Cookie、也不按 bizCode 抛错，用独立请求层
async function passportRequest(path: string, options: RequestOptions = {}): Promise<RequestResult> {
  const url = new URL(`${PC_API}${path}`)
  for (const [key, value] of Object.entries(options.query || {})) url.searchParams.set(key, String(value))
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: { Accept: 'application/json, text/plain, */*', ...(options.headers || {}) },
    body: options.body === undefined ? undefined : typeof options.body === 'string' ? options.body : JSON.stringify(options.body),
    signal: AbortSignal.timeout(15000)
  })
  const text = await response.text()
  let body: any = null
  try { body = text ? JSON.parse(text) : null } catch { body = null }
  if (!response.ok) throw new Error(`汽水登录请求失败（HTTP ${response.status}）`)
  return { body, headers: response.headers, status: response.status, text }
}

// 合并 Set-Cookie / payload 里的 cookie 片段到会话 cookie jar（同名覆盖，过滤 Cookie 属性）
function mergeCookies(current: string, values: string[]): string {
  const jar = new Map<string, string>()
  for (const raw of [current, ...values]) {
    for (const part of String(raw || '').split(';')) {
      const eq = part.indexOf('=')
      if (eq <= 0) continue
      const name = part.slice(0, eq).trim()
      if (/^(path|domain|expires|max-age|samesite|secure|httponly)$/i.test(name)) continue
      const value = part.slice(eq + 1).trim()
      if (name && value) jar.set(name, value)
    }
  }
  return Array.from(jar, ([k, v]) => `${k}=${v}`).join('; ')
}

// 登录态以 cookie 里是否存在这些键为准（实测 sessionid 常随 redirect 下发，不在响应头）
function hasLoginState(cookie: string): boolean {
  return cookie.split(';').some(part => {
    const eq = part.indexOf('=')
    if (eq <= 0) return false
    const name = part.slice(0, eq).trim().toLowerCase()
    return ['sessionid', 'sessionid_ss', 'sid_guard', 'sid_tt'].includes(name) && part.slice(eq + 1).trim() !== ''
  })
}

type SodaLoginPhase = 'idle' | 'waiting' | 'scanned' | 'success' | 'expired' | 'error'
interface SodaLoginState {
  phase: SodaLoginPhase
  qrImage: string
  message: string
  error: string
  updatedAt: number
}
// libresoda 真机实测：同一 token 最小轮询间隔 2.5s，error_code=7 限流冷却 5s
const PC_POLL_INTERVAL = 2500
const PC_COOLDOWN_MS = 5000
interface SodaQrSession {
  key: string
  token: string
  deviceId: string
  installId: string
  msToken: string
  verifyPortraitId: string
  expireAt: number
  cooldownUntil: number
  verifyAttempts: number
}

let sodaLoginState: SodaLoginState = { phase: 'idle', qrImage: '', message: '', error: '', updatedAt: 0 }
let sodaLoginSeq = 0
let sodaPollTimer: ReturnType<typeof setTimeout> | null = null
let sodaLoginFailures = 0
let sodaLoginLastSignal = ''
let sodaQrSession: SodaQrSession | null = null

export function getSodaLoginState(): SodaLoginState { return { ...sodaLoginState } }

function publishSodaLoginState(patch: Partial<SodaLoginState>) {
  sodaLoginState = { ...sodaLoginState, ...patch, updatedAt: Date.now() }
  for (const contents of webContents.getAllWebContents()) {
    if (!contents.isDestroyed()) contents.send('soda:login-state', sodaLoginState)
  }
}

function stopSodaLoginPoll() {
  if (sodaPollTimer) { clearTimeout(sodaPollTimer); sodaPollTimer = null }
}

function scheduleSodaLoginPoll(seq: number, delay = PC_POLL_INTERVAL) {
  stopSodaLoginPoll()
  if (!sodaQrSession?.token || seq !== sodaLoginSeq) return
  sodaPollTimer = setTimeout(() => { void pollSodaLogin(seq) }, delay)
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
    verifyPortraitId: `${randomHex(8)}-${randomHex(4)}-${randomHex(4)}-${randomHex(4)}-${randomHex(12)}.login`,
    expireAt: 0,
    cooldownUntil: 0,
    verifyAttempts: 0
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

// 二次验证组件需要的公共参数快照（对象形态，对齐参考实现的 commonParams）
function sodaGeneralParamsObject(session: SodaQrSession): Record<string, string> {
  const params = sodaCommonParams(session, randomHex(8))
  const obj: Record<string, string> = {}
  params.forEach((value, key) => { obj[key] = value })
  return obj
}

// 归一化 2046 决策里的 biz_params：JSON 字符串 / k=v 查询串 / 对象都归成键值对列表，
// 嵌套对象序列化成 JSON 文本，null 丢弃
function normalizeBizParams(value: any): Array<[string, string]> {
  if (value === null || value === undefined) return []
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return []
    try {
      return normalizeBizParams(JSON.parse(text))
    } catch { /* 退回按查询串解析 */ }
    return text.split('&').map(pair => {
      const eq = pair.indexOf('=')
      if (eq <= 0) return null
      let key = pair.slice(0, eq)
      let val = pair.slice(eq + 1)
      try { key = decodeURIComponent(key) } catch { /* 保持原样 */ }
      try { val = decodeURIComponent(val) } catch { /* 保持原样 */ }
      return [key, val] as [string, string]
    }).filter((x): x is [string, string] => !!x && !!x[0])
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)] as [string, string])
  }
  return []
}

// 打开二次验证窗口：登记决策后加载 security_host.html（官方组件经 /verify/* 桥接）
function openSodaVerifyWindow(key: string, seq: number) {
  void openSignerVerifyWindow(key, () => {
    sodaLoginFailures = 0
    scheduleSodaLoginPoll(seq)
  })
}

// 签名页代发护照请求：a_bogus / msToken / 会话 cookie 都由隐藏浏览器上下文补齐
async function signerPassportRequest(
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
  sodaPollTimer = null
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
  // 二次验证窗口已完成：带决策里的 biz_params 重发确认（isResend=true）
  if (isSecondVerifyDone(session.key)) {
    ackSecondVerify(session.key)
    await checkSodaLogin(seq, session, true)
    return
  }
  await checkSodaLogin(seq, session, false)
}

async function checkSodaLogin(seq: number, session: SodaQrSession, resend: boolean) {
  try {
    const bodyParams: Record<string, string> = {
      need_logo: 'false',
      need_short_url: 'false',
      is_frontier: 'true',
      token: session.token,
      is_new_login: '1',
      next: PC_API
    }
    if (resend) {
      const decision = getSecondVerifyDecision(session.key) || {}
      for (const [key, value] of normalizeBizParams((decision as any).biz_params)) {
        if (!(key in bodyParams)) bodyParams[key] = value
      }
    }
    const body = new URLSearchParams(bodyParams).toString()
    const { response, envelope } = await signerPassportRequest(
      session,
      'POST',
      '/passport/web/check_qrconnect/',
      resend ? { isResend: 'true' } : {},
      body
    )
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

    // 2046：护照要求二次安全验证。把决策登记到桥接表，加载 security_host.html 跑官方
    // ucWebSecondVerify 组件，组件网络请求经 /verify/request 回签名页上下文代发
    // （带 cookie + a_bogus），完成后自动关窗恢复轮询。
    if (errorCode === 2046) {
      session.verifyAttempts = (session.verifyAttempts || 0) + 1
      console.warn('[汽水] 扫码轮询触发二次验证(2046) 决策字段:', Object.keys(data).join(','))
      if (session.verifyAttempts <= 3) {
        registerSecondVerify(session.key, data, sodaGeneralParamsObject(session))
        publishSodaLoginState({
          phase: 'scanned',
          message: '汽水要求二次安全验证，请在弹出的窗口完成验证，完成后登录会自动继续'
        })
        openSodaVerifyWindow(session.key, seq)
        return
      }
      failSodaLogin('error', '汽水要求二次安全验证，请改用汽水音乐官方客户端登录后再试')
      return
    }
    if (errorCode === 2 || status === 'expired' || status === 'expire' || status === 'timeout') {
      failSodaLogin('expired', '二维码已过期，请重新获取')
      return
    }
    // 7 号是临时限流（官方文案「访问太频繁」）：冷却 5 秒继续，绝不判失败
    if (!confirmed && (errorCode === 7 || /访问太频繁|操作频繁/.test(message))) {
      session.cooldownUntil = Date.now() + PC_COOLDOWN_MS
      const phase = sodaLoginState.phase === 'scanned' ? 'scanned' : 'waiting'
      publishSodaLoginState({
        phase,
        message: phase === 'scanned' ? '已扫码，正在确认登录…' : '等待手机扫码…'
      })
      scheduleSodaLoginPoll(seq, PC_COOLDOWN_MS)
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
      if (!hasLoginState(cookie) && redirectUrl) {
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
        if (typeof (envelope as any)[key] === 'string') parts.push((envelope as any)[key])
      }
      for (const key of ['sessionid', 'session_id']) {
        if (typeof data[key] === 'string') parts.push(`sessionid=${data[key]}`)
        if (typeof data.auth?.[key] === 'string') parts.push(`sessionid=${data.auth[key]}`)
      }
      cookie = mergeCookies(cookie, parts)
      if (!hasLoginState(cookie)) {
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
      failSodaLogin('error', String(error?.message || '') || '登录状态查询失败，请刷新二维码重试')
      return
    }
    scheduleSodaLoginPoll(seq, Math.min(PC_POLL_INTERVAL * sodaLoginFailures, 10_000))
  }
}

// 获取二维码：走签名页代理（get_qrcode 必需 a_bogus / msToken 签名，裸请求拿不到 token）。
// 遇到 2046 风控时在验证窗口闭环后用同一会话重试（递归，次数受 verifyAttempts 限制）。
async function fetchQrcode(seq: number, session: SodaQrSession): Promise<{ token: string; qrImage: string; expireAt: number }> {
  const { response, envelope } = await signerPassportRequest(
    session,
    'GET',
    '/passport/web/get_qrcode/',
    { next: PC_API, need_logo: 'false', need_short_url: 'false', is_new_login: '1' }
  )
  if (seq !== sodaLoginSeq) throw new Error('登录二维码已刷新，请使用最新的二维码')
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`汽水接口请求失败（HTTP ${response.status}）`)
  }
  const data = envelope.data || {}
  const token = String(data.token || '')
  const qrImage = String(data.qrcode || '')
  const errorCode = Number(data.error_code || 0)
  if (envelope.message !== 'success' || errorCode !== 0 || !token || !qrImage.startsWith('data:image/')) {
    // 护照风控（2046）：把决策登记到桥接表并加载 security_host.html 跑官方组件，
    // 完成后自动关窗，再用同一会话重试取码
    if (errorCode === 2046) {
      session.verifyAttempts = (session.verifyAttempts || 0) + 1
      console.warn('[汽水] 获取二维码触发二次验证(2046) 决策字段:', Object.keys(data).join(','))
      if (session.verifyAttempts <= 3) {
        registerSecondVerify(session.key, data, sodaGeneralParamsObject(session))
        publishSodaLoginState({
          phase: 'waiting',
          qrImage: '',
          message: '汽水要求二次安全验证，请在弹出的窗口完成验证，完成后登录会自动重试',
          error: ''
        })
        return await new Promise((resolve, reject) => {
          openSignerVerifyWindow(session.key, () => {
            sodaLoginFailures = 0
            void fetchQrcode(seq, session).then(resolve).catch(reject)
          })
        })
      }
    }
    throw new Error(String(data.description || envelope.message || '汽水没有返回可用的二维码'))
  }
  // 二维码图片本身就是服务端下发的 qrcode_index_url；不要改写成 light/invoke/scan_login，
  // 实测改写版手机点确认后服务端永远停在 scanned。
  if (!String(data.qrcode_index_url || '').includes('token=')) {
    console.warn('[汽水] 服务端没有下发官方扫码地址，仍使用返回的二维码图片')
  }
  return { token, qrImage, expireAt: Number(data.expire_time || 0) * 1000 || Date.now() + 3 * 60_000 }
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
    const result = await fetchQrcode(seq, session)
    if (seq !== sodaLoginSeq) throw new Error('登录二维码已刷新，请使用最新的二维码')
    session.token = result.token
    session.expireAt = result.expireAt
    publishSodaLoginState({ phase: 'waiting', qrImage: result.qrImage, message: '请使用汽水音乐App 扫码授权汽水音乐', error: '' })
    scheduleSodaLoginPoll(seq)
    return { qrImage: result.qrImage, expireAt: session.expireAt }
  } catch (error: any) {
    const errorText = String(error?.message || '') || '获取二维码失败'
    console.warn('[汽水] 获取二维码失败', errorText)
    if (seq === sodaLoginSeq) failSodaLogin('error', errorText)
    throw new Error(errorText)
  }
}

export async function refreshSodaSessionInfo(): Promise<{ connected: boolean; expired: boolean }> {
  loadSodaSession()
  if (!sodaCookie) return { connected: false, expired: false }
  try {
    await pcAccountGet('/luna/pc/me')
    return { connected: true, expired: false }
  } catch (error: any) {
    const message = String(error?.message || '')
    if (message.includes('登录已失效')) return { connected: false, expired: true }
    // 网络错误保留登录态
    return { connected: true, expired: false }
  }
}

export function hasSodaSession() {
  loadSodaSession()
  return Boolean(sodaCookie)
}
export function logoutSoda() {
  sodaLoginSeq++
  stopSodaLoginPoll()
  const session = sodaQrSession
  sodaQrSession = null
  sodaLoginFailures = 0
  sodaLoginLastSignal = ''
  if (session) closeSignerSession(session.key)
  clearPcSession()
  publishSodaLoginState({ phase: 'idle', qrImage: '', message: '', error: '' })
}

// PC 账号接口统一走整份登录 cookie（含 sessionid / sessionid_ss / sid_guard 等）
async function pcAccountGet(path: string, extra: Record<string, string | number> = {}) {
  const body = await passportRequest(path, {
    headers: { ...PC_HEADERS, Cookie: requireSodaSession() },
    query: { aid: PASSPORT.aid, ...extra }
  })
  const code = Number(body.body?.status_code ?? body.body?.code ?? 0)
  if (code !== 0) {
    const msg = String(body.body?.status_info?.status_msg || body.body?.message || '')
    if (/登录.*(失效|过期|重新登录)|未登录|请先登录/.test(msg)) throw new Error('汽水登录已失效，请重新登录')
    throw new Error(msg || `汽水账号接口异常（${code}）`)
  }
  return body.body
}

// PC 账号写入接口：与读取共用整份登录 cookie，只额外带一个 JSON body。
// 收藏 / 取消收藏的路径与请求体对齐汽水 PC 客户端（libresoda collection.rs）。
async function pcAccountPost(path: string, body: Record<string, unknown>, extra: Record<string, string | number> = {}) {
  const result = await passportRequest(path, {
    method: 'POST',
    headers: { ...PC_HEADERS, Cookie: requireSodaSession() },
    query: { aid: PASSPORT.aid, ...extra },
    body
  })
  const code = Number(result.body?.status_code ?? result.body?.code ?? 0)
  if (code !== 0) {
    const msg = String(result.body?.status_info?.status_msg || result.body?.message || '')
    if (/登录.*(失效|过期|重新登录)|未登录|请先登录/.test(msg)) throw new Error('汽水登录已失效，请重新登录')
    throw new Error(msg || `汽水写入接口异常（${code}）`)
  }
  return result.body
}

// 在线红心写入：type=1 的「我喜欢的音乐」就是单曲收藏（track），
// 与手机端同一套账号数据，写完后由前端重新拉取红心列表校正。
export async function setSodaLike(id: string, liked: boolean): Promise<void> {
  const media = [{ type: 'track', id: String(id) }]
  if (liked) {
    await pcAccountPost('/luna/pc/me/collection/media', { scene: '', media })
  } else {
    await pcAccountPost('/luna/pc/me/collection/media/delete', { media })
  }
}

function pcPlaylist(item: any) {
  if (!item) return null
  const id = String(item.id || '')
  const name = String(item.title || item.name || '').trim()
  if (!id || !name) return null
  return {
    id,
    name,
    cover: pickUrl(item.url_cover || item.cover || item.cover_url || item.coverUrl),
    count: Number(item.count_tracks ?? item.track_count ?? item.song_count ?? 0) || 0,
    // PC 接口把红心歌单标成 type=1，和车机一致
    specialType: Number(item.type ?? item.playlist_type) === 1 ? 5 : undefined,
    kind: 'mine' as const
  }
}

export async function getSodaPcLibrary() {
  const [meRaw, listRaw] = await Promise.all([
    pcAccountGet('/luna/pc/me'),
    pcAccountGet('/luna/pc/me/playlist', { iid: PASSPORT.iid, version_code: PASSPORT.version_code })
  ])
  const info = meRaw?.my_info || meRaw?.user || meRaw || {}
  // /luna/pc/me 的头像字段是 my_info.larger_avatar_url（ImageX 对象：urls 或 uri+template_prefix）
  const avatar = pickUrl(info.larger_avatar_url || info.avatar_larger || info.url_avatar || info.avatar || info.avatar_url || info.avatar_url_large || '')
  const profile = {
    name: String(info.nickname || info.public_name || info.name || ''),
    avatar,
    level: 0,
    vip: info.is_vip ? 'vip' as const : '' as const,
    vipKnown: info.is_vip === true
  }
  const rows = Array.isArray(listRaw?.playlists) ? listRaw.playlists : []
  const playlists = rows.map(pcPlaylist).filter(Boolean)
  return { profile, playlists }
}

// 红心曲目：先定位「我喜欢的音乐」歌单（type=1），再用 PC 歌单详情接口拉全部曲目。
// 关键是 getSodaPlaylistTracks 在登录态下走 /luna/pc/playlist/detail，
// 会带上 App 公开接口拿不到的收藏（软件里 77/192 首就是这么丢的）。
export async function getSodaPcLikedTracks(): Promise<NonNullable<ReturnType<typeof mapTrack>>[]> {
  loadSodaSession()
  if (!sodaCookie) throw new Error('请先登录汽水音乐')
  const lists = await pcAccountGet('/luna/pc/me/playlist')
  const playlists = Array.isArray(lists?.playlists) ? lists.playlists : []
  let liked: any = null
  // type=1 是「我喜欢的音乐」；部分账号只给名字，做名字兜底
  for (const raw of playlists) {
    const type = Number(raw?.type ?? raw?.playlist_type)
    if (type === 1) { liked = raw; break }
  }
  if (!liked) {
    liked = playlists.find((raw: any) => /^(我喜欢的音乐|收藏的音乐)$/.test(String(raw?.name || ''))) || null
  }
  if (!liked?.id) return []
  return getSodaPlaylistTracks(String(liked.id))
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
  const base = raw.base_info || {}
  const related = raw.related_info || {}
  const album = raw.album || related.album || related.album_link || {}
  const artists = Array.isArray(raw.artists) ? raw.artists
    : Array.isArray(related.artist_links) ? related.artist_links
      : Array.isArray(related.artists) ? related.artists : []
  return {
    songmid: String(raw.id || base.id),
    // 部分曲目的名字在 base_info 里（与车机侧一致），兼容两种结构
    name: String(raw.name || base.name || base.title || '').trim() || '未知曲目',
    singer: artists
      // 官方曲目的 artists 是对象，原创原声是 user_info，旧接口里偶尔是纯字符串
      .map((artist: any) => typeof artist === 'string' ? artist : artist?.name || artist?.simple_display_name || artist?.user_info?.nickname || '')
      .filter(Boolean)
      .join(' / '),
    album: String(album.name || ''),
    // 汽水的时长是毫秒
    duration: Math.round(Number(raw.duration || base.duration_ms || base.duration || 0) / 1000),
    img: pickUrl(album.url_cover || album.cover_url || raw.display_info?.cover_url || raw.display_info?.url_cover),
    // 只有"必须会员才能播放"才算 VIP；only_vip_download 只限制下载品质，
    // quality_map 里的 need_vip 只是高音质档限制，免费歌也带，不能据此判 VIP
    vip: raw.label_info?.only_vip_playable ? 'vip' as const : '' as const,
    // 原创原声（ugc_clip）没有可解析的播放地址，列表里保留但标灰
    noSource: raw.media_type === 'ugc_clip',
    platform: 'soda' as const
  }
}

// 一次 discover/mix 最多只给 8–10 个歌单，且不同批次有重复；探索墙要铺满 60 格，
// 所以并发多取几份再按 id 去重（多取两份，保证按 id/名字/封面去重后仍够 60 张不重复封面）。
const RECOMMEND_BATCHES = 12
let recommendCache: { at: number; value: NonNullable<ReturnType<typeof mapPlaylist>>[] } | null = null

export async function getSodaRecommendations(limit = 60, force = false) {
  // 探索墙是公开内容，登录门槛由界面控制，这里只做缓存
  if (!force && recommendCache && recommendCache.value.length >= limit && Date.now() - recommendCache.at < 5 * 60_000) {
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
  const seenCovers = new Set<string>()
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
        // 不同歌单会复用同一张封面（官方聚合、翻唱合集），按图再挡一次，墙面才不会成对重复
        const coverKey = playlist.cover.split('?')[0].replace(/~[^/]*$/, '')
        if (coverKey && seenCovers.has(coverKey)) continue
        seen.add(playlist.id)
        seenNames.add(nameKey)
        if (coverKey) seenCovers.add(coverKey)
        playlists.push(playlist)
      }
    }
  }
  if (!playlists.length) throw firstError || new Error('汽水推荐暂时没有返回内容')
  recommendCache = { at: Date.now(), value: playlists }
  return playlists.slice(0, limit)
}

// 手机 App 歌单详情：用 App UA 请求，条目与客户端一致；带网页 cookie 会被判异常设备
async function getPublicPlaylistTracks(playlistId: string) {
  const tracks: NonNullable<ReturnType<typeof mapTrack>>[] = []
  let cursor = ''
  const headers = APP_HEADERS
  // 接口一页最多 50 首，最多翻 5 页，够覆盖长歌单的常用部分
  for (let page = 0; page < 5; page += 1) {
    const body = await requestJson(`${LUNA_API}/luna/playlist/detail`, {
      method: 'POST',
      headers,
      body: { playlist_id: String(playlistId), count: 50, ...(cursor ? { cursor } : {}) }
    })
    const resources = Array.isArray(body?.media_resources) ? body.media_resources : []
    console.info(`[汽水] App 歌单第 ${page + 1} 页返回 ${resources.length} 条 (id=${playlistId})`)
    for (const [index, resource] of resources.entries()) {
      // 与车机 publicTrack 同款的路径集合：有的曲目裹在 entity.media.track_entity 里，
      // 只认 entity.track 会把它当成空条目丢掉（“Fever Pitch” 就是这类）
      const track = mapTrack(
        resource?.entity?.track_wrapper?.track
        || resource?.entity?.media?.track_entity
        || resource?.entity?.track_entity
        || resource?.entity?.track
        || resource?.track_entity
        || resource?.track
      )
      console.info(`[汽水]   ${index + 1}. ${track ? `${track.name} / ${track.singer} / ${track.duration}s` : '未解析出曲目'}`)
      // 与车机路径一致：同一首歌出现多次就保留多次，缺名字也按条目保留，数量对齐手机端
      if (!track) continue
      tracks.push(track)
    }
    cursor = body?.next_cursor ? String(body.next_cursor) : ''
    if (!cursor) break
  }
  return tracks
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
      const raw = resource?.entity?.track_wrapper?.track
        || resource?.entity?.media?.track_entity
        || resource?.entity?.track_entity
        || resource?.entity?.track
        || resource?.track_entity
        || resource?.track
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
    headers: PC_HEADERS,
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

interface SodaAudioVariant {
  // highest / higher / medium，具体档位由平台下发
  quality: string
  bitrate: number
  url: string
}

interface SodaSong {
  name: string
  artists: string[]
  album: string
  cover: string
  // 同一首歌下发多档音源，按码率从高到低排列
  variants: SodaAudioVariant[]
  lyric: string
  // 目录时长（秒），用来判断拿到的音源是不是被截断的试听片段
  duration: number
  // 试听片段在整首歌里的起点与长度（秒）；完整音源两者都是 0
  clipStart: number
  clipSeconds: number
}

const songCache = new Map<string, { at: number; value: SodaSong }>()

// 分享页 H5 只给试听片段；完整音源走车机协议（qishui-api），这里只做兜底
async function fetchSodaSong(trackId: string, force = false): Promise<SodaSong> {
  if (!force) {
    const cached = songCache.get(trackId)
    if (cached && Date.now() - cached.at < 10 * 60_000) return cached.value
  }
  const body = await requestJson(`${LUNA_API}/luna/h5/seo_track`, {
    headers: WEB_HEADERS,
    query: { track_id: trackId, device_platform: 'web' }
  })
  const track = body?.seo_track?.track || {}
  let variants: SodaAudioVariant[] = []
  let servedVid = ''
  try {
    const video = JSON.parse(body?.track_player?.video_model || '{}')
    servedVid = String(video?.video_id || '')
    variants = (Array.isArray(video?.video_list) ? video.video_list : [])
      .map((item: any) => ({
        quality: String(item?.video_meta?.quality || ''),
        bitrate: Number(item?.video_meta?.bitrate || item?.video_meta?.real_bitrate || 0) || 0,
        url: String(item?.main_url || item?.backup_url || '')
      }))
      .filter((item: SodaAudioVariant) => item.url)
      .sort((a: SodaAudioVariant, b: SodaAudioVariant) => b.bitrate - a.bitrate)
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
    variants,
    lyric: String(body?.lyric?.content || ''),
    duration: Math.round(Number(track.duration || 0) / 1000),
    clipStart: isAudition ? Math.round(Number(preview.start || 0) / 1000) : 0,
    clipSeconds: isAudition ? Math.round(Number(preview.duration || 0) / 1000) : 0
  }
  songCache.set(trackId, { at: Date.now(), value })
  return value
}

// 从音源的 mp4 容器里读真实时长，同时顺带确认链接还能用：
// 汽水下发的签名地址会过期，读到 403/404 就当作过期，交给上层换一份新地址
type ProbeResult =
  | { state: 'ok'; seconds: number }
  | { state: 'stale' }
  | { state: 'unknown' }

export async function probeAudio(url: string): Promise<ProbeResult> {
  try {
    const response = await fetch(url, { headers: { Range: 'bytes=0-16383' }, signal: AbortSignal.timeout(8000) })
    if ([401, 403, 404, 410].includes(response.status)) return { state: 'stale' }
    if (!response.ok) return { state: 'unknown' }
    const buffer = Buffer.from(await response.arrayBuffer())
    const index = buffer.indexOf('mvhd')
    if (index >= 4) {
      const version = buffer[index + 4]
      const timescale = version === 1 ? buffer.readUInt32BE(index + 24) : buffer.readUInt32BE(index + 16)
      const duration = version === 1 ? Number(buffer.readBigUInt64BE(index + 28)) : buffer.readUInt32BE(index + 20)
      const seconds = timescale ? duration / timescale : 0
      if (seconds > 0) return { state: 'ok', seconds: Math.round(seconds) }
    }
    return { state: 'ok', seconds: 0 }
  } catch {
    // 本机网络抖动也会让探测失败，这时不能把链接判死，交给播放器自己试
    return { state: 'unknown' }
  }
}

interface VariantPick {
  kind: 'ok'
  variant: SodaAudioVariant
  seconds: number
}

// 优先用用户选的档位，链接过期就换下一档；全部过期返回 stale，一档都探测不了先给首选
async function pickSodaVariant(song: SodaSong, quality: string): Promise<VariantPick | 'stale' | 'empty'> {
  const preferred = song.variants.find(item => item.quality === quality)
  const ordered = preferred
    ? [preferred, ...song.variants.filter(item => item !== preferred)]
    : song.variants
  if (!ordered.length) return 'empty'
  for (const variant of ordered) {
    const probe = await probeAudio(variant.url)
    if (probe.state === 'ok') return { kind: 'ok', variant, seconds: probe.seconds }
    if (probe.state === 'unknown') return { kind: 'ok', variant, seconds: 0 }
  }
  return 'stale'
}

export async function getSodaSongUrl(trackId: string, quality = 'highest', force = false) {
  let song = await fetchSodaSong(trackId, force)
  let pick = await pickSodaVariant(song, quality)
  // 缓存的签名链接过期，或 H5 这次没下发音频：绕过缓存重新取一次
  if (pick === 'stale' || pick === 'empty') {
    song = await fetchSodaSong(trackId, true)
    const retried = await pickSodaVariant(song, quality)
    if (retried !== 'empty') pick = retried
  }
  if (pick === 'empty' || pick === 'stale') throw new Error('这首曲子暂时没有可试听的音源')
  // 免费歌曲拿到的是完整音源，只有明显短于目录时长的才是试听片段
  const trialSeconds = pick.seconds > 0 && song.duration > 0 && pick.seconds < song.duration - 5 ? pick.seconds : 0
  return {
    url: pick.variant.url,
    trialSeconds,
    quality: { level: pick.variant.quality, bitrate: pick.variant.bitrate }
  }
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

// 车机协议下发的 krc 与分享页同格式，统一走同一套解析与试听裁剪
export function formatSodaLyric(content: string, clipStartSec = 0, clipSeconds = 0) {
  const parsed = parseSodaLyric(content)
  return clipStartSec > 0 ? clipLyric(parsed.lyric, parsed.yrc, clipStartSec, clipSeconds) : parsed
}

export async function getSodaLyrics(trackId: string) {
  const song = await fetchSodaSong(trackId)
  const clipped = formatSodaLyric(song.lyric, song.clipStart, song.clipSeconds)
  return { lyric: clipped.lyric, translation: '', yrc: clipped.yrc, ytlyric: '' }
}