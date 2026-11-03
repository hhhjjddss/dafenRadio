<template>
  <transition name="search-fade">
    <div v-if="open" class="search-overlay" @click.self="emit('close')">
      <section class="search-dialog" :class="{ filled: searchFilled }" role="dialog" aria-modal="true" aria-label="搜索音乐">
        <div class="search-dialog-field">
          <Search :size="18" class="sd-icon" />
          <input
            ref="searchInput"
            v-model="draft"
            :aria-label="platform === 'soda' ? '搜索汽水歌单' : '搜索歌曲'"
            :placeholder="platform === 'soda' ? '搜索汽水歌单…' : '搜索歌曲、歌手、专辑…'"
            autocomplete="off"
            spellcheck="false"
            @keydown.enter="onSearchEnter"
          />
          <button v-if="keyword" class="sd-clear" aria-label="清空搜索" @click="clear"><X :size="14" /></button>
          <button class="sd-esc mono" aria-label="关闭搜索" @click="emit('close')">ESC</button>
        </div>

        <div ref="searchListEl" class="search-dialog-body">
          <div v-if="!busy && !searched" class="sd-idle">
            <span class="sd-idle-icon"><Search :size="22" /></span>
            <p>{{ platform === 'soda' ? '输入关键词，发现汽水歌单' : '输入关键词，发现你的音乐' }}</p>
          </div>
          <div v-else-if="busy" class="sd-state sd-fill"><i class="sd-spinner"></i>正在搜索…</div>
          <template v-else>
            <div class="sd-summary">
              <span v-if="platform === 'soda'">「<em>{{ submittedKeyword }}</em>」<i class="mono">{{ sodaResults.length }} 份歌单</i></span>
              <span v-else>「<em>{{ submittedKeyword }}</em>」<i class="mono">{{ results.length }} 首</i></span>
              <button v-if="platform !== 'soda' && results.length" class="sd-playall" @click="emit('play-all')">
                <Play :size="12" fill="currentColor" />播放全部
              </button>
            </div>
            <template v-if="platform === 'soda'">
              <div v-if="!sodaResults.length" class="sd-state sd-fill"><Search :size="14" />没有找到「{{ submittedKeyword }}」</div>
              <div v-else class="sd-results">
                <button
                  v-for="(list, index) in sodaResults"
                  :key="list.id"
                  class="sd-row"
                  @click="emit('open-playlist', list)"
                >
                  <span class="sd-index mono">{{ String(index + 1).padStart(2, '0') }}</span>
                  <span class="sd-cover">
                    <img v-if="list.cover" :src="list.cover" alt="" loading="lazy" @error="fallbackCoverOnError" />
                    <i v-else><ListMusic :size="14" /></i>
                  </span>
                  <span class="sd-copy">
                    <span class="sd-title"><strong>{{ list.name }}</strong></span>
                    <small>{{ list.creator || '汽水音乐' }}</small>
                  </span>
                  <span class="sd-duration mono">{{ list.count ? `${list.count} 首` : '歌单' }}</span>
                  <span class="sd-play"><ListMusic :size="12" /></span>
                </button>
              </div>
            </template>
            <template v-else>
            <div v-if="!results.length" class="sd-state sd-fill"><Search :size="14" />没有找到「{{ submittedKeyword }}」</div>
            <div v-else class="sd-results">
              <button
                v-for="(track, index) in results"
                :key="track.songmid"
                class="sd-row"
                :class="{ unavailable: track.unavailable, current: currentSongmid === track.songmid }"
                @click="emit('play-track', track, index)"
              >
                <span class="sd-index mono">
                  <AudioLines v-if="currentSongmid === track.songmid" :size="14" class="sd-live" :class="{ live: playing }" aria-hidden="true" />
                  <template v-else>{{ String(index + 1).padStart(2, '0') }}</template>
                </span>
                <span class="sd-cover">
                  <img v-if="track.img" :src="track.img" alt="" loading="lazy" @error="fallbackCoverOnError" />
                  <i v-else><Music2 :size="14" /></i>
                </span>
                <span class="sd-copy">
                  <span class="sd-title">
                    <strong>{{ track.name }}</strong>
                    <i v-if="track.unavailable" class="offline-tag">版权受限</i>
                    <i v-else-if="track.vip" class="vip-tag" :class="track.vip">{{ track.vip === 'paid' ? '付费' : 'VIP' }}</i>
                  </span>
                  <small>{{ track.singer }}<template v-if="track.album"> · {{ track.album }}</template></small>
                </span>
                <span class="sd-duration mono">{{ track.duration ? formatTime(track.duration) : '--:--' }}</span>
                <span class="sd-play"><Play :size="12" /></span>
              </button>
            </div>
            </template>
          </template>
        </div>
      </section>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { AudioLines, ListMusic, Music2, Play, Search, X } from '@lucide/vue'
import type { MusicInfo } from '../composables/useNetease'
import { fallbackCoverOnError } from '../utils/cover'

interface Playlist { id: string; name: string; cover: string; count?: number; creator?: string }

const props = defineProps<{
  open: boolean
  platform: 'netease' | 'soda'
  keyword: string
  results: MusicInfo[]
  sodaResults: Playlist[]
  busy: boolean
  searched: boolean
  submittedKeyword: string
  currentSongmid: string
  playing: boolean
}>()

const emit = defineEmits<{
  close: []
  'update:keyword': [value: string]
  submit: [word: string]
  clear: []
  'play-track': [track: MusicInfo, index: number]
  'play-all': []
  'open-playlist': [list: Playlist]
}>()

const draft = computed({
  get: () => props.keyword,
  set: (value: string) => emit('update:keyword', value)
})
const searchFilled = computed(() => props.busy || props.searched)
const searchListEl = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)

watch(() => props.open, async (open) => {
  if (!open) return
  await nextTick()
  searchInput.value?.focus()
  searchInput.value?.select()
})

watch(() => props.submittedKeyword, async () => {
  await nextTick()
  searchListEl.value?.scrollTo({ top: 0 })
})

function onSearchEnter(event: KeyboardEvent) {
  if (event.isComposing) return
  emit('submit', props.keyword.trim())
}

async function clear() {
  emit('clear')
  await nextTick()
  searchInput.value?.focus()
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}
</script>

<style scoped>
/* ---- 居中搜索浮层 ---- */
.search-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 72px 24px;
  overflow: hidden;
  background: rgba(43, 39, 56, 0.1);
}
.search-dialog {
  width: min(680px, 100%);
  min-height: min(58vh, 480px);
  max-height: min(70vh, 600px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.34);
  box-shadow: 0 18px 44px rgba(70, 55, 110, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(34px) saturate(1.35);
  -webkit-backdrop-filter: blur(34px) saturate(1.35);
}
.search-dialog-field {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 62px;
  padding: 0 14px 0 20px;
  border-bottom: 1px solid transparent;
  transition: border-color var(--t-fast);
}
.search-dialog.filled .search-dialog-field { border-bottom-color: var(--border-subtle); }
.sd-icon { flex: none; color: #191722; transition: color var(--t-fast); }
.search-dialog-field:focus-within .sd-icon { color: var(--amber); }
.search-dialog-field input {
  flex: 1;
  min-width: 0;
  color: #191722;
  font-size: 15.5px;
  letter-spacing: 0.02em;
}
.search-dialog-field input::placeholder { color: #191722; }
.sd-clear {
  flex: none;
  width: 24px; height: 24px;
  display: grid; place-items: center;
  border-radius: 50%;
  color: #191722;
  background: var(--bg-surface);
  transition: color var(--t-fast), background var(--t-fast);
}
.sd-clear:hover { color: #000; background: var(--bg-hover); }
.sd-esc {
  flex: none;
  padding: 3px 7px;
  border-radius: 7px;
  border: 1px solid var(--glass-border);
  background: rgba(255, 255, 255, 0.5);
  color: #191722;
  font-size: 9px;
  letter-spacing: 0.1em;
  transition: color var(--t-fast), border-color var(--t-fast);
}
.sd-esc:hover { color: #000; border-color: var(--glass-border-hover); }

.search-dialog-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 8px 10px 10px;
  scrollbar-width: thin;
}
.sd-idle {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding-bottom: 24px;
  color: #191722;
}
.sd-idle-icon {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  border: 1px solid var(--glass-border);
  background: rgba(255, 255, 255, 0.42);
}
.sd-idle p {
  color: #191722;
  font-size: 12px;
  letter-spacing: 0.06em;
}
.sd-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 28px 0;
  color: #191722;
  font-size: 11.5px;
  letter-spacing: 0.05em;
}
.sd-state.sd-fill { flex: 1; padding-bottom: 40px; }
.sd-spinner {
  width: 13px; height: 13px;
  border-radius: 50%;
  border: 1.5px solid var(--amber-border);
  border-top-color: var(--amber);
  animation: sd-spin 0.7s linear infinite;
}
@keyframes sd-spin { to { transform: rotate(360deg); } }

.sd-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 8px 10px;
  color: #191722;
  font-size: 11.5px;
  letter-spacing: 0.04em;
}
.sd-summary > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sd-summary em { color: #000; font-style: normal; font-weight: 500; }
.sd-summary .mono { margin-left: 6px; color: #191722; font-size: 10px; font-style: normal; }
.sd-playall {
  flex: none;
  display: inline-flex; align-items: center; gap: 6px;
  height: 28px; padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--amber-border);
  background: var(--amber-glass);
  color: var(--amber);
  font-size: 10.5px;
  letter-spacing: 0.05em;
  transition: background var(--t-fast), transform var(--t-fast);
}
.sd-playall:hover { background: var(--amber-hover); transform: translateY(-1px); }

.sd-results { display: grid; gap: 1px; }
.sd-row {
  width: 100%;
  display: flex; align-items: center; gap: 12px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid transparent;
  text-align: left;
  transition: background var(--t-fast), border-color var(--t-fast);
}
.sd-row:hover { background: var(--glass-bg-hover); border-color: var(--glass-border); }
.sd-row.unavailable .sd-cover img { filter: grayscale(1); opacity: 0.55; }
.sd-row.unavailable .sd-title strong { color: var(--text-muted); }
.sd-row.current { background: var(--amber-glass); border-color: var(--amber-border); }
.sd-row.current .sd-title strong { color: var(--amber); }
.sd-index { width: 24px; flex: none; display: flex; align-items: center; justify-content: center; color: #191722; font-size: 10px; }
.sd-cover {
  width: 40px; height: 40px;
  flex: none;
  display: grid; place-items: center;
  overflow: hidden;
  border-radius: 10px;
  background: var(--bg-elevated);
  color: #191722;
}
.sd-cover img { width: 100%; height: 100%; object-fit: cover; }
.sd-cover i { display: grid; place-items: center; }
.sd-copy { flex: 1; min-width: 0; display: grid; gap: 3px; }
.sd-title { display: flex; align-items: center; gap: 6px; min-width: 0; }
.sd-title strong { min-width: 0; overflow: hidden; color: #191722; font-size: 12.5px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.sd-copy small { overflow: hidden; color: #191722; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.sd-duration { flex: none; width: 42px; color: #191722; font-size: 10.5px; text-align: right; }
.sd-play {
  flex: none;
  display: grid; place-items: center;
  width: 26px; height: 26px;
  border-radius: 50%;
  color: var(--amber);
  background: var(--amber-glass);
  opacity: 0;
  transform: translateX(-3px);
  transition: opacity var(--t-fast), transform var(--t-fast);
}
.sd-row:hover .sd-play { opacity: 1; transform: none; }
.sd-row.unavailable .sd-play { display: none; }

.vip-tag {
  flex: none;
  padding: 0 4px;
  border-radius: 4px;
  font: 600 8.5px/1.6 var(--font-mono);
  font-style: normal;
  letter-spacing: 0.02em;
}
.vip-tag.vip { color: #a9770c; border: 1px solid rgba(169, 119, 12, 0.35); background: rgba(212, 168, 83, 0.14); }
.vip-tag.paid { color: var(--copper); border: 1px solid rgba(229, 140, 157, 0.4); background: rgba(229, 140, 157, 0.08); }
.offline-tag {
  flex: none;
  padding: 0 4px;
  border-radius: 4px;
  color: var(--ruby);
  border: 1px solid rgba(201, 79, 92, 0.35);
  background: rgba(201, 79, 92, 0.1);
  font: 600 8.5px/1.6 var(--font-mono);
  font-style: normal;
  letter-spacing: 0.02em;
}

/* 正在播放的波形图标 */
.sd-live { color: var(--amber); opacity: 0.55; }
.sd-live.live { animation: search-breathe 1.8s ease-in-out infinite; }
@keyframes search-breathe { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }

/* 浮层出入场 */
.search-fade-enter-active, .search-fade-leave-active { transition: opacity 0.2s ease; }
.search-fade-enter-active .search-dialog, .search-fade-leave-active .search-dialog { transition: opacity 0.22s ease, transform 0.26s cubic-bezier(0.34, 1.2, 0.64, 1); }
.search-fade-enter-from, .search-fade-leave-to { opacity: 0; }
.search-fade-enter-from .search-dialog, .search-fade-leave-to .search-dialog { opacity: 0; transform: translateY(-10px) scale(0.97); }

@media (prefers-reduced-motion: reduce) {
  .sd-live.live { animation: none; opacity: 1; }
}
</style>
