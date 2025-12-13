import { useDownloadQueue } from '../../hooks/useDownloadQueue'
import { Card, CardHeader } from '../ui/Card'
import { Spinner } from '../ui/Spinner'
import { QueueItem } from './QueueItem'

export function QueueList() {
  const { data, isLoading, error } = useDownloadQueue()

  const queue = data?.queue || {}
  const entries = Object.entries(queue)
  const hasActiveDownloads = entries.some(
    ([, job]) => job.status === 'downloading' || job.status === 'queued'
  )

  return (
    <Card>
      <CardHeader
        title="Active Downloads"
        icon="📥"
        action={
          hasActiveDownloads && (
            <span className="flex items-center gap-2 text-sm text-accent-primary">
              <span className="w-2 h-2 rounded-full bg-accent-primary animate-pulse" />
              {entries.filter(([, j]) => j.status === 'downloading').length} active
            </span>
          )
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <div className="text-center py-8 text-error">
          <p>Failed to load queue</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-8 text-text-muted">
          <p className="text-4xl mb-2">📭</p>
          <p>No active downloads</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {entries.map(([jobId, job]) => (
            <QueueItem key={jobId} jobId={jobId} job={job} />
          ))}
        </div>
      )}
    </Card>
  )
}
