import { Menu, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import { BarsOutlined, SettingOutlined } from '@ant-design/icons'
import { Link, useLocation } from 'react-router-dom'
import { APP_NAME } from '../../constants'
import {
  adminSidebarGroups,
  userSidebarGroups,
  type SidebarGroup,
} from './sidebarGroups'

export type { SidebarGroup, SidebarItem } from './sidebarGroups'

interface SidebarProps {
  groups: SidebarGroup[]
  selected: string
  onSelect: (key: string) => void
  collapsed: boolean
  onToggle: () => void
}

export default function Sidebar({
  groups,
  selected,
  onSelect,
  collapsed,
  onToggle,
}: SidebarProps) {
  const location = useLocation()

  const items: MenuProps['items'] = groups.map((group) => ({
    key: group.key,
    type: 'group',
    label: group.title,
    children: group.items.map((item) => ({
      key: item.key,
      icon: item.icon,
      label: <Link to={item.path}>{item.label}</Link>,
    })),
  }))

  const activeKey =
    groups
      .flatMap((g) => g.items)
      .find((it) => location.pathname.startsWith(it.path))?.key ?? selected

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 10,
          padding: collapsed ? '20px 0' : '18px 20px',
          borderBottom: '1px solid var(--ot-color-border-subtle)',
        }}
      >
        {!collapsed && (
          <Link
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: 'var(--ot-color-text)',
              fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: 8,
                background:
                  'linear-gradient(135deg, #2D5BFF 0%, #6E8CFF 100%)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
              }}
              aria-hidden
            >
              OT
            </span>
            <span style={{ fontSize: 15 }}>{APP_NAME}</span>
          </Link>
        )}
        <Tooltip title={collapsed ? '展开侧栏' : '收起侧栏'} placement="right">
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
            style={{
              width: 32,
              height: 32,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              background: 'transparent',
              color: 'var(--ot-color-text-secondary)',
              cursor: 'pointer',
              borderRadius: 8,
              transition:
                'background var(--ot-duration-fast) var(--ot-ease-out), color var(--ot-duration-fast) var(--ot-ease-out)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--ot-color-bg-hover)'
              e.currentTarget.style.color = 'var(--ot-color-text)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--ot-color-text-secondary)'
            }}
          >
            <BarsOutlined />
          </button>
        </Tooltip>
      </div>
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '12px 0',
        }}
      >
        <Menu
          mode="inline"
          inlineIndent={16}
          selectedKeys={[activeKey]}
          items={items}
          onClick={(e) => onSelect(String(e.key))}
          style={{ borderInlineEnd: 0, background: 'transparent' }}
        />
      </div>
      {!collapsed && (
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--ot-color-border-subtle)',
            fontSize: 12,
            color: 'var(--ot-color-text-tertiary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <SettingOutlined />
            <span>v2.0 · 现代商务版</span>
          </div>
        </div>
      )}
    </div>
  )
}

// Suppress unused-import warning when this file is the only consumer.
// (adminSidebarGroups / userSidebarGroups are re-exported via types above
// and used directly by AdminLayout / WorkspaceLayout.)
void adminSidebarGroups
void userSidebarGroups
