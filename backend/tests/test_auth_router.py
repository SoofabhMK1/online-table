"""auth router 补盲测试。

覆盖：
- /api/auth/change-password：错旧密码 / 短密码 / 正确旧密码 → 新密码可登录 / 旧密码失效
- /api/auth/change-account：错旧密码 / 改名成功 / 改名冲突 / 改密成功 / 全改 / 啥都没改
- /api/auth/change-password 未登录 → 401

注：自建 client fixture（auth_client）—— 不覆盖 get_current_user，让默认依赖
通过 bearer token → session.get(User, id) 取 user，保证 user 对象 attached to
请求 session，session.add() 能正确 UPDATE（而非 INSERT stale-detached 对象）。
"""
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.database import get_session
from app.models import User
from app.security import create_access_token, verify_password
from main import app


@pytest.fixture()
def auth_client(engine, admin_user, normal_user):
    """仅 override get_session（不覆盖 get_current_*），让 default 走 bearer token。"""
    def _override_session():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = _override_session
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()


@pytest.fixture()
def normal_token(engine, normal_user):
    """用真实 JWT 签发器生成 normal_user 的 token。"""
    with Session(engine) as s:
        u = s.exec(select(User).where(User.username == "test_user")).first()
        return create_access_token(u.id, u.role_id, u.role.name)


@pytest.fixture()
def admin_token(engine, admin_user):
    """用真实 JWT 签发器生成 admin 的 token。"""
    with Session(engine) as s:
        u = s.exec(select(User).where(User.username == "admin")).first()
        return create_access_token(u.id, u.role_id, u.role.name)


def _hdr(token):
    return {"Authorization": f"Bearer {token}"}


# =============== /api/auth/change-password ===============

class TestChangePassword:
    def test_wrong_old_password_returns_400(self, auth_client, normal_token):
        """错旧密码 → 400。"""
        r = auth_client.post(
            "/api/auth/change-password",
            json={"old_password": "wrong", "new_password": "newpass123"},
            headers=_hdr(normal_token),
        )
        assert r.status_code == 400
        assert "原密码错误" in r.json()["detail"]

    def test_correct_old_password_succeeds(self, auth_client, normal_token, engine):
        """正确旧密码 → 200 + DB 真实更新 + 新密码可登录 + 旧密码失效。"""
        r = auth_client.post(
            "/api/auth/change-password",
            json={"old_password": "test1", "new_password": "newpass123"},
            headers=_hdr(normal_token),
        )
        assert r.status_code == 200
        assert r.json() == {"message": "密码修改成功"}

        # 验证 DB 真实更新
        with Session(engine) as s:
            u = s.exec(select(User).where(User.username == "test_user")).first()
            assert verify_password("newpass123", u.password_hash) is True
            assert verify_password("test1", u.password_hash) is False

        # 旧密码登录应失败
        r_old = auth_client.post(
            "/api/auth/login", json={"username": "test_user", "password": "test1"}
        )
        assert r_old.status_code == 401

        # 新密码登录应成功
        r_new = auth_client.post(
            "/api/auth/login", json={"username": "test_user", "password": "newpass123"}
        )
        assert r_new.status_code == 200

    def test_short_password_rejected_by_schema(self, auth_client, normal_token):
        """new_password 长度 <6 应被 Pydantic schema 拒绝（422）。"""
        r = auth_client.post(
            "/api/auth/change-password",
            json={"old_password": "test1", "new_password": "abc"},
            headers=_hdr(normal_token),
        )
        assert r.status_code == 422


class TestChangeAccount:
    def test_wrong_old_password_returns_400(self, auth_client, normal_token):
        """错旧密码 → 400。"""
        r = auth_client.post(
            "/api/auth/change-account",
            json={"old_password": "wrong", "new_username": "new_test"},
            headers=_hdr(normal_token),
        )
        assert r.status_code == 400

    def test_change_username_only(self, auth_client, normal_token, engine):
        """只改用户名 → 200 + 返回新用户名 + 新用户名可登录。"""
        r = auth_client.post(
            "/api/auth/change-account",
            json={"old_password": "test1", "new_username": "renamed_test"},
            headers=_hdr(normal_token),
        )
        assert r.status_code == 200
        body = r.json()
        assert body["username"] == "renamed_test"
        assert "账号设置已保存" in body["message"]

        # DB 真实更新
        with Session(engine) as s:
            u = s.exec(select(User).where(User.username == "renamed_test")).first()
            assert u is not None
            assert verify_password("test1", u.password_hash) is True

        # 新用户名可登录
        r_login = auth_client.post(
            "/api/auth/login",
            json={"username": "renamed_test", "password": "test1"},
        )
        assert r_login.status_code == 200

    def test_change_username_conflict(self, auth_client, normal_token):
        """新用户名已被占用 → 400。"""
        # 管理员用户名 'admin' 已存在
        r = auth_client.post(
            "/api/auth/change-account",
            json={"old_password": "test1", "new_username": "admin"},
            headers=_hdr(normal_token),
        )
        assert r.status_code == 400
        assert "占用" in r.json()["detail"]

    def test_change_password_only(self, auth_client, normal_token, engine):
        """只改密码 → 200 + 新密码可登录。"""
        r = auth_client.post(
            "/api/auth/change-account",
            json={"old_password": "test1", "new_password": "renamedpass1"},
            headers=_hdr(normal_token),
        )
        assert r.status_code == 200

        r_login = auth_client.post(
            "/api/auth/login",
            json={"username": "test_user", "password": "renamedpass1"},
        )
        assert r_login.status_code == 200

    def test_change_both(self, auth_client, normal_token, engine):
        """同时改用户名+密码 → 200。"""
        r = auth_client.post(
            "/api/auth/change-account",
            json={
                "old_password": "test1",
                "new_username": "combo_user",
                "new_password": "combopass1",
            },
            headers=_hdr(normal_token),
        )
        assert r.status_code == 200
        assert r.json()["username"] == "combo_user"

        r_login = auth_client.post(
            "/api/auth/login",
            json={"username": "combo_user", "password": "combopass1"},
        )
        assert r_login.status_code == 200

    def test_no_changes_returns_400(self, auth_client, normal_token):
        """未提供任何变更 → 400。"""
        r = auth_client.post(
            "/api/auth/change-account",
            json={"old_password": "test1"},
            headers=_hdr(normal_token),
        )
        assert r.status_code == 400
        assert "没有需要修改的内容" in r.json()["detail"]


class TestAuthRequiresLogin:
    def test_change_password_without_login_returns_401(self, auth_client):
        """未登录（无 Authorization 头）→ 401。"""
        r = auth_client.post(
            "/api/auth/change-password",
            json={"old_password": "test1", "new_password": "abcdef"},
        )
        assert r.status_code == 401