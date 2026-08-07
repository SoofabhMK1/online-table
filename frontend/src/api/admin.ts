import { get, post, put, del } from './http'
import type {
  AdminBindingStatus,
  AdminWorkbookDetail,
  AdminWorkbookItem,
  FillingPeriodItem,
  RoleItem,
  TemplateDetail,
  TemplateDuplicateRequest,
  TemplateItem,
  WorkbookReviewRequest,
} from './types'

export async function fetchRoles(): Promise<RoleItem[]> {
  return get<RoleItem[]>('/admin/roles')
}

export async function createRole(name: string): Promise<RoleItem> {
  return post<RoleItem>('/admin/roles', { name })
}

export async function deleteRole(roleId: number): Promise<void> {
  return del(`/admin/roles/${roleId}`)
}

export async function resetRolePassword(
  roleId: number,
): Promise<{ username: string; password: string }> {
  return post<{ username: string; password: string }>(
    `/admin/roles/${roleId}/reset-password`,
  )
}

export async function fetchTemplates(archived = false): Promise<TemplateItem[]> {
  return get<TemplateItem[]>('/templates', {
    params: { archived: archived || undefined },
  })
}

export async function archiveTemplate(templateId: number): Promise<TemplateDetail> {
  return post<TemplateDetail>(`/templates/${templateId}/archive`)
}

export async function unarchiveTemplate(templateId: number): Promise<TemplateDetail> {
  return post<TemplateDetail>(`/templates/${templateId}/unarchive`)
}

export async function fetchTemplateDetail(templateId: number): Promise<TemplateDetail> {
  return get<TemplateDetail>(`/templates/${templateId}`)
}

export interface TemplateLabelConfig {
  rowLabelCols: number
  colLabelRows: number
  contentRows: number
  contentCols: number
  contentNumeric: boolean
}

export async function createTemplate(
  name: string,
  year: number,
  snapshot: Record<string, unknown>,
  labels: TemplateLabelConfig,
): Promise<TemplateDetail> {
  return post<TemplateDetail>('/templates', {
    name,
    year,
    snapshot,
    row_label_cols: labels.rowLabelCols,
    col_label_rows: labels.colLabelRows,
    content_rows: labels.contentRows,
    content_cols: labels.contentCols,
    content_numeric: labels.contentNumeric,
  })
}

export async function updateTemplate(
  templateId: number,
  name: string,
  year: number,
  snapshot: Record<string, unknown>,
  labels: TemplateLabelConfig,
): Promise<TemplateDetail> {
  return put<TemplateDetail>(`/templates/${templateId}`, {
    name,
    year,
    snapshot,
    row_label_cols: labels.rowLabelCols,
    col_label_rows: labels.colLabelRows,
    content_rows: labels.contentRows,
    content_cols: labels.contentCols,
    content_numeric: labels.contentNumeric,
  })
}

export async function duplicateTemplate(
  templateId: number,
  body: TemplateDuplicateRequest,
): Promise<TemplateDetail> {
  return post<TemplateDetail>(`/templates/${templateId}/duplicate`, body)
}

export async function fetchRoleTemplates(roleId: number): Promise<number[]> {
  return get<number[]>(`/admin/roles/${roleId}/templates`)
}

export async function bindRoleTemplates(
  roleId: number,
  templateIds: number[],
): Promise<{ role_id: number; template_ids: number[] }> {
  return post(`/admin/roles/${roleId}/templates`, { template_ids: templateIds })
}

export async function fetchFillingOverview(
  period: string,
): Promise<AdminBindingStatus[]> {
  return get<AdminBindingStatus[]>('/admin/overview', { params: { period } })
}

export async function fetchAdminWorkbooks(
  period: string,
  status?: string,
): Promise<AdminWorkbookItem[]> {
  return get<AdminWorkbookItem[]>('/admin/workbooks', {
    params: { period, status: status || undefined },
  })
}

export async function fetchAdminWorkbookDetail(
  roleId: number,
  templateId: number,
  period: string,
): Promise<AdminWorkbookDetail> {
  return get<AdminWorkbookDetail>(
    `/admin/workbooks/${roleId}/${templateId}/${period}`,
  )
}

export async function reviewWorkbook(
  roleId: number,
  templateId: number,
  period: string,
  body: WorkbookReviewRequest,
): Promise<{ id: number; status: string }> {
  return post(`/admin/workbooks/${roleId}/${templateId}/${period}/review`, body)
}

export async function fetchPeriods(year: number): Promise<FillingPeriodItem[]> {
  return get<FillingPeriodItem[]>('/admin/periods', { params: { year } })
}

export async function upsertPeriod(
  period: string,
  locked: boolean,
): Promise<FillingPeriodItem> {
  return put<FillingPeriodItem>(`/admin/periods/${period}`, { locked })
}
