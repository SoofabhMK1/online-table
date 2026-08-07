import { get, post, put, del } from './http'
import type {
  AdminBindingStatus,
  AdminWorkbookDetail,
  AdminWorkbookItem,
  FillingPeriodItem,
  FunctionTagItem,
  OrgDepartmentItem,
  OrgEntityItem,
  OrgSegmentItem,
  OrgTree,
  RoleCreateRequest,
  RoleItem,
  TemplateDetail,
  TemplateDuplicateRequest,
  TemplateItem,
  WorkbookReviewRequest,
} from './types'

export async function fetchRoles(): Promise<RoleItem[]> {
  return get<RoleItem[]>('/admin/roles')
}

export async function createRole(payload: RoleCreateRequest): Promise<RoleItem> {
  return post<RoleItem>('/admin/roles', payload)
}

export async function updateRole(
  roleId: number,
  payload: RoleCreateRequest,
): Promise<RoleItem> {
  return put<RoleItem>(`/admin/roles/${roleId}`, payload)
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

// ---------- 组织架构 ----------

export async function fetchOrgTree(): Promise<OrgTree> {
  return get<OrgTree>('/admin/org')
}

export async function createOrgSegment(name: string): Promise<OrgSegmentItem> {
  return post<OrgSegmentItem>('/admin/org/segments', { name })
}
export async function renameOrgSegment(
  id: number,
  name: string,
): Promise<OrgSegmentItem> {
  return put<OrgSegmentItem>(`/admin/org/segments/${id}`, { name })
}
export async function deleteOrgSegment(id: number): Promise<void> {
  return del(`/admin/org/segments/${id}`)
}

export async function createOrgEntity(
  name: string,
  segmentId: number,
): Promise<OrgEntityItem> {
  return post<OrgEntityItem>('/admin/org/entities', { name, segment_id: segmentId })
}
export async function renameOrgEntity(
  id: number,
  name: string,
): Promise<OrgEntityItem> {
  return put<OrgEntityItem>(`/admin/org/entities/${id}`, { name })
}
export async function deleteOrgEntity(id: number): Promise<void> {
  return del(`/admin/org/entities/${id}`)
}

export async function createOrgDepartment(
  name: string,
  entityId: number,
): Promise<OrgDepartmentItem> {
  return post<OrgDepartmentItem>('/admin/org/departments', {
    name,
    entity_id: entityId,
  })
}
export async function renameOrgDepartment(
  id: number,
  name: string,
): Promise<OrgDepartmentItem> {
  return put<OrgDepartmentItem>(`/admin/org/departments/${id}`, { name })
}
export async function deleteOrgDepartment(id: number): Promise<void> {
  return del(`/admin/org/departments/${id}`)
}

export async function createOrgTag(name: string): Promise<FunctionTagItem> {
  return post<FunctionTagItem>('/admin/org/tags', { name })
}
export async function renameOrgTag(
  id: number,
  name: string,
): Promise<FunctionTagItem> {
  return put<FunctionTagItem>(`/admin/org/tags/${id}`, { name })
}
export async function deleteOrgTag(id: number): Promise<void> {
  return del(`/admin/org/tags/${id}`)
}
