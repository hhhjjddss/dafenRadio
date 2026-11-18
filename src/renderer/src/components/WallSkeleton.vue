<template>
  <div
    class="wall-skeleton"
    :class="[variant, { backdrop }]"
    :style="skeletonVars"
    role="status"
    aria-live="polite"
    :aria-label="label"
  >
    <div class="wall-skeleton-pattern" aria-hidden="true"></div>
    <div v-if="statusTitle" class="wall-skeleton-status">
      <span class="wall-skeleton-dot" aria-hidden="true"></span>
      <span class="wall-skeleton-copy">
        <span class="wall-skeleton-kicker mono">{{ statusKicker }}</span>
        <strong>{{ statusTitle }}</strong>
        <small>{{ statusHint }}</small>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

// 照片墙加载骨架：铺满父容器，用纯 CSS 生成格纹 + 一道扫光。
// 详情页（方形封面墙）与探索页（方形 / 圆形封面墙）共用，避免各自维护一套骨架样式。
const props = withDefaults(defineProps<{
  // 格距：相邻格子的中心距（探索页与详情页都是 180）
  pitch?: number
  // 格子实际尺寸：方形墙多画 1px 叠压避免发丝缝
  tile?: number
  // square=无缝棋盘格；dot=圆形封面墙的圆点阵
  variant?: 'square' | 'dot'
  // 探索页需要不透明浅色底盖住真实画布，详情页直接叠在封面虚化上
  backdrop?: boolean
  // 探索页画布整体缩放，格纹同步缩放以对齐真实封面
  scale?: number
  label?: string
  // 有 statusTitle 时才显示底部状态卡
  statusKicker?: string
  statusTitle?: string
  statusHint?: string
}>(), {
  pitch: 180,
  tile: 181,
  variant: 'square',
  backdrop: false,
  scale: 1,
  label: '正在载入',
  statusKicker: '',
  statusTitle: '',
  statusHint: ''
})

const skeletonVars = computed(() => ({
  '--sk-pitch': `${props.pitch}px`,
  '--sk-tile': `${props.tile}px`,
  '--sk-scale': String(props.scale)
}))
</script>

<style scoped>
.wall-skeleton {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
/* 探索页需要整面不透明遮罩盖住下面的真实封面，等解码完再揭开 */
.wall-skeleton.backdrop {
  background:
    radial-gradient(58% 48% at 50% 42%, color-mix(in srgb, var(--ex-accent, #6d5df0) 10%, transparent), transparent 74%),
    linear-gradient(178deg, #fcfaff 0%, #f4f0fb 58%, #ece7f6 100%);
}
.wall-skeleton-pattern {
  position: absolute;
  inset: 0;
  transform: scale(var(--sk-scale, 1));
  transform-origin: 50% 50%;
}
/* 方形封面墙：45° 菱形棋盘，与 181px 无缝封面对齐 */
.wall-skeleton.square {
  background-color: rgba(70, 55, 110, 0.05);
}
.wall-skeleton.square .wall-skeleton-pattern {
  background-image:
    linear-gradient(45deg, rgba(70, 55, 110, 0.1) 25%, transparent 25%, transparent 75%, rgba(70, 55, 110, 0.1) 75%),
    linear-gradient(45deg, rgba(70, 55, 110, 0.1) 25%, transparent 25%, transparent 75%, rgba(70, 55, 110, 0.1) 75%);
  background-size: calc(var(--sk-pitch) * 2) calc(var(--sk-pitch) * 2);
  background-position: 0 0, var(--sk-pitch) var(--sk-pitch);
}
/* 圆形封面墙：圆点阵，圆片直径对齐真实封面 */
.wall-skeleton.dot .wall-skeleton-pattern {
  background-image: radial-gradient(
    circle,
    rgba(116, 100, 150, 0.16) 0,
    rgba(116, 100, 150, 0.16) calc(var(--sk-tile) / 2),
    transparent calc(var(--sk-tile) / 2 + 1px)
  );
  background-size: var(--sk-pitch) var(--sk-pitch);
}
/* 单条高光扫过整面墙，比为每块骨架各跑一条动画省得多 */
.wall-skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  background: linear-gradient(102deg, transparent 24%, rgba(255, 255, 255, 0.5) 50%, transparent 76%);
  transform: translateX(-100%);
  animation: wall-skeleton-sweep 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  pointer-events: none;
}
@keyframes wall-skeleton-sweep {
  to { transform: translateX(100%); }
}
/* 底部状态卡：仅探索页使用 */
.wall-skeleton-status {
  position: absolute;
  left: 50%;
  bottom: 22px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 15px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.68);
  border: 1px solid rgba(255, 255, 255, 0.82);
  box-shadow: 0 10px 26px rgba(70, 55, 110, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(18px) saturate(1.3);
  -webkit-backdrop-filter: blur(18px) saturate(1.3);
  translate: -50% 0;
}
.wall-skeleton-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ex-accent, #6d5df0);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ex-accent, #6d5df0) 14%, transparent);
  animation: wall-skeleton-dot 1.8s ease-in-out infinite;
}
.wall-skeleton-copy {
  display: grid;
  gap: 1px;
}
.wall-skeleton-kicker {
  color: var(--ex-accent, #6d5df0);
  font-size: 8px;
  letter-spacing: 0.22em;
}
.wall-skeleton-copy strong {
  color: var(--text-primary);
  font: 600 12px/1.35 var(--font-body);
  letter-spacing: 0.04em;
}
.wall-skeleton-copy small {
  color: var(--text-ghost);
  font-size: 10px;
  letter-spacing: 0.03em;
}
@keyframes wall-skeleton-dot {
  0%, 100% { opacity: 0.55; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .wall-skeleton::after { animation: none; opacity: 0; }
  .wall-skeleton-dot { animation: none; }
}
</style>
