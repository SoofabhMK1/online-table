"""登录限流 — HTTP 真实端到端测试。

通过 conftest 的 `client_no_auth` fixture（不 override get_current_user）发出真实 HTTP 请求。
覆盖：
- 10 次错密码后第 11 次 429 + Retry-After
- 错密码后正确登录重置桶
- 不同用户独立桶（admin vs test_user）
- 限流 401 vs 429 文案区分
- 桶满后即使密码正确也 429
"""
import time

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import rate_limit
from app.database import engine
from app.models import User
from app.security import hash_password
from tests.test_security_e2e import client_no_auth  # noqa: F401  复用 fixture


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """每个测试前后重置限流桶，避免跨测试状态污染。"""
    limiter = rate_limit.get_login_rate_limiter()
    # 清空所有桶（limiter 暴露 _attempts 字典；测试间彻底重置）
    if hasattr(limiter, '_attempts'):
        limiter._attempts.clear()
    yield
    if hasattr(limiter, '_attempts'):
        limiter._attempts.clear()


def _new_user(client, username, password="rl_pw12345"):
    """API 创建独立测试用户（避免与 conftest admin/normal 冲突）。

    角色名限 50 字符内（schema 约束），用短名字。
    使用 `client_no_auth` fixture（不 override get_current_user）让 change-account 用真实用户。
    """
    # 先拿 admin token（创建角色需 admin 权限）
    admin_login = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    assert admin_login.status_code == 200, f"admin login ʧ��: {admin_login.status_code} {admin_login.text}"
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    r = client.post(
        "/api/admin/roles",
        json={"name": f"rl_{username}"},
        headers=admin_headers,
    )
    assert r.status_code == 201, f"create role ʧ��: {r.status_code} {r.text}"
    role = r.json()
    # 登录默认账号（密码 123456）然后用 change-account 改密码
    login_resp = client.post(
        "/api/auth/login",
        json={"username": role["default_username"], "password": "123456"},
    )
    assert login_resp.status_code == 200, f"login ʧ��: {login_resp.status_code} {login_resp.text}"
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    change_resp = client.post(
        "/api/auth/change-account",
        json={"old_password": "123456", "new_password": password},
        headers=headers,
    )
    if change_resp.status_code != 200:
        from app.security import verify_password
        from sqlmodel import select as sql_select
        from app.models import User as UserModel
        with __import__('sqlmodel').Session(engine) as s2:
            u = s2.exec(sql_select(UserModel).where(UserModel.username == role["default_username"])).first()
            ok = verify_password("123456", u.password_hash) if u else False
        raise AssertionError(
            f"change-account ʧ��: {change_resp.status_code} {change_resp.text} | "
            f"DB user found={u is not None}, verify(123456)={ok}"
        )
    return role["default_username"], password


class TestLoginRateLimitHttp:
    """真实 HTTP 端到端验证 /api/auth/login 的限流行为。"""

    def test_10_failures_then_429(self, client_no_auth):
        """连续 10 次错密码 → 第 11 次 429 + Retry-After 头 + 错误文案。"""
        # 调试：先看 admin login + admin 接口
        login = client_no_auth.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
        if login.status_code != 200:
            raise AssertionError(f"admin login 失败: {login.status_code} {login.text}")
        token = login.json()["access_token"]
        r = client_no_auth.get(
            "/api/admin/roles",
            headers={"Authorization": f"Bearer {token}"},
        )
        if r.status_code != 200:
            raise AssertionError(f"admin token 调 admin 接口失败: {r.status_code} {r.text}")
        username, _ = _new_user(client_no_auth, "op1_rl", password="correct_pw")
        # 10 次错密码
        for i in range(rate_limit.MAX_ATTEMPTS):
            r = client_no_auth.post(
                "/api/auth/login",
                json={"username": username, "password": "wrong"},
            )
            assert r.status_code == 401, f"第 {i+1} 次错密码应 401，实际 {r.status_code}"
        # 第 11 次（即使输入正确密码）也 429
        r = client_no_auth.post(
            "/api/auth/login",
            json={"username": username, "password": "correct_pw"},
        )
        assert r.status_code == 429
        # Retry-After 头
        retry_after = r.headers.get("Retry-After")
        assert retry_after is not None
        assert int(retry_after) > 0
        assert int(retry_after) <= rate_limit.WINDOW_SECONDS
        # 文案
        assert "失败" in r.json()["detail"] or "频繁" in r.json()["detail"]

    def test_correct_login_after_failures_resets_counter(self, client_no_auth):
        """错 5 次 → 正确登录重置 → 再错 10 次仍 401（未到 429）。"""
        username, password = _new_user(client_no_auth, "op1_alt", password="alt_pw")
        for _ in range(5):
            r = client_no_auth.post(
                "/api/auth/login",
                json={"username": username, "password": "wrong"},
            )
            assert r.status_code == 401
        # 正确登录 → 重置
        r = client_no_auth.post(
            "/api/auth/login",
            json={"username": username, "password": password},
        )
        assert r.status_code == 200
        # 再错 10 次仍 401（桶被重置）
        for i in range(rate_limit.MAX_ATTEMPTS):
            r = client_no_auth.post(
                "/api/auth/login",
                json={"username": username, "password": "wrong"},
            )
            assert r.status_code == 401, f"重置后再错第 {i+1} 次应 401"

    def test_separate_users_have_independent_buckets(self, client_no_auth):
        """admin 桶满不影响 op1 桶。"""
        # 用 conftest 的 admin（admin/admin123）跑满 10 次错密码
        for _ in range(rate_limit.MAX_ATTEMPTS):
            r = client_no_auth.post(
                "/api/auth/login",
                json={"username": "admin", "password": "wrong"},
            )
            assert r.status_code == 401
        # admin 桶满
        r_admin = client_no_auth.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin123"},
        )
        assert r_admin.status_code == 429
        # test_user 桶独立
        r_test = client_no_auth.post(
            "/api/auth/login",
            json={"username": "test_user", "password": "test1"},
        )
        assert r_test.status_code == 200

    def test_429_error_message_distinct_from_401(self, client_no_auth):
        """429 与 401 文案应不同，便于客户端区分。"""
        username, _ = _new_user(client_no_auth, "op1_msg", password="msg_pw")
        # 401 文案
        r401 = client_no_auth.post(
            "/api/auth/login",
            json={"username": username, "password": "wrong"},
        )
        assert r401.status_code == 401
        assert "用户名或密码错误" in r401.json()["detail"]
        # 429 文案
        for _ in range(rate_limit.MAX_ATTEMPTS):
            client_no_auth.post(
                "/api/auth/login",
                json={"username": username, "password": "wrong"},
            )
        r429 = client_no_auth.post(
            "/api/auth/login",
            json={"username": username, "password": "msg_pw"},
        )
        assert r429.status_code == 429
        assert "用户名或密码错误" not in r429.json()["detail"]
        assert "失败" in r429.json()["detail"] or "频繁" in r429.json()["detail"]

    def test_locked_user_cannot_login_even_with_correct_password(self, client_no_auth):
        """桶满后即使密码正确也 429（被锁定在限流层）。"""
        username, password = _new_user(client_no_auth, "op1_lock", password="lock_pw")
        for _ in range(rate_limit.MAX_ATTEMPTS):
            client_no_auth.post(
                "/api/auth/login",
                json={"username": username, "password": "wrong"},
            )
        # 正确密码 → 仍 429
        r = client_no_auth.post(
            "/api/auth/login",
            json={"username": username, "password": password},
        )
        assert r.status_code == 429

    def test_max_attempts_constant_matches_documented(self):
        """限流配置与 AGENTS.md 描述一致（10 次 / 5 分钟）。"""
        assert rate_limit.MAX_ATTEMPTS == 10
        assert rate_limit.WINDOW_SECONDS == 300