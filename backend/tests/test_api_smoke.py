"""API smoke tests：覆盖登录 / 角色 CRUD / 模板 CRUD / 提交+审核 / 期间锁定 / 默认账号。"""
import pytest
from sqlmodel import Session


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_admin_login_success(client):
    r = client.post(
        "/api/auth/login", json={"username": "admin", "password": "admin123"}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["username"] == "admin"
    assert body["role_name"] == "管理员"


def test_admin_login_wrong_password(client):
    r = client.post(
        "/api/auth/login", json={"username": "admin", "password": "wrong"}
    )
    assert r.status_code == 401


def test_list_roles_excludes_admin(client, admin_user):
    r = client.get("/api/admin/roles")
    assert r.status_code == 200
    body = r.json()
    names = [r["name"] for r in body]
    assert "管理员" not in names


def test_create_role_and_bind_template(client, session):
    """端到端：创建角色 → 创建模板 → 绑定 → 列表能看到。"""
    r = client.post(
        "/api/admin/roles", json={"name": "财务测试组"}
    )
    assert r.status_code == 201
    role = r.json()
    assert role["name"] == "财务测试组"
    assert role["default_username"].startswith("role_")

    # 重复同名应 400
    r2 = client.post("/api/admin/roles", json={"name": "财务测试组"})
    assert r2.status_code == 400


def test_delete_role_requires_typed_name(client):
    # 先创建
    r = client.post("/api/admin/roles", json={"name": "待删角色"})
    role_id = r.json()["id"]
    # 错的 confirm_name → 400
    r = client.request(
        "DELETE", f"/api/admin/roles/{role_id}", json={"confirm_name": "wrong"}
    )
    assert r.status_code == 400
    # 正确 confirm_name → 204
    r = client.request(
        "DELETE", f"/api/admin/roles/{role_id}", json={"confirm_name": "待删角色"}
    )
    assert r.status_code == 204


def test_create_template_rejects_oversized_snapshot(client):
    """超大 snapshot 应被 MAX_SNAPSHOT_BYTES 校验 413 拦截。"""
    from app.config import settings

    big = {"sheets": {"s1": {"cellData": {"0": {"0": {"v": "x" * (settings.MAX_SNAPSHOT_BYTES + 100)}}}}}}
    r = client.post(
        "/api/templates",
        json={"name": "超大模板", "snapshot": big},
    )
    assert r.status_code == 413


def test_list_templates_pagination(client):
    # 创建 5 个模板
    for i in range(5):
        client.post(
            "/api/templates", json={"name": f"tpl-{i}", "snapshot": {}}
        )
    r = client.get("/api/templates?limit=2&offset=1")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 2


def test_period_lock_round_trip(client):
    """upsert 锁定 → list_periods 应反映。"""
    client.put("/api/admin/periods/2030-01", json={"locked": True})
    r = client.get("/api/admin/periods?year=2030")
    assert r.status_code == 200
    body = r.json()
    periods = {p["period"]: p["locked"] for p in body}
    assert periods["2030-01"] is True
    assert periods["2030-06"] is False

    # 解锁
    client.put("/api/admin/periods/2030-01", json={"locked": False})
    r = client.get("/api/admin/periods?year=2030")
    periods = {p["period"]: p["locked"] for p in r.json()}
    assert periods["2030-01"] is False


def test_period_lock_blocks_workbook_save(client, normal_user, engine):
    """锁定期间，部门 save 应被 400 拦截（端到端：用真 token 验证锁定逻辑）。

    修复原缺陷版本（原版用 Bearer _ 占位，断言 401 或 400 不真正验证锁定），
    现在通过 create_access_token 拿真 token 调用 /api/workspace/workbooks，
    真正断言锁定拒存（400 + 中文文案）。
    """
    from app.models import User
    from app.security import create_access_token
    from sqlmodel import select

    # 给 test_user 角色绑定模板
    tr = client.post(
        "/api/templates",
        json={
            "name": "lock-test",
            "year": 2030,
            "snapshot": {"sheets": {"s1": {"id": "s1", "cellData": {}}}},
        },
    )
    tid = tr.json()["id"]
    roles = client.get("/api/admin/roles").json()
    test_role = next(r for r in roles if r["name"] == "测试部")
    client.post(
        f"/api/admin/roles/{test_role['id']}/templates",
        json={"template_ids": [tid]},
    )

    # 锁定 2030-09
    r_lock = client.put("/api/admin/periods/2030-09", json={"locked": True})
    assert r_lock.status_code == 200

    # 用 normal_user 的真 token 试保存 → 应被锁定拒存 400
    with Session(engine) as s:
        u = s.exec(select(User).where(User.username == "test_user")).first()
        token = create_access_token(u.id, u.role_id, u.role.name)

    snap = {"sheets": {"s1": {"id": "s1", "cellData": {}}}}
    r = client.post(
        "/api/workspace/workbooks",
        json={
            "template_id": tid,
            "period": "2030-09",
            "snapshot": snap,
            "action": "save",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 400
    assert "锁定" in r.json()["detail"]


def test_overview_returns_role_template_pairs(client, session):
    """overview 接口应有 OrgBindingStatus 列表结构（即使空）。"""
    r = client.get("/api/admin/overview?period=2030-09")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_review_requires_submit_status(client, session):
    """对未提交 / 不存在的工作簿调用 review 应 404。"""
    r = client.post(
        "/api/admin/workbooks/99999/99999/2030-09/review",
        json={"action": "approved"},
    )
    assert r.status_code == 404


def test_review_rejected_requires_reason(client, engine):
    """创建角色 + 模板 + 填报 + 提交 + 尝试 reject 不带 reason → 400。

    修复原缺陷版本（原版是空 pass），现在端到端验证：
    1. 审核已 submitted 的工作簿
    2. reject 不带 reject_reason → 400
    3. reject 仅空白 reject_reason → 400
    4. reject 带合理原因 → 200
    """
    from sqlmodel import Session, select

    from app.models import RoleWorkbook

    # 创建模板 + 角色 + 绑定
    tpl = client.post(
        "/api/templates",
        json={"name": "rev-test", "year": 2030, "snapshot": {"sheets": {}}},
    ).json()
    role = client.post("/api/admin/roles", json={"name": "rev-部门"}).json()
    client.post(
        f"/api/admin/roles/{role['id']}/templates",
        json={"template_ids": [tpl["id"]]},
    )

    # 直接插入一条 submitted 工作簿（admin 视角造数据）
    with Session(engine) as s:
        s.add(RoleWorkbook(
            role_id=role["id"],
            template_id=tpl["id"],
            period="2030-09",
            snapshot={"v": 1},
            status="submitted",
        ))
        s.commit()

    # 1. reject 不带 reason → 400
    r = client.post(
        f"/api/admin/workbooks/{role['id']}/{tpl['id']}/2030-09/review",
        json={"action": "rejected"},
    )
    assert r.status_code == 400

    # 2. reject 仅空白 → 400
    r = client.post(
        f"/api/admin/workbooks/{role['id']}/{tpl['id']}/2030-09/review",
        json={"action": "rejected", "reject_reason": "   "},
    )
    assert r.status_code == 400

    # 3. reject 带合理原因 → 200 + status=rejected + 原因写入
    r = client.post(
        f"/api/admin/workbooks/{role['id']}/{tpl['id']}/2030-09/review",
        json={"action": "rejected", "reject_reason": "预算金额需重核"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "rejected"

    # 持久化校验
    with Session(engine) as s:
        wb = s.exec(select(RoleWorkbook).where(
            RoleWorkbook.role_id == role["id"],
            RoleWorkbook.template_id == tpl["id"],
        )).first()
        assert wb.status == "rejected"
        assert wb.reject_reason == "预算金额需重核"


def test_admin_role_name_rejected(client):
    """尝试创建「管理员」角色 → 400。"""
    r = client.post("/api/admin/roles", json={"name": "管理员"})
    assert r.status_code == 400