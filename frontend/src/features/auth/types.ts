export type UserRole = 'Admin' | 'Supervisor' | 'Worker' | 'Citizen'

export interface AuthUser {
  id: number
  username: string
  role: UserRole
}

export interface LoginResponse {
  code: number
  message: string
  token: string
  user: AuthUser
}

export interface RegisterPayload {
  username: string
  email: string
  password: string
}
