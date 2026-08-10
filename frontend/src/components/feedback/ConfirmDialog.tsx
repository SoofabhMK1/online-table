import type { ReactNode } from 'react'
import { Modal } from 'antd'
import { ExclamationCircleOutlined } from '@ant-design/icons'

export interface ConfirmDialogProps {
  open: boolean
  title: ReactNode
  children?: ReactNode
  danger?: boolean
  okText?: string
  cancelText?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  children,
  danger = false,
  okText = '确认',
  cancelText = '取消',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {danger && (
            <ExclamationCircleOutlined
              style={{ color: 'var(--ot-color-danger)' }}
            />
          )}
          {title}
        </span>
      }
      onOk={onConfirm}
      onCancel={onCancel}
      okText={okText}
      cancelText={cancelText}
      okButtonProps={{ danger, loading }}
      centered
      width={440}
      destroyOnHidden
    >
      {children}
    </Modal>
  )
}
