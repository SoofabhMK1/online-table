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

export interface TemplateItem {
  id: number
  name: string
  row_label_cols: number
  col_label_rows: number
  content_rows: number
  content_cols: number
}

export interface TemplateDetail extends TemplateItem {
  snapshot: Record<string, unknown>
}

export interface WorkspaceTemplateDetail extends TemplateItem {
  has_saved: boolean
  snapshot: Record<string, unknown>
}

export interface RoleItem {
  id: number
  name: string
}

export interface WorkbookSubmit {
  template_id: number
  snapshot: Record<string, unknown>
}