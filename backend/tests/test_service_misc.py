"""service 层补盲测试。

覆盖：
- role_service.ensure_function_tag：None / 存在 / 不存在
- role_service.safe_commit：commit 成功 + IntegrityError → 409
- workbook_service.is_period_locked_for：通过 lambda 调用，None record / locked / unlocked
"""
import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.models import FunctionTag, Role, User
from app.services.role_service import ensure_function_tag, safe_commit
from app.services.workbook_service import is_period_locked_for


class TestEnsureFunctionTag:
    def test_none_function_tag_id_passes(self, session):
        """不传职能标签 ID 时不校验（直接放行）。"""
        ensure_function_tag(session, None)  # 不抛错

    def test_existing_function_tag_passes(self, session):
        """存在的职能标签 ID 不抛错。"""
        tag = FunctionTag(name="财务")
        session.add(tag)
        session.commit()
        session.refresh(tag)
        ensure_function_tag(session, tag.id)  # 不抛错

    def test_missing_function_tag_raises_400(self, session):
        """不存在的职能标签 ID 应抛 400。"""
        with pytest.raises(HTTPException) as exc:
            ensure_function_tag(session, 99999)
        assert exc.value.status_code == 400
        assert "职能标签" in str(exc.value.detail)


class TestSafeCommit:
    def test_safe_commit_succeeds(self, session):
        """正常 commit 不抛错。"""
        role = Role(name="测试角色A")
        session.add(role)
        safe_commit(session)
        assert role.id is not None

    def test_safe_commit_raises_409_on_integrity_error(self, session, admin_user):
        """IntegrityError（唯一约束冲突）应被转换为 409。

        利用 User.username 唯一索引：先插入一个用户，再插入同名用户，触发 IntegrityError，
        被 safe_commit 转成 409。
        """
        # 先创建一个用户占位（使用 admin_user 的 role_id 满足 FK）
        session.add(User(
            username="dup_user",
            password_hash="x",
            role_id=admin_user.role_id,
            is_default=False,
        ))
        session.commit()

        # 在同一 session 内再次添加同名 user（flush 会因 UniqueConstraint 触发 IntegrityError）
        session.add(User(
            username="dup_user",
            password_hash="y",
            role_id=admin_user.role_id,
            is_default=False,
        ))
        with pytest.raises(HTTPException) as exc:
            safe_commit(session)
        assert exc.value.status_code == 409
        assert "冲突" in str(exc.value.detail)
        # rollback 已发生，可继续使用 session
        assert session.is_active


class TestIsPeriodLockedFor:
    def test_no_record_returns_false(self):
        """未配置该 period（数据库无记录）应返回 False（未锁定）。"""
        result = is_period_locked_for(lambda _: None, "2030-01")
        assert result is False

    def test_unlocked_record_returns_false(self):
        """存在记录但 locked=False 应返回 False。"""

        class _Record:
            locked = False

        result = is_period_locked_for(lambda _: _Record(), "2030-01")
        assert result is False

    def test_locked_record_returns_true(self):
        """存在记录且 locked=True 应返回 True。"""

        class _Record:
            locked = True

        result = is_period_locked_for(lambda _: _Record(), "2030-01")
        assert result is True

    def test_falsy_record_returns_false(self):
        """record 为 0/'' 等 falsy 值时返回 False（防止 record.locked 抛错）。"""
        result = is_period_locked_for(lambda _: 0, "2030-01")
        assert result is False