"""角色管理相关业务逻辑（无 HTTP 依赖，便于单测）。

从 routers/admin.py 抽离的纯函数与持久化操作：
- 默认账号用户名生成
- 默认账号兜底创建
- 角色名部门内唯一性校验
- 板块/主体/部门层级自动补全
- 职能标签存在性校验
- OrgTree 批量预加载（避免 N+1）
- RoleRead DTO 拼装（基于预加载的 lookup）
"""
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.config import settings
from app.models import (
    BusinessSegment,
    FunctionTag,
    OrgDepartment,
    OrgEntity,
    Role,
    User,
)
from app.schemas import RoleRead
from app.security import hash_password


def default_username(role: Role) -> str:
    """角色默认账号的初始用户名：自动生成且全局唯一，与角色名解耦、改名不影响。"""
    return f"role_{role.id}"


def _user_username(session: Session, role: Role) -> str | None:
    """当前默认账号的实际用户名（可能已被用户改名），找不到返回 None。"""
    user = session.exec(
        select(User).where(User.role_id == role.id, User.is_default == True)  # noqa: E712
    ).first()
    return user.username if user is not None else None


def user_display_username(session: Session, role: Role) -> str:
    """角色默认账号展示用户名（找不到则回退到初始用户名）。"""
    return _user_username(session, role) or default_username(role)


def ensure_default_user(session: Session, role: Role) -> User:
    """确保角色存在默认账号（按 is_default 标记定位，用户名可在账号设置中自行修改）。

    定位顺序：is_default 用户 → 旧 scheme（username=role_{id}）回填标记 → 新建。
    不再使用「角色下首个任意用户」兜底（会误把 op1 等业务账号标记为默认）。
    """
    user = session.exec(
        select(User).where(User.role_id == role.id, User.is_default == True)  # noqa: E712
    ).first()
    if user is not None:
        return user
    user = session.exec(
        select(User).where(
            User.role_id == role.id, User.username == default_username(role)
        )
    ).first()
    if user is not None:
        user.is_default = True
        session.add(user)
        session.commit()
        session.refresh(user)
        return user
    user = User(
        username=default_username(role),
        password_hash=hash_password(settings.DEFAULT_USER_PASSWORD),
        role_id=role.id,
        is_default=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def ensure_name_unique(
    session: Session,
    name: str,
    department_id: int | None,
    exclude_role_id: int | None = None,
) -> None:
    """校验角色名在「同一部门内」唯一；冲突抛 400。"""
    stmt = select(Role).where(Role.name == name)
    if department_id is not None:
        stmt = stmt.where(Role.department_id == department_id)
    else:
        stmt = stmt.where(Role.department_id.is_(None))
    if exclude_role_id is not None:
        stmt = stmt.where(Role.id != exclude_role_id)
    if session.exec(stmt).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该部门下已存在同名角色",
        )


def normalize_classification(
    session: Session,
    segment_id: int | None,
    entity_id: int | None,
    department_id: int | None,
) -> tuple[int | None, int | None, int | None]:
    """由低层级自动补全高层级，并校验层级一致性。"""
    if department_id is not None:
        department = session.get(OrgDepartment, department_id)
        if department is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="部门不存在"
            )
        entity = session.get(OrgEntity, department.entity_id)
        entity_id = department.entity_id
        segment_id = entity.segment_id
    if entity_id is not None:
        entity = session.get(OrgEntity, entity_id)
        if entity is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="主体不存在"
            )
        if segment_id is not None and entity.segment_id != segment_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="主体不属于所选业务板块",
            )
        segment_id = entity.segment_id
    if segment_id is not None:
        if session.get(BusinessSegment, segment_id) is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="业务板块不存在"
            )
    return segment_id, entity_id, department_id


def ensure_function_tag(session: Session, function_tag_id: int | None) -> None:
    if function_tag_id is None:
        return
    if session.get(FunctionTag, function_tag_id) is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="职能标签不存在"
        )


def batch_load_org_lookup(session: Session, roles: list[Role]) -> dict:
    """批量预加载角色列表所需的 org 分类名称 + 默认账号用户名。

    把原本每行 5 次 session.get（segment / entity / department / function_tag / default_user）
    收成 4 次 IN 查询，从 O(N×5) 降到 O(4)。
    """
    seg_ids = {r.segment_id for r in roles if r.segment_id is not None}
    ent_ids = {r.entity_id for r in roles if r.entity_id is not None}
    dept_ids = {r.department_id for r in roles if r.department_id is not None}
    tag_ids = {r.function_tag_id for r in roles if r.function_tag_id is not None}
    role_ids = {r.id for r in roles}

    def _id_name_map(model, ids: set[int]) -> dict[int, str]:
        if not ids:
            return {}
        rows = session.exec(select(model).where(model.id.in_(ids))).all()
        return {row.id: row.name for row in rows}

    segs = _id_name_map(BusinessSegment, seg_ids)
    ents = _id_name_map(OrgEntity, ent_ids)
    depts = _id_name_map(OrgDepartment, dept_ids)
    tags = _id_name_map(FunctionTag, tag_ids)

    default_users: dict[int, str] = {}
    if role_ids:
        default_users = {
            u.role_id: u.username
            for u in session.exec(
                select(User).where(
                    User.role_id.in_(role_ids),
                    User.is_default == True,  # noqa: E712
                )
            ).all()
        }

    return {
        "segments": segs,
        "entities": ents,
        "departments": depts,
        "function_tags": tags,
        "default_users": default_users,
    }


def to_role_read(role: Role, lookup: dict) -> RoleRead:
    """将角色转成带分类名称的响应模型（使用预加载的 lookup，避免 N+1）。"""
    segs = lookup["segments"]
    ents = lookup["entities"]
    depts = lookup["departments"]
    tags = lookup["function_tags"]
    default_users = lookup["default_users"]
    return RoleRead(
        id=role.id,
        name=role.name,
        segment_id=role.segment_id,
        segment_name=segs.get(role.segment_id) if role.segment_id else None,
        entity_id=role.entity_id,
        entity_name=ents.get(role.entity_id) if role.entity_id else None,
        department_id=role.department_id,
        department_name=depts.get(role.department_id) if role.department_id else None,
        function_tag_id=role.function_tag_id,
        function_tag_name=tags.get(role.function_tag_id) if role.function_tag_id else None,
        default_username=default_users.get(role.id, default_username(role)),
    )


def safe_commit(session: Session) -> None:
    """捕获 IntegrityError 后回滚并转换为 409，统一错误语义。"""
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="数据冲突，请重试",
        )