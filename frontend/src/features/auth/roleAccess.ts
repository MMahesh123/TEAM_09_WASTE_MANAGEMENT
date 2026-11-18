
import type { UserRole } from './types'

export function getDashboardPath(role: UserRole): string {
  switch (role) {
    case 'Admin':
      return '/admin/dashboard'
    case 'Supervisor':
      return '/supervisor/dashboard'
    case 'Worker':
      return '/worker/dashboard'
    case 'Citizen':
      return '/citizen/dashboard'
  }
}
