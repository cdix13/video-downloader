import { useDependencyCheck } from '../hooks/useServerInfo'

export function DependencyAlert() {
  const { data, isLoading } = useDependencyCheck()

  if (isLoading || !data || data.missing.length === 0) {
    return null
  }

  return (
    <div className="mb-4 md:mb-6 p-4 rounded-lg bg-warning/20 border border-warning/30">
      <div className="flex items-start gap-3">
        <span className="text-xl">⚠️</span>
        <div>
          <p className="font-medium text-warning">Missing Dependencies</p>
          <p className="text-sm text-text-secondary mt-1">
            The following required tools are not installed:{' '}
            <span className="text-warning font-mono">
              {data.missing.join(', ')}
            </span>
          </p>
          <p className="text-xs text-text-muted mt-2">
            Please install them to enable all features.
          </p>
        </div>
      </div>
    </div>
  )
}
