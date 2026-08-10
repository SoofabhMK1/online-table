"""template_service 纯函数单测。"""
import pytest
from fastapi import HTTPException

from app.config import settings
from app.services import template_service


class TestCheckSnapshotSize:
    def test_small_snapshot_ok(self):
        template_service.check_snapshot_size({"a": 1, "b": "hello"})

    def test_large_snapshot_rejected(self):
        # 构造刚好超过 MAX_SNAPSHOT_BYTES 的大 dict
        big = {"x": "a" * (settings.MAX_SNAPSHOT_BYTES + 100)}
        with pytest.raises(HTTPException) as exc_info:
            template_service.check_snapshot_size(big)
        assert exc_info.value.status_code == 413
        assert "快照过大" in str(exc_info.value.detail)

    def test_empty_snapshot_ok(self):
        template_service.check_snapshot_size({})
        template_service.check_snapshot_size({"sheets": {}})