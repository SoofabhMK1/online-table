from datetime import datetime

from sqlmodel import Field, Relationship, SQLModel
from sqlalchemy import Column, JSON, UniqueConstraint


class BusinessSegment(SQLModel, table=True):
    """业务板块（组织架构第一层）。"""

    __tablename__ = "business_segments"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)

    entities: list["OrgEntity"] = Relationship(back_populates="segment")


class OrgEntity(SQLModel, table=True):
    """主体（组织架构第二层，隶属于业务板块）。"""

    __tablename__ = "org_entities"

    id: int | None = Field(default=None, primary_key=True)
    name: str
    segment_id: int = Field(foreign_key="business_segments.id", index=True)

    segment: BusinessSegment = Relationship(back_populates="entities")
    departments: list["OrgDepartment"] = Relationship(back_populates="entity")


class OrgDepartment(SQLModel, table=True):
    """部门（组织架构第三层，隶属于主体）。一个部门下可有多个角色。"""

    __tablename__ = "org_departments"

    id: int | None = Field(default=None, primary_key=True)
    name: str
    entity_id: int = Field(foreign_key="org_entities.id", index=True)

    entity: OrgEntity = Relationship(back_populates="departments")
    roles: list["Role"] = Relationship(back_populates="department")


class FunctionTag(SQLModel, table=True):
    """职能标签（全局列表，如 行政科室、预算等）。"""

    __tablename__ = "function_tags"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)


class Role(SQLModel, table=True):
    """角色表。角色按 业务板块→主体→部门 + 职能标签 分类，分类为组织元数据（可空）。

    角色名在同一部门（department_id）内唯一；不同部门可存在同名角色（如多个财务部都有「财务主管」）。
    """

    __tablename__ = "roles"
    __table_args__ = (UniqueConstraint("department_id", "name"),)

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    segment_id: int | None = Field(
        default=None, foreign_key="business_segments.id", index=True
    )
    entity_id: int | None = Field(
        default=None, foreign_key="org_entities.id", index=True
    )
    department_id: int | None = Field(
        default=None, foreign_key="org_departments.id", index=True
    )
    function_tag_id: int | None = Field(
        default=None, foreign_key="function_tags.id", index=True
    )

    users: list["User"] = Relationship(back_populates="role")
    template_links: list["RoleTemplateMapping"] = Relationship(
        back_populates="role"
    )
    workbooks: list["RoleWorkbook"] = Relationship(back_populates="role")
    segment: BusinessSegment | None = Relationship()
    entity: OrgEntity | None = Relationship()
    department: OrgDepartment | None = Relationship(back_populates="roles")
    function_tag: FunctionTag | None = Relationship()


class User(SQLModel, table=True):
    """用户表。is_default 标记角色「默认账号」，用于重置密码等按角色定位账号（不依赖用户名）。"""

    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    password_hash: str
    role_id: int = Field(foreign_key="roles.id")
    is_default: bool = Field(default=False, index=True)

    role: Role | None = Relationship(back_populates="users")


class Template(SQLModel, table=True):
    """模板表（管理员创建）。snapshot 为 Univer 工作簿快照字典。"""

    __tablename__ = "templates"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    # 填报年份：同一模板结构在不同年份可创建不同版本
    year: int = Field(default=0, index=True)
    snapshot: dict = Field(default_factory=dict, sa_column=Column(JSON))
    # 行标签列数：最左侧若干列作为行标签（例如第 1、2 列都是行标签 → row_label_cols=2）
    row_label_cols: int = Field(default=0)
    # 列标签行数：最上方若干行作为列标签
    col_label_rows: int = Field(default=0)
    # 内容区行数 / 列数：用户可填写的区域（从 col_label_rows 行、row_label_cols 列开始）
    content_rows: int = Field(default=0)
    content_cols: int = Field(default=0)
    # 内容区仅允许数字：提交时校验内容区非空单元格必须为数值
    content_numeric: bool = Field(default=False)
    # 归档标记：归档后从工作台/总览/绑定列表隐藏（保留角色绑定与历史数据）
    archived: bool = Field(default=False, index=True)
    archived_at: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    role_links: list["RoleTemplateMapping"] = Relationship(
        back_populates="template"
    )
    workbooks: list["RoleWorkbook"] = Relationship(back_populates="template")


class RoleTemplateMapping(SQLModel, table=True):
    """角色-模板权限关联表，采用组合主键。"""

    __tablename__ = "role_template_mapping"

    role_id: int = Field(
        default=None, primary_key=True, foreign_key="roles.id"
    )
    template_id: int = Field(
        default=None, primary_key=True, foreign_key="templates.id"
    )

    role: Role = Relationship(back_populates="template_links")
    template: Template = Relationship(back_populates="role_links")


class RoleWorkbook(SQLModel, table=True):
    """部门（角色）填报数据表，一个部门对每个模板每个周期一行。

    - period 为填报周期，形如 "YYYY-MM"（例如 2026-08），同一模板每月独立保存。
    - status：draft(草稿) / submitted(已提交) / approved(已通过) / rejected(已退回)。
    """

    __tablename__ = "role_workbooks"
    __table_args__ = (UniqueConstraint("role_id", "template_id", "period"),)

    id: int | None = Field(default=None, primary_key=True)
    role_id: int = Field(foreign_key="roles.id", index=True)
    template_id: int = Field(foreign_key="templates.id", index=True)
    period: str = Field(index=True)
    snapshot: dict = Field(default_factory=dict, sa_column=Column(JSON))
    status: str = Field(default="draft", index=True)
    submit_at: datetime | None = None
    review_at: datetime | None = None
    reject_reason: str | None = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    role: Role = Relationship(back_populates="workbooks")
    template: Template = Relationship(back_populates="workbooks")


class FillingPeriod(SQLModel, table=True):
    """填报期间锁定表。管理员手动锁定某个月（YYYY-MM）后，该月所有部门不可再填报/提交。"""

    __tablename__ = "filling_periods"

    id: int | None = Field(default=None, primary_key=True)
    period: str = Field(unique=True, index=True)
    locked: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)