/**
 * ArchivedTemplatePanel：归档模板 Tab 内容。仅显示已归档模板并支持恢复。
 * 与 TemplatePanel 共用 useTemplates hook，两侧状态保持一致。
 */
import { useState } from 'react'
import { Button, Space, Table, Typography, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { ReloadOutlined, UndoOutlined } from '@ant-design/icons'
import type { TemplateItem } from '../../../api/types'
import { useTemplates } from '../hooks/useTemplates'

export default function ArchivedTemplatePanel() {
  const { archivedTemplates, archivedLoading, reloadArchived, unarchive } = useTemplates()
  const [archivingId, setArchivingId] = useState<number | null>(null)

  const handleUnarchiveTemplate = async (template: TemplateItem) => {
    setArchivingId(template.id)
    try {
      await unarchive(template.id)
      message.success(`模板「${template.name}」已恢复`)
    } catch {
      message.error('恢复失败')
    } finally {
      setArchivingId(null)
    }
  }

  const archivedColumns: TableColumnsType<TemplateItem> = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: '模板名称', dataIndex: 'name' },
    { title: '年份', dataIndex: 'year', width: 80 },
    {
      title: '归档时间',
      dataIndex: 'archived_at',
      width: 180,
      render: (value: string | null) => (value ? new Date(value).toLocaleString() : '-'),
    },
    {
      title: '操作',
      width: 120,
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<UndoOutlined />}
          loading={archivingId === record.id}
          onClick={() => void handleUnarchiveTemplate(record)}
        >
          恢复
        </Button>
      ),
    },
  ]

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="large">
      <Space wrap>
        <Typography.Text strong>归档模板</Typography.Text>
        <Button icon={<ReloadOutlined />} onClick={() => void reloadArchived()}>
          刷新
        </Button>
        <Typography.Text type="secondary">
          归档模板已从工作台/填报总览/绑定列表中隐藏，恢复后即可重新使用（原角色绑定保留）。
        </Typography.Text>
      </Space>
      <Table
        rowKey="id"
        columns={archivedColumns}
        dataSource={archivedTemplates}
        loading={archivedLoading}
        pagination={false}
      />
    </Space>
  )
}