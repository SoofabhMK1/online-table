"""workbook router 补盲测试。

覆盖：
- GET /admin/workbooks?period=YYYY-MM[&status=]：列出某周期填报记录 / 按状态筛选 / 排序
- GET /admin/workbooks/{role}/{template}/{period}：预览快照 / 不存在 404
- POST /admin/workbooks/{role}/{template}/{period}/review：完整状态机（draft → submitted → approved / rejected）
  覆盖 happy path 与各种边界
- GET /admin/overview?period=YYYY-MM：返回 OrgBindingStatus 列表结构
"""
import pytest
from sqlmodel import Session, select

from app.models import RoleWorkbook


def _create_template(client, name="wb测试模板", **kwargs):
    body = {
        "name": name,
        "year": 2026,
        "snapshot": {"sheets": {}},
        "row_label_cols": 0,
        "col_label_rows": 0,
        "content_rows": 1,
        "content_cols": 1,
        "content_numeric": False,
    }
    body.update(kwargs)
    return client.post("/api/templates", json=body).json()


class TestListAdminWorkbooks:
    def test_empty_list_when_no_workbooks(self, client):
        r = client.get("/api/admin/workbooks?period=2030-01")
        assert r.status_code == 200
        assert r.json() == []

    def test_lists_workbook_with_role_and_template(self, client, engine, admin_user):
        """admin 创建模板 + 角色 → 用户 save 后 admin 列表能拉到。"""
        tpl = _create_template(client, name="WB列表测试")
        role = client.post("/api/admin/roles", json={"name": "WB测试部"}).json()
        client.post(
            f"/api/admin/roles/{role['id']}/templates",
            json={"template_ids": [tpl["id"]]},
        )

        # 直接造一份 RoleWorkbook（admin 视角无需真实 save）
        with Session(engine) as s:
            s.add(RoleWorkbook(
                role_id=role["id"],
                template_id=tpl["id"],
                period="2026-08",
                snapshot={"v": 1},
            ))
            s.commit()

        r = client.get("/api/admin/workbooks?period=2026-08")
        assert r.status_code == 200
        body = r.json()
        assert len(body) == 1
        assert body[0]["role_name"] == "WB测试部"
        assert body[0]["template_name"] == "WB列表测试"
        assert body[0]["period"] == "2026-08"
        assert body[0]["status"] == "draft"

    def test_filter_by_status(self, client, engine, admin_user):
        """按 status 筛选（只返回对应状态）。"""
        tpl = _create_template(client, name="筛选测试")
        role = client.post("/api/admin/roles", json={"name": "筛选部"}).json()
        client.post(
            f"/api/admin/roles/{role['id']}/templates",
            json={"template_ids": [tpl["id"]]},
        )
        with Session(engine) as s:
            s.add(RoleWorkbook(role_id=role["id"], template_id=tpl["id"], period="2026-09",
                                snapshot={}, status="draft"))
            s.add(RoleWorkbook(role_id=role["id"], template_id=tpl["id"], period="2026-10",
                                snapshot={}, status="submitted", submit_at=None))
            s.commit()

        r_draft = client.get("/api/admin/workbooks?period=2026-09&status=draft")
        assert r_draft.status_code == 200
        assert len(r_draft.json()) == 1
        assert r_draft.json()[0]["status"] == "draft"

        r_submitted = client.get("/api/admin/workbooks?period=2026-10&status=submitted")
        assert len(r_submitted.json()) == 1
        assert r_submitted.json()[0]["status"] == "submitted"

        r_approved = client.get("/api/admin/workbooks?period=2026-09&status=approved")
        assert r_approved.json() == []


class TestGetRoleWorkbookDetail:
    def test_returns_snapshot(self, client, engine, admin_user):
        tpl = _create_template(client)
        role = client.post("/api/admin/roles", json={"name": "预览部"}).json()
        snap = {"sheets": {"s1": {"cellData": {"0": {"0": {"v": "预览值"}}}}}}
        with Session(engine) as s:
            s.add(RoleWorkbook(role_id=role["id"], template_id=tpl["id"],
                                period="2026-08", snapshot=snap, status="submitted"))
            s.commit()

        r = client.get(f"/api/admin/workbooks/{role['id']}/{tpl['id']}/2026-08")
        assert r.status_code == 200
        body = r.json()
        assert body["role_name"] == "预览部"
        assert body["template_name"] == tpl["name"]
        assert body["snapshot"] == snap
        assert body["status"] == "submitted"

    def test_nonexistent_returns_404(self, client):
        r = client.get("/api/admin/workbooks/99999/99999/2030-01")
        assert r.status_code == 404


class TestReviewStateMachine:
    """完整审核状态机：draft → submitted → approved / rejected → (修改 → submitted)"""

    def _setup_workbook(self, client, engine, admin_user, status="submitted"):
        tpl = _create_template(client, name="审审核模板")
        role = client.post("/api/admin/roles", json={"name": "审审核部"}).json()
        with Session(engine) as s:
            s.add(RoleWorkbook(
                role_id=role["id"], template_id=tpl["id"], period="2026-08",
                snapshot={"v": 1}, status=status,
            ))
            s.commit()
        return role["id"], tpl["id"]

    def test_approve_submitted(self, client, engine, admin_user):
        rid, tid = self._setup_workbook(client, engine, admin_user, "submitted")
        r = client.post(
            f"/api/admin/workbooks/{rid}/{tid}/2026-08/review",
            json={"action": "approved"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "approved"

        # 持久化验证
        with Session(engine) as s:
            wb = s.exec(select(RoleWorkbook).where(
                RoleWorkbook.role_id == rid, RoleWorkbook.template_id == tid
            )).first()
            assert wb.status == "approved"
            assert wb.review_at is not None
            assert wb.reject_reason is None

    def test_reject_with_reason(self, client, engine, admin_user):
        rid, tid = self._setup_workbook(client, engine, admin_user, "submitted")
        r = client.post(
            f"/api/admin/workbooks/{rid}/{tid}/2026-08/review",
            json={"action": "rejected", "reject_reason": "预算金额需重核"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "rejected"

        with Session(engine) as s:
            wb = s.exec(select(RoleWorkbook).where(
                RoleWorkbook.role_id == rid, RoleWorkbook.template_id == tid
            )).first()
            assert wb.status == "rejected"
            assert wb.reject_reason == "预算金额需重核"

    def test_reject_without_reason_returns_400(self, client, engine, admin_user):
        rid, tid = self._setup_workbook(client, engine, admin_user, "submitted")
        r = client.post(
            f"/api/admin/workbooks/{rid}/{tid}/2026-08/review",
            json={"action": "rejected"},
        )
        assert r.status_code == 400

    def test_reject_with_empty_reason_returns_400(self, client, engine, admin_user):
        rid, tid = self._setup_workbook(client, engine, admin_user, "submitted")
        r = client.post(
            f"/api/admin/workbooks/{rid}/{tid}/2026-08/review",
            json={"action": "rejected", "reject_reason": "   "},
        )
        assert r.status_code == 400

    def test_review_draft_returns_400(self, client, engine, admin_user):
        """草稿状态不能审 → 400。"""
        rid, tid = self._setup_workbook(client, engine, admin_user, "draft")
        r = client.post(
            f"/api/admin/workbooks/{rid}/{tid}/2026-08/review",
            json={"action": "approved"},
        )
        assert r.status_code == 400
        assert "已提交" in r.json()["detail"]

    def test_review_approved_returns_400(self, client, engine, admin_user):
        """已通过的不能再审。"""
        rid, tid = self._setup_workbook(client, engine, admin_user, "approved")
        r = client.post(
            f"/api/admin/workbooks/{rid}/{tid}/2026-08/review",
            json={"action": "rejected", "reject_reason": "再退一次"},
        )
        assert r.status_code == 400

    def test_re_review_after_resubmit(self, client, engine, admin_user):
        """rejected → 修改 → submit → 再审 → approved 完整链路。"""
        rid, tid = self._setup_workbook(client, engine, admin_user, "submitted")
        # 退回
        r1 = client.post(
            f"/api/admin/workbooks/{rid}/{tid}/2026-08/review",
            json={"action": "rejected", "reject_reason": "需修改"},
        )
        assert r1.status_code == 200

        # 修改：直接改 status 回 submitted（模拟用户重新提交）
        with Session(engine) as s:
            wb = s.exec(select(RoleWorkbook).where(
                RoleWorkbook.role_id == rid, RoleWorkbook.template_id == tid
            )).first()
            wb.status = "submitted"
            wb.reject_reason = None
            s.add(wb)
            s.commit()

        # 再审通过
        r2 = client.post(
            f"/api/admin/workbooks/{rid}/{tid}/2026-08/review",
            json={"action": "approved"},
        )
        assert r2.status_code == 200
        assert r2.json()["status"] == "approved"


class TestOverview:
    def test_overview_returns_role_template_pairs(self, client, admin_user):
        """overview 应返回 role × template 的扁平列表结构（含组织分类）。"""
        tpl = _create_template(client, name="总览测试")
        role = client.post("/api/admin/roles", json={"name": "总览部"}).json()
        client.post(
            f"/api/admin/roles/{role['id']}/templates",
            json={"template_ids": [tpl["id"]]},
        )

        r = client.get("/api/admin/overview?period=2026-08")
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body, list)
        # 找到我们的组合
        matched = [
            x for x in body
            if x["role_id"] == role["id"] and x["template_id"] == tpl["id"]
        ]
        assert len(matched) == 1
        item = matched[0]
        assert item["role_name"] == "总览部"
        assert item["template_name"] == "总览测试"
        assert item["status"] == "none"  # 未填报

    def test_overview_with_org_classification(self, client):
        """带组织分类的角色应正确展示 segment/entity/department 名。"""
        seg = client.post("/api/admin/org/segments", json={"name": "总览板块"}).json()
        ent = client.post(
            "/api/admin/org/entities", json={"name": "总览主体", "segment_id": seg["id"]}
        ).json()
        dept = client.post(
            "/api/admin/org/departments",
            json={"name": "总览部门", "entity_id": ent["id"]},
        ).json()
        tpl = _create_template(client)
        role = client.post(
            "/api/admin/roles",
            json={"name": "总览分类角色", "department_id": dept["id"]},
        ).json()
        client.post(
            f"/api/admin/roles/{role['id']}/templates",
            json={"template_ids": [tpl["id"]]},
        )

        r = client.get("/api/admin/overview?period=2026-08")
        item = next(x for x in r.json()
                     if x["role_id"] == role["id"] and x["template_id"] == tpl["id"])
        assert item["segment_name"] == "总览板块"
        assert item["entity_name"] == "总览主体"
        assert item["department_name"] == "总览部门"