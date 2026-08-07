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
  segment_id: number | null
  segment_name: string | null
  entity_id: number | null
  entity_name: string | null
  department_id: number | null
  department_name: string | null
  function_tag_id: number | null
  function_tag_name: string | null
}

export interface RoleCreateRequest {
  name: string
  segment_id?: number | null
  entity_id?: number | null
  department_id?: number | null
  function_tag_id?: number | null
}

export interface OrgDepartmentItem {
  id: number
  name: string
}

export interface OrgEntityItem {
  id: number
  name: string
  departments: OrgDepartmentItem[]
}

export interface OrgSegmentItem {
  id: number
  name: string
  entities: OrgEntityItem[]
}

export interface FunctionTagItem {
  id: number
  name: string
}

export interface OrgTree {
  segments: OrgSegmentItem[]
  tags: FunctionTagItem[]
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
