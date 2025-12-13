import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useUIStore } from '../stores/uiStore'
import { useEffect, useRef } from 'react'
import type { DownloadJob } from '../types'

export function useDownloadQueue() {
  const queryClient = useQueryClient()
  const { addToast, markJobCompleted, isJobNotified } = useUIStore()
  const prevQueueRef = useRef<Record<string, DownloadJob>>({})

  const query = useQuery({
    queryKey: ['queue'],
    queryFn: api.getQueue,
    refetchInterval: 1000,
    refetchIntervalInBackground: false,
  })

  // Notify on download completion and refresh history
  useEffect(() => {
    if (!query.data?.queue) return

    const currentQueue = query.data.queue
    const prevQueue = prevQueueRef.current

    Object.entries(currentQueue).forEach(([jobId, job]) => {
      const prevJob = prevQueue[jobId]

      if (
        job.status === 'completed' &&
        prevJob?.status !== 'completed' &&
        !isJobNotified(jobId)
      ) {
        markJobCompleted(jobId)
        addToast(
          `Download complete: ${job.file_info?.filename || 'File ready'}`,
          'success'
        )
        // Refresh history immediately when download completes
        queryClient.invalidateQueries({ queryKey: ['history'] })
      } else if (
        job.status === 'failed' &&
        prevJob?.status !== 'failed' &&
        !isJobNotified(jobId)
      ) {
        markJobCompleted(jobId)
        addToast(`Download failed: ${job.error || 'Unknown error'}`, 'error')
      }
    })

    prevQueueRef.current = currentQueue
  }, [query.data?.queue, addToast, markJobCompleted, isJobNotified, queryClient])

  return query
}

export function useStartDownload() {
  const queryClient = useQueryClient()
  const { addToast, setDownloadForm } = useUIStore()

  return useMutation({
    mutationFn: api.startDownload,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] })
      addToast('Download started', 'success')
      // Only clear URL, keep other settings
      setDownloadForm({ url: '', selectedFormat: null })
    },
    onError: (error: Error) => {
      addToast(`Failed to start download: ${error.message}`, 'error')
    },
  })
}

export function useCancelDownload() {
  const queryClient = useQueryClient()
  const { addToast } = useUIStore()

  return useMutation({
    mutationFn: api.cancelDownload,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] })
      addToast('Download cancelled', 'info')
    },
    onError: (error: Error) => {
      addToast(`Failed to cancel: ${error.message}`, 'error')
    },
  })
}

export function useResumeDownload() {
  const queryClient = useQueryClient()
  const { addToast } = useUIStore()

  return useMutation({
    mutationFn: api.resumeDownload,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] })
      addToast('Download resumed', 'success')
    },
    onError: (error: Error) => {
      addToast(`Failed to resume: ${error.message}`, 'error')
    },
  })
}

export function useRemoveDownload() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: api.removeDownload,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] })
    },
  })
}
