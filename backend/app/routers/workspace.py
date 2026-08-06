from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.database import get_session
from app.dependencies import get_current_user
from app.models import RoleTemplateMapping, Template, User, UserWorkbook
from app.schemas import (
    TemplateRead,
    WorkbookCreate,
    WorkspaceTemplateDetail,
)

router = APIRouter(prefix="/api/workspace", tags=["workspace"])


def _ensure_template_allowed(
    session: Session, template_id: int, role_id: int
) -> Template:
    """校验模板存在且当前角色拥有其访问权限。"""
    link = session.exec(
        select(RoleTemplateMapping).where(
            RoleTemplateMapping.role_id == role_id,
            RoleTemplateMapping.template_id == template_id,
        )
    ).first()
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="无权访问该模板"
        )
    return session.get(Template, template_id)


@router.get("/templates", response_model=list[TemplateRead])
async def list_accessible_templates(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[Template]:
    """多表联查：根据当前用户 role_id 返回其拥有权限的模板列表（仅 id+name）。"""
    stmt = (
        select(Template)
        .join(
            RoleTemplateMapping,
            RoleTemplateMapping.template_id == Template.id,
        )
        .where(RoleTemplateMapping.role_id == current_user.role_id)
    )
    return session.exec(stmt).all()


@router.get("/templates/{template_id}", response_model=WorkspaceTemplateDetail)
async def get_accessible_template(
    template_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> WorkspaceTemplateDetail:
    """获取模板详情：snapshot 为当前用户已保存的数据（若有），否则为模板原始快照。"""
    template = _ensure_template_allowed(session, template_id, current_user.role_id)
    workbook = session.exec(
        select(UserWorkbook).where(
            UserWorkbook.user_id == current_user.id,
            UserWorkbook.template_id == template_id,
        )
    ).first()
    has_saved = workbook is not None
    snapshot = workbook.snapshot if workbook is not None else template.snapshot
    return WorkspaceTemplateDetail(
        id=template.id,
        name=template.name,
        row_label_cols=template.row_label_cols,
        col_label_rows=template.col_label_rows,
        content_rows=template.content_rows,
        content_cols=template.content_cols,
        has_saved=has_saved,
        snapshot=snapshot,
    )


@router.post("/workbooks", response_model=dict, status_code=status.HTTP_201_CREATED)
async def submit_workbook(
    body: WorkbookCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """提交用户填报数据：存在则更新，不存在则插入。"""
    _ensure_template_allowed(session, body.template_id, current_user.role_id)

    workbook = session.exec(
        select(UserWorkbook).where(
            UserWorkbook.user_id == current_user.id,
            UserWorkbook.template_id == body.template_id,
        )
    ).first()

    if workbook is None:
        workbook = UserWorkbook(
            user_id=current_user.id,
            template_id=body.template_id,
            snapshot=body.snapshot,
        )
        session.add(workbook)
    else:
        workbook.snapshot = body.snapshot

    session.commit()
    session.refresh(workbook)
    return {"id": workbook.id, "updated_at": workbook.updated_at.isoformat()}