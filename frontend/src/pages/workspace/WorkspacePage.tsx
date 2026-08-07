import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Layout,
  Row,
  Space,
  Tag,
  Typography,
  message,
} from 'antd'
import { TableOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { fetchWorkspaceTemplates } from '../../api/workspace'
import type { WorkspaceTemplateItem } from '../../api/types'
import ChangePasswordModal from '../../components/ChangePasswordModal'
import { useAuthStore } from '../../store/useAuthStore'
import {
  currentPeriod,
  dayjsToPeriod,
  periodToDayjs,
  STATUS_META,
} from '../../utils/workbookStatus'

const { Header, Content } = Layout

export default function WorkspacePage() {
  const navigate = useNavigate()
  const username = useAuthStore((s) => s.username)
  const logout = useAuthStore((s) => s.logout)
  const [period, setPeriod] = useState<string>(currentPeriod())
  const [templates, setTemplates] = useState<WorkspaceTemplateItem[]>([])
  const [loading, setLoading] = useState(false)
  const [changePwdOpen, setChangePwdOpen] = useState(false)

  const load = useCallback(async (p: string) => {
    setLoading(true)
    try {
      setTemplates(await fetchWorkspaceTemplates(p))
    } catch {
      message.error('加载模板列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(period)
  }, [load, period])

  const handleLogout = () => {
    logout()
    message.success('已退出登录')
    navigate('/login', { replace: true })
  }

  const sorted = [...templates].sort((a, b) => {
    const order = { none: 0, draft: 1, rejected: 2, submitted: 3, approved: 4 }
    return (order[a.status] ?? 0) - (order[b.status] ?? 0)
  })

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
          在线表格 · 工作台
        </Typography.Text>
        <Space>
          <Typography.Text style={{ color: '#fff' }}>
            当前用户：{username ?? ''}
          </Typography.Text>
          <Button onClick={() => setChangePwdOpen(true)}>修改密码</Button>
          <Button onClick={handleLogout}>退出登录</Button>
        </Space>
      </Header>
      <ChangePasswordModal
        open={changePwdOpen}
        onClose={() => setChangePwdOpen(false)}
      />
      <Content style={{ padding: 24 }}>
        <Space style={{ marginBottom: 16 }} size="middle" wrap>
          <Typography.Title level={4} style={{ margin: 0 }}>
            我的模板
          </Typography.Title>
          <DatePicker
            picker="month"
            value={periodToDayjs(period)}
            onChange={(v) => setPeriod(dayjsToPeriod(v))}
            allowClear={false}
            style={{ width: 140 }}
          />
          <Typography.Text type="secondary">
            填报月份：{period}
          </Typography.Text>
        </Space>
        {loading ? (
          <Typography.Text type="secondary">加载中...</Typography.Text>
        ) : sorted.length === 0 ? (
          <Empty
            description={
              period.startsWith(`${new Date().getFullYear()}`)
                ? `当前角色在 ${period} 暂无可用模板，请联系管理员配置`
                : `当前角色在 ${period} 暂无可用模板（可能该年份尚未建模板）`
            }
          />
        ) : (
          <Row gutter={[16, 16]}>
            {sorted.map((template) => {
              const meta = STATUS_META[template.status]
              return (
                <Col key={template.id} xs={24} sm={12} md={8} lg={6}>
                  <Card
                    hoverable
                    onClick={() =>
                      navigate(`/workspace/templates/${template.id}?period=${period}`)
                    }
                  >
                    <Space orientation="vertical" size="small" style={{ width: '100%' }}>
                      <TableOutlined
                        style={{ fontSize: 28, color: '#1677ff', marginBottom: 8 }}
                      />
                      <Card.Meta title={template.name} />
                      <div>
                        <Tag color={meta.color}>{meta.text}</Tag>
                        {template.locked && <Tag color="default">已锁定</Tag>}
                      </div>
                    </Space>
                  </Card>
                </Col>
              )
            })}
          </Row>
        )}
      </Content>
    </Layout>
  )
}
