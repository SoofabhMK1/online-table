"""template router 补盲测试。

覆盖：
- GET /templates/{id}：详情 / 404
- PUT /templates/{id}：改名 / 改 snapshot / 改标签字段 / content_numeric / 404
- POST /templates/{id}/duplicate：跨年复制（默认 copy_bindings=True）/ 不复制绑定 / 404
- POST /templates/{id}/archive：归档成功 / 重复归档 400 / 归档后从 active 列表消失但 archived 列表可见
- POST /templates/{id}/unarchive：恢复成功 / 未归档恢复 400
- 归档后不可绑定新角色
"""
import pytest


def _create(client, **kwargs):
    body = {
        "name": "测试模板",
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


class TestGetTemplate:
    def test_get_returns_full_detail(self, client):
        """GET /templates/{id} 应返回完整 snapshot。"""
        snap = {"sheets": {"s1": {"cellData": {"0": {"0": {"v": "hello"}}}}}}
        created = _create(client, name="详情模板", snapshot=snap)

        r = client.get(f"/api/templates/{created['id']}")
        assert r.status_code == 200
        body = r.json()
        assert body["id"] == created["id"]
        assert body["name"] == "详情模板"
        assert body["snapshot"] == snap
        assert body["row_label_cols"] == 0
        assert body["archived"] is False

    def test_get_nonexistent_returns_404(self, client):
        r = client.get("/api/templates/99999")
        assert r.status_code == 404


class TestUpdateTemplate:
    def test_update_name(self, client):
        created = _create(client, name="原名")
        r = client.put(
            f"/api/templates/{created['id']}",
            json={"name": "新名"},
        )
        assert r.status_code == 200
        assert r.json()["name"] == "新名"

    def test_update_snapshot(self, client):
        """更新 snapshot 应实际写库。"""
        created = _create(client, snapshot={"v": 1})
        new_snap = {"sheets": {"new": {"cellData": {"0": {"0": {"v": "X"}}}}}}
        r = client.put(
            f"/api/templates/{created['id']}", json={"snapshot": new_snap}
        )
        assert r.status_code == 200
        # 重新 GET 验证持久化
        r2 = client.get(f"/api/templates/{created['id']}")
        assert r2.json()["snapshot"] == new_snap

    def test_update_label_fields(self, client):
        """更新 row_label_cols / col_label_rows / content_* / content_numeric。"""
        created = _create(
            client,
            row_label_cols=0,
            col_label_rows=0,
            content_rows=1,
            content_cols=1,
            content_numeric=False,
        )
        r = client.put(
            f"/api/templates/{created['id']}",
            json={
                "row_label_cols": 2,
                "col_label_rows": 1,
                "content_rows": 5,
                "content_cols": 3,
                "content_numeric": True,
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert body["row_label_cols"] == 2
        assert body["col_label_rows"] == 1
        assert body["content_rows"] == 5
        assert body["content_cols"] == 3
        assert body["content_numeric"] is True

    def test_update_year(self, client):
        """更新 year 字段。"""
        created = _create(client, year=2026)
        r = client.put(
            f"/api/templates/{created['id']}", json={"year": 2027}
        )
        assert r.status_code == 200
        assert r.json()["year"] == 2027

    def test_update_nonexistent_returns_404(self, client):
        r = client.put("/api/templates/99999", json={"name": "x"})
        assert r.status_code == 404

    def test_update_oversized_snapshot_rejected_413(self, client):
        """超大 snapshot → 413。"""
        from app.config import settings

        big = {
            "sheets": {
                "s1": {"cellData": {"0": {"0": {"v": "x" * (settings.MAX_SNAPSHOT_BYTES + 100)}}}}
            }
        }
        created = _create(client)
        r = client.put(f"/api/templates/{created['id']}", json={"snapshot": big})
        assert r.status_code == 413


class TestDuplicateTemplate:
    def test_duplicate_to_new_year_default_copies_bindings(self, client):
        """默认 copy_bindings=True，复制到新年份并保留角色绑定。"""
        # 建模板 + 绑定角色
        created = _create(client, name="原模板", year=2026)
        role = client.post("/api/admin/roles", json={"name": "复制角色"}).json()
        client.post(
            f"/api/admin/roles/{role['id']}/templates",
            json={"template_ids": [created["id"]]},
        )

        r = client.post(
            f"/api/templates/{created['id']}/duplicate", json={"year": 2027}
        )
        assert r.status_code == 201
        body = r.json()
        assert body["name"] == "原模板 (2027)"
        assert body["year"] == 2027
        # 标签字段保留
        assert body["row_label_cols"] == created["row_label_cols"]
        assert body["col_label_rows"] == created["col_label_rows"]
        assert body["content_rows"] == created["content_rows"]
        assert body["content_cols"] == created["content_cols"]
        assert body["content_numeric"] == created["content_numeric"]
        assert body["snapshot"] == created["snapshot"]

        # 验证绑定已复制
        bindings = client.get(
            f"/api/admin/roles/{role['id']}/templates"
        ).json()
        assert body["id"] in bindings

    def test_duplicate_with_copy_bindings_false(self, client):
        """copy_bindings=False，新模板不应有绑定。"""
        created = _create(client, name="不复制", year=2026)
        role = client.post("/api/admin/roles", json={"name": "不复制角色"}).json()
        client.post(
            f"/api/admin/roles/{role['id']}/templates",
            json={"template_ids": [created["id"]]},
        )

        r = client.post(
            f"/api/templates/{created['id']}/duplicate",
            json={"year": 2027, "copy_bindings": False},
        )
        assert r.status_code == 201
        new_id = r.json()["id"]

        # 验证新模板未绑定
        bindings = client.get(
            f"/api/admin/roles/{role['id']}/templates"
        ).json()
        assert new_id not in bindings
        # 原模板仍绑定
        assert created["id"] in bindings

    def test_duplicate_nonexistent_returns_404(self, client):
        r = client.post(
            "/api/templates/99999/duplicate", json={"year": 2027}
        )
        assert r.status_code == 404

    def test_duplicate_creates_independent_template(self, client):
        """复制出来的模板是独立对象（修改不影响原模板）。"""
        created = _create(client, name="独立模板", year=2026)
        r = client.post(
            f"/api/templates/{created['id']}/duplicate", json={"year": 2027}
        )
        new_id = r.json()["id"]
        assert new_id != created["id"]

        # 修改原模板
        r_put = client.put(
            f"/api/templates/{created['id']}", json={"name": "原模板改名"}
        )
        assert r_put.status_code == 200
        # 新模板不受影响
        r_get = client.get(f"/api/templates/{new_id}")
        assert r_get.json()["name"] == "独立模板 (2027)"


class TestArchiveTemplate:
    def test_archive_hides_from_active_list(self, client):
        """归档后从 active 列表消失。"""
        created = _create(client, name="将归档")
        r = client.post(f"/api/templates/{created['id']}/archive")
        assert r.status_code == 200
        assert r.json()["archived"] is True
        assert r.json()["archived_at"] is not None

        # 默认列表（未归档）应不包含
        active = client.get("/api/templates").json()
        assert all(t["id"] != created["id"] for t in active)

        # archived=true 列表应包含
        archived = client.get("/api/templates?archived=true").json()
        assert any(t["id"] == created["id"] for t in archived)

    def test_archive_twice_returns_400(self, client):
        """重复归档 → 400。"""
        created = _create(client)
        client.post(f"/api/templates/{created['id']}/archive")
        r2 = client.post(f"/api/templates/{created['id']}/archive")
        assert r2.status_code == 400
        assert "已归档" in r2.json()["detail"]

    def test_archive_nonexistent_returns_404(self, client):
        r = client.post("/api/templates/99999/archive")
        assert r.status_code == 404

    def test_unarchive_restores(self, client):
        """归档 → 恢复 → 在 active 列表重现。"""
        created = _create(client, name="归档又恢复")
        client.post(f"/api/templates/{created['id']}/archive")
        r = client.post(f"/api/templates/{created['id']}/unarchive")
        assert r.status_code == 200
        assert r.json()["archived"] is False
        assert r.json()["archived_at"] is None

        active = client.get("/api/templates").json()
        assert any(t["id"] == created["id"] for t in active)

    def test_unarchive_not_archived_returns_400(self, client):
        """未归档恢复 → 400。"""
        created = _create(client)
        r = client.post(f"/api/templates/{created['id']}/unarchive")
        assert r.status_code == 400
        assert "未归档" in r.json()["detail"]

    def test_archived_template_cannot_be_bound(self, client):
        """归档模板绑定新角色 → 400（AGENTS.md 关键决策：归档后不可绑定）。"""
        created = _create(client)
        client.post(f"/api/templates/{created['id']}/archive")

        role = client.post("/api/admin/roles", json={"name": "尝试绑定"}).json()
        r = client.post(
            f"/api/admin/roles/{role['id']}/templates",
            json={"template_ids": [created["id"]]},
        )
        assert r.status_code == 400
        assert "已归档" in r.json()["detail"]

    def test_existing_binding_survives_archive(self, client):
        """归档前已绑定的角色在归档后仍保留（AGENTS.md 关键决策：保留历史数据）。"""
        created = _create(client, name="绑定后归档")
        role = client.post("/api/admin/roles", json={"name": "保留角色"}).json()
        client.post(
            f"/api/admin/roles/{role['id']}/templates",
            json={"template_ids": [created["id"]]},
        )

        client.post(f"/api/templates/{created['id']}/archive")

        # 仍能查到该绑定
        bindings = client.get(
            f"/api/admin/roles/{role['id']}/templates"
        ).json()
        assert created["id"] in bindings