import { useState } from 'react'
import { App, Button, Form, Input, Typography } from 'antd'
import {
  LockOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { loginApi } from '../api/auth'
import { useAuthStore } from '../store/useAuthStore'
import { ADMIN_ROLE_NAME, APP_NAME, APP_TAGLINE, APP_VERSION } from '../constants'
import BrandMark from '../components/BrandMark'

interface LoginFormValues {
  username: string
  password: string
}

const VALUE_PROPS = [
  {
    icon: <SafetyCertificateOutlined />,
    title: '基于角色的精细权限',
    desc: '业务板块 → 主体 → 部门 + 职能标签三级组织，角色与部门解耦',
  },
  {
    icon: <ThunderboltOutlined />,
    title: '模板化一键复用',
    desc: '标签区只读 + 内容区限定，跨年复制模板与绑定',
  },
  {
    icon: <LockOutlined />,
    title: '草稿 / 提交 / 审核闭环',
    desc: '可锁定填报周期，可退回要求修改，自动校验数字',
  },
] as const

export default function LoginPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [loading, setLoading] = useState(false)

  const onFinish = async (values: LoginFormValues) => {
    setLoading(true)
    try {
      const res = await loginApi(values)
      setAuth({
        token: res.access_token,
        userId: res.user_id,
        username: res.username,
        roleId: res.role_id,
        roleName: res.role_name,
      })
      message.success(`欢迎，${res.username}`)
      navigate(res.role_name === ADMIN_ROLE_NAME ? '/admin' : '/workspace', {
        replace: true,
      })
    } catch {
      message.error('用户名或密码错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 7fr)',
        background: 'var(--ot-color-bg)',
      }}
    >
      <aside
        aria-hidden
        className="ot-login-brand"
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '48px 56px',
          color: '#fff',
          background:
            'radial-gradient(120% 100% at 0% 0%, #4F76FF 0%, #2D5BFF 35%, #1B3FCC 100%)',
          overflow: 'hidden',
        }}
      >
        <BrandMark size={36} wordColor="#fff" />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 460 }}>
          <Typography.Title
            level={1}
            style={{
              color: '#fff',
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              marginBottom: 12,
            }}
          >
            {APP_NAME}
          </Typography.Title>
          <div
            style={{
              fontSize: 16,
              color: 'rgba(255,255,255,0.78)',
              marginBottom: 32,
              lineHeight: 1.6,
            }}
          >
            {APP_TAGLINE}
          </div>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gap: 20,
            }}
          >
            {VALUE_PROPS.map((v) => (
              <li
                key={v.title}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.12)',
                    fontSize: 16,
                    flexShrink: 0,
                  }}
                >
                  {v.icon}
                </span>
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 15,
                      marginBottom: 4,
                    }}
                  >
                    {v.title}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: 'rgba(255,255,255,0.7)',
                      lineHeight: 1.6,
                    }}
                  >
                    {v.desc}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            fontSize: 12,
            color: 'rgba(255,255,255,0.6)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>© {new Date().getFullYear()} {APP_NAME}</span>
          <span>{APP_VERSION} · 现代商务版</span>
        </div>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            right: -120,
            top: -120,
            width: 360,
            height: 360,
            borderRadius: '50%',
            background:
              'radial-gradient(circle at center, rgba(255,255,255,0.18), transparent 60%)',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: -80,
            bottom: -80,
            width: 280,
            height: 280,
            borderRadius: '50%',
            background:
              'radial-gradient(circle at center, rgba(110,140,255,0.30), transparent 70%)',
          }}
        />
      </aside>
      <main
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
        }}
      >
        <div
          className="ot-fade-in"
          style={{ width: '100%', maxWidth: 380 }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 32,
            }}
          >
            <BrandMark size={32} />
          </div>
          <Typography.Title
            level={2}
            style={{
              margin: 0,
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: '-0.01em',
            }}
          >
            登录账号
          </Typography.Title>
          <Typography.Paragraph
            type="secondary"
            style={{ marginTop: 8, marginBottom: 28, fontSize: 14 }}
          >
            使用您的账号与密码登录系统。
          </Typography.Paragraph>

          <Form<LoginFormValues>
            onFinish={onFinish}
            layout="vertical"
            requiredMark={false}
            autoComplete="off"
          >
            <Form.Item
              name="username"
              label="用户名"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input
                id="username"
                prefix={<UserOutlined />}
                placeholder="用户名"
                size="large"
                autoComplete="username"
              />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                id="password"
                prefix={<LockOutlined />}
                placeholder="密码"
                size="large"
                autoComplete="current-password"
              />
            </Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={loading}
              style={{
                marginTop: 8,
                height: 44,
                fontWeight: 500,
                boxShadow: '0 6px 16px -4px rgba(45, 91, 255, 0.40)',
              }}
            >
              登录
            </Button>
          </Form>

          <div
            style={{
              marginTop: 28,
              paddingTop: 20,
              borderTop: '1px solid var(--ot-color-border-subtle)',
              fontSize: 12,
              color: 'var(--ot-color-text-tertiary)',
              lineHeight: 1.7,
            }}
          >
            <div>默认管理员：admin / admin123</div>
            <div>新创建角色默认密码：123456（首次登录后可账号设置中修改）</div>
          </div>
        </div>
      </main>
      <style>{`
        @media (max-width: 960px) {
          .ot-login-brand { display: none !important; }
        }
      `}</style>
    </div>
  )
}
