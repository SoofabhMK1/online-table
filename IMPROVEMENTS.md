# 改进建议清单

> 5 阶段测试期间识别的可改进项，按严重度排序。
> 每项说明：现象 → 根因 → 建议修复 → 工作量估计。
> 业务代码 0 改动（仅测试基础设施已加固），本清单供后续迭代时参考。

---

## 🟠 高（影响测试可靠性，已修）

### ✅ IMP-01 e2e_change_password 清理吞错 → 已修
- **现象**：原 `catch {}` 静默吞错，导致 op1 用户改名后未还原，后续 e2e 找不到 op1。
- **修复**（`frontend/e2e_change_password.mjs`）：API + SQL 双层兜底 + 显式 `throw`。
- **状态**：✅ 阶段 2 已修。

### ✅ IMP-02 conftest `_StubUser` 跨 session `InvalidRequestError` → 已修
- **现象**：`get_current_user` override 持有 fixture session 创建的 User 对象，路由内新 session 调用 `session.add(obj)` 触发 "already attached to session"。
- **修复**（`backend/tests/conftest.py`）：`expire_on_commit=False` + 关闭时 `expunge_all()`。
- **状态**：✅ 阶段 1 已修。

---

## 🟡 中（业务代码 / 测试脚本可改进）

### IMP-03 e2e.mjs cleanup `axios.delete` 模板无 DELETE 路由
- **现象**：`axios.delete(\`/api/templates/{id}\`)` 返回 405（无 DELETE 路由），但 `.catch(() => {})` 静默吞错 → 模板累积在 DB 中。
- **建议**：改用 `axios.post(\`/api/templates/{id}/archive\`)`（已存在），cleanup 改 archive。
- **工作量**：1 行代码。
- **影响文件**：`frontend/e2e.mjs` line 137。

### IMP-04 `PUT /api/admin/periods/{period}` path 段不校验月份格式
- **现象**：`PUT /api/admin/periods/2030-13` 月份 13 不存在但返回 200（仅业务层 schema 校验 body 字段，path 段未用 `pattern=PERIOD_PATTERN`）。
- **建议**：在 `routers/admin.py` 的 `upsert_period_lock` 端点参数加 `Path(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$")`。
- **工作量**：1 行代码。
- **影响文件**：`backend/app/routers/admin.py` line 740（`@router.put("/periods/{period}")`）。

### IMP-05 e2e.mjs 依赖 EmptyState「新建模板」按钮
- **现象**：当 `templates.length > 0` 时 EmptyState 不显示「新建模板」按钮（仅顶部按钮可见），e2e.mjs 中 `await page.click('.ant-btn-primary')` 会因依赖 DB 状态失败。
- **建议**：e2e.mjs 改用顶部「新建模板」按钮（page.getByText / click by text 找「新建模板」），不依赖 EmptyState action。
- **工作量**：3-5 行代码。
- **影响文件**：`frontend/e2e.mjs` line 26。

### IMP-06 antd v6 DatePicker `picker="month"` 不响应 `native setter + input event`
- **现象**：通过 page.evaluate 用 `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set` 设置 input.value + dispatch 'input' 事件不能触发 antd DatePicker onChange。
- **建议（UI 测试侧）**：用 puppeteer `page.click('.ant-picker-input')` 打开弹层 + `page.keyboard.press('ArrowRight')` 或点 `.ant-picker-cell-inner` 选月。
- **建议（业务侧）**：如需支持程序化设置，可在 antd DatePicker 外包一层受控 + onChange 显式触发。
- **工作量**：UI 测试侧重写 helper，1-2 小时。
- **影响文件**：`frontend/e2e_*.mjs` 所有用 DatePicker 的地方。

### IMP-07 antd InputNumber 受控 value prop 不同步 React state
- **现象**：antd InputNumber 是 `rc-input-number` 实现，`value` 是受控 prop。直接 `setter.call(input, '2035')` 改 DOM value 不触发 onChange。
- **建议（UI 测试侧）**：focus input + 用 `page.keyboard.press('ArrowUp')` 触发 antd InputNumber 的 +1 行为（监听 keyboard 事件）。
- **影响文件**：`frontend/e2e_duplicate.mjs`（已用此方法 work）、`frontend/e2e_periods_ui.mjs`。

---

## 🟡 中（antd v6 兼容要点 — 未来开发必看）

> 这些不是「待修 bug」而是「前端开发 + UI 测试必须知道的事实」。详细见 `docs/DEVELOPMENT_NOTES.md`。

### IMP-08 antd v6 Modal 嵌套 + UniverSheet 工具栏
- **现象**：`OverviewPage` 的预览 Modal 内嵌 `UniverSheet` 组件，UniverSheet 有自己的 toolbar（删除/重命名等），与 antd Modal footer 的「退回」「审核通过」按钮并存。
- **关键**：「退回」按钮实际渲染文本是 `"退 回"`（中文之间空格），必须用 `replace(/\s+/g, '')` 后再匹配。
- **建议**：所有 e2e 找 antd Modal 内按钮时用 `closest('.ant-modal-footer')` 或 `closest('.ant-modal')` 找祖先容器，避免被 UniverSheet 工具栏干扰。

### IMP-09 antd v6 Dropdown 类名变化
- **现象**：v5 用 `.ant-dropdown-menu-item`，v6 改名为 `.ant-dropdown-menu`（UL 元素）。
- **影响**：`frontend/e2e_change_password.mjs` 改用 `'.ant-dropdown-menu-item'` 失败。

### IMP-10 antd v6 OverviewPage 树形表格多层展开
- **现象**：表格用 `buildOverviewTree` 把 `板块→主体→部门→角色→item` 嵌套为树形，**单次 click expand icon 只展开当前层**，下一层图标需再 click。多次循环 click 10 次才能全部展开。
- **建议**：UI 测试用循环 10 次 click + sleep 800ms 等 DOM 异步更新。

---

## 🟢 信息（仅记录，无需修改）

### IMP-11 Vite dev server 首次依赖优化 504
- **现象**：npm run dev 启动后，浏览器首次访问会 504（Vite 懒编译）。e2e.mjs 在 Vite 冷启动后第一次跑偶发失败。
- **建议**：CI 加 Vite warm-up（访问一次首页后等几秒），或在 e2e.mjs 加 retry 包装（当前 run_all_e2e.ps1 已有 3 次 retry）。

### IMP-12 占位 SECRET_KEY 子串 `xxxxxx`
- **现象**：连续 6 个 x 触发 `_PLACEHOLDER_SUBSTRINGS` 校验（test_strict_secrets.py BUG 修复前的征兆）。
- **建议**：强密钥测试避免用 `"x" * N` 模式，用 `string.ascii_letters + string.digits` 等不重复字符。

### IMP-13 限流器 module-level singleton 跨测试累积
- **现象**：`rate_limit._login_rate_limiter` 是 module-level singleton，跨测试累积失败次数。
- **建议**：每个测试前后用 autouse fixture 清空 `limiter._attempts` 字典（已修，见 IMP-02 阶段 4 实现）。

### IMP-14 `workbook.status='submitted'` 后再 save/submit 被后端拒 400
- **设计如此**（AGENTS.md 明文规定）。E2E 应避免在 submitted 后再修改。

---

## 测试侧基础设施改进（已修）

| ID | 内容 | 文件 | 阶段 |
|---|---|---|---|
| FIX-01 | conftest `_StubUser` 跨 session attached 修复 | `backend/tests/conftest.py` | 1 |
| FIX-02 | e2e_change_password cleanup 双层兜底（API + SQL helper）| `frontend/e2e_change_password.mjs` + `_test_helper_reset_op1.py` | 2 |
| FIX-03 | 限流器跨测试隔离（autouse fixture 清空 _attempts）| `backend/tests/test_rate_limit_http.py` | 4 |
| FIX-04 | JWT 端到端测试 fixture（`client_no_auth` 不 override `get_current_user`）| `backend/tests/test_security_e2e.py` | 4 |

---

## 后续迭代建议

1. **修复 IMP-03~IMP-05**：优先级高，1-2 小时工作量，业务代码 0 改动后即可获得更稳定测试套件。
2. **修复 IMP-04**：业务代码小改动，1 行。
3. **改进 e2e_*.mjs 的 DatePicker 交互**（IMP-06）：所有 DatePicker 改用 keyboard / click 弹层方式。
4. **前端 vitest 单测**：当前 0% 覆盖（AGENTS.md 阶段 0 调研），长期投资。
5. **e2e 性能**：13 套件 ~5 分钟（Vite warm-up 占大头），可考虑生产构建模式跑 E2E 提速。

---

**生成时间**：2026-08-11 / 5 阶段测试后整理
**业务代码 0 改动**：本清单记录的是**后续开发者应知道的事实**与**可选改进项**。
