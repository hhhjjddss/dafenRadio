<template>
  <div class="settings-backdrop" @click.self="emit('close')">
    <section class="settings-window" role="dialog" aria-modal="true" aria-label="偏好设置">
      <header class="settings-header">
        <span class="settings-mark"><SlidersHorizontal :size="16" /></span>
        <h2 class="settings-heading">偏好设置</h2>
        <button class="settings-close" aria-label="关闭设置" @click="emit('close')"><X :size="15" /></button>
      </header>

      <main class="settings-scroll">
        <section class="settings-group">
          <div class="setting-row">
            <div class="setting-copy">
              <strong>动态封面配色</strong>
              <small>从当前歌曲封面提取界面主色</small>
            </div>
            <button
              class="toggle"
              :class="{ on: coverPalette }"
              role="switch"
              :aria-checked="coverPalette"
              aria-label="动态封面配色"
              @click="emit('update:cover-palette', !coverPalette)"
            ><i></i></button>
          </div>
        </section>

        <section class="settings-group">
          <div class="setting-row">
            <div class="setting-copy">
              <strong>开机自动播放</strong>
              <small>启动后自动用心动模式 / 平台推荐开始放歌</small>
            </div>
            <button
              class="toggle"
              :class="{ on: autoPlay }"
              role="switch"
              :aria-checked="autoPlay"
              aria-label="开机自动播放"
              @click="emit('update:auto-play', !autoPlay)"
            ><i></i></button>
          </div>
        </section>

        <section class="settings-group">
          <div class="setting-row">
            <div class="setting-copy">
              <strong>窗口置顶</strong>
              <small>让播放器始终显示在其他窗口上方</small>
            </div>
            <button
              class="toggle"
              :class="{ on: alwaysOnTop }"
              role="switch"
              :aria-checked="alwaysOnTop"
              aria-label="窗口置顶"
              @click="emit('update:always-on-top', !alwaysOnTop)"
            ><i></i></button>
          </div>
        </section>

        <section class="settings-group">
          <div class="setting-row power-row">
            <div class="setting-copy">
              <strong>节能模式</strong>
              <small class="note">切到其他应用（窗口失去焦点）时暂停常驻动画：播放条唱片旋转与歌名滚动、歌词页封面旋转、呼吸灯与播放指示、探索画布漂移、加载骨架闪光，并停止歌词逐字刷新；回到窗口自动恢复，音频播放不受影响。最小化或收进托盘时始终暂停。</small>
            </div>
            <button
              class="toggle"
              :class="{ on: powerSave }"
              role="switch"
              :aria-checked="powerSave"
              aria-label="节能模式"
              @click="emit('update:power-save', !powerSave)"
            ><i></i></button>
          </div>
        </section>

        <section class="settings-group">
          <div class="setting-row">
            <div class="setting-copy">
              <strong>数据目录</strong>
              <small class="path" :title="dataDir">{{ dataDir || '正在读取…' }}</small>
            </div>
            <div class="dir-actions">
              <button class="ghost-btn" :disabled="!dataDir" @click="openDataDir">打开</button>
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-copy">
              <strong>本地缓存</strong>
              <small>封面与网络请求的临时文件<template v-if="cacheSize"> · 可清理 {{ cacheSize }}</template></small>
            </div>
            <button class="ghost-btn cache-btn" :disabled="clearing" :aria-busy="clearing" @click="clearCache">
              <LoaderCircle v-if="clearing" class="cache-spin" :size="12" />
              <Trash2 v-else :size="12" />
              <span>{{ clearing ? '清理中' : cacheState || '清除' }}</span>
            </button>
          </div>
        </section>
      </main>

      <footer class="settings-footer">
        <span>DaFen Radio</span>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { LoaderCircle, SlidersHorizontal, Trash2, X } from '@lucide/vue'

defineProps<{
  coverPalette: boolean
  alwaysOnTop: boolean
  autoPlay: boolean
  powerSave: boolean
}>()

const emit = defineEmits<{
  close: []
  'update:cover-palette': [enabled: boolean]
  'update:always-on-top': [enabled: boolean]
  'update:auto-play': [enabled: boolean]
  'update:power-save': [enabled: boolean]
}>()

const dataDir = ref('')
const clearing = ref(false)
const cacheState = ref('')
const cacheSize = ref('')
let cacheTimer: ReturnType<typeof setTimeout> | null = null

async function openDataDir() {
  try { await window.api.openDataDir() } catch { /* 打开系统文件管理器失败时静默 */ }
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function loadCacheInfo() {
  try {
    const result = await window.api.cacheInfo()
    if (result?.success) cacheSize.value = formatBytes(Number(result.data?.bytes) || 0)
  } catch { /* 读取失败时不展示大小 */ }
}

async function clearCache() {
  if (clearing.value) return
  clearing.value = true
  cacheState.value = ''
  try {
    const result = await window.api.clearCache()
    if (result?.success) {
      const freed = formatBytes(Number(result.data?.freedBytes) || 0)
      cacheState.value = freed ? `已清理 ${freed}` : '已清理'
      cacheSize.value = formatBytes(Number(result.data?.bytes) || 0)
    } else {
      cacheState.value = '清理失败'
    }
  } catch {
    cacheState.value = '清理失败'
  } finally {
    clearing.value = false
    if (cacheTimer) clearTimeout(cacheTimer)
    cacheTimer = setTimeout(() => { cacheState.value = '' }, cacheState.value === '清理失败' ? 2600 : 2400)
  }
}

async function loadAppInfo() {
  try {
    const result = await window.api.appInfo()
    if (result?.success) {
      dataDir.value = result.data.dataDir
    }
  } catch { /* 读取失败时保留占位展示 */ }
}

onMounted(() => {
  void loadAppInfo()
  void loadCacheInfo()
})

onBeforeUnmount(() => {
  if (cacheTimer) clearTimeout(cacheTimer)
})
</script>

<style scoped>
.settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: 72px 24px;
  overflow: hidden;
  background: rgba(43, 39, 56, 0.1);
}
.settings-window {
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
.settings-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 62px;
  padding: 0 14px 0 20px;
  border-bottom: 1px solid var(--border-subtle);
}
.settings-mark {
  flex: none;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: 1px solid var(--glass-border);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.42);
  color: #191722;
}
.settings-heading {
  margin: 0;
  color: var(--text-primary);
  font: 300 16px/1 var(--font-display);
  letter-spacing: 0.05em;
}
.settings-close {
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
.settings-close:hover { background: rgba(255, 255, 255, 0.55); border-color: var(--glass-border); color: #000; }

.settings-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 12px 8px;
  scrollbar-width: thin;
}
.settings-group {
  padding: 10px 8px 2px;
  border-bottom: 1px solid rgba(70, 55, 110, 0.06);
}
.settings-group:last-child { border-bottom: 0; }
.setting-row {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}
.setting-copy { min-width: 0; }
.setting-copy strong {
  display: block;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
}
.setting-copy small {
  display: block;
  margin-top: 3px;
  max-width: 340px;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.setting-copy small.path { font-family: var(--font-mono); font-size: 9.5px; }
/* 节能模式要交代清楚哪些控件在什么情况下停，说明文字允许换行 */
.setting-row.power-row { align-items: flex-start; padding: 8px 0 10px; }
.setting-row.power-row .toggle { margin-top: 1px; }
.setting-copy small.note {
  max-width: 520px;
  white-space: normal;
  line-height: 1.65;
}

.dir-actions { flex: none; display: flex; align-items: center; gap: 6px; }

.toggle {
  flex: none;
  width: 36px;
  height: 20px;
  padding: 2px;
  border-radius: 999px;
  background: rgba(70, 55, 110, 0.16);
  transition: background var(--t-fast);
}
.toggle i {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(70, 55, 110, 0.22);
  transition: transform var(--t-fast);
}
.toggle.on { background: var(--brand-accent); }
.toggle.on i { transform: translateX(16px); }

.ghost-btn {
  flex: none;
  height: 28px;
  padding: 0 13px;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.4);
  color: #191722;
  font-size: 10.5px;
  transition: background var(--t-fast), border-color var(--t-fast), color var(--t-fast);
}
.ghost-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.8); border-color: var(--glass-border-hover); color: #000; }
.ghost-btn:disabled { opacity: 0.5; }
.cache-btn { min-width: 104px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; font-variant-numeric: tabular-nums; }
.cache-btn span { white-space: nowrap; }
.cache-spin { animation: cache-spin 0.85s linear infinite; }
@keyframes cache-spin { to { transform: rotate(360deg); } }

.settings-footer {
  flex: none;
  display: flex;
  align-items: center;
  padding: 4px 22px 12px;
  color: var(--text-ghost);
  font-size: 9px;
}

@media (max-width: 820px) {
  .settings-header { padding: 0 10px 0 14px; gap: 8px; }
  .setting-copy small { max-width: 200px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
}
</style>
