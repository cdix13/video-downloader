import clsx from 'clsx'

interface ProgressBarProps {
  progress: number
  showShimmer?: boolean
  size?: 'sm' | 'md'
}

export function ProgressBar({
  progress,
  showShimmer = false,
  size = 'md',
}: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress))

  return (
    <div
      className={clsx(
        'w-full bg-bg-secondary rounded-full overflow-hidden',
        size === 'sm' ? 'h-1.5' : 'h-2.5'
      )}
    >
      <div
        className={clsx(
          'h-full bg-gradient-primary rounded-full transition-all duration-300',
          showShimmer && 'shimmer'
        )}
        style={{ width: `${clampedProgress}%` }}
      />
    </div>
  )
}
