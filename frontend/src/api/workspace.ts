import { get, post } from './http'
import type { TemplateItem, WorkbookSubmit, WorkspaceTemplateDetail } from './types'

export async function fetchWorkspaceTemplates(): Promise<TemplateItem[]> {
  return get<TemplateItem[]>('/workspace/templates')
}

export async function fetchWorkspaceTemplateDetail(
  templateId: number,
): Promise<WorkspaceTemplateDetail> {
  return get<WorkspaceTemplateDetail>(`/workspace/templates/${templateId}`)
}

export async function submitWorkbook(
  templateId: number,
  snapshot: Record<string, unknown>,
): Promise<{ id: number; updated_at: string }> {
  return post<{ id: number; updated_at: string }>('/workspace/workbooks', {
    template_id: templateId,
    snapshot,
  } satisfies WorkbookSubmit)
}