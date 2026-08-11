"""role router 补盲测试。

覆盖：
- PUT /admin/roles/{id}：改名 / 改分类 / 改名同步默认账号 username 不变 / 改名冲突 / 管理员角色不可改
- POST /admin/roles/{id}/reset-password：重置密码后新密码可登 / 旧密码失效 / 管理员不可重置
- DELETE /admin/roles/{id}：confirm_name 错 → 400 / 管理员不可删 / 有非默认用户 → 400
  / 删除级联清理模板绑定 + 填报历史 + 默认账号
- 跨部门同名角色允许 / 同部门同名不允许
"""
import pytest
from sqlmodel import Session, select

from app.models import (
    Role,
    RoleTemplateMapping,
    RoleWorkbook,
    Template,
    User,
)
from app.security import hash_password, verify_password


def _create_role(client, name="测试角色A", **kwargs):
    return client.post("/api/admin/roles", json={"name": name, **kwargs}).json()


class TestUpdateRole:
    def test_rename_role_succeeds(self, client):
        """改名成功 + 默认账号 username 不变（自动生成与角色名解耦）。"""
        created = _create_role(client, "原始名")
        original_default_username = created["default_username"]
        assert original_default_username.startswith("role_")

        r = client.put(
            f"/api/admin/roles/{created['id']}", json={"name": "改名后"}
        )
        assert r.status_code == 200
        body = r.json()
        assert body["name"] == "改名后"
        # 改名不应改变默认账号 username（与角色名解耦）
        assert body["default_username"] == original_default_username

    def test_rename_role_conflict_returns_400(self, client):
        """改名冲突（同部门已有同名）→ 400。"""
        _create_role(client, "角色1")
        created2 = _create_role(client, "角色2")

        r = client.put(
            f"/api/admin/roles/{created2['id']}", json={"name": "角色1"}
        )
        assert r.status_code == 400
        assert "已存在" in r.json()["detail"]

    def test_rename_role_to_admin_name_rejected(self, client):
        """改名为「管理员」→ 400（系统保留角色名）。"""
        created = _create_role(client, "待改名")
        r = client.put(
            f"/api/admin/roles/{created['id']}", json={"name": "管理员"}
        )
        assert r.status_code == 400
        assert "保留" in r.json()["detail"]

    def test_update_role_classification(self, client):
        """改分类（部门）成功，自动补全 segment/entity。"""
        # 先建组织
        seg = client.post("/api/admin/org/segments", json={"name": "科技板块"}).json()
        ent = client.post(
            "/api/admin/org/entities", json={"name": "科技主体", "segment_id": seg["id"]}
        ).json()
        dept = client.post(
            "/api/admin/org/departments",
            json={"name": "研发部", "entity_id": ent["id"]},
        ).json()

        created = _create_role(client, "研发角色")
        # 改部门 → 应自动补齐 entity + segment
        r = client.put(
            f"/api/admin/roles/{created['id']}",
            json={"department_id": dept["id"]},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["department_id"] == dept["id"]
        assert body["entity_id"] == ent["id"]
        assert body["segment_id"] == seg["id"]

    def test_update_nonexistent_role_returns_404(self, client):
        """不存在的角色 ID → 404。"""
        r = client.put("/api/admin/roles/99999", json={"name": "x"})
        assert r.status_code == 404

    def test_admin_role_not_editable(self, client, admin_user):
        """「管理员」角色 → 400 不可编辑。"""
        admin_role = client.get("/api/admin/roles").json()
        # 管理员不在列表中（list 过滤），直接通过依赖校验的 role 名做断言
        r = client.put(f"/api/admin/roles/{admin_user.role_id}", json={"name": "新名"})
        assert r.status_code == 400
        assert "不可编辑" in r.json()["detail"]


class TestResetPassword:
    def test_reset_password_changes_hash(self, client, engine):
        """重置密码后默认账号 password_hash 应更新为 DEFAULT_USER_PASSWORD。"""
        from app.config import settings

        created = _create_role(client, "重置角色")
        username = created["default_username"]

        # 先用 random password 覆盖默认密码
        with Session(engine) as s:
            u = s.exec(select(User).where(User.username == username)).first()
            u.password_hash = hash_password("custom123")
            s.add(u)
            s.commit()

        # 验证旧 hash 不等于 DEFAULT_USER_PASSWORD
        with Session(engine) as s:
            u = s.exec(select(User).where(User.username == username)).first()
            assert verify_password(settings.DEFAULT_USER_PASSWORD, u.password_hash) is False

        # 重置
        r = client.post(f"/api/admin/roles/{created['id']}/reset-password")
        assert r.status_code == 200
        body = r.json()
        assert body["username"] == username
        assert "重置" in body["message"]

        # DB 中 hash 应匹配 DEFAULT_USER_PASSWORD
        with Session(engine) as s:
            u = s.exec(select(User).where(User.username == username)).first()
            assert verify_password(settings.DEFAULT_USER_PASSWORD, u.password_hash) is True

        # 旧密码应失效
        r_old = client.post(
            "/api/auth/login", json={"username": username, "password": "custom123"}
        )
        assert r_old.status_code == 401

        # DEFAULT_USER_PASSWORD 可登录
        r_new = client.post(
            "/api/auth/login",
            json={"username": username, "password": settings.DEFAULT_USER_PASSWORD},
        )
        assert r_new.status_code == 200

    def test_admin_role_reset_rejected(self, client, admin_user):
        """管理员角色不可重置密码 → 400。"""
        r = client.post(f"/api/admin/roles/{admin_user.role_id}/reset-password")
        assert r.status_code == 400
        assert "不可重置" in r.json()["detail"]

    def test_reset_nonexistent_role_returns_404(self, client):
        """不存在的角色 → 404。"""
        r = client.post("/api/admin/roles/99999/reset-password")
        assert r.status_code == 404


class TestDeleteRole:
    def test_delete_role_wrong_confirm_returns_400(self, client):
        """错 confirm_name → 400。"""
        created = _create_role(client, "待删")
        r = client.request(
            "DELETE", f"/api/admin/roles/{created['id']}", json={"confirm_name": "错名"}
        )
        assert r.status_code == 400
        assert "不一致" in r.json()["detail"]

    def test_delete_role_success(self, client):
        """正确 confirm_name → 204。"""
        created = _create_role(client, "将删")
        r = client.request(
            "DELETE", f"/api/admin/roles/{created['id']}", json={"confirm_name": "将删"}
        )
        assert r.status_code == 204

        # 列表中应不再有
        roles = client.get("/api/admin/roles").json()
        assert all(r["id"] != created["id"] for r in roles)

    def test_admin_role_not_deletable(self, client, admin_user):
        """管理员角色不可删 → 400。"""
        r = client.request(
            "DELETE",
            f"/api/admin/roles/{admin_user.role_id}",
            json={"confirm_name": "管理员"},
        )
        assert r.status_code == 400
        assert "不可删除" in r.json()["detail"]

    def test_delete_role_with_non_default_user_rejected(
        self, client, engine, normal_user
    ):
        """角色下存在非默认用户 → 400 拒绝删除。"""
        created = _create_role(client, "占位角色")
        # normal_user 角色的用户不是「测试部」；我们通过 session 直接关联一个新角色
        # 简单做法：直接添加一个 is_default=False 的 user 关联到该角色
        with Session(engine) as s:
            s.add(User(
                username="extra_user",
                password_hash=hash_password("x123456"),
                role_id=created["id"],
                is_default=False,
            ))
            s.commit()

        r = client.request(
            "DELETE", f"/api/admin/roles/{created['id']}", json={"confirm_name": "占位角色"}
        )
        assert r.status_code == 400
        assert "用户" in r.json()["detail"]

    def test_delete_cascades_template_bindings_and_workbooks(
        self, client, engine, admin_user
    ):
        """删除角色应级联清理其 role_template_mapping + role_workbooks + 默认账号。"""
        created = _create_role(client, "级联角色")
        role_id = created["id"]

        # 创建模板 + 绑定 + 填报记录
        tpl = client.post(
            "/api/templates",
            json={"name": "级联模板", "snapshot": {}, "year": 2026},
        ).json()
        client.post(
            f"/api/admin/roles/{role_id}/templates",
            json={"template_ids": [tpl["id"]]},
        )
        # 直接写一条 RoleWorkbook
        with Session(engine) as s:
            s.add(RoleWorkbook(
                role_id=role_id,
                template_id=tpl["id"],
                period="2026-01",
                snapshot={"v": 1},
            ))
            s.commit()

        # 删除角色
        r = client.request(
            "DELETE", f"/api/admin/roles/{role_id}", json={"confirm_name": "级联角色"}
        )
        assert r.status_code == 204

        # 验证级联清理
        with Session(engine) as s:
            assert s.get(Role, role_id) is None
            assert s.exec(
                select(RoleTemplateMapping).where(RoleTemplateMapping.role_id == role_id)
            ).first() is None
            assert s.exec(
                select(RoleWorkbook).where(RoleWorkbook.role_id == role_id)
            ).first() is None
            # 默认账号也被删除
            assert s.exec(
                select(User).where(User.role_id == role_id)
            ).first() is None

        # 模板本身保留
        with Session(engine) as s:
            assert s.get(Template, tpl["id"]) is not None


class TestRoleNameCrossDepartment:
    def test_same_name_in_different_departments_allowed(self, client):
        """不同部门可同名（AGENTS.md 关键决策）。"""
        # 建两个部门
        seg = client.post("/api/admin/org/segments", json={"name": "业务板块A"}).json()
        ent = client.post(
            "/api/admin/org/entities", json={"name": "主体A", "segment_id": seg["id"]}
        ).json()
        dept1 = client.post(
            "/api/admin/org/departments", json={"name": "部门1", "entity_id": ent["id"]}
        ).json()
        dept2 = client.post(
            "/api/admin/org/departments", json={"name": "部门2", "entity_id": ent["id"]}
        ).json()

        # 同名「财务主管」分属不同部门都应 201
        r1 = client.post(
            "/api/admin/roles",
            json={"name": "财务主管", "department_id": dept1["id"]},
        )
        r2 = client.post(
            "/api/admin/roles",
            json={"name": "财务主管", "department_id": dept2["id"]},
        )
        assert r1.status_code == 201
        assert r2.status_code == 201

    def test_same_name_in_same_department_rejected(self, client):
        """同部门内同名 → 400。"""
        r1 = client.post("/api/admin/roles", json={"name": "财务主管"})
        r2 = client.post("/api/admin/roles", json={"name": "财务主管"})
        assert r1.status_code == 201
        assert r2.status_code == 400