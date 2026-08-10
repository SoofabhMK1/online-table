import { Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Outlet } from 'react-router-dom'
import { buildRoutes } from './routes'
import RouteFallback from './RouteFallback'

export function withSuspense(node: ReactNode): ReactNode {
  return <Suspense fallback={<RouteFallback />}>{node}</Suspense>
}

export const router = createBrowserRouter(buildRoutes(Outlet, withSuspense))
