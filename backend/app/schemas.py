from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    """登录请求体。"""

    username: str
    password: str


class TokenResponse(BaseModel):
    """登录成功后的 JWT Token 响应。"""

    access_token: str
    token_type: str = "bearer"
    user_id: int
    username: str
    role_id: int
    role_name: str


class TemplateCreate(BaseModel):
    """新建模板请求体。snapshot 为 Univer 工作簿快照字典。"""

    name: str
    snapshot: dict = Field(default_factory=dict)
    row_label_cols: int = Field(default=0, ge=0)
    col_label_rows: int = Field(default=0, ge=0)
    content_rows: int = Field(default=0, ge=0)
    content_cols: int = Field(default=0, ge=0)


class TemplateUpdate(BaseModel):
    """更新模板请求体。"""

    name: str | None = None
    snapshot: dict | None = None
    row_label_cols: int | None = Field(default=None, ge=0)
    col_label_rows: int | None = Field(default=None, ge=0)
    content_rows: int | None = Field(default=None, ge=0)
    content_cols: int | None = Field(default=None, ge=0)


class TemplateRead(BaseModel):
    """模板响应（不含 snapshot，用于列表场景）。"""

    id: int
    name: str
    row_label_cols: int = 0
    col_label_rows: int = 0
    content_rows: int = 0
    content_cols: int = 0


class TemplateDetail(BaseModel):
    """模板详情响应（含完整 snapshot）。"""

    id: int
    name: str
    snapshot: dict
    row_label_cols: int = 0
    col_label_rows: int = 0
    content_rows: int = 0
    content_cols: int = 0


class WorkspaceTemplateDetail(BaseModel):
    """工作台模板详情：snapshot 为当前用户已保存的数据（若有）否则为模板原始快照。"""

    id: int
    name: str
    row_label_cols: int = 0
    col_label_rows: int = 0
    content_rows: int = 0
    content_cols: int = 0
    has_saved: bool = False
    snapshot: dict


class RoleTemplateBind(BaseModel):
    """为角色绑定模板 ID 列表的请求体。"""

    template_ids: list[int]


class RoleRead(BaseModel):
    """角色响应。"""

    id: int
    name: str


class RoleCreate(BaseModel):
    """新建角色请求体。"""

    name: str


class WorkbookCreate(BaseModel):
    """提交用户填报数据的请求体。"""

    template_id: int
    snapshot: dict