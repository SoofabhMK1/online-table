import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Alert, App, Button, Space, Spin, Tag } from 'antd'
import {
  ArrowLeftOutlined,
  SaveOutlined,
  SendOutlined,
  LogoutOutlined,
  KeyOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { IWorkbookData } from '@univerjs/core'
import UniverSheet, {
  type ProtectedLabels,
  type UniverSheetHandle,
} from '../../components/UniverSheet'
import {
  fetchWorkspaceTemplateDetail,
  submitWorkbook,
} from '../../api/workspace'
import type { WorkbookStatus } from '../../api/types'
import AccountSettingsModal from '../../components/AccountSettingsModal'
import { useAuthStore } from '../../store/useAuthStore'
import { currentPeriod, STATUS_META } from '../../utils/workbookStatus'
import { validateContentNumeric } from '../../utils/validateContent'
import BrandMark from '../../components/BrandMark'

export default function WorkspaceEditPage() {
  const { templateId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const logout = useAuthStore((s) => s.logout)
  const username = useAuthStore((s) => s.username)
  const setUsername = useAuthStore((s) => s.setUsername)
  const sheetRef = useRef<UniverSheetHandle>(null)
  const period = searchParams.get('period') ?? currentPeriod()
  const [snapshot, setSnapshot] = useState<IWorkbookData | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [status, setStatus] = useState<WorkbookStatus>('none')
  const [rejectReason, setRejectReason] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [contentNumeric, setContentNumeric] = useState(false)
  const [protectedLabels, setProtectedLabels] = useState<
    ProtectedLabels | undefined
  >(undefined)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [changePwdOpen, setChangePwdOpen] = useState(false)

  const readOnly = locked || status === 'submitted' || status === 'approved'

  const load = useCallback(
    async (tid: number, p: string) => {
      setLoading(true)
      try {
        const detail = await fetchWorkspaceTemplateDetail(tid, p)
        setTemplateName(detail.name)
        setStatus(detail.status)
        setRejectReason(detail.reject_reason)
        setLocked(detail.locked)
        setContentNumeric(detail.content_numeric)
        setSnapshot(detail.snapshot as unknown as IWorkbookData)
        setProtectedLabels({
          rowLabelCols: detail.row_label_cols,
          colLabelRows: detail.col_label_rows,
          contentRows: detail.content_rows,
          contentCols: detail.content_cols,
        })
      } catch {
        message.error('加载模板失败')
      } finally {
        setLoading(false)
      }
    },
    [message],
  )

  useEffect(() => {
    const tid = Number(templateId)
    void load(tid, period)
  }, [templateId, period, load])

  const persist = async (action: 'save' | 'submit') => {
    const data = sheetRef.current?.getWorkbookData()
    if (!data) return
    if (action === 'submit' && contentNumeric && protectedLabels) {
      const invalid = validateContentNumeric(
        data as unknown as Record<string, unknown>,
        {
          rowLabelCols: protectedLabels.rowLabelCols,
          colLabelRows: protectedLabels.colLabelRows,
          contentRows: protectedLabels.contentRows,
          contentCols: protectedLabels.contentCols,
          contentNumeric,
        },
      )
      if (invalid.length > 0) {
        message.error(
          `单元格 ${invalid.map((c) => c.label).join('、')} 需为数字`,
        )
        return
      }
    }
    if (action === 'submit') {
      setSubmitting(true)
    } else {
      setSaving(true)
    }
    try {
      await submitWorkbook({
        template_id: Number(templateId),
        period,
        snapshot: data as unknown as Record<string, unknown>,
        action,
      })
      if (action === 'submit') {
        message.success('提交成功，等待财务审核')
        await load(Number(templateId), period)
      } else {
        message.success('草稿已保存')
      }
    } catch (error) {
      const detail = (
        error as { response?: { data?: { detail?: string } } }
      )?.response?.data?.detail
      message.error(detail ?? '保存失败，请重试')
    } finally {
      setSaving(false)
      setSubmitting(false)
    }
  }

  const handleSubmit = () => {
    modal.confirm({
      title: '确认提交填报？',
      content:
        '提交后该周期的填报将被锁定，等待财务审核（如需修改需被退回后）。',
      okText: '确认提交',
      cancelText: '取消',
      onOk: () => persist('submit'),
    })
  }

  const handleLogout = () => {
    logout()
    message.success('已退出登录')
    navigate('/login', { replace: true })
  }

  const statusMeta = STATUS_META[status]

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--ot-color-bg)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          height: 56,
          background: 'var(--ot-color-surface)',
          borderBottom: '1px solid var(--ot-color-border)',
          flexShrink: 0,
          gap: 16,
        }}
      >
        <SpaceWithGap>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/workspace')}
          >
            返回
          </Button>
          <BrandMark size={26} />
          <span
            style={{
              width: 1,
              height: 18,
              background: 'var(--ot-color-border)',
            }}
            aria-hidden
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              lineHeight: 1.3,
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--ot-color-text)',
              }}
            >
              {templateName || '加载中…'}
            </span>
            <span
              style={{
                fontSize: 11,
                color: 'var(--ot-color-text-tertiary)',
              }}
            >
              周期 {period}
            </span>
          </div>
          <Tag
            style={{
              margin: 0,
              background: statusMeta.color === 'default' ? '#F1F5F9' : undefined,
              color:
                statusMeta.color === 'default'
                  ? 'var(--ot-color-text-secondary)'
                  : undefined,
              border: 'none',
              fontWeight: 500,
            }}
          >
            {statusMeta.text}
          </Tag>
        </SpaceWithGap>
        <Space>
          {!readOnly && (
            <>
              <Button
                icon={<SaveOutlined />}
                loading={saving}
                disabled={loading}
                onClick={() => void persist('save')}
              >
                保存草稿
              </Button>
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={submitting}
                disabled={loading}
                onClick={handleSubmit}
                style={{
                  boxShadow: '0 4px 12px -4px rgba(45, 91, 255, 0.40)',
                }}
              >
                提交
              </Button>
            </>
          )}
          <Button
            icon={<KeyOutlined />}
            onClick={() => setChangePwdOpen(true)}
          >
            账号设置
          </Button>
          <Button icon={<LogoutOutlined />} onClick={handleLogout}>
            退出登录
          </Button>
        </Space>
      </header>

      <AccountSettingsModal
        open={changePwdOpen}
        onClose={() => setChangePwdOpen(false)}
        currentUsername={username ?? ''}
        onUsernameChanged={setUsername}
      />

      {status === 'rejected' && (
        <Alert
          type="error"
          showIcon
          style={{ flexShrink: 0, borderRadius: 0 }}
          message={`填报已被退回：${rejectReason ?? '未填写退回原因'}`}
          description="请根据退回原因修改后重新提交。"
        />
      )}
      {locked && (
        <Alert
          type="warning"
          showIcon
          style={{ flexShrink: 0, borderRadius: 0 }}
          message="该周期已被管理员锁定，无法修改"
          description="如需调整请联系管理员解锁该填报月份。"
        />
      )}
      {readOnly && !locked && (
        <Alert
          type="info"
          showIcon
          style={{ flexShrink: 0, borderRadius: 0 }}
          message={
            status === 'approved'
              ? '该周期填报已通过审核，当前为只读状态'
              : '该周期填报已提交，等待财务审核，当前为只读状态'
          }
        />
      )}
      {contentNumeric && (
        <Alert
          type="info"
          showIcon
          style={{ flexShrink: 0, borderRadius: 0 }}
          message="本模板内容区仅允许填写数字，提交时系统会自动校验"
        />
      )}

      <div
        style={{
          flex: 1,
          position: 'relative',
          minHeight: 0,
          background: 'var(--ot-color-surface)',
          margin: 16,
          borderRadius: 12,
          border: '1px solid var(--ot-color-border)',
          overflow: 'hidden',
          boxShadow: 'var(--ot-shadow-sm)',
        }}
      >
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
              key={`${templateId}-${period}`}
              ref={sheetRef}
              initialSnapshot={snapshot}
              protectedLabels={protectedLabels}
              readOnly={readOnly}
              disableSheetOps
            />
          )
        )}
      </div>
    </div>
  )
}

function SpaceWithGap({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {children}
    </div>
  )
}
