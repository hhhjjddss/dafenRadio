/* 汽水签名页：在隐藏 BrowserWindow 里运行官方 bdms.js，由它给护照请求补 a_bogus。
 *
 * 参考 libresoda 的 CDP 签名页（tools/qishui-signer + cdp_signer.rs）：
 * 护照接口对裸请求会一路 error_code=7，且手机确认后的登录 cookie 只落在
 * 「发起确认的那个浏览器会话」里，所以取码、轮询、跳转必须由同一个页面发出。
 * 每个二维码用独立的 session partition（独立 cookie jar + 设备身份），
 * 用完即关，避免设备身份复用触发限流。 */

import { app, BrowserWindow, session } from 'electron'
import { createServer, type Server } from 'http'
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

function serveAssets(): Promise<number> {
  if (assetPort) return Promise.resolve(assetPort)
  if (serverStarting) return serverStarting
  serverStarting = new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const name = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'security_host.html'
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

function closeSession(key: string) {
  const entry = sessions.get(key)
  if (!entry) return
  sessions.delete(key)
  if (!entry.window.isDestroyed()) entry.window.destroy()
}

export function closeAllSignerSessions() {
  for (const key of [...sessions.keys()]) closeSession(key)
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
