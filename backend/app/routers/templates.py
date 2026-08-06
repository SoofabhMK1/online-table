from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.database import get_session
from app.dependencies import get_current_admin
from app.models import Template
from app.schemas import TemplateCreate, TemplateDetail, TemplateRead, TemplateUpdate

router = APIRouter(
    prefix="/api/templates", tags=["templates"], dependencies=[Depends(get_current_admin)]
)


@router.post("", response_model=TemplateDetail, status_code=status.HTTP_201_CREATED)
async def create_template(
    body: TemplateCreate, session: Session = Depends(get_session)
) -> Template:
    """新建模板，snapshot 作为 dict 直接落入 SQLite JSON 字段。"""
    template = Template(
        name=body.name,
        snapshot=body.snapshot,
        row_label_cols=body.row_label_cols,
        col_label_rows=body.col_label_rows,
        content_rows=body.content_rows,
        content_cols=body.content_cols,
    )
    session.add(template)
    session.commit()
    session.refresh(template)
    return template


@router.get("", response_model=list[TemplateRead])
async def list_templates(session: Session = Depends(get_session)) -> list[Template]:
    """拉取系统全部模板列表。"""
    return session.exec(select(Template)).all()


@router.get("/{template_id}", response_model=TemplateDetail)
async def get_template(
    template_id: int, session: Session = Depends(get_session)
) -> Template:
    """获取单个模板的完整快照。"""
    template = session.get(Template, template_id)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="模板不存在")
    return template


@router.put("/{template_id}", response_model=TemplateDetail)
async def update_template(
    template_id: int,
    body: TemplateUpdate,
    session: Session = Depends(get_session),
) -> Template:
    """更新现有模板的名称或 Snapshot 数据。"""
    template = session.get(Template, template_id)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="模板不存在")
    if body.name is not None:
        template.name = body.name
    if body.snapshot is not None:
        template.snapshot = body.snapshot
    if body.row_label_cols is not None:
        template.row_label_cols = body.row_label_cols
    if body.col_label_rows is not None:
        template.col_label_rows = body.col_label_rows
    if body.content_rows is not None:
        template.content_rows = body.content_rows
    if body.content_cols is not None:
        template.content_cols = body.content_cols
    session.add(template)
    session.commit()
    session.refresh(template)
    return template