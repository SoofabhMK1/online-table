import type { AdminBindingStatus, WorkbookStatus } from '../api/types'
import { STATUS_META } from './workbookStatus'

export interface OverviewDeptRow {
  type: 'dept'
  key: string
  segmentName: string | null
  entityName: string | null
  departmentName: string | null
  children: OverviewRoleRow[]
}

export interface OverviewRoleRow {
  type: 'role'
  key: string
  roleId: number
  roleName: string
  functionTagName: string | null
  children: OverviewItemRow[]
}

export interface OverviewItemRow {
  type: 'item'
  key: string
  item: AdminBindingStatus
}

export type OverviewRow = OverviewDeptRow | OverviewRoleRow | OverviewItemRow

/** 将平铺的 角色×模板 状态列表按 板块→主体→部门→角色 组织成树。 */
export function buildOverviewTree(rows: AdminBindingStatus[]): OverviewDeptRow[] {
  const deptMap = new Map<string, OverviewDeptRow>()
  for (const row of rows) {
    const deptKey = `${row.segment_id ?? ''}|${row.entity_id ?? ''}|${row.department_id ?? ''}`
    let dept = deptMap.get(deptKey)
    if (!dept) {
      dept = {
        type: 'dept',
        key: `dept_${deptKey}`,
        segmentName: row.segment_name,
        entityName: row.entity_name,
        departmentName: row.department_name,
        children: [],
      }
      deptMap.set(deptKey, dept)
    }
    let role = dept.children.find((r) => r.roleId === row.role_id)
    if (!role) {
      role = {
        type: 'role',
        key: `role_${row.role_id}`,
        roleId: row.role_id,
        roleName: row.role_name,
        functionTagName: row.function_tag_name,
        children: [],
      }
      dept.children.push(role)
    }
    role.children.push({
      type: 'item',
      key: `item_${row.role_id}_${row.template_id}`,
      item: row,
    })
  }
  return Array.from(deptMap.values())
}

export type StatusCounts = Record<WorkbookStatus, number>

/** 统计一组树节点下的各状态数量（叶子 item 计入）。 */
export function countStatus(rows: OverviewRow[]): StatusCounts {
  const counts: StatusCounts = { none: 0, draft: 0, submitted: 0, approved: 0, rejected: 0 }
  const walk = (r: OverviewRow) => {
    if (r.type === 'item') {
      counts[r.item.status] = (counts[r.item.status] ?? 0) + 1
    } else {
      r.children.forEach(walk)
    }
  }
  rows.forEach(walk)
  return counts
}

/** 状态汇总文案，如「已提交3 · 已通过1」。 */
export function formatStatusSummary(counts: StatusCounts): string {
  const parts: string[] = []
  for (const s of ['submitted', 'approved', 'rejected', 'draft', 'none'] as WorkbookStatus[]) {
    if (counts[s] > 0) parts.push(`${STATUS_META[s].text}${counts[s]}`)
  }
  return parts.join(' · ') || '—'
}

export function totalItems(counts: StatusCounts): number {
  return Object.values(counts).reduce((a, b) => a + b, 0)
}
