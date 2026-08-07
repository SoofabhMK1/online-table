from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.config import settings
from app.database import get_session
from app.dependencies import get_current_admin
from app.models import FillingPeriod, Role, RoleTemplateMapping, RoleWorkbook, Template, User
from app.schemas import (
    AdminBindingStatus,
    AdminWorkbookDetail,
    AdminWorkbookRead,
    FillingPeriodRead,
    FillingPeriodUpsert,
    PERIOD_PATTERN,
    RoleCreate,
    RoleRead,
    RoleTemplateBind,
    WorkbookReview,
)
from app.security import hash_password

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(get_current_admin)])


def _ensure_role_default_user(session: Session, role: Role) -> User:
    """确保角色存在默认账号（用户名=角色名），不存在则创建。"""
    user = session.exec(
        select(User).where(User.username == role.name)
    ).first()
    if user is None:
        user = User(
            username=role.name,
            password_hash=hash_password(settings.DEFAULT_USER_PASSWORD),
            role_id=role.id,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
    return user


@router.get("/roles", response_model=list[RoleRead])
async def list_roles(session: Session = Depends(get_session)) -> list[Role]:
    """获取系统角色列表（不含管理员角色，避免管理员误删自身）。"""
    return session.exec(
        select(Role).where(Role.name != settings.ADMIN_ROLE_NAME)
    ).all()


@router.post("/roles", response_model=RoleRead, status_code=status.HTTP_201_CREATED)
async def create_role(
    body: RoleCreate, session: Session = Depends(get_session)
) -> Role:
    """创建新角色，并自动为其创建默认账号（用户名=角色名，密码=初始密码）。"""
    if body.name == settings.ADMIN_ROLE_NAME:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="管理员角色为系统保留角色"
        )
    existing = session.exec(
        select(Role).where(Role.name == body.name)
    ).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="角色已存在"
        )
    role = Role(name=body.name)
    session.add(role)
    session.commit()
    session.refresh(role)
    _ensure_role_default_user(session, role)
    return role


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
async def delete_role(role_id: int, session: Session = Depends(get_session)) -> None:
    """删除角色（同时解除其模板绑定与默认账号，并要求角色下无其他用户）。"""
    role = session.get(Role, role_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="角色不存在")
    if role.name == settings.ADMIN_ROLE_NAME:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="管理员角色不可删除"
        )
    other_users = session.exec(
        select(User).where(User.role_id == role_id, User.username != role.name)
    ).all()
    if other_users:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="该角色下存在用户，无法删除"
        )
    for link in session.exec(
        select(RoleTemplateMapping).where(RoleTemplateMapping.role_id == role_id)
    ).all():
        session.delete(link)
    default_user = session.exec(
        select(User).where(User.username == role.name)
    ).first()
    if default_user is not None:
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
    workbook.status = body.action
    workbook.review_at = datetime.utcnow()
    workbook.reject_reason = (
        body.reject_reason if body.action == "rejected" else None
    )
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