import { apiClient } from '../../services/api/client'
import type { AuthUser, LoginResponse, RegisterPayload } from './types'

export interface LoginPayload {
  email: string
  password: string
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/auth/login', payload)

  if (!response.data.token || !response.data.user) {
    throw new Error('The server returned an invalid login response.')
  }

  localStorage.setItem('wms_access_token', response.data.token)
  localStorage.setItem('wms_user', JSON.stringify(response.data.user))

  return response.data
}

export async function register(payload: RegisterPayload): Promise<void> {
  await apiClient.post('/auth/register', payload)
}

export function getStoredUser(): AuthUser | null {
  const value = localStorage.getItem('wms_user')

  if (!value) return null

  try {
    const parsed = JSON.parse(value) as Partial<AuthUser>

    if (
      typeof parsed.id !== 'number' ||
      typeof parsed.username !== 'string' ||
      !['Admin', 'Supervisor', 'Worker', 'Citizen'].includes(parsed.role ?? '')
    ) {
      return null
    }

    return parsed as AuthUser
  } catch {
    return null
  }
}

export function logout(): void {
  localStorage.removeItem('wms_access_token')
  localStorage.removeItem('wms_user')
}
