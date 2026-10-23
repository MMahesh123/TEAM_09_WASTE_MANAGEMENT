import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { getStoredUser } from '../features/auth/authService'

export default function RequireAuth() {
  const location = useLocation()
  const token = localStorage.getItem('wms_access_token')
  const user = getStoredUser()

  if (!token || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
