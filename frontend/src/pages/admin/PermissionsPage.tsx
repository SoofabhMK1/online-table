import { useEffect, useState } from 'react'
import {
  App,
  Button,
  Card,
  Select,
  Space,
  Spin,
  Transfer,
  Typography,
} from 'antd'
import type { Key } from 'react'
import { SaveOutlined } from '@ant-design/icons'
import { bindRoleTemplates, fetchRoleTemplates } from '../../api/admin'
import { useRolesStore } from '../../store/useRolesStore'
import { useTemplatesStore } from '../../store/useTemplatesStore'
import PageHeader from '../../components/layout/PageHeader'
import EmptyState from '../../components/feedback/EmptyState'

export default function PermissionsPage() {
  const { message } = App.useApp()
  const roles = useRolesStore((s) => s.roles)
  const fetchRoles = useRolesStore((s) => s.fetchRoles)
  const templates = useTemplatesStore((s) => s.templates)
  const fetchActive = useTemplatesStore((s) => s.fetchActive)

  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null)
  const [targetKeys, setTargetKeys] = useState<Key[]>([])
  const [permissionLoading, setPermissionLoading] = useState(false)

  useEffect(() => {
    void fetchRoles()
    void fetchActive()
  }, [fetchRoles, fetchActive])

  useEffect(() => {
    const first = roles[0]
    if (first && selectedRoleId == null) {
      setSelectedRoleId(first.id)
    }
  }, [roles, selectedRoleId])

  useEffect(() => {
    if (selectedRoleId == null) return
    let cancelled = false
    setPermissionLoading(true)
    fetchRoleTemplates(selectedRoleId)
      .then((ids) => {
        if (!cancelled) setTargetKeys(ids.map(String))
      })
      .finally(() => {
        if (!cancelled) setPermissionLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedRoleId])

  const handleSavePermission = async () => {
    if (selectedRoleId == null) return
    try {
      await bindRoleTemplates(selectedRoleId, targetKeys.map(Number))
      message.success('权限配置已保存')
    } catch {
      message.error('保存权限失败')
    }
  }

  const hasRoles = roles.length > 0
  const hasTemplates = templates.length > 0

  return (
    <div className="ot-fade-in">
      <PageHeader
        eyebrow="管理中心"
        title="模板权限"
        description="为每个角色分配可访问的模板；用户登录后只能看到自己角色已绑定的模板。"
      />

      {!hasRoles ? (
        <Card style={{ borderRadius: 12 }}>
          <EmptyState
            variant="roles"
            description="请先在「角色管理」创建角色"
          />
        </Card>
      ) : !hasTemplates ? (
        <Card style={{ borderRadius: 12 }}>
          <EmptyState
            variant="templates"
            description="请先在「模板管理」创建模板"
          />
        </Card>
      ) : (
        <Card style={{ borderRadius: 12 }}>
          <Space orientation="vertical" style={{ width: '100%' }} size="large">
            <Space size={12} align="center">
              <Typography.Text type="secondary">选择角色</Typography.Text>
              <Select
                style={{ width: 240 }}
                value={selectedRoleId ?? undefined}
                onChange={setSelectedRoleId}
                options={roles.map((r) => ({ value: r.id, label: r.name }))}
                placeholder="请选择角色"
              />
            </Space>
            <Spin spinning={permissionLoading}>
              <Transfer<{ key: string; title: string }>
                dataSource={templates.map((t) => ({
                  key: String(t.id),
                  title: `${t.name}（${t.year}）`,
                }))}
                targetKeys={targetKeys}
                onChange={(keys) => setTargetKeys(keys)}
                render={(item) => item.title}
                titles={['未绑定模板', '已绑定模板']}
                showSearch
                styles={{ section: { width: 360, height: 320 } }}
                disabled={selectedRoleId == null}
                listStyle={{ width: 360, height: 320 }}
              />
            </Spin>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              disabled={selectedRoleId == null}
              onClick={() => void handleSavePermission()}
              style={{
                boxShadow: '0 4px 12px -4px rgba(45, 91, 255, 0.30)',
              }}
            >
              保存权限配置
            </Button>
          </Space>
        </Card>
      )}
    </div>
  )
}
