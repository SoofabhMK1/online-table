import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { App } from 'antd'
import { useAuthStore } from '../../store/useAuthStore'
import AppShell from '../../components/layout/AppShell'
import { userSidebarGroups } from '../../components/layout/sidebarGroups'
import AccountSettingsModal from '../../components/AccountSettingsModal'
import { useState } from 'react'

export default function WorkspaceLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { message } = App.useApp()
  const username = useAuthStore((s) => s.username)
  const roleName = useAuthStore((s) => s.roleName)
  const setUsername = useAuthStore((s) => s.setUsername)
  const logout = useAuthStore((s) => s.logout)
  const [changePwdOpen, setChangePwdOpen] = useState(false)

  const handleLogout = () => {
    logout()
    message.success('已退出登录')
    navigate('/login', { replace: true })
  }

  const handleSidebarSelect = (key: string) => {
    const item = userSidebarGroups
      .flatMap((g) => g.items)
      .find((it) => it.key === key)
    if (item && item.path !== location.pathname) {
      navigate(item.path)
    }
  }

  return (
    <>
      <AppShell
        sidebarGroups={userSidebarGroups}
        sidebarSelected="workspace"
        onSidebarSelect={handleSidebarSelect}
        breadcrumbs={[{ title: '工作台' }]}
        username={username ?? ''}
        roleName={roleName ?? ''}
        onAccountSettings={() => setChangePwdOpen(true)}
        onLogout={handleLogout}
      >
        <Outlet />
      </AppShell>
      <AccountSettingsModal
        open={changePwdOpen}
        onClose={() => setChangePwdOpen(false)}
        currentUsername={username ?? ''}
        onUsernameChanged={setUsername}
      />
    </>
  )
}
