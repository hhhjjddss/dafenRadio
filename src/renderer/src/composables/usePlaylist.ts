import type { MusicInfo } from './useNetease'
import type { PlayMode } from './usePlayer'

// 播放队列
let playQueue: MusicInfo[] = []
let currentIndex = -1

export function usePlaylist() {
  // 设置播放队列
  const setPlayQueue = (tracks: MusicInfo[], startIndex: number = 0) => {
    playQueue = [...tracks]
    currentIndex = startIndex
  }

  // 获取当前播放信息
  const getCurrentInfo = () => ({
    queue: [...playQueue],
    index: currentIndex
  })

  // 手动切歌时同步队列索引（doPlay(x, false) 不会更新 currentIndex）
  const setCurrentIndex = (index: number) => {
    if (index >= 0 && index < playQueue.length) {
      currentIndex = index
    }
  }

  // 计算下一首但不提交索引（播放成功后再 commitIndex，避免失败跳号）
  const peekNextTrack = (playMode: PlayMode): { track: MusicInfo; index: number } | null => {
    if (playQueue.length === 0) return null

    let nextIndex = -1

    switch (playMode) {
      case 'shuffle':
        if (playQueue.length === 1) {
          nextIndex = 0
        } else {
          do {
            nextIndex = Math.floor(Math.random() * playQueue.length)
          } while (nextIndex === currentIndex)
        }
        break

      case 'repeat-all':
        nextIndex = (currentIndex + 1) % playQueue.length
        break

      case 'repeat-one':
        return null // 单曲循环由外部处理

      case 'sequence':
      default:
        nextIndex = currentIndex + 1
        if (nextIndex >= playQueue.length) {
          return null // 顺序播放到最后一首停止
        }
        break
    }

    return { track: playQueue[nextIndex], index: nextIndex }
  }

  // 播放下一首
  const getNextTrack = (playMode: PlayMode): MusicInfo | null => {
    const next = peekNextTrack(playMode)
    if (!next) return null
    currentIndex = next.index
    return next.track
  }

  // 播放成功后提交索引（配合 peekNextTrack 使用）
  const commitIndex = (index: number) => {
    if (index >= 0 && index < playQueue.length) {
      currentIndex = index
    }
  }

  // 播放上一首
  const getPrevTrack = (playMode: PlayMode): MusicInfo | null => {
    if (playQueue.length === 0) return null

    let prevIndex = -1

    switch (playMode) {
      case 'shuffle':
        if (playQueue.length === 1) {
          prevIndex = 0
        } else {
          do {
            prevIndex = Math.floor(Math.random() * playQueue.length)
          } while (prevIndex === currentIndex)
        }
        break

      case 'repeat-all':
      case 'repeat-one':
      case 'sequence':
      default:
        prevIndex = currentIndex - 1
        if (prevIndex < 0) {
          prevIndex = playQueue.length - 1
        }
        break
    }

    currentIndex = prevIndex
    return playQueue[currentIndex]
  }
//npm.cmd run dev
  return {
    setPlayQueue,
    getCurrentInfo,
    setCurrentIndex,
    commitIndex,
    peekNextTrack,
    getNextTrack,
    getPrevTrack
  }
}
