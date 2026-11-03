#!/usr/bin/env node
/**
 * electron-vite 启动包装器。
 *
 * 某些环境（例如从 Electron 进程、部分 IDE / 终端集成里启动）会带上
 * ELECTRON_RUN_AS_NODE=1。这个变量会让 electron-vite 启动的 Electron
 * 以 Node 模式运行，表现就是 dev 日志停在 "start electron app..."，
 * 然后进程直接退出、窗口打不开。
 *
 * 这里在启动 electron-vite 之前把它清掉，保证子进程真正以 Electron 模式运行。
 */
const { spawn } = require('node:child_process')
const path = require('node:path')

delete process.env.ELECTRON_RUN_AS_NODE

// 部分 Windows 远程/受限会话下 Electron 的 Chromium sandbox 起不来，
// 表现为日志停在 "start electron app..." 后直接退出。开发/预览时关闭 sandbox。
if (process.env.NO_SANDBOX !== '0') process.env.NO_SANDBOX = '1'

const command = process.argv[2] || 'dev'
const args = process.argv.slice(3)
const cli = path.join(process.cwd(), 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')

const child = spawn(process.execPath, [cli, command, ...args], {
  stdio: 'inherit',
  env: process.env
})

child.on('error', (error) => {
  console.error('[dev] 启动 electron-vite 失败:', error)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
