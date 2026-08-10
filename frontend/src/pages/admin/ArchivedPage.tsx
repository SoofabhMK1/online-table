import { useEffect, useState } from 'react'
import {
  App,
  Button,
  Card,
  Table,
  Tag,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { ReloadOutlined, UndoOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import type { TemplateItem } from '../../api/types'
import { useTemplatesStore } from '../../store/useTemplatesStore'
import PageHeader from '../../components/layout/PageHeader'
import EmptyState from '../../components/feedback/EmptyState'

export default function ArchivedPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const archivedTemplates = useTemplatesStore((s) => s.archivedTemplates)
  const archivedLoading = useTemplatesStore((s) => s.archivedLoading)
  const fetchArchived = useTemplatesStore((s) => s.fetchArchived)
  const unarchive = useTemplatesStore((s) => s.unarchive)
  const [archivingId, setArchivingId] = useState<number | null>(null)

  useEffect(() => {
    void fetchArchived()
  }, [fetchArchived])

  const handleUnarchiveTemplate = async (template: TemplateItem) => {
    setArchivingId(template.id)
    try {
      await unarchive(template.id)
      message.success(`模板「${template.name}」已恢复`)
      navigate('/admin/templates')
    } catch {
      message.error('恢复失败')
    } finally {
      setArchivingId(null)
    }
  }

  const columns: TableColumnsType<TemplateItem> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 70,
      render: (v: number) => (
        <span className="ot-mono" style={{ color: 'var(--ot-color-text-tertiary)' }}>
          #{v}
        </span>
      ),
    },
    {
      title: '模板名称',
      dataIndex: 'name',
      render: (v: string) => <span style={{ fontWeight: 500 }}>{v}</span>,
    },
    {
      title: '年份',
      dataIndex: 'year',
      width: 80,
      render: (v: number) => (
        <Tag style={{ borderRadius: 6, fontVariantNumeric: 'tabular-nums' }}>
          {v}
        </Tag>
      ),
    },
    {
      title: '归档时间',
      dataIndex: 'archived_at',
      width: 200,
      render: (value: string | null) =>
        value ? (
          <span style={{ fontSize: 13, color: 'var(--ot-color-text-secondary)' }}>
            {new Date(value).toLocaleString()}
          </span>
        ) : (
          '-'
        ),
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
    <div className="ot-fade-in">
      <PageHeader
        eyebrow="管理中心"
        title="归档模板"
        description="归档的模板会从工作台 / 填报总览 / 绑定列表中隐藏，角色绑定与历史数据保留，可随时恢复。"
        actions={
          <Button icon={<ReloadOutlined />} onClick={() => void fetchArchived()}>
            刷新
          </Button>
        }
      />

      <Card styles={{ body: { padding: 0 } }} style={{ borderRadius: 12 }}>
        {archivedTemplates.length === 0 && !archivedLoading ? (
          <EmptyState
            variant="archived"
            description="归档的模板会显示在这里，可随时恢复"
          />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={archivedTemplates}
            loading={archivedLoading}
            pagination={false}
            className="ot-cv-auto"
          />
        )}
      </Card>
    </div>
  )
}
