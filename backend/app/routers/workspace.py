import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

import json

from app.config import settings
from app.database import get_session
from app.dependencies import get_current_user
from app.models import FillingPeriod, RoleTemplateMapping, RoleWorkbook, Template, User
from app.schemas import (
    PERIOD_PATTERN,
    WorkbookSubmit,
    WorkspaceTemplateDetail,
    WorkspaceTemplateItem,
)

router = APIRouter(prefix="/api/workspace", tags=["workspace"])


def _check_snapshot_size(snapshot: dict) -> None:
    """序列化后超 MAX_SNAPSHOT_BYTES 即拒绝（413）。"""
    size = len(json.dumps(snapshot, ensure_ascii=False, default=str).encode("utf-8"))
    if size > settings.MAX_SNAPSHOT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"快照过大（{size} 字节 > {settings.MAX_SNAPSHOT_BYTES}），请精简表格内容",
        )


def _is_period_locked(session: Session, period: str) -> bool:
    """查询指定填报周期是否被管理员手动锁定。"""
    record = session.exec(
        select(FillingPeriod).where(FillingPeriod.period == period)
    ).first()
    return bool(record and record.locked)


def _validate_content_numeric(snapshot: dict, template: Template) -> None:
    """内容区仅允许数字：校验内容区矩形内非空单元格必须为数值，否则抛出 400。"""
    if not template.content_numeric:
        return
    if template.content_rows <= 0 or template.content_cols <= 0:
        return
    sheets = snapshot.get("sheets", {}) or {}
    invalid_cells: list[str] = []
    # 遍历所有 sheet 的内容区矩形
    for sheet_name, sheet in sheets.items():
        if not isinstance(sheet, dict):
            continue
        cell_data = sheet.get("cellData", {}) or {}
        for row, col in _iter_content_area(template):
            row_data = cell_data.get(str(row))
            if not isinstance(row_data, dict):
                continue
            cell = row_data.get(str(col))
            if not isinstance(cell, dict) or cell.get("v") in (None, ""):
                continue
            value = cell.get("v")
            if not _is_numeric(value):
                col_letter = _col_index_to_letter(col)
                invalid_cells.append(f"{col_letter}{row + 1}")
    if invalid_cells:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"单元格 {'、'.join(invalid_cells)} 需为数字",
        )


def _iter_content_area(template: Template):
    """生成内容区矩形内的 (row, col) 坐标（行列从 0 开始）。"""
    for row in range(
        template.col_label_rows,
        template.col_label_rows + template.content_rows,
    ):
        for col in range(
            template.row_label_cols,
            template.row_label_cols + template.content_cols,
        ):
            yield row, col


def _is_numeric(value) -> bool:
    """校验单元格值是否为数值（允许千分位逗号与正负号；不允许任意位置逗号）。

    与 frontend/utils/validateContent.ts 保持同逻辑：
    - 整数 / 浮点（含负数、小数）：通过
    - 千分位逗号：1,234,567.89 通过；1,2 / 1,2,3 拒绝（避免歧义）
    - 空串 / 空值：放行（由外层 caller 跳过）
    """
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return True
    if isinstance(value, str):
        import re
        return bool(re.fullmatch(r"-?\d{1,3}(,\d{3})+(\.\d+)?|-?\d+(\.\d+)?", value.strip()))
    return False


def _col_index_to_letter(col: int) -> str:
    """将 0 起始列号转换为 Excel 列字母（0 -> A）。"""
    letters = ""
    n = col + 1
    while n > 0:
        n, remainder = divmod(n - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


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


def _get_workbook(
    session: Session, role_id: int, template_id: int, period: str
) -> RoleWorkbook | None:
    """查询某部门对某模板在某周期的填报数据。"""
    return session.exec(
        select(RoleWorkbook).where(
            RoleWorkbook.role_id == role_id,
            RoleWorkbook.template_id == template_id,
            RoleWorkbook.period == period,
        )
    ).first()


@router.get("/templates", response_model=list[WorkspaceTemplateItem])
async def list_accessible_templates(
    period: str = Query(..., pattern=PERIOD_PATTERN),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[WorkspaceTemplateItem]:
    """返回当前部门在指定周期可填报的模板列表（仅当年模板），并附带该周期填报状态。"""
    year = int(period[:4])
    rows = session.exec(
        select(Template, RoleWorkbook)
        .join(
            RoleTemplateMapping,
            RoleTemplateMapping.template_id == Template.id,
        )
        .outerjoin(
            RoleWorkbook,
            (RoleWorkbook.template_id == Template.id)
            & (RoleWorkbook.role_id == current_user.role_id)
            & (RoleWorkbook.period == period),
        )
        .where(
            RoleTemplateMapping.role_id == current_user.role_id,
            Template.year == year,
            Template.archived == False,  # noqa: E712
        )
        .order_by(Template.id)
        .offset(offset)
        .limit(limit)
    ).all()
    locked = _is_period_locked(session, period)
    return [
        WorkspaceTemplateItem(
            id=template.id,
            name=template.name,
            year=template.year,
            row_label_cols=template.row_label_cols,
            col_label_rows=template.col_label_rows,
            content_rows=template.content_rows,
            content_cols=template.content_cols,
            content_numeric=template.content_numeric,
            status=workbook.status if workbook else "none",
            submit_at=workbook.submit_at if workbook else None,
            locked=locked,
        )
        for template, workbook in rows
    ]


@router.get("/templates/{template_id}", response_model=WorkspaceTemplateDetail)
async def get_accessible_template(
    template_id: int,
    period: str = Query(..., pattern=PERIOD_PATTERN),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> WorkspaceTemplateDetail:
    """获取模板详情：snapshot 为当前部门该周期已保存的数据（若有），否则为模板原始快照。"""
    template = _ensure_template_allowed(session, template_id, current_user.role_id)
    workbook = _get_workbook(session, current_user.role_id, template_id, period)
    return WorkspaceTemplateDetail(
        id=template.id,
        name=template.name,
        year=template.year,
        row_label_cols=template.row_label_cols,
        col_label_rows=template.col_label_rows,
        content_rows=template.content_rows,
        content_cols=template.content_cols,
        content_numeric=template.content_numeric,
        status=workbook.status if workbook else "none",
        submit_at=workbook.submit_at if workbook else None,
        reject_reason=workbook.reject_reason if workbook else None,
        locked=_is_period_locked(session, period),
        snapshot=workbook.snapshot if workbook else template.snapshot,
    )


@router.post("/workbooks", response_model=dict, status_code=status.HTTP_201_CREATED)
async def submit_workbook(
    body: WorkbookSubmit,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """保存草稿或提交填报：同一部门对同一模板同一周期仅一份数据，已提交/已通过后禁止修改。"""
    template = _ensure_template_allowed(session, body.template_id, current_user.role_id)
    if template.year != int(body.period[:4]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该模板不属于此填报年份",
        )
    if _is_period_locked(session, body.period):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该周期已被管理员锁定，无法修改",
        )
    _check_snapshot_size(body.snapshot)
    if body.action == "submit":
        _validate_content_numeric(body.snapshot, template)

    workbook = _get_workbook(session, current_user.role_id, body.template_id, body.period)

    if workbook is None:
        workbook = RoleWorkbook(
            role_id=current_user.role_id,
            template_id=body.template_id,
            period=body.period,
            snapshot=body.snapshot,
        )
        session.add(workbook)
        try:
            session.commit()
        except IntegrityError:
            # 并发场景下另一请求已创建同 (role, template, period) 行；
            # 回滚后重新加载并走 update 分支。
            session.rollback()
            workbook = _get_workbook(
                session, current_user.role_id, body.template_id, body.period
            )
            if workbook is None:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="并发创建失败，请重试",
                )
            if workbook.status in ("submitted", "approved"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="该周期填报已提交/已通过，无法修改",
                )
            workbook.snapshot = body.snapshot
    else:
        if workbook.status in ("submitted", "approved"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="该周期填报已提交/已通过，无法修改",
            )
        workbook.snapshot = body.snapshot

    if body.action == "submit":
        if workbook.status in ("submitted", "approved"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="该周期填报已提交/已通过，无法重复提交",
            )
        workbook.status = "submitted"
        workbook.submit_at = datetime.utcnow()
        workbook.review_at = None
        workbook.reject_reason = None

    session.commit()
    session.refresh(workbook)
    return {
        "id": workbook.id,
        "status": workbook.status,
        "updated_at": workbook.updated_at.isoformat(),
    }
