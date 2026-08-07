/**
 * AdminPage：管理端入口（layout + header + 7 个 Tab）。
 * 各 Tab 内容由 panels/ 子组件承载；本组件只负责：
 *   1) Header（用户名 / 账号设置 / 退出登录）
 *   2) Tabs 容器
 *   3) AccountSettingsModal 全局挂载
 *   4) OrgManager + 其它 panel
 */
import { useEffect, useState } from 'react'
import { App, Button, Layout, Space, Tabs, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import AccountSettingsModal from '../../components/AccountSettingsModal'
import OrgManager from '../../components/OrgManager'
import { useRolesStore } from '../../store/useRolesStore'
import { useTemplatesStore } from '../../store/useTemplatesStore'
import TemplatePanel from './panels/TemplatePanel'
import ArchivedTemplatePanel from './panels/ArchivedTemplatePanel'
import RolePanel from './panels/RolePanel'
import PermissionPanel from './panels/PermissionPanel'
import OverviewPanel from './panels/OverviewPanel'
import PeriodPanel from './panels/PeriodPanel'

const { Header, Content } = Layout

export default function AdminPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const username = useAuthStore((s) => s.username)
  const setUsername = useAuthStore((s) => s.setUsername)
  const logout = useAuthStore((s) => s.logout)

  const [changePwdOpen, setChangePwdOpen] = useState(false)

  // 组织架构 / 模板 / 角色 / 归档 — 共享 store
  const orgTree = useRolesStore((s) => s.orgTree)
  const orgLoading = useRolesStore((s) => s.orgLoading)
  const fetchOrgTree = useRolesStore((s) => s.fetchOrgTree)
  const fetchRoles = useRolesStore((s) => s.fetchRoles)
  const fetchTemplatesAll = useTemplatesStore((s) => s.fetchAll)

  // 进入页面时拉取初始数据（覆盖式写入 store）
  useEffect(() => {
    void fetchRoles()
    void fetchOrgTree()
    void fetchTemplatesAll()
  }, [fetchRoles, fetchOrgTree, fetchTemplatesAll])

  const handleLogout = () => {
    logout()
    message.success('已退出登录')
    navigate('/login', { replace: true })
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography.Text style={{ color: '#fff', fontSize: 18 }}>
          在线表格 · 管理端
        </Typography.Text>
        <Space>
          <Typography.Text style={{ color: '#fff' }}>
            当前用户：{username ?? ''}
          </Typography.Text>
          <Button onClick={() => setChangePwdOpen(true)}>账号设置</Button>
          <Button onClick={handleLogout}>退出登录</Button>
        </Space>
      </Header>
      <Content style={{ padding: 24 }}>
        <Tabs
          items={[
            { key: 'templates', label: '模板管理', children: <TemplatePanel /> },
            { key: 'roles', label: '角色管理', children: <RolePanel /> },
            {
              key: 'org',
              label: '组织架构',
              children: (
                <OrgManager
                  tree={orgTree}
                  onChanged={() => void fetchOrgTree()}
                  loading={orgLoading}
                />
              ),
            },
            { key: 'permissions', label: '模板权限', children: <PermissionPanel /> },
            { key: 'overview', label: '填报总览', children: <OverviewPanel /> },
            { key: 'periods', label: '填报期间', children: <PeriodPanel /> },
            { key: 'archived', label: '归档模板', children: <ArchivedTemplatePanel /> },
          ]}
        />
      </Content>

      <AccountSettingsModal
        open={changePwdOpen}
        onClose={() => setChangePwdOpen(false)}
        currentUsername={username ?? ''}
        onUsernameChanged={setUsername}
      />
    </Layout>
  )
}