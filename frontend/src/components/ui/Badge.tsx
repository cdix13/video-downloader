import clsx from 'clsx'
import type { DownloadStatus } from '../../types'

interface BadgeProps {
  status: DownloadStatus
}

const statusStyles: Record<DownloadStatus, string> = {
  queued: 'badge-queued',
  downloading: 'badge-downloading',
  completed: 'badge-completed',
  failed: 'badge-failed',
  cancelled: 'badge-cancelled',
}

export function Badge({ status }: BadgeProps) {
  return <span className={clsx('badge', statusStyles[status])}>{status}</span>
}
