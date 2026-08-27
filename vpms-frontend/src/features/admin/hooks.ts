import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api-client'
import type { User } from '@/lib/types'

export function useAllUsers() {
  return useQuery({ queryKey: ['users', 'all'], queryFn: () => apiFetch<User[]>('/api/v1/users/all') })
}

export function useAssignableRoles() {
  return useQuery({ queryKey: ['users', 'roles'], queryFn: () => apiFetch<string[]>('/api/v1/users/roles') })
}

export interface UserCreatePayload {
  name: string
  email: string
  password: string
  role: string
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UserCreatePayload) => apiFetch<User>('/api/v1/users', { method: 'POST', body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useUpdateUser(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { role?: string; is_active?: boolean }) =>
      apiFetch<User>(`/api/v1/users/${userId}`, { method: 'PATCH', body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useResetPassword(userId: string) {
  return useMutation({
    mutationFn: (newPassword: string) =>
      apiFetch<void>(`/api/v1/users/${userId}/reset-password`, { method: 'POST', body: { new_password: newPassword } }),
  })
}
