import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { ADMIN_ROLE_NAME } from '../constants'

/** 根路径跳转：已登录按角色分流，未登录去登录页。 */
export default function RootRedirect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const roleName = useAuthStore((s) => s.roleName)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <Navigate to={roleName === ADMIN_ROLE_NAME ? '/admin' : '/workspace'} replace />
}