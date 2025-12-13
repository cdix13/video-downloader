import type {
  ServerInfo,
  DependencyCheck,
  DownloadQueue,
  DownloadJob,
  FormatsResponse,
  HistoryResponse,
  ApiResponse,
} from '../types'

const BASE_URL = ''

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    throw new Error(`API Error: ${res.status} ${res.statusText}`)
  }

  return res.json()
}

export const api = {
  getServerInfo: () => fetchApi<ServerInfo>('/api/server-info'),

  checkDependencies: () => fetchApi<DependencyCheck>('/api/check-dependencies'),

  startDownload: (data: {
    url: string
    audio_only?: boolean
    use_sponsorblock?: boolean
    use_impersonate?: boolean
    proxy?: string
    format_id?: string
  }) =>
    fetchApi<ApiResponse & { job_id: string }>('/api/download', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getQueue: () => fetchApi<DownloadQueue>('/api/queue'),

  getJobStatus: (jobId: string) =>
    fetchApi<{ success: boolean; job: DownloadJob }>(`/api/status/${jobId}`),

  cancelDownload: (jobId: string) =>
    fetchApi<ApiResponse>(`/api/cancel/${jobId}`, { method: 'POST' }),

  resumeDownload: (jobId: string) =>
    fetchApi<ApiResponse>(`/api/resume/${jobId}`, { method: 'POST' }),

  removeDownload: (jobId: string) =>
    fetchApi<ApiResponse>(`/api/remove/${jobId}`, { method: 'DELETE' }),

  getFormats: (url: string, proxy?: string) =>
    fetchApi<FormatsResponse>('/api/formats', {
      method: 'POST',
      body: JSON.stringify({ url, proxy }),
    }),

  getHistory: () => fetchApi<HistoryResponse>('/api/history'),

  deleteHistoryItem: (id: string) =>
    fetchApi<ApiResponse>(`/api/history/${id}`, { method: 'DELETE' }),

  getFileUrl: (filepath: string) => `${BASE_URL}/api/file/${filepath}`,

  getDownloadUrl: (filepath: string) =>
    `${BASE_URL}/api/download-file/${filepath}`,
}
