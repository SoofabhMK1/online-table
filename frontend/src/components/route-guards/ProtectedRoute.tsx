import { Navigate } from 'react-router-dom'
import { type ReactNode } from 'react'
import { useAuthStore } from '../../store/useAuthStore'

/** 已登录才可访问，未登录重定向至 /login。 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}
