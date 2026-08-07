export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
  user_id: number
  username: string
  role_id: number
  role_name: string
}

export interface ChangePasswordRequest {
  old_password: string
  new_password: string
}

export interface TemplateItem {
  id: number
  name: string
  year: number
  row_label_cols: number
  col_label_rows: number
  content_rows: number
  content_cols: number
  content_numeric: boolean
  archived: boolean
  archived_at: string | null
}

export interface TemplateDetail extends TemplateItem {
  snapshot: Record<string, unknown>
}

export interface TemplateDuplicateRequest {
  year: number
  copy_bindings: boolean
}

export interface RoleItem {
  id: number
  name: string
}

export type WorkbookStatus = 'none' | 'draft' | 'submitted' | 'approved' | 'rejected'

export interface WorkspaceTemplateItem extends TemplateItem {
  status: WorkbookStatus
  submit_at: string | null
  locked: boolean
}

export interface WorkspaceTemplateDetail extends TemplateItem {
  status: WorkbookStatus
  submit_at: string | null
  reject_reason: string | null
  locked: boolean
  snapshot: Record<string, unknown>
}

export interface FillingPeriodItem {
  period: string
  locked: boolean
}

export interface WorkbookSubmit {
  template_id: number
  period: string
  snapshot: Record<string, unknown>
  action: 'save' | 'submit'
}

export interface AdminBindingStatus {
  role_id: number
  role_name: string
  template_id: number
  template_name: string
  status: WorkbookStatus
  submit_at: string | null
  updated_at: string | null
}

export interface AdminWorkbookItem {
  role_id: number
  role_name: string
  template_id: number
  template_name: string
  period: string
  status: WorkbookStatus
  submit_at: string | null
  updated_at: string | null
  reject_reason: string | null
}

export interface AdminWorkbookDetail {
  role_id: number
  role_name: string
  template_id: number
  template_name: string
  period: string
  status: WorkbookStatus
  submit_at: string | null
  reject_reason: string | null
  snapshot: Record<string, unknown>
}

export interface WorkbookReviewRequest {
  action: 'approved' | 'rejected'
  reject_reason?: string
}
