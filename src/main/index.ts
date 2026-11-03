import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, session, shell, Tray } from 'electron'
import { join, dirname } from 'path'
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, utimesSync, writeFileSync } from 'fs'
import { mkdir, readdir, rm, stat, writeFile } from 'fs/promises'

// 修复 Windows 下控制台日志中文乱码：强制 stdout/stderr 使用 UTF-8
if (process.platform === 'win32') {
  try {
    const { stdout, stderr } = process
    ;(stdout as any).setDefaultEncoding?.('utf8')
    ;(stderr as any).setDefaultEncoding?.('utf8')
  } catch {}
}
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { beginNeteaseLogin, getNeteaseCollectionTracks, getNeteaseHeartbeat, getNeteaseLibrary, getNeteaseLikedSongs, getNeteaseLoginState, getNeteaseLyrics, getNeteasePersonalFm, getNeteaseSongUrl, hasNeteaseSession, logoutNetease, neteaseCacheDir, scrobbleNetease, searchNetease, searchNeteaseLyrics, setNeteaseLike, stopNeteaseApi } from './netease-api'
import { beginSodaLogin, getSodaFeedTracks, getSodaLibrary, getSodaLoginState, getSodaLyrics, getSodaPlaylistTracks, getSodaRecommendations, getSodaSongUrl, hasSodaSession, logoutSoda, searchSodaPlaylists } from './soda-api'
import { closeAllSignerSessions, stopSignerAssets } from './soda-signer'
import { searchOnlineLyrics } from './lyrics'

// 透明窗口默认退回灰度抗锯齿，强制 LCD 次像素渲染让小字号中文更清晰
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('enable-lcd-text')
}
// 汽水签名页跑在 127.0.0.1，护照 cookie 属于跨站 cookie；关掉 Chromium 的
// 第三方 cookie 限制，否则确认后的登录态写不进签名页分区（对齐参考实现）
app.commandLine.appendSwitch('disable-features', 'BlockThirdPartyCookies,ThirdPartyStoragePartitioning')


// 数据统一放在 userData/data：收藏、两个平台的登录态与缓存都在这里。
// 安装目录/工作目录在打包后可能无写权限（如 Program Files），不再允许自选目录
const DATA_DIR = join(app.getPath('userData'), 'data')
const SETTINGS_FILE = join(app.getPath('userData'), 'app-settings.json')

type AppSettings = {
  // 旧版允许自选数据目录，现在只作为一次性迁移的来源保留，不再提供修改入口
  dataDir?: string
  platform?: 'netease' | 'soda'
  onboardingDone?: boolean
  // 桌面歌词悬浮条最后一次拖到的位置
  lyricsPos?: { x: number; y: number }
}

function readAppSettings(): AppSettings {
  try {
    if (!existsSync(SETTINGS_FILE)) return {}
    const parsed = JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (e) {
    console.warn('[Data] 读取设置失败:', e)
    return {}
  }
}

// 平台选择由主进程落盘：渲染进程的 localStorage 按端口分域，开发时端口变化会丢
function saveAppSettings() {
  try {
    writeFileSync(SETTINGS_FILE, JSON.stringify(appSettings, null, 2), 'utf-8')
  } catch (e) {
    console.warn('[Data] 保存设置失败:', e)
  }
}

const appSettings = readAppSettings()
try { mkdirSync(DATA_DIR, { recursive: true }) } catch (e) { console.warn('[Data] 创建数据目录失败:', e) }

function favoritesFile(): string {
  return join(DATA_DIR, 'favorites.json')
}

// 旧版把数据分散在 userData 根目录、开发期项目目录和自选目录，
// 统一收进 userData/data；保留旧文件的修改时间，退出标记与登录态的先后关系不变
function copyPreservingTime(from: string, to: string, label: string) {
  mkdirSync(dirname(to), { recursive: true })
  // 先写临时文件再改名：复制中途失败（磁盘满、被杀进程）不会留下半个收藏或登录态
  const temp = `${to}.migrating`
  copyFileSync(from, temp)
  try {
    const { atime, mtime } = statSync(from)
    utimesSync(temp, atime, mtime)
  } catch { /* 时间戳保留失败不影响数据本身 */ }
  renameSync(temp, to)
  console.log('[Data] 已迁移' + label + ':', from, '→', to)
}

function migrateFile(from: string, to: string, label: string) {
  try {
    if (!existsSync(from) || existsSync(to)) return
    copyPreservingTime(from, to, label)
  } catch (e) {
    console.warn('[Data] 迁移' + label + '失败（不影响使用）:', e)
  }
}

// 登录态/退出标记可能同时存在于多处，取最新的一份迁入；
// 目标已经更新时跳过，避免旧副本覆盖新数据
function migrateNewest(froms: string[], to: string, label: string) {
  try {
    let best: { file: string; mtime: number } | null = null
    for (const file of froms) {
      try {
        const mtime = statSync(file).mtimeMs
        if (!best || mtime > best.mtime) best = { file, mtime }
      } catch { /* 该位置没有这份数据 */ }
    }
    if (!best) return
    try {
      if (statSync(to).mtimeMs >= best.mtime) return
    } catch { /* 目标还不存在 */ }
    copyPreservingTime(best.file, to, label)
  } catch (e) {
    console.warn('[Data] 迁移' + label + '失败（不影响使用）:', e)
  }
}

function migrateCacheDirFrom(root: string) {
  const from = join(root, 'netease-cache')
  const to = join(DATA_DIR, 'netease-cache')
  try {
    if (!existsSync(from) || existsSync(to)) return
    mkdirSync(DATA_DIR, { recursive: true })
    try {
      renameSync(from, to)
    } catch {
      // 跨盘或文件被占用时退回复制，旧目录留待系统清理
      cpSync(from, to, { recursive: true })
    }
    console.log('[Data] 已迁移网易云缓存:', from, '→', to)
  } catch (e) {
    console.warn('[Data] 迁移网易云缓存失败（不影响使用）:', e)
  }
}

try {
  const legacyAppDir = is.dev ? process.cwd() : dirname(app.getPath('exe'))
  const legacyRoots = new Set<string>([app.getPath('userData'), legacyAppDir])
  if (typeof appSettings.dataDir === 'string' && appSettings.dataDir) legacyRoots.add(appSettings.dataDir)
  const roots = [...legacyRoots].filter((root) => root && root !== DATA_DIR)

  for (const root of roots) {
    migrateFile(join(root, 'data', 'favorites.json'), favoritesFile(), '收藏数据')
    migrateFile(join(root, 'favorites.json'), favoritesFile(), '收藏数据')
  }
  migrateNewest(roots.map((root) => join(root, 'netease-session.bin')), join(DATA_DIR, 'netease-session.bin'), '网易云登录状态')
  migrateNewest(roots.map((root) => join(root, 'netease-session.logged-out')), join(DATA_DIR, 'netease-session.logged-out'), '网易云退出标记')
  migrateNewest(roots.map((root) => join(root, 'soda-session.bin')), join(DATA_DIR, 'soda-session.bin'), '汽水登录状态')
  migrateNewest(roots.map((root) => join(root, 'soda-session.logged-out')), join(DATA_DIR, 'soda-session.logged-out'), '汽水退出标记')
  for (const root of roots) migrateCacheDirFrom(root)
} catch (e) {
  console.warn('[Data] 旧数据迁移失败（不影响使用）:', e)
}

console.log('[Data] DATA_DIR:', DATA_DIR)
console.log('[Data] FAVORITES_FILE:', favoritesFile())

async function dirSize(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    let total = 0
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        total += await dirSize(full)
      } else if (entry.isFile()) {
        try { total += (await stat(full)).size } catch { /* 文件刚好被删除 */ }
      }
    }
    return total
  } catch {
    return 0
  }
}

async function measureCacheBytes(): Promise<number> {
  let http = 0
  try { http = await session.defaultSession.getCacheSize() } catch (e) { console.warn('[Cache] 读取 HTTP 缓存失败:', e) }
  return http + await dirSize(neteaseCacheDir())
}

// 设置面板每次打开都会问一次，30 秒内直接复用上次结果，避免反复遍历整棵缓存目录
const CACHE_SIZE_TTL = 30_000
let cacheSizeCache: { bytes: number; at: number } | null = null
let cacheSizeProbe: Promise<number> | null = null

async function totalCacheBytes(): Promise<number> {
  if (cacheSizeCache && Date.now() - cacheSizeCache.at < CACHE_SIZE_TTL) return cacheSizeCache.bytes
  if (!cacheSizeProbe) {
    cacheSizeProbe = measureCacheBytes()
      .then((bytes) => {
        cacheSizeCache = { bytes, at: Date.now() }
        return bytes
      })
      .finally(() => { cacheSizeProbe = null })
  }
  return cacheSizeProbe
}

let mainWindow: BrowserWindow | null = null
// Windows 的透明窗口 setFullScreen() 后 Electron 不更新 isFullScreen()，也不会发
// enter/leave-full-screen 事件；全屏状态和全屏前的尺寸只能由主进程自己记
let windowFullscreen = false
let fullscreenWasMaximized = false

function sendMaximized(maximized: boolean) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('window:maximized-change', maximized)
}

function sendFullscreen(fullscreen: boolean) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('window:fullscreen-change', fullscreen)
}

function enterFullscreen(): boolean {
  if (!mainWindow || mainWindow.isDestroyed() || windowFullscreen) return Boolean(mainWindow)
  fullscreenWasMaximized = mainWindow.isMaximized()
  windowFullscreen = true
  mainWindow.setFullScreen(true)
  sendFullscreen(true)
  return true
}

function leaveFullscreen(): boolean {
  if (!mainWindow || mainWindow.isDestroyed() || !windowFullscreen) return false
  const wasMaximized = fullscreenWasMaximized
  windowFullscreen = false
  fullscreenWasMaximized = false
  // 透明窗口的原生退出全屏会自己把尺寸收回去；再 setBounds 反而每轮涨 2px
  mainWindow.setFullScreen(false)
  sendFullscreen(false)
  if (wasMaximized) {
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed() || windowFullscreen) return
      mainWindow.maximize()
      sendMaximized(true)
    }, 180)
  }
  return false
}

// 最大化 / 还原完全以窗口当前状态为准，不做额外补尺寸：
// 之前的“记住最大化前尺寸再 setBounds”会被伪全屏的尺寸污染，导致还原不回去
function toggleMainWindowMaximize() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (windowFullscreen) {
    leaveFullscreen()
    return
  }
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
    sendMaximized(false)
  } else {
    mainWindow.maximize()
    sendMaximized(true)
  }
}

// ---- 系统托盘：常驻图标 + 玻璃小面板 ----
type TrayPlayerState = {
  title: string
  artist: string
  cover: string
  playing: boolean
  hasTrack: boolean
  platform: 'netease' | 'soda'
  vip: string
  // 桌面歌词悬浮条用：当前歌词行与收藏状态
  lyric: string
  favorite: boolean
}

const EMPTY_TRAY_STATE: TrayPlayerState = {
  title: '',
  artist: '',
  cover: '',
  playing: false,
  hasTrack: false,
  platform: 'netease',
  vip: '',
  lyric: '',
  favorite: false
}
const TRAY_PANEL_WIDTH = 340
const TRAY_PANEL_HEIGHT = 172

let tray: Tray | null = null
let trayPanel: BrowserWindow | null = null
let trayState: TrayPlayerState = { ...EMPTY_TRAY_STATE }
let isQuitting = false
let trayPanelHiddenAt = 0
let lastTrayToggleAt = 0

// ---- 桌面歌词：独立置顶的细长悬浮条 ----
const LYRIC_BAR_WIDTH = 360
const LYRIC_BAR_HEIGHT = 82
const LYRIC_BAR_ACTIONS = new Set(['prev', 'toggle', 'next', 'like'])
let lyricBar: BrowserWindow | null = null
let lyricMoveTimer: ReturnType<typeof setTimeout> | null = null

function showMainWindow() {
  if (trayPanel && !trayPanel.isDestroyed()) trayPanel.hide()
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function sendTrayState(state: TrayPlayerState) {
  trayState = { ...EMPTY_TRAY_STATE, ...state }
  if (trayPanel && !trayPanel.isDestroyed()) trayPanel.webContents.send('tray:state', trayState)
  if (lyricBar && !lyricBar.isDestroyed()) lyricBar.webContents.send('lyric:state', trayState)
  tray?.setToolTip(trayState.hasTrack ? `${trayState.title} — ${trayState.artist}` : 'DaFen Radio')
}

function trayPanelAnchor() {
  const trayBounds = tray!.getBounds()
  const display = trayBounds.width > 0 && trayBounds.height > 0
    ? screen.getDisplayMatching(trayBounds)
    : screen.getPrimaryDisplay()
  return { trayBounds, workArea: display.workArea }
}

function positionTrayPanel() {
  if (!tray || !trayPanel || trayPanel.isDestroyed()) return
  const { trayBounds, workArea } = trayPanelAnchor()
  const hasTrayBounds = trayBounds.width > 0 && trayBounds.height > 0
  const centerX = hasTrayBounds ? trayBounds.x + trayBounds.width / 2 : workArea.x + workArea.width - TRAY_PANEL_WIDTH / 2 - 12
  let x = Math.round(centerX - TRAY_PANEL_WIDTH / 2)
  let y = hasTrayBounds ? trayBounds.y - TRAY_PANEL_HEIGHT - 8 : workArea.y + workArea.height - TRAY_PANEL_HEIGHT - 8
  // 托盘在屏幕顶部时翻到下方；上下都放不下时贴住工作区边缘
  if (hasTrayBounds && y < workArea.y) y = trayBounds.y + trayBounds.height + 8
  x = Math.max(workArea.x + 8, Math.min(x, workArea.x + workArea.width - TRAY_PANEL_WIDTH - 8))
  y = Math.max(workArea.y + 8, Math.min(y, workArea.y + workArea.height - TRAY_PANEL_HEIGHT - 8))
  trayPanel.setPosition(x, y, false)
}

function createTrayPanel() {
  const panel = new BrowserWindow({
    width: TRAY_PANEL_WIDTH,
    height: TRAY_PANEL_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  panel.setAlwaysOnTop(true, 'pop-up-menu')
  panel.on('blur', () => {
    // 点托盘再点面板时，blur 会先于 click 触发；稍等一拍，让托盘 click 自己决定开合
    setTimeout(() => {
      if (!trayPanel || trayPanel.isDestroyed() || trayPanel.isFocused()) return
      if (!trayPanel.isVisible()) return
      trayPanel.hide()
      trayPanelHiddenAt = Date.now()
    }, 140)
  })
  panel.on('closed', () => {
    trayPanel = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL'])
    url.searchParams.set('tray', '1')
    panel.loadURL(url.toString())
  } else {
    panel.loadFile(join(__dirname, '../renderer/index.html'), { query: { tray: '1' } })
  }

  trayPanel = panel
}

function toggleTrayPanel() {
  if (!tray) return
  const now = Date.now()
  if (now - lastTrayToggleAt < 250) return
  lastTrayToggleAt = now

  if (trayPanel && !trayPanel.isDestroyed() && trayPanel.isVisible()) {
    trayPanel.hide()
    trayPanelHiddenAt = Date.now()
    return
  }
  if (now - trayPanelHiddenAt < 220) return

  if (!trayPanel || trayPanel.isDestroyed()) createTrayPanel()
  positionTrayPanel()
  trayPanel?.show()
  trayPanel?.focus()
  trayPanel?.webContents.send('tray:state', trayState)
}

// 桌面歌词条记住拖动位置；换显示器后夹回可见工作区
function clampLyricPos(x: number, y: number) {
  const { workArea } = screen.getDisplayNearestPoint({ x, y })
  return {
    x: Math.round(Math.min(Math.max(x, workArea.x), workArea.x + workArea.width - LYRIC_BAR_WIDTH)),
    y: Math.round(Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - LYRIC_BAR_HEIGHT))
  }
}

function defaultLyricPos() {
  const { workArea } = screen.getPrimaryDisplay()
  return {
    x: Math.round(workArea.x + (workArea.width - LYRIC_BAR_WIDTH) / 2),
    y: workArea.y + workArea.height - LYRIC_BAR_HEIGHT - 24
  }
}

function sendLyricVisibility(visible: boolean) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return
  mainWindow.webContents.send('lyric:visibility', visible)
}

function createLyricBar() {
  const saved = appSettings.lyricsPos
  const pos = saved ? clampLyricPos(saved.x, saved.y) : defaultLyricPos()
  const bar = new BrowserWindow({
    width: LYRIC_BAR_WIDTH,
    height: LYRIC_BAR_HEIGHT,
    x: pos.x,
    y: pos.y,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  bar.setAlwaysOnTop(true, 'floating')
  bar.webContents.on('did-finish-load', () => {
    if (!bar.isDestroyed()) bar.webContents.send('lyric:state', trayState)
  })
  bar.on('moved', () => {
    if (lyricMoveTimer) clearTimeout(lyricMoveTimer)
    lyricMoveTimer = setTimeout(() => {
      if (!lyricBar || lyricBar.isDestroyed()) return
      const [x, y] = lyricBar.getPosition()
      appSettings.lyricsPos = { x, y }
      saveAppSettings()
    }, 400)
  })
  bar.on('closed', () => {
    // Alt+F4 等系统方式关掉时，也要把主界面的开关状态改回来
    if (lyricMoveTimer) { clearTimeout(lyricMoveTimer); lyricMoveTimer = null }
    lyricBar = null
    sendLyricVisibility(false)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL'])
    url.searchParams.set('lyric', '1')
    bar.loadURL(url.toString())
  } else {
    bar.loadFile(join(__dirname, '../renderer/index.html'), { query: { lyric: '1' } })
  }

  lyricBar = bar
}

function toggleLyricBar(): boolean {
  if (lyricBar && !lyricBar.isDestroyed() && lyricBar.isVisible()) {
    lyricBar.hide()
    sendLyricVisibility(false)
    return false
  }
  if (!lyricBar || lyricBar.isDestroyed()) createLyricBar()
  // 不抢焦点：用户正在别的窗口工作时点开歌词也只是浮在上面
  lyricBar!.showInactive()
  lyricBar!.webContents.send('lyric:state', trayState)
  sendLyricVisibility(true)
  return true
}

function hideLyricBar() {
  if (!lyricBar || lyricBar.isDestroyed()) return
  lyricBar.hide()
  sendLyricVisibility(false)
}

function createTray() {
  if (tray) return
  const iconPath = join(__dirname, '../../resources/icon.ico')
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon.isEmpty() ? join(__dirname, '../../resources/icon-32.png') : icon)
  tray.setToolTip('DaFen Radio')
  tray.on('click', () => toggleTrayPanel())
  tray.on('right-click', () => {
    tray?.popUpContextMenu(Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => showMainWindow() },
      { type: 'separator' },
      { label: '退出 DaFen Radio', click: () => { isQuitting = true; app.quit() } }
    ]))
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1162,
    height: 705,
    minWidth: 1162,
    minHeight: 705,
    maxHeight: 900,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    transparent: true,
    backgroundColor: '#00000000',
    icon: join(__dirname, '../../resources/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  mainWindow.on('maximize', () => sendMaximized(true))
  mainWindow.on('unmaximize', () => sendMaximized(false))
  // 关闭按钮收进托盘：真正退出只走托盘菜单或 app.quit()
  mainWindow.on('close', (event) => {
    if (isQuitting || !tray) return
    event.preventDefault()
    if (windowFullscreen) leaveFullscreen()
    mainWindow?.hide()
    if (trayPanel && !trayPanel.isDestroyed() && trayPanel.isVisible()) trayPanel.hide()
  })
  // 主窗口销毁时连同隐藏的汽水签名页一起回收，避免它把应用留在后台
  mainWindow.on('closed', () => {
    mainWindow = null
    closeAllSignerSessions()
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // 原生全屏事件只在部分平台/窗口类型下触发；透明窗口靠 enterFullscreen/leaveFullscreen 自己同步
  mainWindow.on('enter-full-screen', () => {
    windowFullscreen = true
    sendFullscreen(true)
  })
  mainWindow.on('leave-full-screen', () => {
    windowFullscreen = false
    sendFullscreen(false)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 单实例：关闭窗口只是收进托盘，再点启动图标应唤回原窗口而不是开第二个应用
// 开发模式不取锁：托盘里的安装版占用同一个 userData 锁时，开发版会立即退出看不到界面
const hasSingleInstanceLock = is.dev || app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return
  electronApp.setAppUserModelId('com.dafen.radio')

  // 汽水音源放在抖音 CDN：请求只要带 Referer 就回 403 HTML，媒体元素又无法用
  // referrerPolicy 关掉它，只能在网络层剥掉，否则 <audio> 会报 Format error。
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.douyinvod.com/*'] },
    (details, callback) => {
      const headers: Record<string, string> = { ...details.requestHeaders }
      for (const key of Object.keys(headers)) {
        const name = key.toLowerCase()
        if (name === 'referer' || name === 'sec-fetch-site') delete headers[key]
      }
      callback({ requestHeaders: headers })
    }
  )

  // 记住上次选择的平台：同步读取，首帧就能套用正确主题
  ipcMain.on('settings:platform-sync', (event) => {
    event.returnValue = appSettings.platform || ''
  })
  ipcMain.on('settings:set-platform', (_, platform: string) => {
    if (platform !== 'netease' && platform !== 'soda') return
    if (appSettings.platform === platform) return
    appSettings.platform = platform
    saveAppSettings()
  })

  // 引导是否看完也存在主进程：localStorage 跟着页面来源走，开发换端口或多开会丢
  ipcMain.on('settings:onboarding-sync', (event) => {
    event.returnValue = Boolean(appSettings.onboardingDone)
  })
  ipcMain.on('settings:set-onboarding-done', () => {
    if (appSettings.onboardingDone) return
    appSettings.onboardingDone = true
    saveAppSettings()
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 窗口控制
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => toggleMainWindowMaximize())
  ipcMain.on('window:restore', () => {
    if (windowFullscreen) {
      leaveFullscreen()
      return
    }
    mainWindow?.unmaximize()
    sendMaximized(false)
  })
  ipcMain.handle('window:isMaximized', () => Boolean(mainWindow?.isMaximized()))
  ipcMain.handle('window:isFullscreen', () => windowFullscreen || Boolean(mainWindow?.isFullScreen()))
  ipcMain.on('window:close', () => mainWindow?.close())

  // 托盘面板：渲染进程同步播放状态，面板按钮回传给主窗口执行
  ipcMain.on('tray:state', (_, state: TrayPlayerState) => sendTrayState(state))
  ipcMain.handle('tray:get-state', () => trayState)
  ipcMain.on('tray:control', (_, action: string) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (action !== 'prev' && action !== 'toggle' && action !== 'next' && action !== 'like') return
    mainWindow.webContents.send('tray:command', action)
  })
  ipcMain.on('tray:show-main', () => showMainWindow())

  // 桌面歌词条：开关、状态、控制回传
  ipcMain.handle('lyric:toggle', () => toggleLyricBar())
  ipcMain.handle('lyric:is-visible', () => Boolean(lyricBar && !lyricBar.isDestroyed() && lyricBar.isVisible()))
  ipcMain.handle('lyric:get-state', () => trayState)
  ipcMain.on('lyric:hide', () => hideLyricBar())
  ipcMain.on('lyric:show-main', () => showMainWindow())
  ipcMain.on('lyric:control', (_, action: string) => {
    if (!LYRIC_BAR_ACTIONS.has(action)) return
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('lyric:command', action)
  })

  // 全屏控制：以主进程记录的状态为准，避免透明窗口 isFullScreen() 失真
  ipcMain.handle('window:exitFullscreen', () => leaveFullscreen())
  ipcMain.handle('window:toggleFullscreen', () => {
    return windowFullscreen ? leaveFullscreen() : enterFullscreen()
  })

  // 窗口置顶
  ipcMain.handle('window:setAlwaysOnTop', (_, enable: boolean) => {
    mainWindow?.setAlwaysOnTop(Boolean(enable))
    return { success: true, data: Boolean(mainWindow?.isAlwaysOnTop()) }
  })

  // 设置页：数据目录与缓存
  ipcMain.handle('app:info', () => ({
    success: true,
    data: { version: app.getVersion(), dataDir: DATA_DIR }
  }))
  ipcMain.handle('app:openDataDir', async () => {
    try {
      mkdirSync(DATA_DIR, { recursive: true })
      const error = await shell.openPath(DATA_DIR)
      return error ? { success: false, error } : { success: true }
    } catch (error: any) {
      return { success: false, error: error?.message || '打开数据目录失败' }
    }
  })
  // 缓存 = Chromium 的 HTTP 缓存 + 网易云接口的 netease-cache（同时充当 worker 临时目录）
  ipcMain.handle('app:cacheInfo', async () => {
    try {
      return { success: true, data: { bytes: await totalCacheBytes() } }
    } catch (error: any) {
      return { success: false, error: error?.message || '读取缓存大小失败' }
    }
  })
  ipcMain.handle('app:clearCache', async () => {
    try {
      // 清理前后都强制实测，不能拿 TTL 缓存算释放量
      const before = await measureCacheBytes()
      try { await session.defaultSession.clearCache() } catch (e) { console.warn('[Cache] 清理 HTTP 缓存失败:', e) }
      const cacheDir = neteaseCacheDir()
      try { await rm(cacheDir, { recursive: true, force: true }) } catch (e) { console.warn('[Cache] 删除网易云缓存失败:', e) }
      try { await mkdir(cacheDir, { recursive: true }) } catch (e) { console.warn('[Cache] 重建网易云缓存目录失败:', e) }
      const after = await measureCacheBytes()
      cacheSizeCache = { bytes: after, at: Date.now() }
      return { success: true, data: { freedBytes: Math.max(0, before - after), bytes: after } }
    } catch (error: any) {
      return { success: false, error: error?.message || '清理缓存失败' }
    }
  })

  // 搜索
  ipcMain.handle('netease:search', async (_, keyword: string) => {
    try { return { success: true, data: await searchNetease(keyword) } }
    catch (error: any) { return { success: false, error: error.message } }
  })
  ipcMain.handle('netease:library', async () => {
    try { return { success: true, data: await getNeteaseLibrary() } }
    catch (error: any) { return { success: false, error: error.message } }
  })
  ipcMain.handle('netease:collection', async (_, kind: string, collectionId: string) => {
    try { return { success: true, data: await getNeteaseCollectionTracks(kind, collectionId) } }
    catch (error: any) { return { success: false, error: error.message } }
  })
  ipcMain.handle('netease:liked', async () => {
    try { return { success: true, data: await getNeteaseLikedSongs() } }
    catch (error: any) { return { success: false, error: error.message } }
  })
  ipcMain.handle('netease:heartbeat', async (_, songId: string, playlistId: string, count?: number) => {
    try { return { success: true, data: await getNeteaseHeartbeat(songId, playlistId, count) } }
    catch (error: any) { return { success: false, error: error.message } }
  })
  ipcMain.handle('netease:personal-fm', async (_, count?: number) => {
    try { return { success: true, data: await getNeteasePersonalFm(count) } }
    catch (error: any) { return { success: false, error: error.message } }
  })
  ipcMain.handle('netease:like', async (_, songId: string, like: boolean) => {
    try { return { success: true, data: await setNeteaseLike(songId, like) } }
    catch (error: any) { return { success: false, error: error.message } }
  })
  ipcMain.handle('netease:scrobble', async (_, songId: string, playedSeconds: number, sourceId?: string) => {
    try { return { success: true, data: await scrobbleNetease(songId, playedSeconds, sourceId) } }
    catch (error: any) { return { success: false, error: error.message } }
  })
  ipcMain.handle('netease:lyrics', async (_, songId: string) => {
    try { return { success: true, data: await getNeteaseLyrics(songId) } }
    catch (error: any) { return { success: false, error: error.message } }
  })
  ipcMain.handle('netease:lyricsSearch', async (_, name: string, singer: string, duration: number) => {
    try {
      const online = await searchOnlineLyrics(name, singer, duration)
      if (online?.lyric) return { success: true, data: online }
      return { success: true, data: await searchNeteaseLyrics(name, singer, duration) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
  ipcMain.handle('netease:configured', async () => ({ success: true, data: await hasNeteaseSession() }))
  ipcMain.handle('netease:loginQr', async () => {
    try { return { success: true, data: await beginNeteaseLogin() } }
    catch (error: any) { return { success: false, error: error.message } }
  })
  ipcMain.handle('netease:loginState', () => ({ success: true, data: getNeteaseLoginState() }))
  ipcMain.handle('netease:logout', async () => {
    try { await logoutNetease(); return { success: true } }
    catch (error: any) { return { success: false, error: error.message } }
  })
  // 播放地址按平台分流：汽水目前只有匿名试听片段
  ipcMain.handle('player:play', async (_, songId: string, platform: string) => {
    try {
      const data = platform === 'soda' ? await getSodaSongUrl(songId) : await getNeteaseSongUrl(songId)
      return { success: true, data }
    } catch (error: any) { return { success: false, error: error.message } }
  })

  // 汽水音乐：推荐（需登录）、歌单、歌单搜索、歌词
  ipcMain.handle('soda:recommend', async (_, force?: boolean) => {
    try { return { success: true, data: await getSodaRecommendations(50, Boolean(force)) } }
    catch (error: any) { return { success: false, error: error.message } }
  })
  ipcMain.handle('soda:feed', async (_, count = 50) => {
    try { return { success: true, data: await getSodaFeedTracks(count) } }
    catch (error: any) { return { success: false, error: error.message } }
  })
  ipcMain.handle('soda:loginQr', async () => {
    try { return { success: true, data: await beginSodaLogin() } }
    catch (error: any) { return { success: false, error: error.message } }
  })
  ipcMain.handle('soda:loginState', () => ({ success: true, data: getSodaLoginState() }))
  ipcMain.handle('soda:configured', () => ({ success: true, data: hasSodaSession() }))
  ipcMain.handle('soda:logout', () => {
    try { logoutSoda(); return { success: true } }
    catch (error: any) { return { success: false, error: error.message } }
  })
  ipcMain.handle('soda:library', async () => {
    try { return { success: true, data: await getSodaLibrary() } }
    catch (error: any) { return { success: false, error: error.message } }
  })
  ipcMain.handle('soda:playlist', async (_, playlistId: string) => {
    try { return { success: true, data: await getSodaPlaylistTracks(playlistId) } }
    catch (error: any) { return { success: false, error: error.message } }
  })
  ipcMain.handle('soda:searchPlaylists', async (_, keyword: string) => {
    try { return { success: true, data: await searchSodaPlaylists(keyword) } }
    catch (error: any) { return { success: false, error: error.message } }
  })
  ipcMain.handle('soda:lyrics', async (_, songId: string) => {
    try { return { success: true, data: await getSodaLyrics(songId) } }
    catch (error: any) { return { success: false, error: error.message } }
  })

  // 封面取色：主进程解码图片，避免渲染进程的跨域限制
  ipcMain.handle('theme:palette', async (_, url: string) => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
      if (!response.ok) throw new Error(`图片请求失败（HTTP ${response.status}）`)
      const buffer = Buffer.from(await response.arrayBuffer())
      const image = nativeImage.createFromBuffer(buffer)
      if (image.isEmpty()) throw new Error('图片解码失败')
      const small = image.resize({ width: 24, height: 24, quality: 'good' })
      const bitmap = small.toBitmap() // BGRA
      let red = 0, green = 0, blue = 0, count = 0
      for (let i = 0; i < bitmap.length; i += 4) {
        const b = bitmap[i], g = bitmap[i + 1], r = bitmap[i + 2]
        if (Math.max(r, g, b) - Math.min(r, g, b) > 24 && (r + g + b) / 3 > 40) {
          red += r; green += g; blue += b; count++
        }
      }
      if (!count) throw new Error('封面没有可用的主色')
      const accent = `rgb(${Math.round(red / count)}, ${Math.round(green / count)}, ${Math.round(blue / count)})`
      return { success: true, data: { accent, glow: accent.replace('rgb(', 'rgba(').replace(')', ', .3)') } }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
  // 收藏数据存储（存到当前数据目录的 favorites.json）
  ipcMain.handle('favorites:load', () => {
    try {
      const file = favoritesFile()
      console.log('[Favorites] 加载:', file)
      if (!existsSync(file)) return []
      const raw = readFileSync(file, 'utf-8')
      const data = JSON.parse(raw)
      if (!Array.isArray(data)) return []
      // 清掉早期 LX 音源时期留下的 kuwo/qq 等本地歌曲记录，它们已经无法播放
      const legacySources = new Set(['kuwo', 'kugou', 'qq', 'migu', 'baidu', 'xiami', 'joox'])
      const cleaned = data.filter((item: any) => !item?.source || !legacySources.has(String(item.source)))
      if (cleaned.length !== data.length) {
        writeFileSync(file, JSON.stringify(cleaned, null, 2), 'utf-8')
        console.log('[Favorites] 已清理旧音源记录:', data.length - cleaned.length, '首')
      }
      console.log('[Favorites] 已加载', cleaned.length, '首歌曲')
      return cleaned
    } catch (e: any) {
      console.warn('[Favorites] 加载失败:', e.message)
      return []
    }
  })

  // 异步落盘：登录后同步上千首收藏时，避免阻塞主进程把窗口卡住
  ipcMain.handle('favorites:save', async (_, data: any[]) => {
    try {
      await mkdir(DATA_DIR, { recursive: true })
      const file = favoritesFile()
      await writeFile(file, JSON.stringify(data), 'utf-8')
      console.log('[Favorites] 已保存', data.length, '首歌曲到', file)
      return true
    } catch (e: any) {
      console.warn('[Favorites] 保存失败:', e.message)
      return false
    }
  })

  createWindow()
  createTray()

  app.on('activate', () => showMainWindow())
})

app.on('window-all-closed', () => {
  // 托盘常驻时窗口只是隐藏；只有真正退出（托盘菜单）或托盘不可用才结束进程
  if (process.platform !== 'darwin' && (!tray || isQuitting)) {
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  tray?.destroy()
  tray = null
  stopNeteaseApi()
  stopSignerAssets()
})
