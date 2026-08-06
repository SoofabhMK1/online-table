import { createBrowserRouter, Navigate } from 'react-router-dom'
import ProtectedRoute from '../components/ProtectedRoute'
import AdminRoute from '../components/AdminRoute'
import RootRedirect from '../components/RootRedirect'
import LoginPage from '../pages/LoginPage'
import AdminPage from '../pages/admin/AdminPage'
import WorkspacePage from '../pages/workspace/WorkspacePage'
import WorkspaceEditPage from '../pages/workspace/WorkspaceEditPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootRedirect />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/admin',
    element: <ProtectedRoute />,
    children: [
      {
        element: <AdminRoute />,
        children: [
          {
            index: true,
            element: <AdminPage />,
          },
        ],
      },
    ],
  },
  {
    path: '/workspace',
    element: <ProtectedRoute />,
    children: [
      {
        index: true,
        element: <WorkspacePage />,
      },
      {
        path: 'templates/:templateId',
        element: <WorkspaceEditPage />,
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])