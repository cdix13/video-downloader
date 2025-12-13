import { useMutation } from '@tanstack/react-query'
import { api } from '../api/client'
import { useUIStore } from '../stores/uiStore'
import type { Format } from '../types'

interface FetchFormatsResult {
  title: string
  formats: Format[]
}

export function useFetchFormats() {
  const { addToast, downloadForm } = useUIStore()

  return useMutation({
    mutationFn: async (): Promise<FetchFormatsResult> => {
      const proxy =
        downloadForm.proxyType === 'tor'
          ? 'socks5://127.0.0.1:9050'
          : downloadForm.proxyType === 'tor-browser'
            ? 'socks5://127.0.0.1:9150'
            : downloadForm.proxyType === 'custom'
              ? downloadForm.customProxy
              : ''

      const response = await api.getFormats(downloadForm.url, proxy)

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch formats')
      }

      return {
        title: response.title,
        formats: response.formats,
      }
    },
    onError: (error: Error) => {
      addToast(`Failed to fetch formats: ${error.message}`, 'error')
    },
  })
}
