<template>
  <div
    v-if="visible"
    class="boot-splash"
    :style="{ '--boot-dur': `${durationMs}ms` }"
    aria-hidden="true"
  >
    <div class="boot-core">
      <!-- === logo 符号：用 mask 渲染，明暗主题自动适配 === -->
      <span class="boot-mark" :style="markStyle">
        <span class="boot-sheen"></span>
      </span>

      <!-- === 品牌字标 === -->
      <div class="boot-word">dafen Radio</div>

      <!-- === 进度细线：自动从左到右画完 === -->
      <span class="boot-line"></span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 开屏启动页 ——「落款」式构图
 * ------------------------------------------------------------
 * 结构：logo 符号 + 品牌字标 + 一根自动画完的细线
 * 动画：整体一次进场 → 细线画完 → 整体淡出收尾
 * 视觉与镜像自 BootSplash 模板（BootSplash.tsx / boot-splash.css）
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import logoMark from '../assets/logo-mark.png'
import '../assets/styles/boot-splash.css'

/**
 * 开屏动画总时长 (ms)。调大 = 整体等比放慢（进场、细线、淡出都按百分比联动）。
 * 想再慢就继续加，例如 6500 / 8000。
 */
const BOOT_MS = 5200

const props = withDefaults(defineProps<{ durationMs?: number }>(), {
  durationMs: BOOT_MS
})

const emit = defineEmits<{
  complete: []
}>()

const visible = ref(true)

const markStyle = computed(() => ({
  WebkitMaskImage: `url(${logoMark})`,
  maskImage: `url(${logoMark})`
}))

let timer: ReturnType<typeof setTimeout> | undefined

onMounted(() => {
  timer = setTimeout(() => {
    visible.value = false
    emit('complete')
  }, props.durationMs)
})

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>
