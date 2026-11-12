<template>
  <div class="login-backdrop" @click.self="emit('close')">
    <section class="login-window" role="dialog" aria-modal="true" :aria-label="`${brandName}账号`" :aria-busy="Boolean(loggedIn && syncing)">
      <header class="login-header">
        <img class="login-logo" :src="brandLogo" alt="" />
        <div class="login-title">
          <h2>{{ brandName }}</h2>
          <span class="status-pill" :class="{ online: loggedIn }"><i></i>{{ loggedIn ? '已连接' : expired ? '登录已过期' : busy ? '连接中' : '未连接' }}</span>
        </div>
        <button class="login-close" aria-label="关闭账号" @click="emit('close')"><X :size="15" /></button>
      </header>

      <main class="login-body">
        <div class="login-hero">
          <img class="hero-watermark" :src="brandLogo" alt="" aria-hidden="true" />
          <span class="login-aurora" aria-hidden="true"></span>
          <div class="login-copy">
            <span class="step-label mono">{{ syncing ? 'SYNCING' : loggedIn ? 'CONNECTED' : expired ? 'SESSION EXPIRED' : error ? 'TRY AGAIN' : scanned ? 'CONFIRM ON PHONE' : qrImage ? 'SCAN TO SIGN IN' : 'SECURE SIGN IN' }}</span>
            <h3>{{ syncing ? '正在同步音乐空间' : loggedIn ? '账号已就绪' : expired ? '登录状态已过期' : error ? '二维码暂时不可用' : scanned ? '请在手机上确认登录' : qrImage ? scanTitle : `登录${brandName}` }}</h3>
            <p>{{ syncing ? '登录成功，正在整理你的歌单与收藏…' : loggedIn ? '登录凭据已安全保存在这台设备，失效时会明确提示重新登录。' : expired ? '保存的登录凭据已失效，重新扫码即可恢复歌单与收藏。' : error ? errorHint : scanned ? (loginMessage || '已扫码，请在手机上确认登录') : qrImage ? (loginMessage || scanHint) : idleHint }}</p>
            <p v-if="error" class="login-error" role="alert"><AlertCircle :size="13" /><span>{{ error }}</span></p>
            <div class="login-actions">
              <button v-if="!loggedIn" class="text-action" :disabled="busy" @click="startLogin">
                <QrCode v-if="!qrImage && !error && !busy" :size="13" />
                <RefreshCw v-else :size="13" />
                {{ busy ? '正在获取二维码…' : qrImage || error ? '刷新二维码' : `登录${brandName}` }}
              </button>
              <button v-else-if="syncing" class="text-action" @click="emit('close')"><ArrowRight :size="13" /> 进入应用</button>
              <button v-else class="text-action" :disabled="busy" @click="startLogin"><ExternalLink :size="13" /> 切换账号</button>
              <button v-if="loggedIn" class="text-action danger" :disabled="loggingOut" @click="logout">
                <LogOut :size="13" />{{ loggingOut ? '退出中…' : '退出登录' }}
              </button>
            </div>
          </div>

          <div class="qr-frame" :class="{ live: qrImage && !loggedIn, online: loggedIn, failed: !qrImage && !busy && !!error }">
            <div v-if="qrImage && !loggedIn" class="qr-box">
              <img :src="qrImage" :alt="`${brandName}扫码登录二维码`" />
              <span class="qr-scan" aria-hidden="true"></span>
            </div>
            <div v-else-if="loggedIn && syncing" class="qr-state sync-state">
              <span class="sync-vinyl" aria-hidden="true"><Disc3 :size="30" /><i></i></span>
              <small>正在整理音乐空间</small>
              <span class="sync-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
            </div>
            <div v-else-if="loggedIn" class="qr-state">
              <span class="qr-check"><Check :size="20" /></span>
              <small>已安全连接</small>
            </div>
            <div v-else-if="expired" class="qr-state">
              <span class="qr-fail"><AlertCircle :size="20" /></span>
              <small>登录已过期</small>
            </div>
            <div v-else-if="busy" class="qr-state">
              <span class="qr-spinner"></span>
              <small>正在获取二维码</small>
            </div>
            <div v-else-if="error" class="qr-state">
              <span class="qr-fail"><AlertCircle :size="20" /></span>
              <small>二维码不可用</small>
            </div>
            <div v-else class="qr-state">
              <span class="qr-idle"><QrCode :size="20" /></span>
              <small>准备获取二维码</small>
            </div>
          </div>
        </div>

        <div class="verify-flow" aria-label="登录流程">
          <div class="flow-step" :class="{ done: qrImage || scanned || loggedIn, active: busy && !qrImage }">
            <span class="flow-icon"><QrCode :size="14" /></span>
            <div class="flow-copy"><strong>获取二维码</strong><small>{{ qrImage || scanned || loggedIn ? '已生成' : busy ? '正在获取' : '准备扫码' }}</small></div>
          </div>
          <span class="flow-link" :class="{ lit: qrImage || scanned || loggedIn, flowing: !!qrImage && !scanned && !loggedIn }"></span>
          <div class="flow-step" :class="{ done: scanned || loggedIn }">
            <span class="flow-icon"><ScanLine :size="14" /></span>
            <div class="flow-copy"><strong>扫码成功</strong><small>{{ scanned || loggedIn ? '已扫码' : '手机扫码' }}</small></div>
          </div>
          <span class="flow-link" :class="{ lit: scanned || loggedIn, flowing: scanned && !loggedIn }"></span>
          <div class="flow-step" :class="{ done: loggedIn, active: scanned && !loggedIn }">
            <span class="flow-icon"><Smartphone :size="14" /></span>
            <div class="flow-copy"><strong>手机确认</strong><small>{{ loggedIn ? '已确认' : scanned ? '请在手机上确认' : qrImage ? '等待手机确认' : '在手机端确认' }}</small></div>
          </div>
          <span class="flow-link" :class="{ lit: loggedIn, flowing: loggedIn && syncing }"></span>
          <div class="flow-step" :class="{ done: loggedIn && !syncing, active: loggedIn && syncing }">
            <span class="flow-icon"><Check :size="14" /></span>
            <div class="flow-copy"><strong>完成同步</strong><small>{{ syncing ? '正在同步…' : loggedIn ? '已同步' : '自动同步歌单' }}</small></div>
          </div>
          <span v-if="loggedIn && syncing" class="sync-track" aria-hidden="true"><i></i></span>
        </div>
      </main>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { AlertCircle, ArrowRight, Check, Disc3, ExternalLink, LogOut, QrCode, RefreshCw, ScanLine, Smartphone, X } from '@lucide/vue'
import neteaseLogo from '../assets/platforms/netease.png'
import sodaLogo from '../assets/platforms/soda.png'

const props = defineProps<{ syncing?: boolean; platform?: 'netease' | 'soda' }>()

const emit = defineEmits<{ close: []; 'logged-out': [platform: 'netease' | 'soda']; expired: [] }>()

const isSoda = computed(() => props.platform === 'soda')
const brandName = computed(() => isSoda.value ? '汽水音乐' : '网易云音乐')
const brandLogo = computed(() => isSoda.value ? sodaLogo : neteaseLogo)
const scanTitle = computed(() => isSoda.value ? '用汽水音乐 App 扫码' : '用网易云音乐 App 扫码')
const scanHint = computed(() => isSoda.value
  ? '在汽水音乐 App 里扫一扫并确认，登录凭据会加密保存。'
  : '二维码仅用于本机登录确认，登录凭据会加密保存。')
const idleHint = computed(() => isSoda.value
  ? '登录后同步你在汽水的歌单与收藏；不登录也可以浏览推荐与试听。'
  : '登录后同步歌单、收藏与每日推荐；不登录也可以直接搜索试听。')
const loggedIn = ref(false)
const expired = ref(false)
const loggingOut = ref(false)
const qrImage = ref('')
const busy = ref(false)
const error = ref('')
const loginMessage = ref('')
const phase = ref('')
// 主进程轮询到的「已扫码、待确认」阶段
const scanned = computed(() => phase.value === 'scanned')
// 主进程负责 5 秒软冷却与继续轮询；这里只做文案区分，不再自己停掉自动刷新
function isRateLimitedText(text: string) {
  return /频繁|风控|受限|rate\s*limit|too\s*many|429/i.test(text)
}
const errorHint = computed(() => isRateLimitedText(error.value)
  ? '登录请求太频繁，稍等片刻再点刷新；期间浏览推荐和试听不受影响。'
  : '刷新一次二维码通常就能恢复。')
let disposed = false
// 每次取码都推进序号，避免旧请求覆盖新二维码
let attempt = 0
let busyTimer: ReturnType<typeof setTimeout> | null = null
let offLoginState: (() => void) | null = null

function clearBusyTimer() {
  if (busyTimer) clearTimeout(busyTimer)
  busyTimer = null
}

function applyLoginState(state: any) {
  if (!state || typeof state !== 'object') return
  const next = String(state.phase || '')
  phase.value = next
  if (next === 'success') {
    clearBusyTimer()
    busy.value = false
    loggedIn.value = true
    expired.value = false
    qrImage.value = ''
    loginMessage.value = state.message || '扫码成功，正在同步歌单…'
    error.value = ''
    return
  }
  if (next === 'waiting') {
    if (state.qrImage) {
      clearBusyTimer()
      busy.value = false
      qrImage.value = state.qrImage
      loggedIn.value = false
      error.value = ''
    } else {
      // 主进程正在取码：锁住按钮，避免用户重复点击又发一轮请求
      busy.value = true
      clearBusyTimer()
      busyTimer = setTimeout(() => {
        if (disposed || phase.value !== 'waiting' || qrImage.value) return
        busy.value = false
        phase.value = 'error'
        error.value = '获取二维码超时，请检查网络后重试。'
      }, 25000)
    }
    if (state.message) loginMessage.value = state.message
    return
  }
  if (next === 'scanned') {
    clearBusyTimer()
    busy.value = false
    if (state.qrImage) {
      qrImage.value = state.qrImage
      loggedIn.value = false
      error.value = ''
    }
    loginMessage.value = state.message || '已扫码，请在手机上确认登录'
    return
  }
  if (next === 'expired' || next === 'error') {
    clearBusyTimer()
    busy.value = false
    qrImage.value = ''
    loginMessage.value = ''
    error.value = state.error || (next === 'expired' ? '二维码已过期，请重新获取' : '登录失败，请刷新二维码重试')
    return
  }
  if (next === 'idle') {
    clearBusyTimer()
    busy.value = false
    qrImage.value = ''
    loginMessage.value = ''
    error.value = ''
  }
}

async function startLogin() {
  if (busy.value) return
  console.info(`[登录] ${brandName.value} 开始获取二维码 (platform=${props.platform})`)
  const token = ++attempt
  busy.value = true
  error.value = ''
  qrImage.value = ''
  loginMessage.value = '等待扫码确认…'
  loggedIn.value = false
  expired.value = false
  phase.value = 'waiting'
  clearBusyTimer()
  // 主进程取码最长可能卡在服务启动上：到点先放开按钮，避免刷新按钮一直不可用
  busyTimer = setTimeout(() => {
    if (disposed || token !== attempt) return
    busy.value = false
    phase.value = 'error'
    error.value = '获取二维码超时，请检查网络后重试。'
  }, 20000)
  try {
    const result = isSoda.value ? await window.api.sodaLoginQr() : await window.api.neteaseLoginQr()
    if (disposed || token !== attempt) return
    if (!result.success || !result.data) throw new Error(result.error || '获取二维码失败，请检查网络后重试。')
    const image = typeof result.data === 'string' ? result.data : result.data?.qrImage || ''
    if (!image) throw new Error(result.error || '没有收到二维码图片，请稍后重试。')
    error.value = ''
    qrImage.value = image
    loginMessage.value = '等待手机扫码…'
    phase.value = 'waiting'
    console.info(`[登录] ${brandName.value} 二维码已拿到`)
  } catch (reason: any) {
    console.error(`[登录] ${brandName.value} 取码失败:`, reason?.message || reason)
    if (disposed || token !== attempt) return
    loginMessage.value = ''
    error.value = reason.message || '获取二维码失败，请稍后重试。'
    phase.value = 'error'
  } finally {
    if (token === attempt) {
      clearBusyTimer()
      busy.value = false
    }
  }
}

async function logout() {
  if (loggingOut.value) return
  loggingOut.value = true
  attempt++
  error.value = ''
  try {
    const logoutApi = isSoda.value ? window.api.sodaLogout : window.api.neteaseLogout
    if (typeof logoutApi !== 'function') throw new Error('退出登录需要完全重启应用后生效')
    const result = await logoutApi()
    if (!result?.success) throw new Error(result?.error || '退出登录失败')
    clearBusyTimer()
    loggedIn.value = false
    expired.value = false
    busy.value = false
    qrImage.value = ''
    loginMessage.value = ''
    phase.value = 'idle'
    // 浮层可能已被关闭，但登出结果必须同步给 App，避免界面停留在旧账号
    emit('logged-out', isSoda.value ? 'soda' : 'netease')
  } catch (reason: any) {
    error.value = reason.message || '退出登录失败，请稍后重试。'
  } finally {
    loggingOut.value = false
  }
}

onMounted(async () => {
  // 轮询在主进程，浮层只负责展示状态：关掉浮层也不会丢掉手机上的确认
  const stateListener = isSoda.value ? window.api.onSodaLoginState : window.api.onNeteaseLoginState
  offLoginState = stateListener?.((state: any) => {
    if (!disposed) applyLoginState(state)
  }) ?? null
  try {
    // 校验真实登录态：凭据过期时明确显示「登录已过期」，而不是笼统的未连接
    const result = isSoda.value ? await window.api.sodaSessionInfo() : await window.api.neteaseSessionInfo()
    if (disposed) return
    loggedIn.value = Boolean(result?.data?.connected)
    expired.value = Boolean(result?.data?.expired)
    // 弹层先发现了过期也要回传给主界面，否则背后的账号资料还显示为已连接
    if (expired.value) emit('expired')
  } catch {
    loggedIn.value = false
  }
  // 凭据已过期时停在「登录已过期」，由用户点刷新二维码再取新码；
  // 否则自动取码会把过期提示盖掉，看起来像从没登录过
  if (loggedIn.value || expired.value || disposed) return
  let state: any = null
  try {
    const result = isSoda.value ? await window.api.sodaLoginState() : await window.api.neteaseLoginState()
    state = result?.data || null
  } catch { /* 旧 preload 没有状态接口时直接取新码 */ }
  if (disposed) return
  if (state) applyLoginState(state)
  // 等待中的二维码直接复用，避免重开浮层让手机上的确认作废
  if (loggedIn.value || qrImage.value || phase.value === 'waiting' || disposed) return
  await startLogin()
})

onBeforeUnmount(() => {
  disposed = true
  attempt++
  clearBusyTimer()
  offLoginState?.()
  offLoginState = null
})
</script>

<style scoped>
.login-backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: 72px 24px;
  overflow: hidden;
  background: rgba(43, 39, 56, 0.1);
}
.login-window {
  --login-accent: var(--brand-accent);
  --login-accent-deep: var(--brand-accent-deep);
  --login-accent-bright: var(--amber-bright);
  --login-accent-soft: var(--brand-accent-soft);
  --login-accent-line: var(--brand-accent-line);
  --login-accent-glow: var(--brand-accent-glow);
  width: min(680px, 100%);
  min-height: min(58vh, 480px);
  max-height: min(70vh, 600px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.34);
  color: var(--text-primary);
  box-shadow:
    0 18px 44px rgba(70, 55, 110, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(34px) saturate(1.35);
  -webkit-backdrop-filter: blur(34px) saturate(1.35);
}
.login-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 62px;
  padding: 0 14px 0 20px;
  border-bottom: 1px solid var(--border-subtle);
}
.login-logo {
  width: 30px;
  height: 30px;
  flex: none;
  display: block;
  border-radius: 9px;
  object-fit: cover;
  box-shadow: 0 4px 12px rgba(70, 55, 110, 0.14);
}
.login-title { display: flex; align-items: center; gap: 9px; min-width: 0; }
.login-title h2 { margin: 0; color: var(--text-primary); font-size: 13px; font-weight: 600; }
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border: 1px solid rgba(70, 55, 110, 0.12);
  border-radius: var(--r-full);
  background: rgba(70, 55, 110, 0.04);
  color: var(--text-muted);
  font-size: 9.5px;
  letter-spacing: 0.03em;
}
.status-pill i { width: 5px; height: 5px; flex: none; border-radius: 50%; background: #b3acc0; }
.status-pill.online { border-color: rgba(63, 155, 120, 0.22); background: rgba(63, 155, 120, 0.08); color: #2f7a5d; }
.status-pill.online i { background: var(--emerald); box-shadow: 0 0 7px rgba(63, 155, 120, 0.5); }
.login-close {
  flex: none;
  width: 28px;
  height: 28px;
  margin-left: auto;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 50%;
  background: transparent;
  color: #191722;
  transition: background var(--t-fast), color var(--t-fast), border-color var(--t-fast);
}
.login-close:hover { background: rgba(255, 255, 255, 0.55); border-color: var(--glass-border); color: #000; }

.login-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 14px 20px 18px;
  overflow-y: auto;
  scrollbar-width: thin;
}
.login-hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 160px;
  align-items: center;
  gap: 20px;
  padding: 16px 18px;
  border: 1px solid rgba(255, 255, 255, 0.58);
  border-radius: 16px;
  background:
    radial-gradient(320px 170px at 0% 0%, color-mix(in srgb, var(--login-accent) 7%, transparent), transparent 70%),
    rgba(255, 255, 255, 0.3);
  overflow: hidden;
}
.hero-watermark {
  position: absolute;
  top: 50%;
  left: 36%;
  width: 212px;
  height: 212px;
  transform: translate(-50%, -50%) rotate(-8deg);
  opacity: 0.11;
  pointer-events: none;
  user-select: none;
  mix-blend-mode: multiply;
}
.login-hero::before,
.login-hero::after {
  content: '';
  position: absolute;
  width: 200px;
  height: 200px;
  border-radius: 50%;
  filter: blur(52px);
  pointer-events: none;
}
.login-hero::before { top: -110px; left: -70px; background: color-mix(in srgb, var(--login-accent) 11%, transparent); animation: drift-a 10s ease-in-out infinite; }
.login-hero::after { right: -40px; bottom: -120px; background: color-mix(in srgb, var(--login-accent-bright) 10%, transparent); animation: drift-b 12s ease-in-out infinite; }
.login-aurora {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(115deg, transparent 28%, color-mix(in srgb, var(--login-accent) 8%, transparent) 44%, color-mix(in srgb, var(--login-accent-bright) 8%, transparent) 56%, transparent 72%);
  transform: translateX(-65%);
  opacity: 1;
  animation: aurora-sweep 4s ease-in-out infinite;
}
.login-copy { position: relative; z-index: 1; min-width: 0; }
.step-label { display: inline-flex; align-items: center; gap: 6px; color: var(--login-accent); font-size: 8.5px; letter-spacing: 0.18em; }
.step-label::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  animation: label-breathe 2s ease-in-out infinite;
}
.login-copy h3 { margin: 7px 0 0; color: var(--text-primary); font: 400 20px/1.3 var(--font-display); }
.login-copy p { max-width: 360px; margin: 7px 0 0; color: var(--text-muted); font-size: 11px; line-height: 1.7; }
.login-error {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  max-width: 360px;
  margin-top: 9px;
  padding: 7px 9px;
  border-radius: 8px;
  background: rgba(201, 79, 92, 0.07);
  color: var(--ruby);
  font-size: 10px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.login-error svg { flex: none; margin-top: 1px; }
.login-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 13px; }
.text-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border: 1px solid rgba(70, 55, 110, 0.12);
  border-radius: var(--r-full);
  background: rgba(255, 255, 255, 0.72);
  color: #191722;
  font-size: 12.5px;
  transition: border-color var(--t-fast), color var(--t-fast), background var(--t-fast);
}
.text-action:hover:not(:disabled) { border-color: var(--login-accent-line); background: #fff; color: var(--login-accent-deep); }
.text-action.danger { border-color: rgba(201, 79, 92, 0.18); color: var(--ruby); }
.text-action.danger:hover:not(:disabled) { border-color: rgba(201, 79, 92, 0.38); background: rgba(201, 79, 92, 0.06); color: var(--ruby); }
.text-action:disabled { opacity: 0.5; }
.qr-frame {
  position: relative;
  z-index: 1;
  width: 160px;
  height: 160px;
  justify-self: end;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 8px 22px rgba(70, 55, 110, 0.07);
  overflow: hidden;
}
.qr-frame.live { animation: qr-breathe 3.4s ease-in-out infinite; }
.qr-frame.online { border-color: rgba(63, 155, 120, 0.25); box-shadow: 0 8px 22px rgba(63, 155, 120, 0.08); }
.qr-box { position: relative; width: 100%; height: 100%; display: grid; place-items: center; }
.qr-frame img { width: 140px; height: 140px; border-radius: 6px; image-rendering: pixelated; }
.qr-scan {
  position: absolute;
  left: 10px;
  right: 10px;
  top: 8%;
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--login-accent) 90%, transparent), transparent);
  box-shadow: 0 0 14px color-mix(in srgb, var(--login-accent) 50%, transparent);
  animation: qr-scan 2.8s ease-in-out infinite;
}
.qr-state { display: grid; justify-items: center; gap: 9px; color: var(--text-muted); }
.qr-state small { font-size: 9px; letter-spacing: 0.03em; }
.qr-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid color-mix(in srgb, var(--login-accent) 16%, transparent);
  border-top-color: var(--login-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.sync-state { gap: 7px; }
.sync-vinyl {
  position: relative;
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  color: var(--login-accent);
}
.sync-vinyl::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--login-accent) 20%, transparent);
  border-top-color: var(--login-accent);
  animation: spin 1.4s linear infinite;
}
.sync-vinyl::after {
  content: '';
  position: absolute;
  inset: 8px;
  border-radius: 50%;
  border: 1px dashed color-mix(in srgb, var(--login-accent) 24%, transparent);
  animation: spin 5s linear infinite reverse;
}
.sync-vinyl > i {
  position: absolute;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--login-accent);
  box-shadow: 0 0 8px var(--login-accent-glow);
}
.sync-vinyl svg { opacity: 0.82; animation: sync-pulse 2s ease-in-out infinite; }
.sync-bars { display: flex; align-items: flex-end; gap: 3px; height: 12px; }
.sync-bars i {
  width: 3px;
  height: 12px;
  border-radius: 2px;
  background: var(--login-accent);
  transform-origin: 50% 100%;
  animation: sync-bar 1.05s ease-in-out infinite;
  opacity: 0.7;
}
.sync-bars i:nth-child(2) { animation-delay: 0.12s; }
.sync-bars i:nth-child(3) { animation-delay: 0.28s; }
.sync-bars i:nth-child(4) { animation-delay: 0.08s; }
.sync-bars i:nth-child(5) { animation-delay: 0.22s; }
.qr-check {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(63, 155, 120, 0.1);
  color: var(--emerald);
  animation: pop-in 0.5s cubic-bezier(0.2, 1.5, 0.4, 1);
}
.qr-fail { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 50%; background: rgba(201, 79, 92, 0.08); color: var(--ruby); }
.qr-idle { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 50%; background: rgba(70, 55, 110, 0.06); color: #191722; }

.verify-flow {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 7px 9px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.28);
}
.sync-track {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 3px;
  height: 2px;
  border-radius: 2px;
  overflow: hidden;
  background: color-mix(in srgb, var(--login-accent) 8%, transparent);
}
.sync-track i {
  display: block;
  width: 34%;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, transparent, var(--login-accent-bright), transparent);
  animation: sync-travel 1.25s ease-in-out infinite;
}
.flow-step {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid transparent;
  border-radius: 10px;
  transition: background 0.35s ease, border-color 0.35s ease;
}
.flow-step.active {
  border-color: color-mix(in srgb, var(--login-accent) 16%, transparent);
  background: color-mix(in srgb, var(--login-accent) 6%, transparent);
}
.flow-icon {
  position: relative;
  width: 26px;
  height: 26px;
  flex: none;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.45);
  color: #191722;
  transition: background var(--t-base), color var(--t-base), border-color var(--t-base);
}
.flow-copy { display: grid; gap: 1px; }
.flow-copy strong { color: var(--text-muted); font-size: 10px; font-weight: 600; transition: color var(--t-base); }
.flow-copy small { color: var(--text-ghost); font-size: 8.5px; }
.flow-step.done .flow-icon {
  border-color: color-mix(in srgb, var(--login-accent) 20%, transparent);
  background: var(--login-accent-soft);
  color: var(--login-accent);
  animation: flow-pop 0.45s cubic-bezier(0.2, 1.5, 0.4, 1);
}
.flow-step.done .flow-copy strong { color: var(--text-secondary); }
.flow-step.active .flow-icon {
  border-color: color-mix(in srgb, var(--login-accent) 30%, transparent);
  background: var(--login-accent-soft);
  color: var(--login-accent);
}
.flow-step.active .flow-icon::after {
  content: '';
  position: absolute;
  inset: -1px;
  border: 1px solid color-mix(in srgb, var(--login-accent) 42%, transparent);
  border-radius: 9px;
  pointer-events: none;
  animation: step-ripple 1.7s ease-out infinite;
}
.flow-step.active .flow-copy strong { color: var(--login-accent-deep); }
.flow-link {
  position: relative;
  flex: 1;
  height: 2px;
  min-width: 16px;
  border-radius: 2px;
  background: repeating-linear-gradient(90deg, rgba(70, 55, 110, 0.16) 0 4px, transparent 4px 8px);
  overflow: hidden;
  transition: background 0.3s ease;
}
.flow-link.lit { background: linear-gradient(90deg, color-mix(in srgb, var(--login-accent) 38%, transparent), color-mix(in srgb, var(--login-accent) 18%, transparent)); }
.flow-link.flowing {
  background-image: linear-gradient(90deg, color-mix(in srgb, var(--login-accent) 16%, transparent) 0%, color-mix(in srgb, var(--login-accent) 85%, transparent) 42%, color-mix(in srgb, var(--login-accent-bright) 30%, white) 50%, color-mix(in srgb, var(--login-accent) 85%, transparent) 58%, color-mix(in srgb, var(--login-accent) 16%, transparent) 100%);
  background-size: 240% 100%;
  background-position: 200% 0;
  animation: flow-travel 1.4s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes sync-pulse {
  0%, 100% { opacity: 0.45; transform: scale(0.92); }
  50% { opacity: 1; transform: scale(1); }
}
@keyframes sync-bar {
  0%, 100% { transform: scaleY(0.35); opacity: 0.45; }
  50% { transform: scaleY(1); opacity: 1; }
}
@keyframes sync-travel {
  from { transform: translateX(-120%); }
  to { transform: translateX(340%); }
}
@keyframes drift-a { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(24px, 16px); } }
@keyframes drift-b { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-18px, -14px); } }
@keyframes aurora-sweep {
  0% { transform: translateX(-65%); }
  60%, 100% { transform: translateX(65%); }
}
@keyframes label-breathe {
  0%, 100% { opacity: 0.35; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1); }
}
@keyframes flow-pop {
  0% { transform: scale(0.7); opacity: 0.6; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes qr-breathe {
  0%, 100% { box-shadow: 0 8px 22px rgba(70, 55, 110, 0.07), 0 0 0 0 color-mix(in srgb, var(--login-accent) 0%, transparent); }
  50% { box-shadow: 0 12px 30px rgba(70, 55, 110, 0.13), 0 0 0 7px color-mix(in srgb, var(--login-accent) 7%, transparent); }
}
@keyframes qr-scan {
  0% { top: 8%; opacity: 0; }
  12% { opacity: 1; }
  88% { opacity: 1; }
  100% { top: 90%; opacity: 0; }
}
@keyframes pop-in { 0% { transform: scale(0.6); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@keyframes step-ripple {
  0% { transform: scale(1); opacity: 0.65; }
  100% { transform: scale(1.45); opacity: 0; }
}
@keyframes flow-travel {
  from { background-position: 200% 0; }
  to { background-position: -100% 0; }
}
@media (max-width: 820px) {
  .login-hero { grid-template-columns: 1fr; justify-items: center; text-align: center; }
  .login-copy p { margin-inline: auto; }
  .qr-frame { justify-self: center; }
  .flow-copy small { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
}
</style>
