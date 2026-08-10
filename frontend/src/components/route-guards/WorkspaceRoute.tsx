import { Navigate } from 'react-router-dom'
import { type ReactNode } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { ADMIN_ROLE_NAME } from '../../constants'

/** 非管理员才可访问工作台；管理员进入则重定向到管理首页。 */
export default function WorkspaceRoute({ children }: { children: ReactNode }) {
  const roleName = useAuthStore((s) => s.roleName)
  if (roleName === ADMIN_ROLE_NAME) {
    return <Navigate to="/admin" replace />
  }
  return <>{children}</>
}
