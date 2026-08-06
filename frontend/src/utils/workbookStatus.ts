import dayjs from 'dayjs'
import type { WorkbookStatus } from '../api/types'

export interface StatusMeta {
  text: string
  color: string
}

export const STATUS_META: Record<WorkbookStatus, StatusMeta> = {
  none: { text: '未填报', color: 'default' },
  draft: { text: '草稿', color: 'blue' },
  submitted: { text: '已提交', color: 'orange' },
  approved: { text: '已通过', color: 'green' },
  rejected: { text: '已退回', color: 'red' },
}

export const STATUS_ORDER: WorkbookStatus[] = [
  'none',
  'draft',
  'submitted',
  'approved',
  'rejected',
]

/** 将 "YYYY-MM" 字符串转成 antd DatePicker（picker=month）所需的 dayjs 对象。 */
export function periodToDayjs(period: string) {
  return dayjs(period + '-01')
}

export function currentPeriod(): string {
  const now = new Date()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${m}`
}

export function dayjsToPeriod(value: dayjs.Dayjs | null): string {
  if (!value) {
    return currentPeriod()
  }
  const m = String(value.month() + 1).padStart(2, '0')
  return `${value.year()}-${m}`
}
