<template>
  <div class="topbar">
    <div class="topbar-actions">
      <!-- 收起/展开按钮常驻在工具组最左端：收起点向右移，展开点向左移 -->
      <button
        class="round-action fold-trigger"
        :data-tip="folded ? '展开' : '收起'"
        :aria-label="folded ? '展开功能按钮' : '收起功能按钮'"
        @click="emit('toggle-fold')"
      >
        <ChevronsLeft v-if="folded" :size="16" />
        <ChevronsRight v-else :size="16" />
      </button>
      <div class="action-fold" :class="{ closed: folded, folding }">
        <div class="action-tools">
          <!-- 导航：入口按钮并入右侧操作组，下拉展开 -->
          <div class="nav-wrap">
            <button class="round-action nav-trigger" :class="{ on: navOpen }" :aria-expanded="navOpen" aria-label="展开导航" data-tip="导航" @click="emit('toggle-nav')">
              <i></i><i></i><i></i>
            </button>
            <div v-if="navOpen" class="menu-veil" @click="emit('close-nav')"></div>
            <transition name="pop">
              <nav v-if="navOpen" class="nav-menu">
                <button v-for="item in navItems" :key="item.key" class="nav-item" :class="{ active: item.key === activeNav }" @click="emit('navigate', item.key)">
                  <span class="nav-glyph"><component :is="item.icon" :size="16" /></span>
                  <span class="nav-text">{{ item.label }}</span>
                </button>
              </nav>
            </transition>
          </div>
          <button class="round-action" aria-label="搜索歌曲" data-tip="搜索" @click="emit('open-search')"><Search :size="16" /></button>
          <button class="round-action" aria-label="定位我的喜欢" data-tip="定位喜欢" @click="emit('locate-favorites')"><LocateFixed :size="16" /></button>
          <div class="platform-wrap">
            <button class="round-action platform-trigger" :class="{ on: platformOpen, connected: accountConnected, soda: activePlatform === 'soda' }" aria-label="切换平台" data-tip="平台" @click="emit('toggle-platform')">
              <transition name="logo-swap">
                <img v-if="activePlatform === 'soda'" key="soda" class="platform-trigger-logo" :src="sodaLogo" alt="" />
                <img v-else-if="connected" key="netease" class="platform-trigger-logo" :src="neteaseLogo" alt="" />
                <ArrowLeftRight v-else key="swap" :size="16" />
              </transition>
            </button>
            <div v-if="platformOpen" class="menu-veil" @click="emit('close-platform')"></div>
            <transition name="platform-pop">
              <div v-if="platformOpen" class="platform-menu">
                <button class="platform-item" :class="{ active: activePlatform === 'netease' }" @click="emit('open-platform', 'netease')">
                  <img class="p-logo" :src="neteaseLogo" alt="" />
                  <span class="p-copy"><strong>网易云音乐</strong><small>{{ activePlatform === 'netease' ? (connected ? '已连接 · 当前平台' : '未连接 · 点击登录') : (connected ? '已连接 · 点击切换' : '点击登录') }}</small></span>
                  <span class="p-live" :class="{ off: !(activePlatform === 'netease' && connected) }"></span>
                </button>
                <button class="platform-item" :class="{ active: activePlatform === 'soda' }" @click="emit('open-platform', 'soda')">
                  <img class="p-logo" :src="sodaLogo" alt="" />
                  <span class="p-copy"><strong>汽水音乐</strong><small>{{ activePlatform === 'soda' ? (sodaConnected ? '已连接 · 当前平台' : '未连接 · 点击登录') : (sodaConnected ? '已连接 · 点击切换' : '点击登录') }}</small></span>
                  <span class="p-live" :class="{ off: !(activePlatform === 'soda' && sodaConnected) }"></span>
                </button>
                <button class="platform-item disabled" disabled>
                  <img class="p-logo" :src="qqLogo" alt="" />
                  <span class="p-copy"><strong>QQ 音乐</strong><small>即将接入</small></span>
                  <span class="p-live off"></span>
                </button>
              </div>
            </transition>
          </div>
          <button class="round-action" aria-label="设置" data-tip="设置" @click="emit('open-settings')"><SettingsIcon :size="16" /></button>
        </div>
      </div>
      <div class="account-wrap" :data-tip="accountTip">
        <button class="account-chip" aria-label="账号" @click="emit('open-login')">
          <img v-if="account.avatar" :src="account.avatar" alt="" />
          <span v-else class="chip-fallback">
            <UserRound v-if="!accountConnected" :size="15" />
            <Music2 v-else-if="!account.name" :size="14" />
            <template v-else>{{ account.name.slice(0, 1) }}</template>
          </span>
        </button>
        <!-- 资料同步完成（有昵称）后再展示会员/等级，避免未同步时误标成「VIP · 无等级」 -->
        <div v-if="account.name" class="account-meta">
          <span v-if="account.vip" class="vip-badge" :class="account.vip">
            {{ account.vip === 'svip' ? 'SVIP' : 'VIP' }}
          </span>
          <span v-if="account.level" class="level-badge">Lv{{ account.level }}</span>
          <span v-else class="level-badge level-empty">无等级</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ArrowLeftRight, ChevronsLeft, ChevronsRight, Compass, ListMusic, LocateFixed, Music2, Search, Settings as SettingsIcon, UserRound } from '@lucide/vue'
import neteaseLogo from '../assets/platforms/netease.png'
import sodaLogo from '../assets/platforms/soda.png'
import qqLogo from '../assets/platforms/qq.png'

interface AccountProfile {
  name: string
  avatar: string
  level: number
  vip: '' | 'vip' | 'svip'
}

type NavKey = 'explore' | 'mine' | 'playlists'

defineProps<{
  folded: boolean
  folding: boolean
  navOpen: boolean
  platformOpen: boolean
  activeNav: NavKey
  activePlatform: 'netease' | 'soda'
  connected: boolean
  sodaConnected: boolean
  account: AccountProfile
  accountConnected: boolean
  accountTip: string
}>()

const emit = defineEmits<{
  'toggle-fold': []
  'toggle-nav': []
  'close-nav': []
  'toggle-platform': []
  'close-platform': []
  navigate: [key: NavKey]
  'open-search': []
  'locate-favorites': []
  'open-platform': [platform: 'netease' | 'soda']
  'open-settings': []
  'open-login': []
}>()

const navItems = [
  { key: 'explore', label: '探索', icon: Compass },
  { key: 'mine', label: '我的音乐', icon: UserRound },
  { key: 'playlists', label: '歌单', icon: ListMusic }
] as const
</script>

<style scoped>
.topbar {
  height: 58px; flex: none;
  display: flex; align-items: center; justify-content: flex-end;
  padding: 0 22px;
  /* 抬到内容层之上，否则导航/平台下拉会被歌单页内容挡住点击 */
  position: relative; z-index: 2;
}
.topbar-actions { display: flex; align-items: center; gap: 10px; }

/* 一键收起：工具组向右收起，常驻折叠按钮随组右移；展开时向左展开 */
.action-fold {
  display: grid;
  grid-template-columns: 1fr;
  transition: grid-template-columns 0.5s cubic-bezier(0.65, 0, 0.35, 1);
}
.action-fold.closed { grid-template-columns: 0fr; }
.action-tools {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: opacity 0.26s ease;
}
.action-tools > * { flex: none; transition: opacity 0.26s ease, transform 0.44s cubic-bezier(0.65, 0, 0.35, 1); }
.action-fold.closed .action-tools { overflow: hidden; opacity: 0; pointer-events: none; }
.action-fold.folding .action-tools { overflow: hidden; }
.action-fold.closed .action-tools > * { opacity: 0; transform: translateX(18px); }
.round-action {
  width: 32px; height: 32px;
  display: grid; place-items: center;
  border-radius: 50%;
  border: 1px solid transparent;
  color: #191722;
  transition: color var(--t-fast), border-color var(--t-fast), background var(--t-fast);
}
.round-action:hover, .round-action.on { color: #000; border-color: var(--glass-border); background: var(--glass-bg); }
.round-action.on { color: var(--amber); }
.round-action.platform-trigger:hover, .round-action.platform-trigger.on { color: var(--brand-accent-deep); border-color: var(--brand-accent-line); background: var(--brand-accent-soft); }
.platform-trigger-logo { width: 18px; height: 18px; display: block; border-radius: 5px; object-fit: cover; }
/* 切换平台时顶栏图标做一次交换：旧图标缩转淡出，新图标缩转弹入，两者叠在同一格内 */
.platform-trigger > * { grid-area: 1 / 1; }
.logo-swap-enter-active { transition: opacity 0.18s ease, transform 0.26s cubic-bezier(0.3, 1.4, 0.6, 1); }
.logo-swap-leave-active { transition: opacity 0.1s ease, transform 0.12s ease-in; }
.logo-swap-enter-from { opacity: 0; transform: scale(0.4) rotate(-50deg); }
.logo-swap-leave-to { opacity: 0; transform: scale(0.4) rotate(50deg); }

/* ---- 导航下拉：入口按钮与右侧操作同排 ---- */
.nav-wrap { position: relative; }
.nav-trigger { display: grid; place-content: center; gap: 4px; }
.nav-trigger i { display: block; width: 14px; height: 1.5px; border-radius: 2px; background: currentColor; }
.nav-menu {
  position: absolute;
  top: calc(100% + 10px); left: 0;
  z-index: 40;
  width: 196px;
  display: grid; gap: 3px;
  padding: 6px;
  border-radius: var(--r-lg);
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.34);
  box-shadow: 0 18px 44px rgba(70, 55, 110, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(34px) saturate(1.35);
  -webkit-backdrop-filter: blur(34px) saturate(1.35);
  transform-origin: top left;
}
.nav-item {
  height: 40px;
  display: flex; align-items: center; gap: 12px;
  padding: 0 13px;
  border-radius: var(--r-md);
  color: #191722;
  font-size: 12.5px;
  letter-spacing: 0.04em;
  text-align: left;
  transition: background var(--t-fast), color var(--t-fast);
}
.nav-item:hover { background: var(--glass-bg-hover); color: #000; }
.nav-item.active { background: var(--glass-bg); border: 1px solid var(--glass-border); color: #000; box-shadow: inset 0 1px 0 var(--glass-shine); }
.nav-item.active .nav-glyph { color: var(--amber); }
.nav-glyph { width: 18px; display: grid; place-items: center; color: #191722; transition: color var(--t-fast); }
.nav-item:hover .nav-glyph { color: #000; }
.nav-glyph :deep(svg) { display: block; }

/* ---- 平台切换下拉 ---- */
.platform-wrap { position: relative; }
.menu-veil { position: fixed; inset: 0; z-index: 39; }
.platform-menu {
  position: absolute; top: calc(100% + 10px); right: 0;
  width: 218px;
  padding: 6px;
  border-radius: var(--r-lg);
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.34);
  box-shadow: 0 18px 44px rgba(70, 55, 110, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(34px) saturate(1.35);
  -webkit-backdrop-filter: blur(34px) saturate(1.35);
  z-index: 40;
  transform-origin: top right;
}
.platform-item {
  width: 100%;
  display: flex; align-items: center; gap: 10px;
  padding: 9px 10px;
  border-radius: var(--r-md);
  text-align: left;
  transition: background var(--t-fast);
}
.platform-item:hover:not(.disabled) { background: var(--brand-accent-soft); }
.platform-item.active { background: var(--brand-accent-soft); }
.platform-item.active .p-copy strong { color: var(--brand-accent-deep); }
.platform-item.disabled { cursor: default; }
.platform-item.disabled .p-logo,
.platform-item.disabled .p-copy { opacity: 0.42; }
.p-logo {
  width: 28px;
  height: 28px;
  flex: none;
  display: block;
  border-radius: 8px;
  object-fit: cover;
  box-shadow: 0 2px 8px rgba(70, 55, 110, 0.14), inset 0 0 0 1px rgba(255, 255, 255, 0.12);
}
.p-copy { min-width: 0; flex: 1; display: grid; gap: 2px; }
.p-copy strong { color: var(--text-primary); font-size: 11.5px; font-weight: 500; }
.p-copy small { color: var(--text-muted); font-size: 9px; }
.p-live {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: var(--emerald);
  animation: p-live-breathe 2.4s ease-in-out infinite;
}
.p-live.off { background: var(--ruby); animation: none; box-shadow: 0 0 6px rgba(201, 79, 92, 0.45); opacity: 0.9; }
@keyframes p-live-breathe { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
/* 下拉从右上角弹性展开，三行依次落位；关闭时快速收起 */
.platform-pop-enter-active { transition: opacity 0.18s ease, transform 0.28s cubic-bezier(0.3, 1.3, 0.55, 1); }
.platform-pop-leave-active { transition: opacity 0.12s ease, transform 0.14s ease-in; }
.platform-pop-enter-from { opacity: 0; transform: translateY(-10px) scale(0.92); }
.platform-pop-leave-to { opacity: 0; transform: translateY(-6px) scale(0.97); }
.platform-pop-enter-active .platform-item { animation: platform-item-in 0.32s cubic-bezier(0.3, 1.25, 0.55, 1) both; }
.platform-pop-enter-active .platform-item:nth-child(1) { animation-delay: 0.04s; }
.platform-pop-enter-active .platform-item:nth-child(2) { animation-delay: 0.09s; }
.platform-pop-enter-active .platform-item:nth-child(3) { animation-delay: 0.14s; }
@keyframes platform-item-in {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: none; }
}
.pop-enter-active, .pop-leave-active { transition: opacity 0.18s, transform 0.18s; }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: translateY(-6px) scale(0.97); }

/* ---- 账号 ---- */
.account-chip {
  width: 38px; height: 38px;
  display: grid; place-items: center;
  overflow: hidden;
  border-radius: 50%;
  border: 1px solid var(--brand-accent-line);
  background: var(--glass-bg);
  color: #191722;
  font-size: 13px;
  transition: border-color var(--t-fast), box-shadow var(--t-fast);
}
.account-chip:hover { border-color: var(--brand-accent); box-shadow: 0 0 0 3px var(--brand-accent-soft), 0 0 12px var(--brand-accent-glow); }
.account-chip img { width: 100%; height: 100%; object-fit: cover; }
.chip-fallback { display: grid; place-items: center; width: 100%; height: 100%; font-size: 13px; }
.account-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
/* 账号区贴着窗口右缘，提示框改为右对齐，避免长文案被裁掉；竖直位置让到徽标下方 */
.account-wrap[data-tip]::after {
  top: calc(100% + 22px);
  left: auto;
  right: 0;
  transform: translate(0, -3px);
}
.account-wrap[data-tip]:hover::after,
.account-wrap[data-tip]:focus-visible::after { transform: translate(0, 0); }
/* 徽标叠在头像正下方，头像保持与左侧圆钮同一条中线 */
.account-meta {
  position: absolute;
  top: calc(100% + 2px);
  left: 50%;
  transform: translateX(-50%);
  display: flex; align-items: center; justify-content: center;
  gap: 3px;
  white-space: nowrap;
}
.vip-badge {
  padding: 1px 6px;
  border-radius: 6px;
  background: linear-gradient(135deg, #a9793a, #d8b56b);
  color: #fff8ea;
  font: 600 8.5px/1.2 var(--font-mono);
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.vip-badge.svip {
  background: linear-gradient(135deg, #46335f, #7c5fa8);
  color: #ffe9b5;
  box-shadow: inset 0 0 0 1px rgba(255, 226, 166, 0.35);
}
.level-badge {
  padding: 1px 6px;
  border-radius: 6px;
  background: linear-gradient(135deg, var(--brand-accent-deep), var(--brand-accent));
  color: #fff;
  font: 600 8.5px/1.2 var(--font-mono);
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.level-badge.level-empty {
  padding: 1px 5px;
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  color: var(--text-muted);
  font-family: var(--font-body);
  font-weight: 500;
  letter-spacing: 0;
}

/* ---- 浮层定位：探索页 / 歌单页工具带压在内容之上 ---- */
.app-shell.explore-full .topbar,
.app-shell.float-top .topbar {
  position: absolute;
  top: 38px; left: 0; right: 0;
  z-index: 23;
  pointer-events: none;
}
.app-shell.explore-full .topbar > *,
.app-shell.float-top .topbar > * { pointer-events: auto; }
/* 工具带浮在内容之上时，按钮与头像必须自带玻璃底 */
.app-shell.explore-full .topbar-actions .round-action,
.app-shell.explore-full .account-chip,
.app-shell.float-top .topbar-actions .round-action,
.app-shell.float-top .account-chip {
  background: rgba(255, 255, 255, 0.34);
  border-color: rgba(255, 255, 255, 0.5);
  box-shadow:
    0 6px 18px rgba(70, 55, 110, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(34px) saturate(1.35);
  -webkit-backdrop-filter: blur(34px) saturate(1.35);
}
/* 浅底上悬浮，图标压成黑色才看得清 */
.app-shell.float-top .topbar-actions .round-action { color: #191722; }
/* 浮层状态下基础玻璃底优先级更高，hover 必须同权重提亮，否则悬停毫无反馈 */
.app-shell.explore-full .topbar-actions .round-action:hover,
.app-shell.float-top .topbar-actions .round-action:hover {
  color: #000;
  border-color: var(--glass-border-hover);
  background: rgba(255, 255, 255, 0.6);
}
/* 平台切换按钮保留品牌色 hover，不被上面的提亮盖掉 */
.app-shell.explore-full .topbar-actions .round-action.platform-trigger:hover,
.app-shell.float-top .topbar-actions .round-action.platform-trigger:hover {
  color: var(--brand-accent-deep);
  border-color: var(--brand-accent-line);
  background: var(--brand-accent-soft);
}
.app-shell.explore-full .round-action.platform-trigger { border-color: var(--brand-accent-line); }
.app-shell.explore-full .account-chip { border-color: var(--brand-accent-line); }
/* 歌单详情页：返回键自带退出路径，整组顶部控件都不再显示，避免压在列表上 */
.app-shell.detail-open .topbar-actions { display: none; }

@media (prefers-reduced-motion: reduce) {
  .logo-swap-enter-active, .logo-swap-leave-active,
  .platform-pop-enter-active, .platform-pop-leave-active { transition-duration: 0.01s; }
  .platform-pop-enter-active .platform-item { animation: none; }
  .p-live { animation: none; }
}
</style>
