import { useState, type ReactNode } from 'react'
import { Layout } from 'antd'
import Sidebar, { type SidebarGroup } from './Sidebar'
import Topbar, { type TopbarAction } from './Topbar'

const { Sider, Header, Content } = Layout

export interface AppShellProps {
  sidebarGroups: SidebarGroup[]
  sidebarSelected: string
  onSidebarSelect: (key: string) => void
  breadcrumbs: { title: string; href?: string }[]
  pageTitle?: string
  pageDescription?: string
  pageActions?: ReactNode
  topbarExtras?: ReactNode
  topbarActions?: TopbarAction[]
  username: string
  roleName: string
  onAccountSettings: () => void
  onLogout: () => void
  children: ReactNode
}

export default function AppShell({
  sidebarGroups,
  sidebarSelected,
  onSidebarSelect,
  breadcrumbs,
  pageTitle,
  pageDescription,
  pageActions,
  topbarExtras,
  topbarActions,
  username,
  roleName,
  onAccountSettings,
  onLogout,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <Layout style={{ minHeight: '100vh', flexDirection: 'row' }}>
      <Sider
        width={240}
        collapsedWidth={64}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        style={{
          borderRight: '1px solid var(--ot-color-border)',
          position: 'sticky',
          top: 0,
          height: '100vh',
          zIndex: 10,
        }}
      >
        <Sidebar
          groups={sidebarGroups}
          selected={sidebarSelected}
          onSelect={onSidebarSelect}
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
        />
      </Sider>
      <Layout style={{ flex: 1, minWidth: 0, background: 'var(--ot-color-bg)' }}>
        <Header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 9,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            padding: '0 24px',
            borderBottom: '1px solid var(--ot-color-border)',
            background: 'var(--ot-color-surface)',
          }}
        >
          <Topbar
            breadcrumbs={breadcrumbs}
            username={username}
            roleName={roleName}
            actions={topbarActions}
            extras={topbarExtras}
            onAccountSettings={onAccountSettings}
            onLogout={onLogout}
          />
        </Header>
        <Content
          style={{
            padding: '24px 32px 40px',
          }}
        >
          {(pageTitle || pageActions) && (
            <div
              className="ot-fade-in"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 16,
                marginBottom: 24,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: 0 }}>
                {pageTitle && (
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 600,
                      letterSpacing: '-0.01em',
                      color: 'var(--ot-color-text)',
                      lineHeight: 1.3,
                    }}
                  >
                    {pageTitle}
                  </div>
                )}
                {pageDescription && (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 14,
                      color: 'var(--ot-color-text-secondary)',
                    }}
                  >
                    {pageDescription}
                  </div>
                )}
              </div>
              {pageActions && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  {pageActions}
                </div>
              )}
            </div>
          )}
          <div className="ot-fade-in">{children}</div>
        </Content>
      </Layout>
    </Layout>
  )
}
