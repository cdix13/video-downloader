import { useState } from 'react'
import { useServerInfo } from '../../hooks/useServerInfo'
import { Card } from '../ui/Card'
import { CopyableUrl } from './CopyableUrl'
import { Spinner } from '../ui/Spinner'

export function ServerInfo() {
  const { data, isLoading, error } = useServerInfo()
  const [isExpanded, setIsExpanded] = useState(true)

  if (isLoading) {
    return (
      <Card className="mb-4 md:mb-6">
        <div className="flex items-center justify-center py-4">
          <Spinner />
        </div>
      </Card>
    )
  }

  if (error || !data?.success) {
    return null
  }

  return (
    <Card className="mb-4 md:mb-6">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <h3 className="text-sm font-medium text-text-secondary flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          Server Access
        </h3>
        <svg
          className={`w-5 h-5 text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <CopyableUrl label="Localhost" url={data.localhost_url} />
            <CopyableUrl label="Network" url={data.local_url} />
            <p className="text-xs text-text-muted">
              Share the network URL with devices on the same WiFi
            </p>
          </div>

          {data.qr_available && data.qr_code && (
            <div className="flex justify-center md:justify-end">
              <div className="bg-white p-2 rounded-lg">
                <img
                  src={data.qr_code}
                  alt="QR Code for network access"
                  className="w-24 h-24 md:w-28 md:h-28"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
