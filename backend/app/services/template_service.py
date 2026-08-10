"""模板管理业务逻辑（无 HTTP 依赖，便于单测）。"""
from __future__ import annotations

import json

from fastapi import HTTPException, status

from app.config import settings


def check_snapshot_size(snapshot: dict) -> None:
    """序列化后超 MAX_SNAPSHOT_BYTES 即拒绝（413），避免恶意大 JSON 触发 OOM。"""
    size = len(json.dumps(snapshot, ensure_ascii=False, default=str).encode("utf-8"))
    if size > settings.MAX_SNAPSHOT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"快照过大（{size} 字节 > {settings.MAX_SNAPSHOT_BYTES}），请精简表格内容",
        )