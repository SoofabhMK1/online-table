import { Navigate } from 'react-router-dom'

/** /admin 入口重定向到默认页面（模板管理）。 */
export default function AdminIndexRedirect() {
  return <Navigate to="/admin/templates" replace />
}
