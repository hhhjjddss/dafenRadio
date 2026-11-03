<template>
  <header class="window-bar" :class="{ 'auto-hidden': hidden }" @mouseenter="emit('reveal')">
    <div class="window-brand">
      <img class="brand-logo" :src="logoMark" alt="DaFen" />
      <span class="brand-word">dafen</span>
    </div>
    <div class="window-actions">
      <button aria-label="最小化" @click="appWindow.api.windowMinimize()"><Minus :size="12" /></button>
      <button :aria-label="fullscreen ? '退出全屏' : '全屏'" @click="emit('toggle-fullscreen')">
        <Minimize2 v-if="fullscreen" :size="11" />
        <Maximize2 v-else :size="11" />
      </button>
      <button :aria-label="maximized ? '还原窗口' : '最大化'" @click="appWindow.api.windowMaximize()">
        <Copy v-if="maximized" :size="11" />
        <Square v-else :size="11" />
      </button>
      <button class="close-window" aria-label="关闭到托盘" @click="appWindow.api.windowClose()"><X :size="12" /></button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { Copy, Maximize2, Minimize2, Minus, Square, X } from '@lucide/vue'
import logoMark from '../assets/logo-mark.png'

defineProps<{
  hidden: boolean
  fullscreen: boolean
  maximized: boolean
}>()

const emit = defineEmits<{
  reveal: []
  'toggle-fullscreen': []
}>()

const appWindow = window
</script>

<style scoped>
.window-bar {
  height: 38px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px 0 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.34);
  box-shadow: 0 10px 26px rgba(70, 55, 110, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(34px) saturate(1.35);
  -webkit-backdrop-filter: blur(34px) saturate(1.35);
  -webkit-app-region: drag;
  user-select: none;
  z-index: 6;
  transition: opacity 0.24s ease, transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}
.window-bar.auto-hidden {
  opacity: 0;
  transform: translateY(-100%);
  pointer-events: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
.window-brand { display: flex; align-items: center; gap: 8px; padding-right: 10px; }
.brand-logo { width: 14px; height: 14px; flex: none; object-fit: contain; filter: brightness(0.22); opacity: 0.72; }
.brand-word {
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.1em;
  line-height: 1;
  color: var(--text-secondary);
}
.window-actions { height: 100%; display: flex; align-items: center; -webkit-app-region: no-drag; }
.window-actions button { height: 100%; width: 44px; display: grid; place-items: center; color: #191722; font-size: 12px; transition: background var(--t-fast), color var(--t-fast); }
.window-actions button:hover { background: rgba(24, 21, 34, 0.08); color: #000; }
.window-actions .close-window:hover { background: #c0392b; color: #fff; }

/* 顶部不占布局高度：探索页与歌单页让窗口栏浮在画布上 */
.app-shell.explore-full .window-bar,
.app-shell.float-top .window-bar {
  position: absolute;
  top: 0; left: 0; right: 0;
  z-index: 24;
}
</style>
