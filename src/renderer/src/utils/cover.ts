export const FALLBACK_COVER = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"%3E%3Crect width="240" height="240" fill="%2316162c"/%3E%3Ccircle cx="120" cy="120" r="78" fill="none" stroke="%238d86f2" stroke-opacity=".28"/%3E%3Ccircle cx="120" cy="120" r="48" fill="none" stroke="%238d86f2" stroke-opacity=".18"/%3E%3Ccircle cx="120" cy="120" r="14" fill="%238d86f2" fill-opacity=".55"/%3E%3C/svg%3E'

// 网易云 CDN 不带 param 就回全尺寸大图（1400px / 数百 KB），几十张并发会互相挤兑，
// 出现白底卡片和逐张缓慢渲染；统一按用途压到小图
const neteaseThumbCache = new Map<string, string>()
export function neteaseThumb(url: string, size = '480y480') {
  if (!url) return url
  const key = `${size}|${url}`
  const cached = neteaseThumbCache.get(key)
  if (cached) return cached
  let next = url
  try {
    const parsed = new URL(url)
    if (/(^|\.)music\.126\.net$/i.test(parsed.hostname)) {
      parsed.searchParams.set('param', size)
      next = parsed.toString()
    }
  } catch {
    // 非绝对地址或本地兜底图保持原样
  }
  neteaseThumbCache.set(key, next)
  return next
}

// 未登录、跨平台旧链接或封面过期时 <img> 会静默失败，这里退回默认封面而不是留白。
// 封面池扩到近两百张后，首屏并发会把 CDN 挤兑出整批拒图（连续一排占位盘）：
// 先隔一小会儿用带 retry 标记的地址重试一次，仍失败才落占位盘
export function fallbackCoverOnError(event: Event) {
  const image = event.target as HTMLImageElement | null
  if (!image || image.src === FALLBACK_COVER) return
  const original = image.dataset.originalSrc || image.src
  const retried = Number(image.dataset.retryCount || 0)
  if (retried < 1) {
    image.dataset.retryCount = String(retried + 1)
    window.setTimeout(() => {
      if (image.src === FALLBACK_COVER) return
      image.src = `${original}${original.includes('?') ? '&' : '?'}retry=${retried + 1}`
    }, 700)
    return
  }
  image.src = FALLBACK_COVER
}

// 封面必须真正解码完成才算就绪，onload 早于解码会让图片在揭开遮罩后一张张补上。
// 12s 只是防止单张请求挂死的兜底，正常网络下都会提前结束。
// 同时限制全局并发：几百张同时解码会互相挤兑，整批被 CDN 拒图
const LOAD_CONCURRENCY = 6
let activeLoads = 0
const loadWaiting: (() => void)[] = []
const loadedCovers = new Set<string>()

function acquireLoadSlot(): Promise<void> {
  return new Promise(resolve => {
    const start = () => {
      activeLoads += 1
      resolve()
    }
    if (activeLoads < LOAD_CONCURRENCY) start()
    else loadWaiting.push(start)
  })
}

function releaseLoadSlot() {
  activeLoads -= 1
  const next = loadWaiting.shift()
  if (next) next()
}

export function loadCover(url: string) {
  // 同一张封面解码过一次就不再重复下载解码（照片墙/列表来回切换时最明显）
  if (loadedCovers.has(url)) return Promise.resolve()
  return new Promise<void>(resolve => {
    let settled = false
    let timer = 0
    const image = new Image()

    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      releaseLoadSlot()
      if (image.complete && image.naturalWidth > 0) loadedCovers.add(url)
      resolve()
    }

    void acquireLoadSlot().then(() => {
      image.onload = () => {
        image.decode().then(finish, finish)
      }
      image.onerror = finish
      image.src = url
      timer = window.setTimeout(finish, 12000)
    })
  })
}
