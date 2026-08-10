import { Tag } from 'antd'
import type { WorkbookStatus } from '../../api/types'
import {
  STATUS_APPROVED,
  STATUS_DRAFT,
  STATUS_NONE,
  STATUS_REJECTED,
  STATUS_SUBMITTED,
} from '../../constants'

const COLOR_MAP: Record<WorkbookStatus, { color: string; bg: string; text: string }> = {
  draft: { color: STATUS_DRAFT, bg: '#EEF2FF', text: '草稿' },
  submitted: { color: STATUS_SUBMITTED, bg: '#FFF7E6', text: '已提交' },
  approved: { color: STATUS_APPROVED, bg: '#ECFDF5', text: '已通过' },
  rejected: { color: STATUS_REJECTED, bg: '#FEF2F2', text: '已退回' },
  none: { color: STATUS_NONE, bg: '#F1F5F9', text: '未填报' },
}

interface StatusChipProps {
  status: WorkbookStatus
  size?: 'small' | 'default'
  showText?: boolean
}

export default function StatusChip({
  status,
  size = 'default',
  showText = true,
}: StatusChipProps) {
  const meta = COLOR_MAP[status]
  return (
    <Tag
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: size === 'small' ? '1px 8px' : '2px 10px',
        margin: 0,
        background: meta.bg,
        color: meta.color,
        border: '1px solid transparent',
        borderRadius: 999,
        fontSize: size === 'small' ? 11 : 12,
        fontWeight: 500,
        lineHeight: 1.6,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: meta.color,
        }}
      />
      {showText && meta.text}
    </Tag>
  )
}
