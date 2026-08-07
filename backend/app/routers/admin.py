from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.config import settings
from app.database import get_session
from app.dependencies import get_current_admin
from app.models import (
    BusinessSegment,
    FillingPeriod,
    FunctionTag,
    OrgDepartment,
    OrgEntity,
    Role,
    RoleTemplateMapping,
    RoleWorkbook,
    Template,
    User,
)
from app.schemas import (
    AdminBindingStatus,
    AdminWorkbookDetail,
    AdminWorkbookRead,
    FillingPeriodRead,
    FillingPeriodUpsert,
    FunctionTagCreate,
    FunctionTagRead,
    OrgDepartmentCreate,
    OrgDepartmentRead,
    OrgEntityCreate,
    OrgEntityRead,
    OrgRename,
    OrgSegmentCreate,
    OrgSegmentRead,
    OrgTreeRead,
    PERIOD_PATTERN,
    RoleCreate,
    RoleDeleteConfirm,
    RoleRead,
    RoleTemplateBind,
    RoleUpdate,
    WorkbookReview,
)
from app.security import hash_password

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(get_current_admin)])


def _role_default_username(role: Role) -> str:
    """角色默认账号的初始用户名：自动生成且全局唯一，与角色名解耦、改名不影响。"""
    return f"role_{role.id}"


def _ensure_role_default_user(session: Session, role: Role) -> User:
    """确保角色存在默认账号（按 is_default 标记定位，用户名可在账号设置中自行修改）。

    定位顺序：is_default 用户 → 旧 scheme（username=role_{id}）回填标记 → 新建。
    不再使用「角色下首个任意用户」兜底：会误把 op1 等业务账号标记为默认，导致
    reset_role_password 重置错对象。找不到时直接创建 role_{id} 新用户。
    """
    user = session.exec(
        select(User).where(User.role_id == role.id, User.is_default == True)  # noqa: E712
    ).first()
    if user is not None:
        return user
    user = session.exec(
        select(User).where(
            User.role_id == role.id, User.username == _role_default_username(role)
        )
    ).first()
    if user is not None:
        user.is_default = True
        session.add(user)
        session.commit()
        session.refresh(user)
        return user
    user = User(
        username=_role_default_username(role),
        password_hash=hash_password(settings.DEFAULT_USER_PASSWORD),
        role_id=role.id,
        is_default=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _role_default_user_username(session: Session, role: Role) -> str:
    """角色默认账号当前的实际用户名（可能已被用户改名），供展示。"""
    user = session.exec(
        select(User).where(User.role_id == role.id, User.is_default == True)  # noqa: E712
    ).first()
    if user is not None:
        return user.username
    return _role_default_username(role)


def _role_to_read(session: Session, role: Role) -> RoleRead:
    """将角色转成带分类名称的响应模型。"""
    return RoleRead(
        id=role.id,
        name=role.name,
        segment_id=role.segment_id,
        segment_name=session.get(BusinessSegment, role.segment_id).name
        if role.segment_id
        else None,
        entity_id=role.entity_id,
        entity_name=session.get(OrgEntity, role.entity_id).name
        if role.entity_id
        else None,
        department_id=role.department_id,
        department_name=session.get(OrgDepartment, role.department_id).name
        if role.department_id
        else None,
        function_tag_id=role.function_tag_id,
        function_tag_name=session.get(FunctionTag, role.function_tag_id).name
        if role.function_tag_id
        else None,
        default_username=_role_default_user_username(session, role),
    )


def _ensure_role_name_unique(
    session: Session, name: str, department_id: int | None, exclude_role_id: int | None = None
) -> None:
    """校验角色名在「同一部门内」唯一（部门为空时按未分类互查）；冲突抛 400。"""
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


def _normalize_role_classification(
    session: Session, segment_id: int | None, entity_id: int | None, department_id: int | None
) -> tuple[int | None, int | None, int | None]:
    """由低层级自动补全高层级，并校验层级一致性；异常抛 400。"""
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
                status_code=status.HTTP_400_BAD_REQUEST, detail="主体不属于所选业务板块"
            )
        segment_id = entity.segment_id
    if segment_id is not None:
        if session.get(BusinessSegment, segment_id) is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="业务板块不存在"
            )
    return segment_id, entity_id, department_id


def _ensure_function_tag(session: Session, function_tag_id: int | None) -> None:
    if function_tag_id is None:
        return
    if session.get(FunctionTag, function_tag_id) is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="职能标签不存在"
        )


@router.get("/roles", response_model=list[RoleRead])
async def list_roles(session: Session = Depends(get_session)) -> list[RoleRead]:
    """获取系统角色列表（不含管理员角色，避免管理员误删自身），含组织分类。"""
    roles = session.exec(
        select(Role).where(Role.name != settings.ADMIN_ROLE_NAME).order_by(Role.id)
    ).all()
    return [_role_to_read(session, role) for role in roles]


@router.post("/roles", response_model=RoleRead, status_code=status.HTTP_201_CREATED)
async def create_role(
    body: RoleCreate, session: Session = Depends(get_session)
) -> RoleRead:
    """创建新角色（可指定 板块/主体/部门/职能标签 分类），并自动创建默认账号。"""
    if body.name == settings.ADMIN_ROLE_NAME:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="管理员角色为系统保留角色"
        )
    segment_id, entity_id, department_id = _normalize_role_classification(
        session, body.segment_id, body.entity_id, body.department_id
    )
    _ensure_role_name_unique(session, body.name, department_id)
    _ensure_function_tag(session, body.function_tag_id)
    role = Role(
        name=body.name,
        segment_id=segment_id,
        entity_id=entity_id,
        department_id=department_id,
        function_tag_id=body.function_tag_id,
    )
    session.add(role)
    session.commit()
    session.refresh(role)
    _ensure_role_default_user(session, role)
    return _role_to_read(session, role)


@router.put("/roles/{role_id}", response_model=RoleRead)
async def update_role(
    role_id: int,
    body: RoleUpdate,
    session: Session = Depends(get_session),
) -> RoleRead:
    """编辑角色名称/分类；默认账号用户名（role_{id}）保持不变。"""
    role = session.get(Role, role_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="角色不存在")
    if role.name == settings.ADMIN_ROLE_NAME:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="管理员角色不可编辑"
        )
    provided = body.model_fields_set
    next_department_id = role.department_id
    if {"segment_id", "entity_id", "department_id"} & provided:
        next_department_id = (
            body.department_id if "department_id" in provided else role.department_id
        )
        segment_id, entity_id, department_id = _normalize_role_classification(
            session,
            body.segment_id if "segment_id" in provided else role.segment_id,
            body.entity_id if "entity_id" in provided else role.entity_id,
            next_department_id,
        )
        role.segment_id = segment_id
        role.entity_id = entity_id
        role.department_id = department_id
        next_department_id = department_id
    if "name" in provided and body.name is not None:
        if body.name == settings.ADMIN_ROLE_NAME:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="管理员角色为系统保留角色"
            )
        _ensure_role_name_unique(session, body.name, next_department_id, exclude_role_id=role.id)
        role.name = body.name
    if "function_tag_id" in provided:
        if body.function_tag_id is not None:
            _ensure_function_tag(session, body.function_tag_id)
        role.function_tag_id = body.function_tag_id
    session.add(role)
    session.commit()
    session.refresh(role)
    return _role_to_read(session, role)


@router.post("/roles/{role_id}/reset-password", response_model=dict)
async def reset_role_password(
    role_id: int, session: Session = Depends(get_session)
) -> dict:
    """将角色的默认账号密码重置为统一初始密码。"""
    role = session.get(Role, role_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="角色不存在")
    if role.name == settings.ADMIN_ROLE_NAME:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="管理员角色不可重置"
        )
    user = _ensure_role_default_user(session, role)
    user.password_hash = hash_password(settings.DEFAULT_USER_PASSWORD)
    session.add(user)
    session.commit()
    return {"username": user.username, "password": settings.DEFAULT_USER_PASSWORD}


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role_id: int,
    body: RoleDeleteConfirm,
    session: Session = Depends(get_session),
) -> None:
    """删除角色，并级联清理其填报历史与模板绑定（要求管理员回传角色名二次确认）。

    级联删除范围：
    - role_template_mapping：模板绑定
    - role_workbooks：填报历史（草稿/已提交/已通过/已退回），一并删除
    - users：仅删除 is_default=True 的默认账号；其他业务用户需先转出/删除
    """
    role = session.get(Role, role_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="角色不存在")
    if role.name == settings.ADMIN_ROLE_NAME:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="管理员角色不可删除"
        )
    if body.confirm_name != role.name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="确认名称与角色名不一致，已取消删除",
        )
    other_users = session.exec(
        select(User).where(User.role_id == role_id, User.is_default != True)  # noqa: E712
    ).all()
    if other_users:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="该角色下存在用户，无法删除"
        )

    # 级联清理：模板绑定
    for link in session.exec(
        select(RoleTemplateMapping).where(RoleTemplateMapping.role_id == role_id)
    ).all():
        session.delete(link)
    # 级联清理：填报历史
    for wb in session.exec(
        select(RoleWorkbook).where(RoleWorkbook.role_id == role_id)
    ).all():
        session.delete(wb)
    # 清理默认账号
    for default_user in session.exec(
        select(User).where(User.role_id == role_id, User.is_default == True)  # noqa: E712
    ).all():
        session.delete(default_user)

    session.delete(role)
    session.commit()


@router.get("/roles/{role_id}/templates", response_model=list[int])
async def get_role_templates(
    role_id: int,
    session: Session = Depends(get_session),
) -> list[int]:
    """获取指定角色当前绑定的模板 ID 列表。"""
    role = session.get(Role, role_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="角色不存在")

    links = session.exec(
        select(RoleTemplateMapping).where(RoleTemplateMapping.role_id == role_id)
    ).all()
    return [link.template_id for link in links]


@router.post("/roles/{role_id}/templates", response_model=dict)
async def bind_templates(
    role_id: int,
    body: RoleTemplateBind,
    session: Session = Depends(get_session),
) -> dict:
    """为特定角色绑定所辖的模板 ID 列表（全量覆盖）。"""
    role = session.get(Role, role_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="角色不存在")

    for template_id in body.template_ids:
        template = session.get(Template, template_id)
        if template is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"模板 {template_id} 不存在",
            )
        if template.archived:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"模板 {template.name} 已归档，无法绑定",
            )

    for link in session.exec(
        select(RoleTemplateMapping).where(RoleTemplateMapping.role_id == role_id)
    ).all():
        session.delete(link)

    for template_id in body.template_ids:
        session.add(
            RoleTemplateMapping(role_id=role_id, template_id=template_id)
        )
    session.commit()
    return {"role_id": role_id, "template_ids": body.template_ids}


def _build_org_tree(session: Session) -> OrgTreeRead:
    """构建组织架构全量树 + 职能标签。"""
    segments = session.exec(select(BusinessSegment).order_by(BusinessSegment.id)).all()
    entities = session.exec(select(OrgEntity).order_by(OrgEntity.id)).all()
    departments = session.exec(
        select(OrgDepartment).order_by(OrgDepartment.id)
    ).all()
    tags = session.exec(select(FunctionTag).order_by(FunctionTag.id)).all()

    entity_map: dict[int, list[OrgEntity]] = {}
    for e in entities:
        entity_map.setdefault(e.segment_id, []).append(e)
    dept_map: dict[int, list[OrgDepartment]] = {}
    for d in departments:
        dept_map.setdefault(d.entity_id, []).append(d)

    return OrgTreeRead(
        segments=[
            OrgSegmentRead(
                id=s.id,
                name=s.name,
                entities=[
                    OrgEntityRead(
                        id=e.id,
                        name=e.name,
                        departments=[
                            OrgDepartmentRead(id=d.id, name=d.name)
                            for d in dept_map.get(e.id, [])
                        ],
                    )
                    for e in entity_map.get(s.id, [])
                ],
            )
            for s in segments
        ],
        tags=[FunctionTagRead(id=t.id, name=t.name) for t in tags],
    )


@router.get("/org", response_model=OrgTreeRead)
async def get_org_tree(session: Session = Depends(get_session)) -> OrgTreeRead:
    """获取组织架构全量树（业务板块→主体→部门）与职能标签。"""
    return _build_org_tree(session)


@router.post("/org/segments", response_model=OrgSegmentRead, status_code=status.HTTP_201_CREATED)
async def create_segment(
    body: OrgSegmentCreate, session: Session = Depends(get_session)
) -> OrgSegmentRead:
    """新增业务板块。"""
    if session.exec(select(BusinessSegment).where(BusinessSegment.name == body.name)).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="业务板块已存在")
    seg = BusinessSegment(name=body.name)
    session.add(seg)
    session.commit()
    session.refresh(seg)
    return OrgSegmentRead(id=seg.id, name=seg.name)


@router.put("/org/segments/{segment_id}", response_model=OrgSegmentRead)
async def rename_segment(
    segment_id: int, body: OrgRename, session: Session = Depends(get_session)
) -> OrgSegmentRead:
    seg = session.get(BusinessSegment, segment_id)
    if seg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="业务板块不存在")
    if session.exec(
        select(BusinessSegment).where(
            BusinessSegment.name == body.name, BusinessSegment.id != segment_id
        )
    ).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="业务板块已存在")
    seg.name = body.name
    session.add(seg)
    session.commit()
    session.refresh(seg)
    return OrgSegmentRead(id=seg.id, name=seg.name)


@router.delete("/org/segments/{segment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_segment(
    segment_id: int, session: Session = Depends(get_session)
) -> None:
    seg = session.get(BusinessSegment, segment_id)
    if seg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="业务板块不存在")
    if session.exec(select(OrgEntity).where(OrgEntity.segment_id == segment_id)).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="该业务板块下存在主体，无法删除"
        )
    session.delete(seg)
    session.commit()


@router.post("/org/entities", response_model=OrgEntityRead, status_code=status.HTTP_201_CREATED)
async def create_entity(
    body: OrgEntityCreate, session: Session = Depends(get_session)
) -> OrgEntityRead:
    """新增主体（隶属于指定业务板块）。"""
    if session.get(BusinessSegment, body.segment_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="业务板块不存在")
    ent = OrgEntity(name=body.name, segment_id=body.segment_id)
    session.add(ent)
    session.commit()
    session.refresh(ent)
    return OrgEntityRead(id=ent.id, name=ent.name)


@router.put("/org/entities/{entity_id}", response_model=OrgEntityRead)
async def rename_entity(
    entity_id: int, body: OrgRename, session: Session = Depends(get_session)
) -> OrgEntityRead:
    ent = session.get(OrgEntity, entity_id)
    if ent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="主体不存在")
    ent.name = body.name
    session.add(ent)
    session.commit()
    session.refresh(ent)
    return OrgEntityRead(id=ent.id, name=ent.name)


@router.delete("/org/entities/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entity(
    entity_id: int, session: Session = Depends(get_session)
) -> None:
    ent = session.get(OrgEntity, entity_id)
    if ent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="主体不存在")
    if session.exec(select(OrgDepartment).where(OrgDepartment.entity_id == entity_id)).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="该主体下存在部门，无法删除"
        )
    session.delete(ent)
    session.commit()


@router.post("/org/departments", response_model=OrgDepartmentRead, status_code=status.HTTP_201_CREATED)
async def create_department(
    body: OrgDepartmentCreate, session: Session = Depends(get_session)
) -> OrgDepartmentRead:
    """新增部门（隶属于指定主体）。"""
    if session.get(OrgEntity, body.entity_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="主体不存在")
    dept = OrgDepartment(name=body.name, entity_id=body.entity_id)
    session.add(dept)
    session.commit()
    session.refresh(dept)
    return OrgDepartmentRead(id=dept.id, name=dept.name)


@router.put("/org/departments/{department_id}", response_model=OrgDepartmentRead)
async def rename_department(
    department_id: int, body: OrgRename, session: Session = Depends(get_session)
) -> OrgDepartmentRead:
    dept = session.get(OrgDepartment, department_id)
    if dept is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="部门不存在")
    dept.name = body.name
    session.add(dept)
    session.commit()
    session.refresh(dept)
    return OrgDepartmentRead(id=dept.id, name=dept.name)


@router.delete("/org/departments/{department_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_department(
    department_id: int, session: Session = Depends(get_session)
) -> None:
    dept = session.get(OrgDepartment, department_id)
    if dept is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="部门不存在")
    if session.exec(select(Role).where(Role.department_id == department_id)).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="该部门下存在角色，无法删除"
        )
    session.delete(dept)
    session.commit()


@router.post("/org/tags", response_model=FunctionTagRead, status_code=status.HTTP_201_CREATED)
async def create_tag(
    body: FunctionTagCreate, session: Session = Depends(get_session)
) -> FunctionTagRead:
    """新增职能标签（全局）。"""
    if session.exec(select(FunctionTag).where(FunctionTag.name == body.name)).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="职能标签已存在")
    tag = FunctionTag(name=body.name)
    session.add(tag)
    session.commit()
    session.refresh(tag)
    return FunctionTagRead(id=tag.id, name=tag.name)


@router.put("/org/tags/{tag_id}", response_model=FunctionTagRead)
async def rename_tag(
    tag_id: int, body: OrgRename, session: Session = Depends(get_session)
) -> FunctionTagRead:
    tag = session.get(FunctionTag, tag_id)
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="职能标签不存在")
    if session.exec(
        select(FunctionTag).where(FunctionTag.name == body.name, FunctionTag.id != tag_id)
    ).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="职能标签已存在")
    tag.name = body.name
    session.add(tag)
    session.commit()
    session.refresh(tag)
    return FunctionTagRead(id=tag.id, name=tag.name)


@router.delete("/org/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    tag_id: int, session: Session = Depends(get_session)
) -> None:
    tag = session.get(FunctionTag, tag_id)
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="职能标签不存在")
    if session.exec(select(Role).where(Role.function_tag_id == tag_id)).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="该职能标签已被角色使用，无法删除"
        )
    session.delete(tag)
    session.commit()


def _find_workbook(
    session: Session, role_id: int, template_id: int, period: str
) -> RoleWorkbook:
    workbook = session.exec(
        select(RoleWorkbook).where(
            RoleWorkbook.role_id == role_id,
            RoleWorkbook.template_id == template_id,
            RoleWorkbook.period == period,
        )
    ).first()
    if workbook is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="该部门尚未填写此模板"
        )
    return workbook


@router.get("/overview", response_model=list[AdminBindingStatus])
async def get_filling_overview(
    period: str = Query(..., pattern=PERIOD_PATTERN),
    session: Session = Depends(get_session),
) -> list[AdminBindingStatus]:
    """填报总览：该年份所有 部门×模板 绑定及对应周期的填报状态（含未填报项）。"""
    year = int(period[:4])
    rows = session.exec(
        select(Role, Template, RoleWorkbook)
        .join(
            RoleTemplateMapping,
            RoleTemplateMapping.role_id == Role.id,
        )
        .join(Template, Template.id == RoleTemplateMapping.template_id)
        .outerjoin(
            RoleWorkbook,
            (RoleWorkbook.role_id == Role.id)
            & (RoleWorkbook.template_id == Template.id)
            & (RoleWorkbook.period == period),
        )
        .where(Template.year == year, Template.archived == False)  # noqa: E712
        .order_by(Role.id, Template.id)
    ).all()
    return [
        AdminBindingStatus(
            role_id=role.id,
            role_name=role.name,
            segment_id=role.segment_id,
            segment_name=session.get(BusinessSegment, role.segment_id).name
            if role.segment_id
            else None,
            entity_id=role.entity_id,
            entity_name=session.get(OrgEntity, role.entity_id).name
            if role.entity_id
            else None,
            department_id=role.department_id,
            department_name=session.get(OrgDepartment, role.department_id).name
            if role.department_id
            else None,
            function_tag_id=role.function_tag_id,
            function_tag_name=session.get(FunctionTag, role.function_tag_id).name
            if role.function_tag_id
            else None,
            template_id=template.id,
            template_name=template.name,
            status=workbook.status if workbook else "none",
            submit_at=workbook.submit_at if workbook else None,
            updated_at=workbook.updated_at if workbook else None,
        )
        for role, template, workbook in rows
    ]


@router.get("/workbooks", response_model=list[AdminWorkbookRead])
async def list_filled_workbooks(
    period: str = Query(..., pattern=PERIOD_PATTERN),
    status_filter: str | None = Query(default=None, alias="status"),
    session: Session = Depends(get_session),
) -> list[AdminWorkbookRead]:
    """查看指定周期各部门已填写的填报记录（可按状态筛选）。"""
    year = int(period[:4])
    stmt = (
        select(RoleWorkbook, Role, Template)
        .join(Role, Role.id == RoleWorkbook.role_id)
        .join(Template, Template.id == RoleWorkbook.template_id)
        .where(Template.year == year, RoleWorkbook.period == period)
        .order_by(RoleWorkbook.updated_at.desc())
    )
    if status_filter:
        stmt = stmt.where(RoleWorkbook.status == status_filter)
    rows = session.exec(stmt).all()
    return [
        AdminWorkbookRead(
            role_id=wb.role_id,
            role_name=role.name,
            template_id=wb.template_id,
            template_name=template.name,
            period=wb.period,
            status=wb.status,
            submit_at=wb.submit_at,
            updated_at=wb.updated_at,
            reject_reason=wb.reject_reason,
        )
        for wb, role, template in rows
    ]


@router.get("/workbooks/{role_id}/{template_id}/{period}", response_model=AdminWorkbookDetail)
async def get_role_workbook(
    role_id: int,
    template_id: int,
    period: str,
    session: Session = Depends(get_session),
) -> AdminWorkbookDetail:
    """获取某部门对某模板在某周期已填写的快照（供管理员预览）。"""
    workbook = _find_workbook(session, role_id, template_id, period)
    role = session.get(Role, role_id)
    template = session.get(Template, template_id)
    return AdminWorkbookDetail(
        role_id=role_id,
        role_name=role.name if role else "",
        template_id=template_id,
        template_name=template.name if template else "",
        period=period,
        status=workbook.status,
        submit_at=workbook.submit_at,
        reject_reason=workbook.reject_reason,
        snapshot=workbook.snapshot,
    )


@router.post("/workbooks/{role_id}/{template_id}/{period}/review", response_model=dict)
async def review_role_workbook(
    role_id: int,
    template_id: int,
    period: str,
    body: WorkbookReview,
    session: Session = Depends(get_session),
) -> dict:
    """审核部门填报：通过（approved）或退回（rejected，需填写原因），仅对已提交生效。"""
    workbook = _find_workbook(session, role_id, template_id, period)
    if workbook.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="仅可审核已提交的填报",
        )
    try:
        reason = body.validated_reason()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    workbook.status = body.action
    workbook.review_at = datetime.utcnow()
    workbook.reject_reason = reason if body.action == "rejected" else None
    session.add(workbook)
    session.commit()
    session.refresh(workbook)
    return {"id": workbook.id, "status": workbook.status}


@router.get("/periods", response_model=list[FillingPeriodRead])
async def list_periods(
    year: int = Query(...),
    session: Session = Depends(get_session),
) -> list[FillingPeriodRead]:
    """获取指定年份全部 12 个月的锁定状态（未配置默认未锁定）。"""
    records = session.exec(
        select(FillingPeriod).where(FillingPeriod.period.like(f"{year}-%"))
    ).all()
    locked_map = {r.period: r.locked for r in records}
    return [
        FillingPeriodRead(period=f"{year}-{month:02d}", locked=locked_map.get(f"{year}-{month:02d}", False))
        for month in range(1, 13)
    ]


@router.put("/periods/{period}", response_model=FillingPeriodRead)
async def upsert_period_lock(
    period: str,
    body: FillingPeriodUpsert,
    session: Session = Depends(get_session),
) -> FillingPeriodRead:
    """锁定或解锁指定填报周期（幂等 upsert）。"""
    record = session.exec(
        select(FillingPeriod).where(FillingPeriod.period == period)
    ).first()
    if record is None:
        record = FillingPeriod(period=period, locked=body.locked)
        session.add(record)
    else:
        record.locked = body.locked
        session.add(record)
    session.commit()
    return FillingPeriodRead(period=period, locked=body.locked)