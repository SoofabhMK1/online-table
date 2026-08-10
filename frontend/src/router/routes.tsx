import type { ComponentType, ReactNode } from 'react'
import { Suspense } from 'react'
import { Navigate } from 'react-router-dom'
import {
  ProtectedRoute,
  AdminRoute,
  WorkspaceRoute,
  RootRedirect,
} from '../components/route-guards'
import {
  LoginPage,
  AdminLayout,
  AdminIndexRedirect,
  TemplatesPage,
  RolesPage,
  OrgPage,
  PermissionsPage,
  OverviewPage,
  PeriodsPage,
  ArchivedPage,
  WorkspaceLayout,
  WorkspaceListPage,
  WorkspaceEditPage,
} from './pageComponents'

export type WithSuspenseFn = (node: ReactNode) => ReactNode

export function buildRoutes(Outlet: ComponentType, withSuspense: WithSuspenseFn) {
  return [
    { path: '/', element: <RootRedirect /> },
    { path: '/login', element: withSuspense(<LoginPage />) },
    {
      path: '/admin',
      element: (
        <ProtectedRoute>
          <AdminRoute>
            <Outlet />
          </AdminRoute>
        </ProtectedRoute>
      ),
      children: [
        { index: true, element: withSuspense(<AdminIndexRedirect />) },
        {
          element: withSuspense(<AdminLayout />),
          children: [
            { path: 'templates', element: withSuspense(<TemplatesPage />) },
            { path: 'roles', element: withSuspense(<RolesPage />) },
            { path: 'organization', element: withSuspense(<OrgPage />) },
            { path: 'permissions', element: withSuspense(<PermissionsPage />) },
            { path: 'overview', element: withSuspense(<OverviewPage />) },
            { path: 'periods', element: withSuspense(<PeriodsPage />) },
            { path: 'archived', element: withSuspense(<ArchivedPage />) },
          ],
        },
      ],
    },
    {
      path: '/workspace',
      element: (
        <ProtectedRoute>
          <WorkspaceRoute>
            <Outlet />
          </WorkspaceRoute>
        </ProtectedRoute>
      ),
      children: [
        {
          element: withSuspense(<WorkspaceLayout />),
          children: [
            { index: true, element: withSuspense(<WorkspaceListPage />) },
          ],
        },
        {
          path: 'templates/:templateId',
          element: withSuspense(<WorkspaceEditPage />),
        },
      ],
    },
    { path: '*', element: <Navigate to="/" replace /> },
  ]
}

// Used to silence unused-import warning for `Suspense` if not referenced elsewhere.
export const _Suspense = Suspense
