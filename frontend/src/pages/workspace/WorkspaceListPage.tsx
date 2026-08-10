import { useEffect, useMemo, useState } from 'react'
import { App, Button, Card, Col, DatePicker, Row, Skeleton } from 'antd'
import { TableOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { fetchWorkspaceTemplates } from '../../api/workspace'
import type { WorkspaceTemplateItem, WorkbookStatus } from '../../api/types'
import StatusChip from '../../components/feedback/StatusChip'
import EmptyState from '../../components/feedback/EmptyState'
import PageHeader from '../../components/layout/PageHeader'
import {
  currentPeriod,
  dayjsToPeriod,
  periodToDayjs,
} from '../../utils/workbookStatus'

const STATUS_WEIGHT: Record<WorkbookStatus, number> = {
  none: 0,
  draft: 1,
  rejected: 2,
  submitted: 3,
  approved: 4,
}

export default function WorkspaceListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [period, setPeriod] = useState<string>(currentPeriod())
  const [templates, setTemplates] = useState<WorkspaceTemplateItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchWorkspaceTemplates(period)
      .then((data) => {
        if (!active) return
        setTemplates(data)
        setLoaded(true)
      })
      .catch(() => {
        message.error('加载模板列表失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [period, message])

  const sorted = useMemo(
    () =>
      [...templates].sort(
        (a, b) => STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status],
      ),
    [templates],
  )

  const isCurrentYear = period.startsWith(`${new Date().getFullYear()}`)
  const emptyVariant = isCurrentYear ? 'workbooks' : 'search'
  const emptyDescription = isCurrentYear
    ? `当前角色在 ${period} 暂无可用模板，请联系管理员配置`
    : `${period} 暂无模板（可能该年份尚未建模板）`

  return (
    <div className="ot-fade-in">
      <PageHeader
        title="我的模板"
        description="选择填报月份，并点击模板进入填报或查看。"
        actions={
          <DatePicker
            picker="month"
            value={periodToDayjs(period)}
            onChange={(v) => setPeriod(dayjsToPeriod(v))}
            allowClear={false}
            style={{ width: 160 }}
          />
        }
        meta={
          <div
            style={{
              fontSize: 13,
              color: 'var(--ot-color-text-secondary)',
            }}
          >
            填报月份：<strong style={{ color: 'var(--ot-color-text)' }}>{period}</strong>
          </div>
        }
      />

      {loading && !loaded ? (
        <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Col key={i} xs={24} sm={12} md={8} lg={6}>
              <Card>
                <Skeleton active paragraph={{ rows: 2 }} />
              </Card>
            </Col>
          ))}
        </Row>
      ) : sorted.length === 0 ? (
        <div
          style={{
            marginTop: 16,
            background: 'var(--ot-color-surface)',
            border: '1px solid var(--ot-color-border)',
            borderRadius: 12,
          }}
        >
          <EmptyState
            variant={emptyVariant}
            description={emptyDescription}
            action={
              <Button type="primary" onClick={() => navigate('/')}>
                回到首页
              </Button>
            }
          />
        </div>
      ) : (
        <Row gutter={[16, 16]} className="ot-cv-auto">
          {sorted.map((t) => (
            <Col key={t.id} xs={24} sm={12} md={8} lg={6}>
              <TemplateCard
                template={t}
                onClick={() =>
                  navigate(`/workspace/templates/${t.id}?period=${period}`)
                }
              />
            </Col>
          ))}
        </Row>
      )}
    </div>
  )
}

interface TemplateCardProps {
  template: WorkspaceTemplateItem
  onClick: () => void
}

function TemplateCard({ template, onClick }: TemplateCardProps) {
  return (
    <Card
      hoverable
      onClick={onClick}
      styles={{
        body: {
          padding: 20,
        },
      }}
      style={{
        borderRadius: 12,
        borderColor: 'var(--ot-color-border)',
        transition: 'all 0.18s var(--ot-ease-out)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background:
              'linear-gradient(135deg, #EEF2FF 0%, #DBE6FF 100%)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--ot-color-primary)',
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          <TableOutlined />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <StatusChip status={template.status} size="small" />
          {template.locked && <StatusChip status="none" size="small" showText />}
          {/* 锁定使用独立样式 */}
        </div>
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--ot-color-text)',
          letterSpacing: '-0.005em',
          marginBottom: 4,
          lineHeight: 1.4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          minHeight: 42,
        }}
      >
        {template.name}
      </div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--ot-color-text-tertiary)',
        }}
      >
        模板 ID #{template.id}
        {template.submit_at && (
          <>
            {' · '}
            最近提交 {new Date(template.submit_at).toLocaleDateString()}
          </>
        )}
      </div>
      {template.locked && (
        <div
          style={{
            marginTop: 12,
            padding: '6px 10px',
            background: '#FEF3C7',
            borderRadius: 6,
            color: '#92400E',
            fontSize: 12,
          }}
        >
          该月已被管理员锁定，不可编辑
        </div>
      )}
    </Card>
  )
}
