import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // 窗口控制
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowRestore: () => ipcRenderer.send('window:restore'),
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>,
  windowIsFullscreen: () => ipcRenderer.invoke('window:isFullscreen') as Promise<boolean>,
  onMaximizeChange: (callback: (maximized: boolean) => void) => {
    const handler = (_: any, maximized: boolean) => callback(maximized)
    ipcRenderer.on('window:maximized-change', handler)
    return () => ipcRenderer.removeListener('window:maximized-change', handler)
  },
  windowClose: () => ipcRenderer.send('window:close'),
  exitFullscreen: () => ipcRenderer.invoke('window:exitFullscreen') as Promise<boolean>,
  toggleFullscreenWindow: () => ipcRenderer.invoke('window:toggleFullscreen') as Promise<boolean>,
  setAlwaysOnTop: (enable: boolean) => ipcRenderer.invoke('window:setAlwaysOnTop', enable),
  onFullscreenChange: (callback: (fullscreen: boolean) => void) => {
    const handler = (_: any, fullscreen: boolean) => callback(fullscreen)
    ipcRenderer.on('window:fullscreen-change', handler)
    return () => ipcRenderer.removeListener('window:fullscreen-change', handler)
  },

  // 托盘：主窗口同步播放状态，小面板回传控制指令
  traySendState: (state: {
    title: string
    artist: string
    cover: string
    playing: boolean
    hasTrack: boolean
    platform: 'netease' | 'soda'
    vip: string
    lyric: string
    favorite: boolean
  }) => ipcRenderer.send('tray:state', state),
  trayGetState: () => ipcRenderer.invoke('tray:get-state'),
  onTrayState: (callback: (state: any) => void) => {
    const handler = (_: any, state: any) => callback(state)
    ipcRenderer.on('tray:state', handler)
    return () => ipcRenderer.removeListener('tray:state', handler)
  },
  onTrayCommand: (callback: (action: 'prev' | 'toggle' | 'next' | 'like') => void) => {
    const handler = (_: any, action: 'prev' | 'toggle' | 'next' | 'like') => callback(action)
    ipcRenderer.on('tray:command', handler)
    return () => ipcRenderer.removeListener('tray:command', handler)
  },
  trayControl: (action: 'prev' | 'toggle' | 'next') => ipcRenderer.send('tray:control', action),
  trayShowMain: () => ipcRenderer.send('tray:show-main'),

  // 桌面歌词悬浮条
  toggleLyricBar: () => ipcRenderer.invoke('lyric:toggle') as Promise<boolean>,
  lyricBarVisible: () => ipcRenderer.invoke('lyric:is-visible') as Promise<boolean>,
  onLyricVisibility: (callback: (visible: boolean) => void) => {
    const handler = (_: any, visible: boolean) => callback(visible)
    ipcRenderer.on('lyric:visibility', handler)
    return () => ipcRenderer.removeListener('lyric:visibility', handler)
  },
  lyricGetState: () => ipcRenderer.invoke('lyric:get-state'),
  onLyricState: (callback: (state: any) => void) => {
    const handler = (_: any, state: any) => callback(state)
    ipcRenderer.on('lyric:state', handler)
    return () => ipcRenderer.removeListener('lyric:state', handler)
  },
  lyricControl: (action: 'prev' | 'toggle' | 'next' | 'like') => ipcRenderer.send('lyric:control', action),
  onLyricCommand: (callback: (action: 'prev' | 'toggle' | 'next' | 'like') => void) => {
    const handler = (_: any, action: 'prev' | 'toggle' | 'next' | 'like') => callback(action)
    ipcRenderer.on('lyric:command', handler)
    return () => ipcRenderer.removeListener('lyric:command', handler)
  },
  lyricHide: () => ipcRenderer.send('lyric:hide'),
  lyricShowMain: () => ipcRenderer.send('lyric:show-main'),

  // 网易云登录、搜索与音频地址
  neteaseSearch: (keyword: string) => ipcRenderer.invoke('netease:search', keyword),
  neteaseLibrary: () => ipcRenderer.invoke('netease:library'),
  neteaseCollection: (kind: string, collectionId: string) => ipcRenderer.invoke('netease:collection', kind, collectionId),
  neteaseLiked: () => ipcRenderer.invoke('netease:liked'),
  neteaseHeartbeat: (songId: string, playlistId: string, count = 30) => ipcRenderer.invoke('netease:heartbeat', songId, playlistId, count),
  neteasePersonalFm: (count = 30) => ipcRenderer.invoke('netease:personal-fm', count),
  neteaseLike: (songId: string, like: boolean) => ipcRenderer.invoke('netease:like', songId, like),
  neteaseScrobble: (songId: string, playedSeconds: number, sourceId = '') => ipcRenderer.invoke('netease:scrobble', songId, playedSeconds, sourceId),
  neteaseLyrics: (songId: string) => ipcRenderer.invoke('netease:lyrics', songId),
  neteaseLyricsSearch: (name: string, singer: string, duration = 0) => ipcRenderer.invoke('netease:lyricsSearch', name, singer, duration),
  neteaseConfigured: () => ipcRenderer.invoke('netease:configured'),
  neteaseSessionInfo: () => ipcRenderer.invoke('netease:sessionInfo') as Promise<{ success: boolean; data?: { connected: boolean; expired: boolean }; error?: string }>,
  neteaseLoginQr: () => ipcRenderer.invoke('netease:loginQr'),
  neteaseLoginState: () => ipcRenderer.invoke('netease:loginState'),
  onNeteaseLoginState: (callback: (state: any) => void) => {
    const handler = (_: any, state: any) => callback(state)
    ipcRenderer.on('netease:login-state', handler)
    return () => ipcRenderer.removeListener('netease:login-state', handler)
  },
  neteaseLogout: () => ipcRenderer.invoke('netease:logout'),

  // 汽水音乐：推荐歌单、歌单详情、歌单搜索、试听与歌词
  sodaRecommend: (force = false) => ipcRenderer.invoke('soda:recommend', force),
  sodaFeed: (count = 50) => ipcRenderer.invoke('soda:feed', count),
  sodaPlaylist: (playlistId: string) => ipcRenderer.invoke('soda:playlist', playlistId),
  sodaSearchPlaylists: (keyword: string) => ipcRenderer.invoke('soda:searchPlaylists', keyword),
  sodaLyrics: (songId: string) => ipcRenderer.invoke('soda:lyrics', songId),
  sodaLoginQr: () => ipcRenderer.invoke('soda:loginQr'),
  sodaLoginState: () => ipcRenderer.invoke('soda:loginState'),
  onSodaLoginState: (callback: (state: any) => void) => {
    const handler = (_: any, state: any) => callback(state)
    ipcRenderer.on('soda:login-state', handler)
    return () => ipcRenderer.removeListener('soda:login-state', handler)
  },
  sodaConfigured: () => ipcRenderer.invoke('soda:configured'),
  sodaSessionInfo: () => ipcRenderer.invoke('soda:sessionInfo') as Promise<{ success: boolean; data?: { connected: boolean; expired: boolean }; error?: string }>,
  sodaLogout: () => ipcRenderer.invoke('soda:logout'),
  sodaLibrary: () => ipcRenderer.invoke('soda:library'),

  // 返回当前平台的音频地址与试听时长，由应用内播放器播放
  playerPlay: (songId: string, platform = 'netease') => ipcRenderer.invoke('player:play', songId, platform),

  // 从封面图片提取主色（动态色彩系统）
  themePalette: (url: string) => ipcRenderer.invoke('theme:palette', url),

  // 应用信息与本地数据
  appInfo: () => ipcRenderer.invoke('app:info'),
  openDataDir: () => ipcRenderer.invoke('app:openDataDir'),
  cacheInfo: () => ipcRenderer.invoke('app:cacheInfo'),
  clearCache: () => ipcRenderer.invoke('app:clearCache'),

  // 收藏数据（存到当前数据目录）
  favoritesLoad: () => ipcRenderer.invoke('favorites:load'),
  favoritesSave: (data: any[]) => ipcRenderer.invoke('favorites:save', data),

  // 设置：上次选择的平台（同步读取，首帧即可用）
  initialPlatform: ipcRenderer.sendSync('settings:platform-sync') as '' | 'netease' | 'soda',
  setPlatform: (platform: 'netease' | 'soda') => ipcRenderer.send('settings:set-platform', platform),
  // 新手引导完成标记：存主进程，避免开发换端口或多开时 localStorage 丢标记
  initialOnboardingDone: ipcRenderer.sendSync('settings:onboarding-sync') as boolean,
  setOnboardingDone: () => ipcRenderer.send('settings:set-onboarding-done')
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
