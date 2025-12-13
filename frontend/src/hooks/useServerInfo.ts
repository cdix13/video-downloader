import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export function useServerInfo() {
  return useQuery({
    queryKey: ['serverInfo'],
    queryFn: api.getServerInfo,
    staleTime: Infinity,
    retry: 2,
  })
}

export function useDependencyCheck() {
  return useQuery({
    queryKey: ['dependencies'],
    queryFn: api.checkDependencies,
    staleTime: Infinity,
    retry: 1,
  })
}
