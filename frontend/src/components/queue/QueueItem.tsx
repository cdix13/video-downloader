import { memo } from 'react'
import {
  useCancelDownload,
  useResumeDownload,
  useRemoveDownload,
} from '../../hooks/useDownloadQueue'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ProgressBar } from '../ui/ProgressBar'
import { truncateUrl } from '../../utils/formatters'
import type { DownloadJob } from '../../types'

interface QueueItemProps {
  jobId: string
  job: DownloadJob
}

export const QueueItem = memo(function QueueItem({ jobId, job }: QueueItemProps) {
  const cancelDownload = useCancelDownload()
  const resumeDownload = useResumeDownload()
  const removeDownload = useRemoveDownload()

  const isActive = job.status === 'downloading' || job.status === 'queued'
  const isResumable = job.status === 'cancelled' || job.status === 'failed'
  const isFinished = job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled'

  return (
    <div className="p-3 rounded-lg bg-bg-secondary border border-border">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-text-primary truncate" title={job.url}>
            {truncateUrl(job.url, 60)}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Badge status={job.status} />
            {job.options?.audio_only && (
              <span className="text-xs text-text-muted">🎵 Audio</span>
            )}
          </div>
        </div>
      </div>

      {job.status === 'downloading' && (
        <>
          <ProgressBar
            progress={job.progress}
            showShimmer={job.progress > 0 && job.progress < 100}
          />
          <div className="flex items-center justify-between mt-2 text-xs font-medium">
            <span className="text-accent-primary">{job.progress.toFixed(1)}%</span>
            <div className="flex items-center gap-3 text-text-secondary">
              {job.speed && <span className="text-success">{job.speed}</span>}
              {job.eta && <span className="text-warning">ETA: {job.eta}</span>}
              {job.total_size && (
                <span className="text-text-primary">
                  {job.downloaded || '0'} / {job.total_size}
                </span>
              )}
            </div>
          </div>
        </>
      )}

      {job.status === 'failed' && job.error && (
        <p className="text-xs text-error mt-2 truncate" title={job.error}>
          {job.error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 mt-3">
        {isActive && (
          <Button
            size="sm"
            variant="danger"
            onClick={() => cancelDownload.mutate(jobId)}
            disabled={cancelDownload.isPending}
          >
            Cancel
          </Button>
        )}
        {isResumable && (
          <Button
            size="sm"
            variant="success"
            onClick={() => resumeDownload.mutate(jobId)}
            disabled={resumeDownload.isPending}
          >
            Resume
          </Button>
        )}
        {isFinished && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => removeDownload.mutate(jobId)}
            disabled={removeDownload.isPending}
          >
            Remove
          </Button>
        )}
      </div>
    </div>
  )
})
