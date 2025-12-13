import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useUIStore } from '../stores/uiStore'

export function useHistory() {
  return useQuery({
    queryKey: ['history'],
    queryFn: api.getHistory,
    staleTime: 30000,
  })
}

export function useDeleteHistoryItem() {
  const queryClient = useQueryClient()
  const { addToast } = useUIStore()

  return useMutation({
    mutationFn: api.deleteHistoryItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['history'] })
      addToast('File deleted', 'success')
    },
    onError: (error: Error) => {
      addToast(`Failed to delete: ${error.message}`, 'error')
    },
  })
}
