import { useState } from 'react'
import { copyToClipboard } from '../../utils/clipboard'
import { useUIStore } from '../../stores/uiStore'

interface CopyableUrlProps {
  label: string
  url: string
}

export function CopyableUrl({ label, url }: CopyableUrlProps) {
  const [copied, setCopied] = useState(false)
  const { addToast } = useUIStore()

  const handleCopy = async () => {
    const success = await copyToClipboard(url)
    if (success) {
      setCopied(true)
      addToast('URL copied to clipboard', 'success')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-muted min-w-16">{label}:</span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-accent-primary hover:underline truncate flex-1"
      >
        {url}
      </a>
      <button
        onClick={handleCopy}
        className="p-1.5 rounded hover:bg-bg-secondary transition-colors flex-shrink-0"
        title="Copy URL"
      >
        {copied ? (
          <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>
    </div>
  )
}
