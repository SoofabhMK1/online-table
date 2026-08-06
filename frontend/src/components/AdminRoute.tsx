import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { ADMIN_ROLE_NAME } from '../constants'

/** 管理员才可访问，否则重定向至工作台。 */
export default function AdminRoute() {
  const roleName = useAuthStore((s) => s.roleName)
  if (roleName !== ADMIN_ROLE_NAME) {
    return <Navigate to="/workspace" replace />
  }
  return <Outlet />
}