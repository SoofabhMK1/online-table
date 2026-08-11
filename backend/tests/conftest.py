"""pytest 全局 fixture：内存 SQLite、admin / 普通用户覆盖、TestClient + httpx AsyncClient。"""
import sys
from collections.abc import Generator
from pathlib import Path

# 把 backend 加入 sys.path，确保 `import app.*` 可用
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

import app.models  # noqa: F401  注册 SQLModel metadata
from app.config import settings
from app.database import get_session
from app.dependencies import get_current_admin, get_current_user
from app.models import Role, User
from app.security import hash_password
from main import app


@pytest.fixture()
def engine():
    """每个测试一个全新的内存 SQLite 引擎（外键启用，StaticPool 让所有连接共享同一内存库）。"""
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(eng, "connect")
    def _fk_on(dbapi_conn, _rec):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    SQLModel.metadata.create_all(bind=eng)
    yield eng
    eng.dispose()


@pytest.fixture()
def session(engine) -> Generator[Session, None, None]:
    """单会话视图，供直接构造 ORM 对象。"""
    with Session(engine) as s:
        yield s


@pytest.fixture()
def admin_user(session) -> User:
    """预置管理员角色 + admin/admin123 账号。"""
    role = session.exec(
        select(Role).where(Role.name == settings.ADMIN_ROLE_NAME)
    ).first()
    if role is None:
        role = Role(name=settings.ADMIN_ROLE_NAME)
        session.add(role)
        session.commit()
        session.refresh(role)
    user = session.exec(select(User).where(User.username == "admin")).first()
    if user is None:
        user = User(
            username="admin",
            password_hash=hash_password("admin123"),
            role_id=role.id,
            is_default=True,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
    return user


@pytest.fixture()
def normal_user(session) -> User:
    """预置「测试部」角色 + test_user/test1 账号（is_default=False）。"""
    role = session.exec(select(Role).where(Role.name == "测试部")).first()
    if role is None:
        role = Role(name="测试部")
        session.add(role)
        session.commit()
        session.refresh(role)
    user = session.exec(select(User).where(User.username == "test_user")).first()
    if user is None:
        user = User(
            username="test_user",
            password_hash=hash_password("test1"),
            role_id=role.id,
            is_default=False,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
    return user


class _StubUser:
    """把 ORM User 透明转发到依赖的访问属性。"""

    def __init__(self, real: User) -> None:
        self._real = real

    def __getattr__(self, name):
        return getattr(self._real, name)


def _install_overrides(engine, admin_user, normal_user):
    def _override_session():
        # expire_on_commit=False 让 commit 后属性不失效；session 关闭后通过
        # expunge_all() 显式解除 ORM 对象与 session 的关联，避免下次新 session
        # add 同一对象时触发 "already attached" 报错（SQLAlchemy 2.x 默认行为）。
        with Session(engine, expire_on_commit=False) as s:
            try:
                yield s
            finally:
                s.expunge_all()

    def _override_admin():
        # 每次依赖调用都从 fresh session 加载并立刻 expunge，返回 detached 副本，
        # 避免被路由内 session.add() 时触发 "already attached to session" 错误。
        with Session(engine) as fresh:
            u = fresh.get(User, admin_user.id)
            fresh.expunge(u)
            return _StubUser(u)

    def _override_normal():
        with Session(engine) as fresh:
            u = fresh.get(User, normal_user.id)
            fresh.expunge(u)
            return _StubUser(u)

    app.dependency_overrides[get_session] = _override_session
    app.dependency_overrides[get_current_admin] = _override_admin
    app.dependency_overrides[get_current_user] = _override_normal


@pytest.fixture()
def client(engine, admin_user, normal_user):
    """FastAPI TestClient：get_session / get_current_* 走测试引擎。"""
    _install_overrides(engine, admin_user, normal_user)
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
async def async_client(engine, admin_user, normal_user):
    """httpx AsyncClient (ASGI transport)：供 async 测试使用。"""
    _install_overrides(engine, admin_user, normal_user)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac
    app.dependency_overrides.clear()