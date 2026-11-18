
import { Navigate, Outlet } from 'react-router-dom'
import { getStoredUser } from '../features/auth/authService'
import type { UserRole } from '../features/auth/types'
import { getDashboardPath } from '../features/auth/roleAccess'

interface RequireRoleProps {
  allowedRoles: UserRole[]
}

export default function RequireRole({ allowedRoles }: RequireRoleProps) {
  const token = localStorage.getItem('wms_access_token')
  const user = getStoredUser()

  if (!token || !user) {
    return <Navigate to="/login" replace />
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={getDashboardPath(user.role)} replace />
  }

  return <Outlet />
}
