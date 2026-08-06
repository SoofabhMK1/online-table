import { get, post } from './http'
import type {
  WorkbookSubmit,
  WorkspaceTemplateDetail,
  WorkspaceTemplateItem,
} from './types'

export async function fetchWorkspaceTemplates(
  period: string,
): Promise<WorkspaceTemplateItem[]> {
  return get<WorkspaceTemplateItem[]>('/workspace/templates', {
    params: { period },
  })
}

export async function fetchWorkspaceTemplateDetail(
  templateId: number,
  period: string,
): Promise<WorkspaceTemplateDetail> {
  return get<WorkspaceTemplateDetail>(`/workspace/templates/${templateId}`, {
    params: { period },
  })
}

export async function submitWorkbook(
  payload: WorkbookSubmit,
): Promise<{ id: number; status: string; updated_at: string }> {
  return post<{ id: number; status: string; updated_at: string }>(
    '/workspace/workbooks',
    payload,
  )
}
