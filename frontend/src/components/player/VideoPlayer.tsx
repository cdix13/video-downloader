import { useRef, useState, useEffect, useCallback } from 'react'
import { api } from '../../api/client'
import type { MediaType } from '../../types'

interface VideoPlayerProps {
  filePath: string
  mediaType: MediaType
}

export function VideoPlayer({ filePath, mediaType }: VideoPlayerProps) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showControls, setShowControls] = useState(true)
  const [gestureIcon, setGestureIcon] = useState<string | null>(null)
  const hideControlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fileUrl = api.getFileUrl(filePath)

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60)
    const secs = Math.floor(time % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const togglePlay = useCallback(() => {
    const media = mediaRef.current
    if (!media) return

    if (media.paused) {
      media.play()
    } else {
      media.pause()
    }
  }, [])

  const seek = useCallback((seconds: number) => {
    const media = mediaRef.current
    if (!media) return

    media.currentTime = Math.max(0, Math.min(media.duration, media.currentTime + seconds))
  }, [])

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const media = mediaRef.current
    if (!media) return

    const rect = e.currentTarget.getBoundingClientRect()
    const pos = (e.clientX - rect.left) / rect.width
    media.currentTime = pos * media.duration
  }

  const showGestureIcon = (icon: string) => {
    setGestureIcon(icon)
    setTimeout(() => setGestureIcon(null), 500)
  }

  // Touch gesture handling
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const lastTapRef = useRef<number>(0)

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return

    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - touchStartRef.current.x
    const deltaY = touch.clientY - touchStartRef.current.y
    const deltaTime = Date.now() - touchStartRef.current.time

    // Double tap detection
    const now = Date.now()
    if (now - lastTapRef.current < 300 && Math.abs(deltaX) < 30 && Math.abs(deltaY) < 30) {
      togglePlay()
      showGestureIcon(isPlaying ? '⏸' : '▶️')
      lastTapRef.current = 0
    } else if (deltaTime < 300 && Math.abs(deltaX) < 30 && Math.abs(deltaY) < 30) {
      lastTapRef.current = now
    }

    // Swipe gestures
    if (deltaTime < 500) {
      if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 50) {
        // Horizontal swipe - seek
        const seekAmount = deltaX > 0 ? 10 : -10
        seek(seekAmount)
        showGestureIcon(deltaX > 0 ? '⏩' : '⏪')
      } else if (Math.abs(deltaY) > 50 && Math.abs(deltaX) < 50) {
        // Vertical swipe
        const isRightSide = touch.clientX > window.innerWidth / 2
        if (isRightSide) {
          showGestureIcon(deltaY < 0 ? '🔊' : '🔉')
        } else {
          showGestureIcon(deltaY < 0 ? '🔆' : '🔅')
        }
      }
    }

    touchStartRef.current = null
  }

  // Auto-hide controls
  const resetHideTimeout = useCallback(() => {
    setShowControls(true)
    if (hideControlsTimeout.current) {
      clearTimeout(hideControlsTimeout.current)
    }
    if (isPlaying) {
      hideControlsTimeout.current = setTimeout(() => setShowControls(false), 3000)
    }
  }, [isPlaying])

  useEffect(() => {
    return () => {
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current)
      }
    }
  }, [])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'ArrowLeft') {
        seek(-10)
      } else if (e.key === 'ArrowRight') {
        seek(10)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePlay, seek])

  const MediaElement = mediaType === 'video' ? 'video' : 'audio'

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center"
      onMouseMove={resetHideTimeout}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Gesture icon overlay */}
      {gestureIcon && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <span className="text-6xl animate-fade-in">{gestureIcon}</span>
        </div>
      )}

      <MediaElement
        ref={mediaRef as React.RefObject<HTMLVideoElement>}
        src={fileUrl}
        className={mediaType === 'video' ? 'max-w-full max-h-full' : 'hidden'}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onClick={togglePlay}
        playsInline
      />

      {/* Audio visualization */}
      {mediaType === 'audio' && (
        <div className="flex flex-col items-center gap-6">
          <div className="w-32 h-32 rounded-full bg-gradient-primary flex items-center justify-center">
            <span className="text-6xl">🎵</span>
          </div>
          <p className="text-text-secondary text-center max-w-md truncate px-4">
            {filePath.split('/').pop()}
          </p>
        </div>
      )}

      {/* Controls */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Progress bar */}
        <div
          className="w-full h-1 bg-white/30 rounded-full cursor-pointer mb-4"
          onClick={handleProgressClick}
        >
          <div
            className="h-full bg-accent-primary rounded-full transition-all"
            style={{ width: `${(currentTime / duration) * 100 || 0}%` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={togglePlay}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            >
              {isPlaying ? '⏸' : '▶️'}
            </button>
            <span className="text-sm text-white/80 font-mono">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
