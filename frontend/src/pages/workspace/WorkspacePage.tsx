import { useEffect, useState } from 'react'
import { Button, Card, Col, Empty, Layout, Row, Space, Typography, message } from 'antd'
import { TableOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { fetchWorkspaceTemplates } from '../../api/workspace'
import type { TemplateItem } from '../../api/types'
import { useAuthStore } from '../../store/useAuthStore'

const { Header, Content } = Layout

export default function WorkspacePage() {
  const navigate = useNavigate()
  const username = useAuthStore((s) => s.username)
  const logout = useAuthStore((s) => s.logout)
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetchWorkspaceTemplates()
      .then(setTemplates)
      .catch(() => message.error('加载模板列表失败'))
      .finally(() => setLoading(false))
  }, [])

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
          在线表格 · 工作台
        </Typography.Text>
        <Space>
          <Typography.Text style={{ color: '#fff' }}>
            当前用户：{username ?? ''}
          </Typography.Text>
          <Button onClick={handleLogout}>退出登录</Button>
        </Space>
      </Header>
      <Content style={{ padding: 24 }}>
        <Typography.Title level={4}>我的模板</Typography.Title>
        {loading ? (
          <Typography.Text type="secondary">加载中...</Typography.Text>
        ) : templates.length === 0 ? (
          <Empty description="当前角色暂无可用模板，请联系管理员配置" />
        ) : (
          <Row gutter={[16, 16]}>
            {templates.map((template) => (
              <Col key={template.id} xs={24} sm={12} md={8} lg={6}>
                <Card
                  hoverable
                  onClick={() => navigate(`/workspace/templates/${template.id}`)}
                >
                  <TableOutlined
                    style={{ fontSize: 28, color: '#1677ff', marginBottom: 8 }}
                  />
                  <Card.Meta title={template.name} />
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Content>
    </Layout>
  )
}