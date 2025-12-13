export interface ServerInfo {
  success: boolean
  local_ip: string
  port: string
  local_url: string
  localhost_url: string
  qr_code: string | null
  qr_available: boolean
}

export interface DependencyCheck {
  success: boolean
  missing: string[]
}

export interface DownloadOptions {
  url: string
  audio_only: boolean
  use_sponsorblock: boolean
  use_impersonate: boolean
  proxy: string
  format_id: string
}

export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface DownloadJob {
  url: string
  status: DownloadStatus
  progress: number
  speed: string
  eta: string
  total_size: string
  downloaded: string
  options: Partial<DownloadOptions>
  created_at: string
  file_info?: {
    filename: string
    filepath: string
    size: number
  }
  error?: string
}

export interface DownloadQueue {
  success: boolean
  queue: Record<string, DownloadJob>
}

export interface Format {
  format_id: string
  ext: string
  resolution: string
  filesize: number | null
  fps: number | null
  note: string
}

export interface FormatsResponse {
  success: boolean
  title: string
  formats: Format[]
  error?: string
}

export interface HistoryItem {
  id: string
  filename: string
  filepath: string
  type: 'video' | 'audio'
  size: number
  timestamp: string
  date: string
}

export interface HistoryResponse {
  success: boolean
  history: HistoryItem[]
}

export interface ApiResponse {
  success: boolean
  message?: string
  error?: string
}

export type MediaType = 'video' | 'audio'
export type HistoryFilter = 'all' | 'video' | 'audio'
export type ProxyType = 'none' | 'tor' | 'tor-browser' | 'custom'
