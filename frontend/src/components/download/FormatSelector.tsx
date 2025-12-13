import clsx from 'clsx'
import type { Format } from '../../types'
import { formatFileSize } from '../../utils/formatters'

interface FormatSelectorProps {
  formats: Format[]
  selectedFormat: string | null
  onSelect: (formatId: string | null) => void
}

export function FormatSelector({
  formats,
  selectedFormat,
  onSelect,
}: FormatSelectorProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm text-text-secondary">Select Format</label>
        {selectedFormat && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-xs text-accent-primary hover:underline"
          >
            Clear selection
          </button>
        )}
      </div>
      <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-border p-2 bg-bg-secondary">
        {formats.map((format) => (
          <button
            key={format.format_id}
            type="button"
            onClick={() => onSelect(format.format_id)}
            className={clsx(
              'w-full text-left px-3 py-2 rounded-md transition-colors',
              'flex items-center justify-between gap-2 text-sm',
              selectedFormat === format.format_id
                ? 'bg-accent-primary/20 border border-accent-primary/50'
                : 'hover:bg-bg-tertiary border border-transparent'
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="px-1.5 py-0.5 rounded bg-bg-tertiary text-xs font-mono uppercase">
                {format.ext}
              </span>
              <span className="text-text-primary truncate">
                {format.resolution || 'audio only'}
              </span>
              {format.fps && (
                <span className="text-text-muted text-xs">{format.fps}fps</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {format.note && (
                <span className="text-xs text-text-muted">{format.note}</span>
              )}
              {format.filesize && (
                <span className="text-xs text-text-secondary">
                  {formatFileSize(format.filesize)}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
