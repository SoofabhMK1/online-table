import type { ReactNode } from 'react'
import {
  AppstoreOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  ScheduleOutlined,
  TeamOutlined,
  ApartmentOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'

export interface SidebarItem {
  key: string
  label: string
  icon: ReactNode
  path: string
}

export interface SidebarGroup {
  key: string
  title: string
  items: SidebarItem[]
}

export const adminSidebarGroups: SidebarGroup[] = [
  {
    key: 'admin',
    title: '管理中心',
    items: [
      {
        key: 'templates',
        label: '模板管理',
        icon: <FileTextOutlined />,
        path: '/admin/templates',
      },
      {
        key: 'roles',
        label: '角色管理',
        icon: <TeamOutlined />,
        path: '/admin/roles',
      },
      {
        key: 'organization',
        label: '组织架构',
        icon: <ApartmentOutlined />,
        path: '/admin/organization',
      },
      {
        key: 'permissions',
        label: '模板权限',
        icon: <SafetyCertificateOutlined />,
        path: '/admin/permissions',
      },
      {
        key: 'overview',
        label: '填报总览',
        icon: <FolderOpenOutlined />,
        path: '/admin/overview',
      },
      {
        key: 'periods',
        label: '填报期间',
        icon: <ScheduleOutlined />,
        path: '/admin/periods',
      },
      {
        key: 'archived',
        label: '归档模板',
        icon: <HistoryOutlined />,
        path: '/admin/archived',
      },
    ],
  },
]

export const userSidebarGroups: SidebarGroup[] = [
  {
    key: 'workspace',
    title: '我的工作',
    items: [
      {
        key: 'workspace',
        label: '工作台',
        icon: <AppstoreOutlined />,
        path: '/workspace',
      },
    ],
  },
]
