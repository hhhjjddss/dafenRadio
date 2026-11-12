/* 汽水签名页：在隐藏 BrowserWindow 里运行官方 bdms.js，由它给护照请求补 a_bogus。
 *
 * 参考 libresoda 的 CDP 签名页（tools/qishui-signer + cdp_signer.rs）：
 * 护照接口对裸请求会一路 error_code=7，且手机确认后的登录 cookie 只落在
 * 「发起确认的那个浏览器会话」里，所以取码、轮询、跳转必须由同一个页面发出。
 * 每个二维码用独立的 session partition（独立 cookie jar + 设备身份），
 * 用完即关，避免设备身份复用触发限流。 */

import { app, BrowserWindow, session } from 'electron'
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http'
import { readFileSync } from 'fs'
import { join } from 'path'

const SIGNER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) SodaMusic/3.2.1 Chrome/136.0.7103.59 Electron/36.4.0 Safari/537.36'
const READY_TIMEOUT = 20_000
const IDLE_CLOSE = 5 * 60_000
const ASSETS = new Set(['security_host.html', 'sdk-glue.js', 'bdms.js', 'react.js', 'react-dom.js'])

export interface SignerRequest {
  method: string
  url: string
  headers?: Record<string, string>
  body?: string | null
  timeout?: number
}

export interface SignerResponse {
  status: number
  body: string
  responseURL: string
  headers: string
}

interface SignerSession {
  window: BrowserWindow
  ready: Promise<void>
  lastUsed: number
}

const sessions = new Map<string, SignerSession>()
let assetServer: Server | null = null
let assetPort = 0
let serverStarting: Promise<number> | null = null

// 二次验证（error_code=2046）桥接登记表：验证窗口里的官方组件通过 /verify/* 与本进程交互。
// 决策（2046 响应 data）与公共参数登记在这里，验证窗口加载 security_host.html 时经
// /verify/start 领取；组件内的网络请求经 /verify/request 路由回签名页上下文代发；
// /verify/complete 置完成标志，扫码轮询侧据此带 biz_params 重发 check_qrconnect。
const verifyDecisions = new Map<string, { decision: any; generalParams: Record<string, string> }>()
const verifyDoneFlags = new Set<string>()

export function registerSecondVerify(key: string, decision: any, generalParams: Record<string, string>) {
  verifyDecisions.set(key, { decision, generalParams })
  verifyDoneFlags.delete(key)
}

export function isSecondVerifyDone(key: string) {
  return verifyDoneFlags.has(key)
}

export function ackSecondVerify(key: string) {
  verifyDoneFlags.delete(key)
}

export function getSecondVerifyDecision(key: string) {
  return verifyDecisions.get(key)?.decision ?? null
}

export function clearSecondVerify(key: string) {
  verifyDecisions.delete(key)
  verifyDoneFlags.delete(key)
}

function serveAssets(): Promise<number> {
  if (assetPort) return Promise.resolve(assetPort)
  if (serverStarting) return serverStarting
  serverStarting = new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const pathname = decodeURIComponent((req.url || '/').split('?')[0])
      if ((req.method || 'GET').toUpperCase() === 'POST' && pathname.startsWith('/verify/')) {
        void handleVerifyBridge(pathname, req, res)
        return
      }
      const name = pathname.replace(/^\/+/, '') || 'security_host.html'
      if (!ASSETS.has(name)) {
        res.writeHead(404)
        res.end('not found')
        return
      }
      try {
        const body = readFileSync(join(app.getAppPath(), 'resources', 'soda-signer', name))
        res.writeHead(200, {
          'Content-Type': name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store'
        })
        res.end(body)
      } catch (error) {
        console.warn('[汽水] 读取签名页资产失败', name, error)
        res.writeHead(500)
        res.end('asset unavailable')
      }
    })
    server.once('error', (error) => {
      serverStarting = null
      reject(error)
    })
    server.listen(0, '127.0.0.1', () => {
      assetServer = server
      assetPort = (server.address() as { port: number }).port
      resolve(assetPort)
    })
  })
  return serverStarting
}

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', chunk => {
      raw += chunk
      if (raw.length > 1_000_000) req.destroy(new Error('请求体过大'))
    })
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}) } catch (error) { reject(error) }
    })
    req.on('error', reject)
  })
}

// 二次验证桥接：验证窗口里的官方组件（security_host.html?key=...）只与本进程通信，
// 真正的网络请求由本进程转发到该二维码的签名页上下文（带登录 cookie + a_bogus）。
async function handleVerifyBridge(pathname: string, req: IncomingMessage, res: ServerResponse) {
  const send = (status: number, payload: unknown) => {
    if (res.headersSent) return
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    })
    res.end(JSON.stringify(payload))
  }
  try {
    const body = await readJsonBody(req)
    const key = String(body?.key || '')
    if (!key) return send(400, { success: false, error: '缺少验证会话 key' })

    if (pathname === '/verify/start') {
      const entry = verifyDecisions.get(key)
      if (!entry) return send(404, { success: false, error: '二次验证决策不存在或已过期' })
      return send(200, { success: true, data: { decision: entry.decision, generalParams: entry.generalParams } })
    }

    if (pathname === '/verify/request') {
      const request = body?.request
      if (!request || typeof request.url !== 'string' || typeof request.method !== 'string') {
        return send(400, { success: false, error: '缺少请求参数' })
      }
      const result = await signerRequest(key, request)
      return send(200, result)
    }

    if (pathname === '/verify/complete') {
      verifyDoneFlags.add(key)
      // 验证完成自动关窗，触发 onClosed -> 恢复扫码轮询并带 biz_params 重发确认
      if (verifyWindow && !verifyWindow.isDestroyed() && verifyWindowKey === key) verifyWindow.close()
      return send(200, { success: true })
    }

    return send(404, { success: false, error: '未知的验证桥接端点' })
  } catch (error) {
    send(500, { success: false, error: String((error as any)?.message || error) })
  }
}

async function createSession(key: string): Promise<SignerSession> {
  const port = await serveAssets()
  const partition = `soda-login-${key}`
  const ses = session.fromPartition(partition)
  ses.setUserAgent(SIGNER_UA)
  // 官方 bdms.js 由 sdk-glue 从 CDN 动态加载；改走本地资产，避免 CDN 抖动/CSP
  ses.webRequest.onBeforeRequest({ urls: ['*://*/*bdms.js*'] }, (details, callback) => {
    if (details.url.startsWith(`http://127.0.0.1:${port}/`)) {
      callback({})
      return
    }
    callback({ redirectURL: `http://127.0.0.1:${port}/bdms.js` })
  })

  const win = new BrowserWindow({
    show: false,
    width: 480,
    height: 720,
    skipTaskbar: true,
    webPreferences: {
      partition,
      webSecurity: false,
      sandbox: false,
      backgroundThrottling: false
    }
  })
  win.webContents.setAudioMuted(true)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  const ready = (async () => {
    await win.loadURL(`http://127.0.0.1:${port}/security_host.html`)
    const deadline = Date.now() + READY_TIMEOUT
    while (Date.now() < deadline) {
      if (win.isDestroyed()) throw new Error('汽水签名页已关闭')
      const ok = await win.webContents
        .executeJavaScript('typeof window.__qishuiRequest === "function" && typeof window.bdms === "object"')
        .catch(() => false)
      if (ok) return
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    throw new Error('汽水安全组件初始化超时')
  })()

  const entry: SignerSession = { window: win, ready, lastUsed: Date.now() }
  sessions.set(key, entry)
  ready.catch(() => closeSession(key))
  return entry
}

async function getSession(key: string): Promise<SignerSession> {
  const existing = sessions.get(key)
  if (existing && !existing.window.isDestroyed()) return existing
  sessions.delete(key)
  return createSession(key)
}

export async function signerRequest(key: string, request: SignerRequest): Promise<SignerResponse> {
  const entry = await getSession(key)
  entry.lastUsed = Date.now()
  await entry.ready
  const spec = {
    method: request.method,
    url: request.url,
    headers: request.headers || {},
    body: request.body ?? null,
    timeout: request.timeout ?? 20_000
  }
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('汽水签名页请求超时')), spec.timeout + 8_000)
    })
    const result = await Promise.race([
      // 页面里的 XHR 失败只当一次请求失败，不能连浏览器上下文一起丢：
      // 二维码的 csrf cookie 就在这个上下文里，重建会把它弄丢。
      entry.window.webContents.executeJavaScript(
        `window.__qishuiRequest(${JSON.stringify(spec)})` +
        '.then(function (r) { return { ok: true, r: r } })' +
        '.catch(function (e) { return { ok: false, error: String((e && e.message) || e) } })'
      ),
      timeout
    ]) as { ok?: boolean; r?: SignerResponse; error?: string } | null
    if (!result) throw new Error('汽水签名页没有返回响应')
    if (result.ok === false) {
      const failure = new Error(result.error || '汽水签名页请求失败') as Error & { requestFailed?: boolean }
      failure.requestFailed = true
      throw failure
    }
    if (!result.r || typeof result.r.status !== 'number') throw new Error('汽水签名页没有返回响应')
    return result.r
  } catch (error: any) {
    if (!error?.requestFailed) {
      // 页面/浏览器通道坏掉时清掉缓存，下一次请求会重建（对齐参考实现的自愈）
      closeSession(key)
    }
    throw error
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** 读取该二维码浏览器会话里的汽水 cookie（确认登录后登录态就在这里）。 */
export async function signerCookies(key: string): Promise<string> {
  const entry = sessions.get(key)
  if (!entry || entry.window.isDestroyed()) return ''
  const cookies = await entry.window.webContents.session.cookies.get({})
  return cookies
    .filter((cookie) => {
      const domain = cookie.domain || ''
      return domain === 'qishui.com' || domain.endsWith('.qishui.com')
    })
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ')
}

export function closeSignerSession(key: string) {
  closeSession(key)
}

/* 护照风控（error_code=2046）要求二次安全验证：官方验证组件必须在浏览器里完成。
   在与签名会话相同的 partition 里弹出可见窗口，加载 security_host.html?key=...&bridgeRoot=/verify，
   组件通过 /verify/request 把网络请求路由回签名页上下文代发（带 cookie + a_bogus）。
   验证完成后自动关窗（closed -> finish -> 恢复扫码轮询）。 */
let verifyWindow: BrowserWindow | null = null
let verifyWindowKey = ''

export async function openSignerVerifyWindow(key: string, onClosed: () => void) {
  if (verifyWindow && !verifyWindow.isDestroyed() && verifyWindowKey === key) return
  if (verifyWindow && !verifyWindow.isDestroyed()) verifyWindow.destroy()
  const port = await serveAssets()
  const url = `http://127.0.0.1:${port}/security_host.html?key=${encodeURIComponent(key)}&bridgeRoot=/verify`
  const win = new BrowserWindow({
    width: 520,
    height: 740,
    title: '汽水安全验证（完成验证后请关闭本窗口）',
    autoHideMenuBar: true,
    webPreferences: {
      partition: `soda-login-${key}`,
      sandbox: false
    }
  })
  verifyWindow = win
  verifyWindowKey = key
  win.setMenuBarVisibility(false)
  // 官方验证组件按浏览器环境渲染，换标准 Chrome UA 避免白屏/风控拒绝
  const chromeUA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  win.webContents.setUserAgent(chromeUA)
  // 开发模式下附带打开该窗口自己的 DevTools，白屏时能看到页面内部的报错
  if (!app.isPackaged) win.webContents.openDevTools({ mode: 'detach' })
  let settled = false
  const finish = () => {
    if (settled) return
    settled = true
    if (verifyWindow === win) {
      verifyWindow = null
      verifyWindowKey = ''
    }
    if (!win.isDestroyed()) win.destroy()
    onClosed()
  }
  win.on('closed', () => {
    if (verifyWindow === win) {
      verifyWindow = null
      verifyWindowKey = ''
    }
    finish()
  })
  // 加载失败不直接销毁窗口：保留错误页让用户看到原因，手动关闭后仍会恢复轮询
  win.loadURL(url).catch(error => {
    console.warn('[汽水] 验证窗口加载失败:', String(error))
  })
}

function closeSession(key: string) {
  clearSecondVerify(key)
  const entry = sessions.get(key)
  if (!entry) return
  sessions.delete(key)
  if (!entry.window.isDestroyed()) entry.window.destroy()
}

export function closeAllSignerSessions() {
  verifyDecisions.clear()
  verifyDoneFlags.clear()
  for (const key of [...sessions.keys()]) closeSession(key)
  if (verifyWindow && !verifyWindow.isDestroyed()) verifyWindow.destroy()
  verifyWindow = null
  verifyWindowKey = ''
}

export function stopSignerAssets() {
  closeAllSignerSessions()
  if (assetServer) {
    assetServer.close()
    assetServer = null
    assetPort = 0
    serverStarting = null
  }
}

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of sessions) {
    if (now - entry.lastUsed > IDLE_CLOSE) closeSession(key)
  }
}, 60_000).unref()