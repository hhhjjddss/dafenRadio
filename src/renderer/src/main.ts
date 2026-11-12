import { createApp } from 'vue'
import App from './App.vue'
import TrayPanel from './components/TrayPanel.vue'
import LyricBar from './components/LyricBar.vue'
import '@callmebill/lxgw-wenkai-web/lxgwwenkaimono-regular/result.min.css'
import './assets/styles/global.css'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

// 托盘小面板与桌面歌词条复用同一套渲染入口，按查询参数挂载独立界面
const params = new URLSearchParams(window.location.search)
const mode = params.has('tray') ? 'tray' : params.has('lyric') ? 'lyric' : 'app'
if (mode !== 'app') document.documentElement.classList.add(`${mode}-mode`)

createApp(mode === 'tray' ? TrayPanel : mode === 'lyric' ? LyricBar : App).mount('#app')
