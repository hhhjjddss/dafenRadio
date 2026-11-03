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

// 未登录、跨平台旧链接或封面过期时 <img> 会静默失败，这里退回默认封面而不是留白
export function fallbackCoverOnError(event: Event) {
  const image = event.target as HTMLImageElement | null
  if (!image || image.src === FALLBACK_COVER) return
  image.src = FALLBACK_COVER
}

// 封面必须真正解码完成才算就绪，onload 早于解码会让图片在揭开遮罩后一张张补上。
// 12s 只是防止单张请求挂死的兜底，正常网络下都会提前结束。
export function loadCover(url: string) {
  return new Promise<void>(resolve => {
    const image = new Image()
    let settled = false
    let timer = 0
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve()
    }
    image.onload = () => {
      image.decode().then(finish, finish)
    }
    image.onerror = finish
    image.src = url
    timer = window.setTimeout(finish, 12000)
  })
}
