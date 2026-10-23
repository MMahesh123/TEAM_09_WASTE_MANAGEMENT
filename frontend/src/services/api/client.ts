import axios, { AxiosError } from 'axios'

const baseURL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
).replace(/\/+$/, '')

export const apiClient = axios.create({
  baseURL,
  timeout: 15000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('wms_access_token')

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string }>) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      // Do not automatically log the user out here:
      // a 403 can mean insufficient permissions, not an expired session.
      window.dispatchEvent(
        new CustomEvent('wms:auth-error', {
          detail: {
            status: error.response.status,
            message: error.response.data?.message ?? 'Authentication failed',
          },
        }),
      )
    }

    return Promise.reject(error)
  },
)

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'Cannot reach the server. Check that the backend is running and try again.'
    }

    const message = error.response.data?.message
    if (typeof message === 'string' && message.trim()) {
      return message
    }

    if (error.response.status === 401) return 'Please sign in to continue.'
    if (error.response.status === 403) return 'You do not have permission to perform this action.'
    if (error.response.status >= 500) return 'The server encountered an error. Please try again later.'
  }

  return 'Something went wrong. Please try again.'
}
