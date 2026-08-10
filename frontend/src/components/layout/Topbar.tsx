import { Breadcrumb, Button, Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import { useNavigate } from 'react-router-dom'
import {
  LogoutOutlined,
  SettingOutlined,
  KeyOutlined,
} from '@ant-design/icons'
import { type ReactNode } from 'react'
import { ADMIN_ROLE_NAME } from '../../constants'

export interface TopbarAction {
  key: string
  label: string
  icon?: ReactNode
  onClick?: () => void
  type?: 'default' | 'primary'
  danger?: boolean
}

interface TopbarProps {
  breadcrumbs: { title: string; href?: string }[]
  username: string
  roleName: string
  actions?: TopbarAction[]
  extras?: ReactNode
  onAccountSettings: () => void
  onLogout: () => void
}

export default function Topbar({
  breadcrumbs,
  username,
  roleName,
  actions,
  extras,
  onAccountSettings,
  onLogout,
}: TopbarProps) {
  const navigate = useNavigate()

  const userMenu: MenuProps['items'] = [
    {
      key: 'settings',
      label: '账号设置',
      icon: <KeyOutlined />,
      onClick: onAccountSettings,
    },
    { type: 'divider' },
    {
      key: 'logout',
      label: '退出登录',
      icon: <LogoutOutlined />,
      danger: true,
      onClick: onLogout,
    },
  ]

  const initial = (username || 'U').slice(0, 1).toUpperCase()

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          minWidth: 0,
          flex: 1,
        }}
      >
        <Breadcrumb
          items={breadcrumbs.map((b) => ({
            title: b.href ? (
              <a
                onClick={(e) => {
                  e.preventDefault()
                  navigate(b.href!)
                }}
                href={b.href}
              >
                {b.title}
              </a>
            ) : (
              <span style={{ color: 'var(--ot-color-text)' }}>{b.title}</span>
            ),
          }))}
          style={{ fontSize: 13 }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        {actions?.map((a) => (
          <Button
            key={a.key}
            type={a.type === 'primary' ? 'primary' : 'default'}
            danger={a.danger}
            icon={a.icon}
            onClick={a.onClick}
          >
            {a.label}
          </Button>
        ))}
        {extras}
        <Dropdown menu={{ items: userMenu }} placement="bottomRight" trigger={['click']}>
          <button
            type="button"
            aria-label="用户菜单"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '4px 10px 4px 4px',
              border: '1px solid var(--ot-color-border)',
              background: 'var(--ot-color-surface)',
              borderRadius: 999,
              cursor: 'pointer',
              color: 'var(--ot-color-text)',
              transition:
                'border-color var(--ot-duration-fast) var(--ot-ease-out), background var(--ot-duration-fast) var(--ot-ease-out)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#CBD5E1'
              e.currentTarget.style.background = 'var(--ot-color-surface-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--ot-color-border)'
              e.currentTarget.style.background = 'var(--ot-color-surface)'
            }}
          >
            <span
              aria-hidden
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background:
                  'linear-gradient(135deg, #2D5BFF 0%, #6E8CFF 100%)',
                color: '#fff',
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              {initial}
            </span>
            <span
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                lineHeight: 1.2,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500 }}>{username}</span>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--ot-color-text-tertiary)',
                }}
              >
                {roleName === ADMIN_ROLE_NAME ? '管理员' : roleName}
              </span>
            </span>
            <SettingOutlined
              style={{ fontSize: 12, color: 'var(--ot-color-text-tertiary)' }}
            />
          </button>
        </Dropdown>
      </div>
    </>
  )
}
