from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

PERIOD_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"


def _current_year() -> int:
    return datetime.now().year


class LoginRequest(BaseModel):
    """登录请求体。"""

    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    """当前用户修改密码请求体。"""

    old_password: str
    new_password: str = Field(min_length=6, max_length=64)


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
    year: int = Field(default_factory=_current_year)
    snapshot: dict = Field(default_factory=dict)
    row_label_cols: int = Field(default=0, ge=0)
    col_label_rows: int = Field(default=0, ge=0)
    content_rows: int = Field(default=0, ge=0)
    content_cols: int = Field(default=0, ge=0)
    content_numeric: bool = False


class TemplateUpdate(BaseModel):
    """更新模板请求体。"""

    name: str | None = None
    year: int | None = None
    snapshot: dict | None = None
    row_label_cols: int | None = Field(default=None, ge=0)
    col_label_rows: int | None = Field(default=None, ge=0)
    content_rows: int | None = Field(default=None, ge=0)
    content_cols: int | None = Field(default=None, ge=0)
    content_numeric: bool | None = None


class TemplateRead(BaseModel):
    """模板响应（不含 snapshot，用于列表场景）。"""

    id: int
    name: str
    year: int = 0
    row_label_cols: int = 0
    col_label_rows: int = 0
    content_rows: int = 0
    content_cols: int = 0
    content_numeric: bool = False
    archived: bool = False
    archived_at: datetime | None = None


class TemplateDetail(BaseModel):
    """模板详情响应（含完整 snapshot）。"""

    id: int
    name: str
    year: int = 0
    snapshot: dict
    row_label_cols: int = 0
    col_label_rows: int = 0
    content_rows: int = 0
    content_cols: int = 0
    content_numeric: bool = False
    archived: bool = False
    archived_at: datetime | None = None


class TemplateDuplicate(BaseModel):
    """复制模板到指定年份的请求体。"""

    year: int
    copy_bindings: bool = True


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


# 填报状态：none 仅出现在“未填报”的场景，实际落库为 draft/submitted/approved/rejected。
WorkbookStatus = Literal["draft", "submitted", "approved", "rejected"]


class WorkspaceTemplateItem(BaseModel):
    """工作台模板列表项：附带当前周期填报状态。"""

    id: int
    name: str
    year: int
    row_label_cols: int = 0
    col_label_rows: int = 0
    content_rows: int = 0
    content_cols: int = 0
    content_numeric: bool = False
    status: str = "none"
    submit_at: datetime | None = None
    locked: bool = False


class WorkspaceTemplateDetail(BaseModel):
    """工作台模板详情：snapshot 为当前部门该周期已保存的数据（若有）否则为模板原始快照。"""

    id: int
    name: str
    year: int
    row_label_cols: int = 0
    col_label_rows: int = 0
    content_rows: int = 0
    content_cols: int = 0
    content_numeric: bool = False
    status: str = "none"
    submit_at: datetime | None = None
    reject_reason: str | None = None
    locked: bool = False
    snapshot: dict


class WorkbookSubmit(BaseModel):
    """部门填报提交请求体。action=save 保存草稿，action=submit 提交。"""

    template_id: int
    period: str = Field(pattern=PERIOD_PATTERN)
    snapshot: dict
    action: Literal["save", "submit"] = "save"


class AdminBindingStatus(BaseModel):
    """管理员视角：部门 × 模板 × 周期 的填报状态（含未填报项）。"""

    role_id: int
    role_name: str
    template_id: int
    template_name: str
    status: str = "none"
    submit_at: datetime | None = None
    updated_at: datetime | None = None


class AdminWorkbookRead(BaseModel):
    """管理员视角：部门填报记录（仅已存在填报数据的记录）。"""

    role_id: int
    role_name: str
    template_id: int
    template_name: str
    period: str
    status: str
    submit_at: datetime | None = None
    updated_at: datetime | None = None
    reject_reason: str | None = None


class AdminWorkbookDetail(BaseModel):
    """管理员视角：部门填报详情（含快照，用于预览）。"""

    role_id: int
    role_name: str
    template_id: int
    template_name: str
    period: str
    status: str
    submit_at: datetime | None = None
    reject_reason: str | None = None
    snapshot: dict


class WorkbookReview(BaseModel):
    """管理员审核请求体。"""

    action: Literal["approved", "rejected"]
    reject_reason: str | None = None


class FillingPeriodRead(BaseModel):
    """填报期间锁定状态。"""

    period: str
    locked: bool


class FillingPeriodUpsert(BaseModel):
    """填报期间锁定/解锁请求体。"""

    locked: bool
