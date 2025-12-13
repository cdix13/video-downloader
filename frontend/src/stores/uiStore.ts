import { create } from 'zustand'
import type { MediaType, ProxyType } from '../types'

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
}

interface VideoModalState {
  isOpen: boolean
  filePath: string | null
  mediaType: MediaType | null
}

interface DownloadFormState {
  url: string
  type: MediaType
  useSponsorblock: boolean
  proxyType: ProxyType
  customProxy: string
  selectedFormat: string | null
}

interface UIState {
  videoModal: VideoModalState
  toasts: Toast[]
  downloadForm: DownloadFormState
  completedJobs: Set<string>

  openVideoModal: (filePath: string, mediaType: MediaType) => void
  closeVideoModal: () => void

  addToast: (message: string, type: Toast['type']) => void
  removeToast: (id: string) => void

  setDownloadForm: (form: Partial<DownloadFormState>) => void
  resetDownloadForm: () => void

  markJobCompleted: (jobId: string) => void
  isJobNotified: (jobId: string) => boolean
}

const initialDownloadForm: DownloadFormState = {
  url: '',
  type: 'video',
  useSponsorblock: false,
  proxyType: 'none',
  customProxy: '',
  selectedFormat: null,
}

export const useUIStore = create<UIState>((set, get) => ({
  videoModal: {
    isOpen: false,
    filePath: null,
    mediaType: null,
  },
  toasts: [],
  downloadForm: initialDownloadForm,
  completedJobs: new Set(),

  openVideoModal: (filePath, mediaType) =>
    set({
      videoModal: { isOpen: true, filePath, mediaType },
    }),

  closeVideoModal: () =>
    set({
      videoModal: { isOpen: false, filePath: null, mediaType: null },
    }),

  addToast: (message, type) => {
    const id = crypto.randomUUID()
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
    }))

    setTimeout(() => {
      get().removeToast(id)
    }, 3000)
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  setDownloadForm: (form) =>
    set((state) => ({
      downloadForm: { ...state.downloadForm, ...form },
    })),

  resetDownloadForm: () =>
    set({ downloadForm: initialDownloadForm }),

  markJobCompleted: (jobId) =>
    set((state) => {
      const newSet = new Set(state.completedJobs)
      newSet.add(jobId)
      return { completedJobs: newSet }
    }),

  isJobNotified: (jobId) => get().completedJobs.has(jobId),
}))
