import { memo, useState } from 'react'
import { useDeleteHistoryItem } from '../../hooks/useHistory'
import { useUIStore } from '../../stores/uiStore'
import { api } from '../../api/client'
import { formatFileSize, formatDate, truncateFilename } from '../../utils/formatters'
import type { HistoryItem as HistoryItemType } from '../../types'

interface HistoryItemProps {
  item: HistoryItemType
}

export const HistoryItem = memo(function HistoryItem({ item }: HistoryItemProps) {
  const { openVideoModal } = useUIStore()
  const deleteItem = useDeleteHistoryItem()
  const [showConfirm, setShowConfirm] = useState(false)

  const handlePlay = () => {
    openVideoModal(item.filepath, item.type)
  }

  const handleDownload = () => {
    window.open(api.getDownloadUrl(item.filepath), '_blank')
  }

  const handleDelete = () => {
    if (showConfirm) {
      deleteItem.mutate(item.id)
      setShowConfirm(false)
    } else {
      setShowConfirm(true)
      setTimeout(() => setShowConfirm(false), 3000)
    }
  }

  return (
    <div className="flex flex-col md:flex-row md:items-center gap-3 p-3 rounded-lg bg-bg-secondary hover:bg-bg-tertiary transition-colors">
      {/* Info row */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className="text-3xl flex-shrink-0">
          {item.type === 'video' ? '🎬' : '🎵'}
        </span>

        <div className="min-w-0 flex-1">
          <p
            className="text-sm text-text-primary truncate"
            title={item.filename}
          >
            {truncateFilename(item.filename, 50)}
          </p>
          <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
            <span>{formatFileSize(item.size)}</span>
            <span>•</span>
            <span>{formatDate(item.date)}</span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-center md:justify-end gap-3 flex-shrink-0">
        <button
          onClick={handlePlay}
          title="Play"
          className="w-14 h-14 flex items-center justify-center rounded-xl hover:bg-bg-primary active:scale-95 transition-all text-3xl"
        >
          ▶️
        </button>
        <button
          onClick={handleDownload}
          title="Download"
          className="w-14 h-14 flex items-center justify-center rounded-xl hover:bg-bg-primary active:scale-95 transition-all text-3xl"
        >
          ⬇️
        </button>
        <button
          onClick={handleDelete}
          disabled={deleteItem.isPending}
          title={showConfirm ? 'Click again to confirm' : 'Delete'}
          className={`w-14 h-14 flex items-center justify-center rounded-xl active:scale-95 transition-all text-3xl ${
            showConfirm
              ? 'bg-error/20 text-error hover:bg-error/30'
              : 'hover:bg-bg-primary'
          } disabled:opacity-50`}
        >
          {showConfirm ? '❌' : '🗑️'}
        </button>
      </div>
    </div>
  )
})
