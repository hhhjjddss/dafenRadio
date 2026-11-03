<template>
  <div class="guide-layer" role="dialog" aria-modal="true" aria-label="新手引导">
    <div v-if="spotStyle" class="guide-hole" :style="spotStyle"></div>
    <div v-else class="guide-dim"></div>

    <div class="guide-slot" :style="slotStyle">
      <section ref="cardRef" class="guide-card">
        <header class="guide-head">
          <span class="guide-kicker">{{ step.kicker }}</span>
          <span class="guide-count mono">{{ currentStep + 1 }} / {{ steps.length }}</span>
        </header>

        <!-- 每个功能配一小段循环演示，比纯文字更快建立印象 -->
        <div class="guide-stage">
          <div v-if="step.key === 'welcome'" class="demo-welcome">
            <span class="demo-orbit outer"></span>
            <span class="demo-orbit inner"></span>
            <span class="demo-mark" :style="markStyle"></span>
          </div>

          <div v-else-if="step.key === 'toolbar'" class="demo-toolbar">
            <span class="demo-fold"><ChevronsLeft :size="13" /></span>
            <span v-for="slot in 3" :key="slot" class="demo-tool"></span>
          </div>

          <div v-else-if="step.key === 'heartbeat'" class="demo-heart">
            <div class="demo-heart-queue" aria-hidden="true">
              <span v-for="row in 3" :key="row" class="demo-heart-row">
                <i></i>
                <span class="demo-heart-line"><b></b><b class="short"></b></span>
              </span>
            </div>
            <span class="demo-heart-core">
              <span class="demo-heart-ring"></span>
              <span class="demo-heart-ring late"></span>
              <span class="demo-heart-btn"><Sparkles :size="16" /></span>
            </span>
          </div>

          <div v-else-if="step.key === 'login'" class="demo-login">
            <div class="demo-platforms">
              <span class="demo-platform active">
                <img :src="neteaseLogo" alt="" />
                <i class="demo-platform-ring"></i>
              </span>
              <span class="demo-platform soon"><img :src="qqLogo" alt="" /></span>
              <span class="demo-platform soon"><img :src="sodaLogo" alt="" /></span>
            </div>
            <div class="demo-login-copy">
              <strong>选择要连接的音乐平台</strong>
              <small>网易云与汽水已接入，QQ 音乐陆续开放</small>
            </div>
          </div>

          <div v-else-if="step.key === 'listen'" class="demo-listen">
            <span class="demo-listen-logo">
              <img :src="neteaseLogo" alt="" />
              <i class="demo-listen-pulse"></i>
            </span>
            <span class="demo-listen-bars" aria-hidden="true">
              <b v-for="bar in 5" :key="bar" :style="{ animationDelay: `${bar * 0.12}s` }"></b>
            </span>
            <span class="demo-listen-badge mono">30s</span>
          </div>

          <div v-else-if="step.key === 'lyric'" class="demo-lyric">
            <span class="demo-lyric-desktop"></span>
            <span class="demo-lyric-pin">置顶</span>
            <div class="demo-lyric-card">
              <span class="demo-lyric-cover"></span>
              <span class="demo-lyric-body">
                <span class="demo-lyric-title"><b></b><b class="short"></b></span>
                <span class="demo-lyric-line"><i></i></span>
              </span>
              <span class="demo-lyric-ctl"><Subtitles :size="12" /></span>
            </div>
          </div>

          <div v-else class="demo-layout">
            <span class="demo-dock"><LayoutGrid :size="13" /></span>
            <div class="demo-flow">
              <div v-for="row in 3" :key="row" class="demo-row" :class="{ alt: row % 2 === 0 }">
                <span v-for="col in 6" :key="col" class="demo-tile"></span>
              </div>
            </div>
          </div>
        </div>

        <transition name="guide-copy" mode="out-in">
          <div :key="step.key" class="guide-copy">
            <h2>{{ step.title }}</h2>
            <p>{{ step.desc }}</p>
          </div>
        </transition>

        <button ref="nextRef" class="guide-next" @click="next">
          <span>{{ step.button }}</span>
          <ArrowRight :size="14" />
        </button>

        <div class="guide-dots" aria-hidden="true">
          <span
            v-for="(item, index) in steps"
            :key="item.key"
            :class="{ active: index === currentStep, done: index < currentStep }"
          ></span>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import gsap from 'gsap'
import { ArrowRight, ChevronsLeft, LayoutGrid, Sparkles, Subtitles } from '@lucide/vue'
import logoMark from '../assets/logo-mark.png'
import neteaseLogo from '../assets/platforms/netease.png'
import qqLogo from '../assets/platforms/qq.png'
import sodaLogo from '../assets/platforms/soda.png'

type StepKey = 'welcome' | 'toolbar' | 'login' | 'heartbeat' | 'lyric' | 'listen' | 'layout'

interface GuideStep {
  key: StepKey
  kicker: string
  title: string
  desc: string
  button: string
  anchor?: string
}

const emit = defineEmits<{
  close: []
  'expand-toolbar': []
}>()

const steps: GuideStep[] = [
  {
    key: 'welcome',
    kicker: 'WELCOME',
    title: '欢迎来到 DaFen Radio',
    desc: '歌单、播放和歌词都收在同一个桌面里。先花十几秒，认识几个最常用的入口。',
    button: '知道了，下一步'
  },
  {
    key: 'toolbar',
    kicker: 'STEP 01 · 工具栏',
    title: '右上角箭头，展开功能',
    desc: '工具栏默认收起，只留下这个箭头按钮。展开后，搜索、平台、设置这些常用按钮才会露出来。',
    button: '展开看看',
    anchor: '.fold-trigger'
  },
  {
    key: 'login',
    kicker: 'STEP 02 · 账号',
    title: '点右上角平台按钮，连接账号',
    desc: '右上角的按钮是平台入口，点开它选择要连接的音乐平台。登录后，歌单、收藏和每日推荐会同步到这张画布上。',
    button: '知道了，下一步',
    anchor: '.platform-trigger'
  },
  {
    key: 'heartbeat',
    kicker: 'STEP 03 · 心动模式',
    title: '星光按钮，连续推荐同风格歌曲',
    desc: '登录后，点播放栏最右侧的星光按钮：它会以当前歌曲为种子，从你的收藏和歌单里接着推荐。没有正在播放的歌时，会从红心或上次播放继续；汽水账号下则播放官方推荐流。',
    button: '知道了，下一步',
    anchor: '.recommend-btn'
  },
  {
    key: 'lyric',
    kicker: 'STEP 04 · 桌面歌词',
    title: '字幕按钮，歌词浮在桌面上',
    desc: '点播放栏里的字幕按钮，歌词会变成一条置顶的小窗：封面、歌名和当前歌词都在里面，上一首、播放、收藏可以直接操作。主窗口收进托盘后，它依然留在桌面上。',
    button: '知道了，下一步',
    anchor: '.lyric-toggle'
  },
  {
    key: 'layout',
    kicker: 'STEP 05 · 排布',
    title: '左上角圆钮，切换排布',
    desc: '探索页左上角的圆钮可以在格阵、行云和斜向之间切换排布，菜单里还能把封面切成圆形或方形，下面的「可移动」用来拖动或锁定画布。',
    button: '知道了，下一步',
    anchor: '.layout-trigger'
  },
  {
    key: 'listen',
    kicker: 'STEP 06 · 听歌记录',
    title: '在这里听，也计入听歌时长',
    desc: '网易云账号下，单曲实际播放满 30 秒会自动打卡一次，进入最近播放与听歌排行，累计进听歌时长和等级成长。汽水暂未开放上报，暂不计入。',
    button: '知道了，开始探索'
  }
]

const CARD_W = 344
const MARGIN = 18

const currentStep = ref(0)
const cardRef = ref<HTMLElement | null>(null)
const nextRef = ref<HTMLButtonElement | null>(null)
const anchorRect = ref<DOMRect | null>(null)
const slotStyle = ref<Record<string, string>>({})

const step = computed(() => steps[currentStep.value])
const markStyle = {
  WebkitMaskImage: `url(${logoMark})`,
  maskImage: `url(${logoMark})`
}

const spotStyle = computed(() => {
  const rect = anchorRect.value
  if (!rect) return null
  const pad = 7
  return {
    top: `${rect.top - pad}px`,
    left: `${rect.left - pad}px`,
    width: `${rect.width + pad * 2}px`,
    height: `${rect.height + pad * 2}px`
  }
})

let measureTimer: ReturnType<typeof setTimeout> | undefined

function measureAnchor() {
  const selector = step.value.anchor
  if (!selector) {
    anchorRect.value = null
    return
  }
  const target = document.querySelector(selector) as HTMLElement | null
  anchorRect.value = target ? target.getBoundingClientRect() : null
}

function positionCard() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const cardH = cardRef.value?.offsetHeight || 380
  const rect = anchorRect.value
  const maxLeft = Math.max(MARGIN, vw - CARD_W - MARGIN)
  const maxTop = Math.max(MARGIN, vh - cardH - MARGIN)
  let left = (vw - CARD_W) / 2
  let top = (vh - cardH) / 2

  if (rect) {
    if (step.value.key === 'heartbeat' || step.value.key === 'lyric') {
      // 星光/桌面歌词按钮都在底部播放栏：卡片浮在它上方，右边对齐
      left = Math.min(maxLeft, Math.max(MARGIN, rect.right - CARD_W))
      top = Math.min(maxTop, Math.max(MARGIN, rect.top - cardH - 14))
    } else if (step.value.key === 'toolbar' || step.value.key === 'login') {
      // 顶栏按钮在右上角：卡片挂在它下方，右边对齐
      left = Math.min(maxLeft, Math.max(MARGIN, rect.right - CARD_W))
      top = Math.min(maxTop, Math.max(MARGIN, rect.bottom + 14))
    } else {
      // 排布按钮在左上角：卡片放在它右侧
      left = Math.min(maxLeft, Math.max(MARGIN, rect.right + 16))
      top = Math.min(maxTop, Math.max(MARGIN, rect.top - 6))
    }
  }

  slotStyle.value = { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` }
}

// 排布按钮要等歌单加载后才挂载，找不到时短暂轮询几次再定位
function trackAnchor(attempt = 0) {
  clearTimeout(measureTimer)
  measureAnchor()
  if (anchorRect.value || !step.value.anchor || attempt >= 4) {
    positionCard()
    return
  }
  measureTimer = setTimeout(() => {
    measureAnchor()
    if (anchorRect.value) positionCard()
    else trackAnchor(attempt + 1)
  }, 450)
}

function playEntrance() {
  const card = cardRef.value
  if (!card) return
  gsap.killTweensOf(card)
  gsap.fromTo(card,
    { opacity: 0, y: 10, scale: 0.97 },
    { opacity: 1, y: 0, scale: 1, duration: 0.42, ease: 'power3.out', clearProps: 'transform' }
  )
}

async function goTo(index: number) {
  currentStep.value = index
  await nextTick()
  if (step.value.key === 'login') {
    // 平台按钮藏在收起的工具栏里，先让主界面展开工具栏，等动画落定再定位
    emit('expand-toolbar')
    clearTimeout(measureTimer)
    measureTimer = setTimeout(() => trackAnchor(), 620)
  } else {
    trackAnchor()
  }
  playEntrance()
  nextRef.value?.focus({ preventScroll: true })
}

function finish() {
  const card = cardRef.value
  if (!card) {
    emit('close')
    return
  }
  gsap.killTweensOf(card)
  gsap.to(card, {
    opacity: 0,
    scale: 0.96,
    y: -8,
    duration: 0.26,
    ease: 'power2.in',
    onComplete: () => emit('close')
  })
}

function next() {
  if (currentStep.value >= steps.length - 1) finish()
  else void goTo(currentStep.value + 1)
}

function handleResize() {
  measureAnchor()
  positionCard()
}

onMounted(async () => {
  await nextTick()
  trackAnchor()
  playEntrance()
  nextRef.value?.focus({ preventScroll: true })
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  clearTimeout(measureTimer)
  window.removeEventListener('resize', handleResize)
  if (cardRef.value) gsap.killTweensOf(cardRef.value)
})
</script>

<style scoped>
.guide-layer {
  position: fixed;
  inset: 0;
  z-index: 99999;
  color: var(--text-primary);
  animation: guide-fade 0.28s ease both;
}

@keyframes guide-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.guide-dim {
  position: absolute;
  inset: 0;
  background: rgba(24, 18, 36, 0.68);
}

.guide-hole {
  position: absolute;
  border-radius: 18px;
  pointer-events: none;
  box-shadow:
    0 0 0 9999px rgba(24, 18, 36, 0.68),
    0 0 0 1px rgba(255, 255, 255, 0.68),
    0 0 28px color-mix(in srgb, var(--amber) 45%, transparent);
  transition:
    top 0.42s cubic-bezier(0.4, 0, 0.2, 1),
    left 0.42s cubic-bezier(0.4, 0, 0.2, 1),
    width 0.42s cubic-bezier(0.4, 0, 0.2, 1),
    height 0.42s cubic-bezier(0.4, 0, 0.2, 1);
}

.guide-slot {
  position: absolute;
  width: 344px;
  transition:
    left 0.42s cubic-bezier(0.4, 0, 0.2, 1),
    top 0.42s cubic-bezier(0.4, 0, 0.2, 1);
}

.guide-card {
  padding: 15px 17px 13px;
  border-radius: 22px;
  /* 背后是 0.68 的暗色遮罩，卡片太透会让正文糊掉，这里用更亮的磨砂玻璃 */
  background: linear-gradient(155deg, rgba(255, 255, 255, 0.82), rgba(248, 244, 255, 0.68));
  border: 1px solid rgba(255, 255, 255, 0.72);
  box-shadow:
    0 24px 64px rgba(28, 20, 46, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(40px) saturate(1.4);
  -webkit-backdrop-filter: blur(40px) saturate(1.4);
}

.guide-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.guide-kicker {
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--brand-accent);
}

.guide-count {
  font-size: 10px;
  color: var(--text-muted);
}

.guide-stage {
  position: relative;
  height: 148px;
  margin: 11px 0 13px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  overflow: hidden;
  background: linear-gradient(160deg, rgba(255, 248, 246, 0.92), rgba(244, 240, 251, 0.94));
  border: 1px solid rgba(120, 100, 160, 0.12);
}

/* ---- 欢迎 ---- */
.demo-welcome {
  position: relative;
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
}

.demo-orbit {
  position: absolute;
  border-radius: 50%;
  border: 1px dashed color-mix(in srgb, var(--amber) 22%, transparent);
}

.demo-orbit.outer {
  width: 124px;
  height: 124px;
  animation: orbit-spin 16s linear infinite;
}

.demo-orbit.inner {
  width: 88px;
  height: 88px;
  border-style: solid;
  border-color: color-mix(in srgb, var(--amber) 14%, transparent);
  animation: orbit-spin 10s linear infinite reverse;
}

@keyframes orbit-spin {
  to { transform: rotate(360deg); }
}

.demo-mark {
  width: 52px;
  height: 52px;
  background: linear-gradient(150deg, var(--amber-bright), var(--amber-dim));
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
  filter: drop-shadow(0 8px 18px color-mix(in srgb, var(--amber) 26%, transparent));
  animation: mark-breathe 3s ease-in-out infinite;
}

@keyframes mark-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}

/* ---- 工具栏展开 ---- */
.demo-toolbar {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
}

.demo-fold {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--brand-accent);
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.96);
  box-shadow: 0 8px 18px rgba(70, 55, 110, 0.14);
  animation: fold-nudge 3.4s ease-in-out infinite;
}

@keyframes fold-nudge {
  0%, 18% { transform: translateX(0); }
  34%, 62% { transform: translateX(-6px); }
  78%, 100% { transform: translateX(0); }
}

.demo-tool {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.66);
  border: 1px solid rgba(120, 100, 160, 0.14);
  animation: tool-slide 3.4s ease-in-out infinite;
}

.demo-tool:nth-child(3) { animation-delay: 0.1s; }
.demo-tool:nth-child(4) { animation-delay: 0.2s; }

@keyframes tool-slide {
  0%, 26% { opacity: 0; transform: translateX(-10px) scale(0.82); }
  42%, 84% { opacity: 1; transform: translateX(0) scale(1); }
  100% { opacity: 0; transform: translateX(-10px) scale(0.82); }
}

/* ---- 账号：多平台入口 ---- */
.demo-login {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.demo-platforms {
  display: flex;
  align-items: center;
  gap: 16px;
}

.demo-platform {
  position: relative;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: #fff;
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 8px 20px rgba(70, 55, 110, 0.12);
  animation: platform-pop 0.6s cubic-bezier(0.3, 1.4, 0.6, 1) both;
}

.demo-platform:nth-child(2) { animation-delay: 0.08s; }
.demo-platform:nth-child(3) { animation-delay: 0.16s; }

.demo-platform img {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  object-fit: cover;
}

.demo-platform.soon img {
  opacity: 0.38;
  filter: grayscale(0.4);
}

.demo-platform.active {
  border-color: var(--brand-accent-line);
}

.demo-platform-ring {
  position: absolute;
  inset: -5px;
  border-radius: 18px;
  border: 1.5px solid color-mix(in srgb, var(--amber) 42%, transparent);
  animation: platform-pulse 2.8s ease-out infinite;
}

@keyframes platform-pulse {
  0% { opacity: 0.7; transform: scale(0.94); }
  70%, 100% { opacity: 0; transform: scale(1.12); }
}

@keyframes platform-pop {
  from { opacity: 0; transform: translateY(8px) scale(0.9); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.demo-login-copy {
  display: grid;
  gap: 4px;
  text-align: center;
}

.demo-login-copy strong {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.demo-login-copy small {
  font-size: 10px;
  line-height: 1.4;
  color: var(--text-ghost);
}

/* ---- 心动模式 ---- */
.demo-heart {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 22px;
}

.demo-heart-queue {
  display: grid;
  gap: 6px;
}

.demo-heart-row {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 112px;
  padding: 5px 7px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.92);
  box-shadow: 0 6px 14px rgba(70, 55, 110, 0.08);
  animation: heart-row 3.4s ease-in-out infinite both;
}

.demo-heart-row:nth-child(2) { animation-delay: 0.16s; }
.demo-heart-row:nth-child(3) { animation-delay: 0.32s; }

.demo-heart-row i {
  flex: none;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  background: linear-gradient(140deg, color-mix(in srgb, var(--amber-bright) 72%, #fff), color-mix(in srgb, var(--amber-dim) 52%, #fff));
}

.demo-heart-line {
  flex: 1;
  display: grid;
  gap: 3px;
}

.demo-heart-line b {
  display: block;
  height: 4px;
  border-radius: 999px;
  background: rgba(90, 75, 130, 0.16);
}

.demo-heart-line b.short {
  width: 58%;
  opacity: 0.65;
}

.demo-heart-core {
  position: relative;
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
}

.demo-heart-btn {
  position: relative;
  z-index: 1;
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--amber);
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.98);
  box-shadow: 0 9px 20px rgba(70, 55, 110, 0.14);
  animation: heart-core 3.4s ease-in-out infinite;
}

.demo-heart-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1.5px solid color-mix(in srgb, var(--amber) 36%, transparent);
  animation: heart-ring 3.4s ease-out infinite;
}

.demo-heart-ring.late { animation-delay: 1.7s; }

@keyframes heart-row {
  0%, 10% { opacity: 0; transform: translateX(12px) scale(0.96); }
  32%, 76% { opacity: 1; transform: translateX(0) scale(1); }
  100% { opacity: 0; transform: translateX(12px) scale(0.96); }
}

@keyframes heart-core {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

@keyframes heart-ring {
  0% { opacity: 0.75; transform: scale(0.92); }
  70%, 100% { opacity: 0; transform: scale(1.45); }
}

/* ---- 听歌记录 ---- */
.demo-listen {
  display: flex;
  align-items: center;
  gap: 18px;
}

.demo-listen-logo {
  position: relative;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 8px 18px rgba(70, 55, 110, 0.12);
}

.demo-listen-logo img {
  width: 28px;
  height: 28px;
  border-radius: 50%;
}

.demo-listen-pulse {
  position: absolute;
  inset: -5px;
  border-radius: 50%;
  border: 1.5px solid color-mix(in srgb, var(--amber) 40%, transparent);
  animation: listen-pulse 2.4s ease-out infinite;
}

.demo-listen-bars {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 32px;
}

.demo-listen-bars b {
  width: 4px;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--amber) 55%, #fff), var(--amber));
  transform-origin: bottom center;
  animation: listen-bar 1.1s ease-in-out infinite;
}

.demo-listen-bars b:nth-child(1) { height: 34%; }
.demo-listen-bars b:nth-child(2) { height: 62%; }
.demo-listen-bars b:nth-child(3) { height: 88%; }
.demo-listen-bars b:nth-child(4) { height: 54%; }
.demo-listen-bars b:nth-child(5) { height: 76%; }

.demo-listen-badge {
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: var(--amber);
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid color-mix(in srgb, var(--amber) 24%, transparent);
  box-shadow: 0 6px 14px rgba(70, 55, 110, 0.08);
}

@keyframes listen-pulse {
  0% { opacity: 0.7; transform: scale(0.9); }
  70%, 100% { opacity: 0; transform: scale(1.35); }
}

@keyframes listen-bar {
  0%, 100% { transform: scaleY(0.4); opacity: 0.7; }
  50% { transform: scaleY(1); opacity: 1; }
}

/* ---- 桌面歌词 ---- */
.demo-lyric {
  position: relative;
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
}

.demo-lyric-desktop {
  position: absolute;
  width: 238px;
  height: 100px;
  border-radius: 16px;
  background: linear-gradient(150deg, rgba(52, 42, 78, 0.14), rgba(52, 42, 78, 0.05));
  border: 1px dashed rgba(90, 75, 130, 0.22);
}

.demo-lyric-pin {
  position: absolute;
  top: 31px;
  left: 48px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--amber);
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid color-mix(in srgb, var(--amber) 22%, transparent);
  box-shadow: 0 5px 12px rgba(70, 55, 110, 0.1);
  animation: lyric-pin 3.6s ease-in-out infinite;
}

.demo-lyric-pin::before {
  content: '';
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--amber);
}

.demo-lyric-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  width: 216px;
  padding: 9px 10px;
  border-radius: 13px;
  background: #fff;
  border: 1px solid rgba(255, 255, 255, 0.96);
  box-shadow: 0 12px 26px rgba(48, 36, 76, 0.18);
  animation: lyric-float 3.6s ease-in-out infinite;
}

@keyframes lyric-float {
  0%, 100% { transform: translateY(2px); }
  50% { transform: translateY(-4px); }
}

@keyframes lyric-pin {
  0%, 100% { opacity: 0.75; }
  50% { opacity: 1; }
}

.demo-lyric-cover {
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: linear-gradient(140deg, color-mix(in srgb, var(--amber-bright) 78%, #fff), color-mix(in srgb, var(--amber-dim) 54%, #fff));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.5);
}

.demo-lyric-body {
  flex: 1;
  display: grid;
  gap: 6px;
  min-width: 0;
}

.demo-lyric-title {
  display: flex;
  gap: 4px;
}

.demo-lyric-title b {
  width: 46px;
  height: 4px;
  border-radius: 999px;
  background: rgba(90, 75, 130, 0.22);
}

.demo-lyric-title b.short {
  width: 26px;
  opacity: 0.6;
}

.demo-lyric-line {
  position: relative;
  height: 5px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(90, 75, 130, 0.1);
}

.demo-lyric-line i {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(90deg, color-mix(in srgb, var(--amber) 20%, transparent), var(--amber));
  transform-origin: left center;
  animation: lyric-fill 3.6s ease-in-out infinite;
}

@keyframes lyric-fill {
  0%, 14% { transform: scaleX(0.12); opacity: 0.5; }
  52%, 82% { transform: scaleX(1); opacity: 1; }
  100% { transform: scaleX(0.12); opacity: 0.5; }
}

.demo-lyric-ctl {
  flex: none;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--amber);
  background: color-mix(in srgb, var(--amber) 10%, #fff);
  border: 1px solid color-mix(in srgb, var(--amber) 18%, transparent);
  animation: lyric-ctl 3.6s ease-in-out infinite;
}

@keyframes lyric-ctl {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--amber) 26%, transparent); }
  50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--amber) 0%, transparent); }
}

/* ---- 排布 ---- */
.demo-layout {
  position: relative;
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
}

.demo-dock {
  position: absolute;
  top: 12px;
  left: 14px;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.82);
  color: var(--brand-accent);
  animation: dock-pulse 3s ease-in-out infinite;
}

@keyframes dock-pulse {
  0%, 100% { box-shadow: 0 6px 16px rgba(70, 55, 110, 0.12), 0 0 0 0 color-mix(in srgb, var(--amber) 30%, transparent); }
  50% { box-shadow: 0 6px 16px rgba(70, 55, 110, 0.12), 0 0 0 7px color-mix(in srgb, var(--amber) 0%, transparent); }
}

.demo-flow {
  display: grid;
  gap: 7px;
  padding-top: 14px;
}

.demo-row {
  display: flex;
  gap: 7px;
  animation: row-drift 7s ease-in-out infinite;
}

.demo-row.alt {
  animation-name: row-drift-alt;
}

.demo-tile {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: linear-gradient(140deg, color-mix(in srgb, var(--amber-bright) 88%, transparent), color-mix(in srgb, var(--amber-dim) 72%, transparent));
  animation: tile-morph 7s ease-in-out infinite;
}

@keyframes tile-morph {
  0%, 10% { border-radius: 50%; transform: scale(0.76); }
  38%, 66% { border-radius: 4px; transform: scale(1); }
  94%, 100% { border-radius: 50%; transform: scale(0.76); }
}

@keyframes row-drift {
  0%, 40% { transform: translateX(0); }
  58%, 80% { transform: translateX(9px); }
  100% { transform: translateX(0); }
}

@keyframes row-drift-alt {
  0%, 40% { transform: translateX(0); }
  58%, 80% { transform: translateX(-9px); }
  100% { transform: translateX(0); }
}

/* ---- 文案与操作 ---- */
.guide-copy h2 {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.guide-copy p {
  margin-top: 7px;
  font-size: 12px;
  line-height: 1.65;
  color: var(--text-secondary);
}

.guide-next {
  width: 100%;
  height: 38px;
  margin-top: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(140deg, var(--amber-bright), var(--amber-dim));
  box-shadow: 0 10px 24px color-mix(in srgb, var(--amber) 28%, transparent);
  transition: transform var(--t-fast), box-shadow var(--t-fast);
}

.guide-next:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 30px color-mix(in srgb, var(--amber) 34%, transparent);
}

.guide-next:active {
  transform: translateY(0) scale(0.99);
}

.guide-dots {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-top: 11px;
}

.guide-dots span {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: rgba(70, 55, 110, 0.16);
  transition: width 0.3s ease, background 0.3s ease;
}

.guide-dots span.active {
  width: 16px;
  background: var(--brand-accent);
}

.guide-dots span.done {
  background: color-mix(in srgb, var(--amber) 40%, transparent);
}

.guide-copy-enter-active,
.guide-copy-leave-active {
  transition: opacity 0.18s ease, transform 0.22s ease;
}

.guide-copy-enter-from {
  opacity: 0;
  transform: translateX(10px);
}

.guide-copy-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

@media (prefers-reduced-motion: reduce) {
  .demo-orbit,
  .demo-mark,
  .demo-fold,
  .demo-tool,
  .demo-platform,
  .demo-platform-ring,
  .demo-heart-btn,
  .demo-heart-ring,
  .demo-heart-row,
  .demo-listen-pulse,
  .demo-listen-bars b,
  .demo-lyric-card,
  .demo-lyric-pin,
  .demo-lyric-line i,
  .demo-lyric-ctl,
  .demo-dock,
  .demo-row,
  .demo-tile {
    animation: none;
  }
}
</style>
