"""填报（workbook）相关业务逻辑：内容区数字校验、迭代器、提交状态语义。

从 routers/workspace.py 抽离的纯函数（无 DB/HTTP 依赖），便于 pytest 单测。
"""
from __future__ import annotations

import re

from fastapi import HTTPException, status

from app.models import Template


def iter_content_area(template: Template):
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


def col_index_to_letter(col: int) -> str:
    """将 0 起始列号转换为 Excel 列字母（0 -> A）。"""
    letters = ""
    n = col + 1
    while n > 0:
        n, remainder = divmod(n - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


# 千分位正则：1,234,567.89 通过；1,2 / 1,2,3 拒绝（避免歧义）
# 与前端 utils/validateContent.ts 完全一致
_NUMERIC_PATTERN = re.compile(r"^-?\d{1,3}(,\d{3})+(\.\d+)?$|^-?\d+(\.\d+)?$")


def is_numeric(value) -> bool:
    """校验单元格值是否为数值（允许千分位逗号与正负号；不允许任意位置逗号）。

    - 整数 / 浮点（含负数、小数）：通过
    - 千分位逗号：1,234,567.89 通过；1,2 / 1,2,3 拒绝
    - 空串 / 空值：放行（由外层 caller 跳过）
    """
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return True
    if isinstance(value, str):
        return bool(_NUMERIC_PATTERN.fullmatch(value.strip()))
    return False


def validate_content_numeric(snapshot: dict, template: Template) -> None:
    """内容区仅允许数字：校验内容区矩形内非空单元格必须为数值，否则抛出 400。

    遍历所有 sheet 的内容区矩形（与 admin/workspace 用法一致）。
    """
    if not template.content_numeric:
        return
    if template.content_rows <= 0 or template.content_cols <= 0:
        return
    sheets = snapshot.get("sheets", {}) or {}
    invalid_cells: list[str] = []
    for sheet_name, sheet in sheets.items():
        if not isinstance(sheet, dict):
            continue
        cell_data = sheet.get("cellData", {}) or {}
        for row, col in iter_content_area(template):
            row_data = cell_data.get(str(row))
            if not isinstance(row_data, dict):
                continue
            cell = row_data.get(str(col))
            if not isinstance(cell, dict) or cell.get("v") in (None, ""):
                continue
            value = cell.get("v")
            if not is_numeric(value):
                invalid_cells.append(f"{col_index_to_letter(col)}{row + 1}")
    if invalid_cells:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"单元格 {'、'.join(invalid_cells)} 需为数字",
        )


def is_period_locked_for(session_func, period: str) -> bool:
    """通过传入的查询函数判断某 period 是否被锁定（保持 workspace 不直接依赖 db 层）。"""
    record = session_func(period)
    return bool(record and record.locked)