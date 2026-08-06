import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Space, Spin, Typography, message } from 'antd'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import type { IWorkbookData } from '@univerjs/core'
import UniverSheet, {
  type ProtectedLabels,
  type UniverSheetHandle,
} from '../../components/UniverSheet'
import {
  fetchWorkspaceTemplateDetail,
  submitWorkbook,
} from '../../api/workspace'
import { useAuthStore } from '../../store/useAuthStore'

export default function WorkspaceEditPage() {
  const { templateId } = useParams()
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const username = useAuthStore((s) => s.username)
  const sheetRef = useRef<UniverSheetHandle>(null)
  const [snapshot, setSnapshot] = useState<IWorkbookData | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [protectedLabels, setProtectedLabels] = useState<ProtectedLabels | undefined>(
    undefined,
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const tid = Number(templateId)
    fetchWorkspaceTemplateDetail(tid)
      .then((detail) => {
        if (cancelled) {
          return
        }
        setTemplateName(detail.name)
        setSnapshot(detail.snapshot as unknown as IWorkbookData)
        setProtectedLabels({
          rowLabelCols: detail.row_label_cols,
          colLabelRows: detail.col_label_rows,
          contentRows: detail.content_rows,
          contentCols: detail.content_cols,
        })
      })
      .catch(() => message.error('加载模板失败'))
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [templateId])

  const handleSave = async () => {
    const data = sheetRef.current?.getWorkbookData()
    if (!data) {
      return
    }
    setSaving(true)
    try {
      await submitWorkbook(
        Number(templateId),
        data as unknown as Record<string, unknown>,
      )
      message.success('保存成功')
    } catch {
      message.error('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          height: 48,
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
          flexShrink: 0,
        }}
      >
        <SpaceWithGap>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/workspace')}
          >
            返回
          </Button>
          <Typography.Text strong>填报：{templateName}</Typography.Text>
        </SpaceWithGap>
        <Space>
          <Typography.Text type="secondary">{username}</Typography.Text>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            disabled={loading}
            onClick={handleSave}
          >
            保存
          </Button>
          <Button
            onClick={() => {
              logout()
              message.success('已退出登录')
              navigate('/login', { replace: true })
            }}
          >
            退出登录
          </Button>
        </Space>
      </div>
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {loading ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Spin size="large" />
          </div>
        ) : (
          snapshot && (
            <UniverSheet
              ref={sheetRef}
              initialSnapshot={snapshot}
              protectedLabels={protectedLabels}
            />
          )
        )}
      </div>
    </div>
  )
}

function SpaceWithGap({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>{children}</div>
}