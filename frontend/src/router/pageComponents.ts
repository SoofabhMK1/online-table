import { lazy } from 'react'

/**
 * 集中管理路由页面组件的 lazy 加载；
 * 仅在此文件出现 lazy()，router/index.tsx / routes.tsx 不再持有非组件导出。
 */
export const LoginPage = lazy(() => import('../pages/LoginPage'))
export const AdminLayout = lazy(() => import('../pages/admin/AdminLayout'))
export const AdminIndexRedirect = lazy(
  () => import('../pages/admin/AdminIndexRedirect'),
)
export const TemplatesPage = lazy(() => import('../pages/admin/TemplatesPage'))
export const RolesPage = lazy(() => import('../pages/admin/RolesPage'))
export const OrgPage = lazy(() => import('../pages/admin/OrgPage'))
export const PermissionsPage = lazy(
  () => import('../pages/admin/PermissionsPage'),
)
export const OverviewPage = lazy(() => import('../pages/admin/OverviewPage'))
export const PeriodsPage = lazy(() => import('../pages/admin/PeriodsPage'))
export const ArchivedPage = lazy(() => import('../pages/admin/ArchivedPage'))
export const WorkspaceLayout = lazy(
  () => import('../pages/workspace/WorkspaceLayout'),
)
export const WorkspaceListPage = lazy(
  () => import('../pages/workspace/WorkspaceListPage'),
)
export const WorkspaceEditPage = lazy(
  () => import('../pages/workspace/WorkspaceEditPage'),
)
