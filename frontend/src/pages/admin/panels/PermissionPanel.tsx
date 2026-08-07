/**
 * PermissionPanel：模板权限 Tab 内容（角色选择 + Transfer）。
 * 角色列表来自 useRoles hook（与 RolePanel 共享选中角色）。
 */
import { useEffect, useState } from 'react'
import { Button, Card, Select, Space, Spin, Transfer, Typography, message } from 'antd'
import type { Key } from 'react'
import { SaveOutlined } from '@ant-design/icons'
import { bindRoleTemplates, fetchRoleTemplates } from '../../../api/admin'
import { useRoles } from '../hooks/useRoles'

export default function PermissionPanel() {
  const { roles } = useRoles()
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null)
  const [targetKeys, setTargetKeys] = useState<Key[]>([])
  const [permissionLoading, setPermissionLoading] = useState(false)

  // 默认选中第一个角色
  useEffect(() => {
    const first = roles[0]
    if (first && selectedRoleId == null) {
      setSelectedRoleId(first.id)
    }
  }, [roles, selectedRoleId])

  // 加载该角色已绑定模板
  useEffect(() => {
    if (selectedRoleId == null) {
      return
    }
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
    if (selectedRoleId == null) {
      return
    }
    try {
      await bindRoleTemplates(selectedRoleId, targetKeys.map(Number))
      message.success('权限配置已保存')
    } catch {
      message.error('保存权限失败')
    }
  }

  return (
    <Card title="模板绑定" size="small">
      <Space orientation="vertical" style={{ width: '100%' }} size="large">
        <Space>
          <Typography.Text>选择角色：</Typography.Text>
          <Select
            style={{ width: 200 }}
            value={selectedRoleId ?? undefined}
            onChange={setSelectedRoleId}
            options={roles.map((r) => ({ value: r.id, label: r.name }))}
            placeholder="请选择角色"
          />
        </Space>
        <Spin spinning={permissionLoading}>
          <TransferPanel
            selectedRoleId={selectedRoleId}
            targetKeys={targetKeys}
            onChange={setTargetKeys}
          />
        </Spin>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          disabled={selectedRoleId == null}
          onClick={() => void handleSavePermission()}
        >
          保存权限配置
        </Button>
      </Space>
    </Card>
  )
}

/** Transfer 内容由 AdminPage 之外维护模板列表；这里简单 import。 */
import { fetchTemplates } from '../../../api/admin'
import type { TemplateItem } from '../../../api/types'
import { useEffect as useEff } from 'react'

function TransferPanel({
  selectedRoleId,
  targetKeys,
  onChange,
}: {
  selectedRoleId: number | null
  targetKeys: Key[]
  onChange: (keys: Key[]) => void
}) {
  const [items, setItems] = useState<TemplateItem[]>([])
  useEff(() => {
    fetchTemplates(false).then(setItems)
  }, [])
  return (
    <Transfer
      dataSource={items.map((t) => ({
        key: String(t.id),
        title: `${t.name}（${t.year}）`,
      }))}
      targetKeys={targetKeys}
      onChange={onChange}
      render={(item) => item.title}
      titles={['未绑定模板', '已绑定模板']}
      showSearch
      styles={{ section: { width: 360, height: 300 } }}
      disabled={selectedRoleId == null}
    />
  )
}