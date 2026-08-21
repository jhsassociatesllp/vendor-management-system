import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api-client'

export interface Notification {
  id: string
  message: string
  read_at: string | null
  created_at: string
  [key: string]: unknown
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiFetch<Notification[]>('/api/v1/notifications'),
  })
}

export function useUnreadNotificationCount() {
  const { data } = useNotifications()
  return data ? data.filter((n) => !n.read_at).length : 0
}
