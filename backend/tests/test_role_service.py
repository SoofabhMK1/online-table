"""role_service 数据库层单测：用 conftest 的 engine fixture + session fixture。"""
from sqlmodel import Session as SqlSession
from sqlmodel import select

from app.config import settings
from app.models import (
    BusinessSegment,
    OrgDepartment,
    OrgEntity,
    Role,
    User,
)
from app.services import role_service


def test_default_username():
    role = Role(id=42)
    assert role_service.default_username(role) == "role_42"


def test_ensure_default_user_creates(session: SqlSession):
    role = Role(name="测试角色A")
    session.add(role)
    session.commit()
    session.refresh(role)

    user = role_service.ensure_default_user(session, role)
    assert user.username == f"role_{role.id}"
    assert user.is_default is True
    assert user.role_id == role.id


def test_ensure_default_user_idempotent(session: SqlSession):
    role = Role(name="测试角色B")
    session.add(role)
    session.commit()
    session.refresh(role)

    u1 = role_service.ensure_default_user(session, role)
    u2 = role_service.ensure_default_user(session, role)
    assert u1.id == u2.id  # 第二次不再创建


def test_ensure_default_user_marks_existing(session: SqlSession):
    """旧 scheme：role_{id} 用户存在但 is_default=False → 标记它为 default。"""
    role = Role(name="测试角色C")
    session.add(role)
    session.commit()
    session.refresh(role)

    # 直接创建一个 username=role_{id} 但 is_default=False 的旧账号
    legacy = User(
        username=f"role_{role.id}",
        password_hash="x",
        role_id=role.id,
        is_default=False,
    )
    session.add(legacy)
    session.commit()

    user = role_service.ensure_default_user(session, role)
    assert user.id == legacy.id
    assert user.is_default is True


def test_ensure_name_unique_passes(session: SqlSession):
    """已存在同名角色 → 再次检查同名同部门应抛 400（注意：因 FK 约束，department_id 必须为 None）。"""
    role = Role(name="财务主管", department_id=None)
    session.add(role)
    session.commit()
    import pytest
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        role_service.ensure_name_unique(session, "财务主管", department_id=None)
    assert exc_info.value.status_code == 400


def test_ensure_name_unique_different_department_ok(session: SqlSession):
    """无部门分类（department_id=None）下的两个「同名」角色共存——验证唯一性按 None 分桶。"""
    role_service.ensure_name_unique(session, "未分类角色", department_id=None)


def test_ensure_name_unique_excludes_self(session: SqlSession):
    """编辑场景：传 exclude_role_id 时同名应允许。"""
    role = Role(name="财务主管", department_id=None, id=1)
    session.add(role)
    session.commit()
    role_service.ensure_name_unique(
        session, "财务主管", department_id=None, exclude_role_id=1
    )  # 不抛


def test_normalize_classification_bottom_up(session: SqlSession):
    """仅提供 department_id → 自动补全 entity_id + segment_id。"""
    seg = BusinessSegment(name="金融板块")
    session.add(seg)
    session.commit()
    session.refresh(seg)
    ent = OrgEntity(name="金融主体", segment_id=seg.id)
    session.add(ent)
    session.commit()
    session.refresh(ent)
    dept = OrgDepartment(name="财务部", entity_id=ent.id)
    session.add(dept)
    session.commit()
    session.refresh(dept)

    s, e, d = role_service.normalize_classification(
        session, None, None, dept.id
    )
    assert s == seg.id
    assert e == ent.id
    assert d == dept.id


def test_normalize_classification_uses_department_entity(
    session: SqlSession,
):
    """当 department_id 提供时，entity_id / segment_id 从部门逐级推算（覆盖任何传入值）。"""
    seg = BusinessSegment(name="板块A")
    session.add(seg)
    session.commit()
    session.refresh(seg)
    ent = OrgEntity(name="主体A", segment_id=seg.id)
    session.add(ent)
    session.commit()
    session.refresh(ent)
    dept = OrgDepartment(name="部门A", entity_id=ent.id)
    session.add(dept)
    session.commit()
    session.refresh(dept)

    # 即便传错的 entity_id，department_id 优先，自动覆盖
    s, e, d = role_service.normalize_classification(
        session, None, 999999, dept.id
    )
    assert d == dept.id
    assert e == ent.id
    assert s == seg.id


def test_to_role_read_with_lookup(session: SqlSession):
    seg = BusinessSegment(name="金融板块")
    session.add(seg)
    session.commit()
    session.refresh(seg)
    role = Role(name="主管", segment_id=seg.id)
    session.add(role)
    session.commit()
    session.refresh(role)

    lookup = role_service.batch_load_org_lookup(session, [role])
    out = role_service.to_role_read(role, lookup)
    assert out.segment_name == "金融板块"
    assert out.default_username == f"role_{role.id}"


def test_batch_load_org_lookup_handles_multiple(session: SqlSession):
    seg1 = BusinessSegment(name="板块1")
    seg2 = BusinessSegment(name="板块2")
    session.add(seg1)
    session.add(seg2)
    session.commit()
    session.refresh(seg1)
    session.refresh(seg2)
    r1 = Role(name="角色1", segment_id=seg1.id)
    r2 = Role(name="角色2", segment_id=seg2.id)
    r3 = Role(name="角色3")  # 无分类
    session.add(r1)
    session.add(r2)
    session.add(r3)
    session.commit()
    session.refresh(r1)
    session.refresh(r2)
    session.refresh(r3)

    lookup = role_service.batch_load_org_lookup(session, [r1, r2, r3])
    assert lookup["segments"] == {seg1.id: "板块1", seg2.id: "板块2"}
    # 单一查询而非 N+1
    assert "default_users" in lookup
    assert "entities" in lookup
    assert "departments" in lookup
    assert "function_tags" in lookup


def test_normalize_classification_rejects_missing_department(session: SqlSession):
    import pytest
    from fastapi import HTTPException

    with pytest.raises(HTTPException):
        role_service.normalize_classification(session, None, None, 99999)


def test_user_display_username_returns_default(session: SqlSession):
    role = Role(name="测试部E")
    session.add(role)
    session.commit()
    session.refresh(role)
    role_service.ensure_default_user(session, role)

    name = role_service.user_display_username(session, role)
    assert name == f"role_{role.id}"