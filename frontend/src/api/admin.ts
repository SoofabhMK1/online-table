import { get, post, put, del } from './http'
import type { RoleItem, TemplateDetail, TemplateItem } from './types'

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

export async function fetchTemplates(): Promise<TemplateItem[]> {
  return get<TemplateItem[]>('/templates')
}

export async function fetchTemplateDetail(templateId: number): Promise<TemplateDetail> {
  return get<TemplateDetail>(`/templates/${templateId}`)
}

export interface TemplateLabelConfig {
  rowLabelCols: number
  colLabelRows: number
  contentRows: number
  contentCols: number
}

export async function createTemplate(
  name: string,
  snapshot: Record<string, unknown>,
  labels: TemplateLabelConfig,
): Promise<TemplateDetail> {
  return post<TemplateDetail>('/templates', {
    name,
    snapshot,
    row_label_cols: labels.rowLabelCols,
    col_label_rows: labels.colLabelRows,
    content_rows: labels.contentRows,
    content_cols: labels.contentCols,
  })
}

export async function updateTemplate(
  templateId: number,
  name: string,
  snapshot: Record<string, unknown>,
  labels: TemplateLabelConfig,
): Promise<TemplateDetail> {
  return put<TemplateDetail>(`/templates/${templateId}`, {
    name,
    snapshot,
    row_label_cols: labels.rowLabelCols,
    col_label_rows: labels.colLabelRows,
    content_rows: labels.contentRows,
    content_cols: labels.contentCols,
  })
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