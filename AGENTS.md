# AGENTS.md

轻量级权限控制在线表格系统（RBAC + Univer 在线表格）的项目说明与开发指南。

## 项目概述

一个带有基于角色的访问控制（RBAC）的在线表格 Web 应用。核心业务：

- **管理员** 在线绘制 Excel 模板（Univer 表格），指定**填报年份**，并只填一个「**数据区域起始单元格**」（如 B3）：系统依据工作表「使用区域」（类似 Excel UsedRange，含内容/样式/合并单元格）自动推算 行标签 = 起始格左侧列、列标签 = 起始格上方行、内容区 = 起始格右下矩形。模板支持一键复制到新年份（跨年不同模板，可同时复制角色绑定）。
- **普通用户**（按角色）登录后，在工作台选择**填报月份**，仅能看到本部门在该年份被授权的模板；进入填报视图后，**只能编辑内容区**，标签区与内容区外的单元格一律只读。
- **填报周期**：`role_workbooks` 以「部门(角色) + 模板 + 周期(YYYY-MM)」为唯一键，同一模板每月独立保存一份，互不覆盖。
- **提交/审核流程**：填报状态为 草稿(draft) → 已提交(submitted) → 已通过(approved)/已退回(rejected)。提交后锁定编辑；管理员在「填报总览」矩阵中预览并审核，退回需填写原因，部门可修改后重新提交。
- **填报期间锁定**：管理员在「填报期间」Tab 手动锁定/解锁某月（`filling_periods`），锁定后该月所有部门不可再保存/提交（无自动截止时间）。
- **内容区数字校验**：模板可选「内容区仅允许数字」（`content_numeric`），提交时非空单元格必须为数值，否则返回非法单元格坐标（如「B2 需为数字」）。
- **角色分类**：角色按「业务板块 → 主体 → 部门 + 职能标签」分类（在「组织架构」Tab 统一配置三层与全局职能标签）；「角色管理」Tab 通过弹窗**级联选择**分类并填写角色名（一个部门可建多个角色），分类为组织元数据、填报仍按角色独立。
- **角色** 由管理员创建，**角色名在同一部门内唯一**（不同部门可有同名角色，如多个财务部的「财务主管」）；创建时自动生成默认账号，**用户名自动生成 `role_{id}`**（全局唯一、与角色名解耦、改名不影响），统一初始密码，管理员可一键重置密码。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | React 19 + Vite 8（TypeScript） |
| 路由 | React Router DOM v7 |
| 状态管理 | Zustand 5（`persist` 到 localStorage） |
| UI 组件库 | Ant Design v6（`@ant-design/icons`） |
| 网络请求 | Axios（统一拦截器注入 JWT、401 跳转） |
| 表格引擎 | Univer 0.25.x（官方 `@univerjs/preset-sheets-core` 预设） |
| 后端框架 | FastAPI 0.141（Python 3.12+） |
| ORM | SQLModel（SQLAlchemy + Pydantic） |
| 认证 | PyJWT（Bearer Token），Passlib + Bcrypt |
| 数据库 | SQLite 单文件（`backend/app.db`） |

## 目录结构

```
project_plan.md              # 项目企划书（需求与五阶段路线图）
AGENTS.md                    # 本文件
backend/
├── requirements.txt         # fastapi[standard], sqlmodel, pyjwt, passlib, bcrypt==4.0.1
├── main.py                  # FastAPI 入口，lifespan 启动建表，挂载 4 个 router
├── seed.py                  # 幂等创建「管理员」角色 + admin/admin123
├── seed_demo.py             # 幂等创建演示角色「运营部」+ 默认账号 + op1
└── app/
    ├── config.py            # Settings：SECRET_KEY、DATABASE_URL、ADMIN_ROLE_NAME、DEFAULT_USER_PASSWORD
    ├── database.py          # SQLite engine、create_db_and_tables、轻量迁移（含 user_workbooks→role_workbooks 归并）、get_session
    ├── models.py            # 6 张 SQLModel 数据表（role_workbooks 支持周期与状态，filling_periods 支持期间锁定）
    ├── schemas.py           # Pydantic 请求/响应模型
    ├── security.py          # bcrypt 哈希、JWT 编解码
    ├── dependencies.py      # get_current_user、get_current_admin
    └── routers/
        ├── auth.py          # POST /api/auth/login
        ├── admin.py         # 角色 CRUD、重置密码、模板绑定
        ├── templates.py     # 模板 CRUD（仅管理员）
        └── workspace.py     # 用户工作台：模板列表/详情、保存填报
frontend/
├── vite.config.ts           # dev 端口 5173，/api 代理到 127.0.0.1:8000
├── e2e.mjs / e2e_labels.mjs / e2e_fixes.mjs / e2e_period.mjs / e2e_import.mjs   # Puppeteer 端到端回归测试
└── src/
    ├── main.tsx             # 入口（注意：刻意不使用 StrictMode，见下文）
    ├── App.tsx / router/index.tsx   # 路由：/login /admin /workspace(/templates/:id)
    ├── constants.ts         # ADMIN_ROLE_NAME = '管理员'
    ├── index.css
    ├── api/
    │   ├── http.ts          # axios 实例 + Bearer 注入 + 401 处理 + get/post/put/del
    │   ├── auth.ts / admin.ts / workspace.ts
    │   └── types.ts         # 前后端共享的接口类型（snake_case 对应后端字段）
    ├── store/useAuthStore.ts# token/userId/username/roleId/roleName，persist
    ├── components/
    │   ├── UniverSheet.tsx  # 核心表格组件（见下文，支持 readOnly）
    │   ├── ChangePasswordModal.tsx  # 用户自助修改密码弹窗
    │   ├── OrgManager.tsx   # 组织架构管理（板块→主体→部门 + 职能标签）
    │   ├── univerLocales.ts # 聚合各 Univer 包的 zh-CN 语言包
    │   ├── ProtectedRoute.tsx / AdminRoute.tsx / RootRedirect.tsx
    ├── pages/
    │   ├── LoginPage.tsx
    │   ├── admin/AdminPage.tsx      # 模板管理(导入/导出/复制/归档) + 角色管理(弹窗级联创建/编辑) + 组织架构 + 模板权限 + 填报总览(汇总筛选/审核/导出) + 填报期间 + 归档模板
    │   └── workspace/WorkspacePage.tsx(月份选择+状态) / WorkspaceEditPage.tsx(草稿/提交)
    └── utils/
        ├── cellRef.ts            # Excel 单元格引用解析/格式化（A1、B3 等）
        ├── usedRange.ts          # 计算工作表使用区域（类似 Excel UsedRange，含内容/样式/合并单元格）
        ├── workbookStatus.ts     # 填报状态文案/颜色 + 周期(YYYY-MM) 工具函数
        ├── validateContent.ts    # 内容区数字校验（与后端同逻辑，提交前即时提示）
        └── excelBridge.ts        # Univer 快照 ⇄ .xlsx（exceljs：值/合并单元格/样式/列宽行高，导入仅取第一张 sheet）
```

## 数据库模型（`backend/app/models.py`）

5 张表，snapshot 均以 SQLAlchemy `Column(JSON)` 存 SQLite（自动序列化，**禁止二次 json.dumps**）。

- **roles**: `id`, `name`（**部门内唯一**，复合唯一 `(department_id, name)`）, `segment_id`→business_segments, `entity_id`→org_entities, `department_id`→org_departments, `function_tag_id`→function_tags（分类均可空，填报仍按角色独立；默认账号用户名 = `role_{id}`）
- **business_segments**（业务板块）/ **org_entities**（主体，属板块）/ **org_departments**（部门，属主体）/ **function_tags**（职能标签，全局）：组织架构三层 + 职能标签
- **users**: `id`, `username`(unique), `password_hash`, `role_id`→roles.id, `is_default`（角色默认账号标记，重置密码/删除角色按此定位，用户名可在账号设置中自行修改）
- **templates**: `id`, `name`, `year`(填报年份), `snapshot`(JSON), `row_label_cols`, `col_label_rows`, `content_rows`, `content_cols`, `content_numeric`, `archived`, `archived_at`, `created_at`
  - 标签/内容区语义：左侧 `row_label_cols` 列为行标签；上方 `col_label_rows` 行为列标签；**内容区 = 行 `[col_label_rows, +content_rows)` × 列 `[row_label_cols, +content_cols)`**
  - `content_numeric=True` 时，提交校验内容区非空单元格必须为数值
  - `archived=True` 时从工作台/填报总览/绑定列表隐藏（**保留角色绑定与历史数据**，可在「归档模板」恢复）
- **role_template_mapping**: 组合主键 `(role_id, template_id)`
- **role_workbooks**: `id`, `role_id`, `template_id`, `period`("YYYY-MM"), `snapshot`(JSON), `status`, `submit_at`, `review_at`, `reject_reason`, `updated_at`
  - 唯一约束 `(role_id, template_id, period)`；**整个部门（角色）共享一份填报数据**
  - `status`：`draft`(草稿) / `submitted`(已提交) / `approved`(已通过) / `rejected`(已退回)
- **filling_periods**: `id`, `period`(unique), `locked`, `created_at` —— 管理员手动锁定/解锁某填报月

> 迁移：`database._migrate_templates_columns()` 补齐标签/内容区/`content_numeric`/`archived`/`archived_at` 字段；`database._migrate_workbooks()` 补齐 `templates.year` 列，并将旧 `user_workbooks` 数据归并到 `role_workbooks`（取用户所属角色 + 当前月 period）后删除旧表；`database._migrate_roles_classification()` 为 roles 补齐分类外键列；`database._migrate_role_name_uniqueness()` 将角色名唯一性由全局改为部门内（删 `ix_roles_name`、建 `ix_roles_department_name`，均幂等）。`filling_periods`/组织架构新表由 `create_all` 自动建表。

## RESTful API（全部前缀 `/api`）

- **认证**
  - `POST /auth/login` {username, password} → `{access_token, user_id, username, role_id, role_name}`
  - `POST /auth/change-password` {old_password, new_password} → 当前登录用户修改自己的密码（需登录）
  - `POST /auth/change-account` {old_password, new_username?, new_password?} → 当前登录用户修改自己的用户名/密码（需输入原密码确认身份；用户名唯一）
- **管理员**（需 `get_current_admin`，即角色名为「管理员」）
  - `GET /admin/roles` → 角色列表（**不含管理员角色**，含组织分类名称）
  - `POST /admin/roles` {name, segment_id?, entity_id?, department_id?, function_tag_id?} → 创建角色（提供 department_id 自动补全其所属 entity/segment）+ 自动创建默认账号
  - `PUT /admin/roles/{id}` → 编辑角色名称/分类（改名同步更新默认账号 username）
  - `POST /admin/roles/{id}/reset-password` → 重置角色默认账号密码
  - `DELETE /admin/roles/{id}` → 删除角色（管理员角色不可删；角色下存在其他用户时拒绝）
  - `GET /admin/org` → 组织架构全量树（segments→entities→departments）+ tags
  - `POST/PUT/DELETE /admin/org/segments`、`/org/entities`、`/org/departments`、`/org/tags` → 组织架构与职能标签增删改（有子级/被引用时拒绝删除）
  - `GET /admin/roles/{id}/templates` → 该角色已绑定模板 id 列表
  - `POST /admin/roles/{id}/templates` {template_ids} → 全量覆盖绑定
  - `GET /admin/overview?period=YYYY-MM` → 填报总览：该年份所有 部门×模板 绑定及周期状态（含未填报）
  - `GET /admin/workbooks?period=YYYY-MM&status=` → 指定周期各部门填报记录（可按状态筛选）
  - `GET /admin/workbooks/{role_id}/{template_id}/{period}` → 某部门某周期已填写的快照（管理员预览）
  - `POST /admin/workbooks/{role_id}/{template_id}/{period}/review` {action: approved|rejected, reject_reason?} → 审核（仅对 submitted 生效，退回需填原因）
  - `GET /admin/periods?year=` → 该年份 12 个月锁定状态（未配置默认未锁定）
  - `PUT /admin/periods/{period}` {locked} → 锁定/解锁某填报月（幂等 upsert）
  - `POST /templates` {name, year, snapshot, row_label_cols, col_label_rows, content_rows, content_cols, content_numeric}
  - `GET /templates?archived=0|1` → 模板列表（默认未归档；`?archived=true` 取归档模板）
  - `GET /templates/{id}` / `PUT /templates/{id}`
  - `POST /templates/{id}/duplicate` {year, copy_bindings} → 复制模板（快照+标签+数字校验）到指定年份，可同步复制角色绑定（跨年建模板）
  - `POST /templates/{id}/archive` / `POST /templates/{id}/unarchive` → 归档/恢复模板（归档后隐藏但保留绑定与历史数据）
- **用户工作台**（需登录）
  - `GET /workspace/templates?period=YYYY-MM` → 当前部门在该年份可访问模板列表 + 该周期填报状态（none/draft/submitted/approved/rejected）与 `locked`
  - `GET /workspace/templates/{id}?period=YYYY-MM` → 模板详情；**snapshot 优先返回该部门该周期已保存的填报数据**，否则返回模板原始快照；含 `locked`、`content_numeric`
  - `POST /workspace/workbooks` {template_id, period, snapshot, action: save|submit} → 保存草稿或提交；**submitted/approved 后禁止修改**，rejected 可改后重提；**该月被锁定（filling_periods）时拒绝**；`submit` 且 `content_numeric` 时校验内容区数值
- 健康检查：`GET /api/health`

## 核心组件：`UniverSheet.tsx`

封装 Univer 表格编辑器的通用组件，通过 `useImperativeHandle` 暴露 `getWorkbookData()`。

- **Props**：`initialSnapshot?: IWorkbookData`、`protectedLabels?: ProtectedLabels`、`readOnly?: boolean`、`disableSheetOps?: boolean`、`onReady?`
- **装配**：用官方 `UniverSheetsCorePreset({ container })` 预设注册插件（render/docs/sheets/sheets-ui/formula-ui 等），需同时导入 `@univerjs/preset-sheets-core/lib/index.css` 及各组件 CSS。中文语言包由 `buildLocales()` 聚合（Univer 0.25 必须显式传 `locales`，否则抛 `Locale not initialized`）。
- **初始化**：`useEffect` 内 `new Univer()` → 注册 preset → `createUnit(UNIVER_SHEET, snapshot)`。
- **标签保护**：当传入 `protectedLabels` 时，注册 `SheetInterceptorService.writeCellInterceptor.intercept(VALIDATE_CELL, ...)` 拦截器。拦截器对**内容矩形之外**的单元格返回 `Promise.resolve(false)`（阻止写入），内容区内放行。
  - 若 `contentRows/contentCols` 均为 0（未配置内容区），退化为「仅锁定标签区」。
  - `readOnly` 为 true 时整表只读（所有单元格拦截为 false），用于已提交/已通过后的只读展示与管理员预览。**只读状态切换通过更换 UniverSheet 的 `key` 重新挂载实现**（拦截器在 mount 时注册）。
- **工作表级权限**：普通用户填报视图（`disableSheetOps` 或 `readOnly`）下，通过 `fWorkbook.getWorkbookPermission().setPoint(...)` 关闭 `WorkbookCreateSheet / WorkbookDeleteSheet / WorkbookRenameSheet / WorkbookMoveSheet / WorkbookHideSheet / WorkbookCopySheet` 权限点，从而禁用「新建/删除/重命名/移动/隐藏/复制工作表」（工作表栏「+」按钮、右键菜单、命令均被拦截）。管理员模板编辑场景不传该 prop，保留完整工作表操作。

## 关键架构决策与坑（务必阅读）

1. **移除 React StrictMode（`main.tsx`）**：Univer 会把内部 React root 渲染进容器；StrictMode 双挂载（mount→unmount→mount）与 `univer.dispose()` 冲突，触发 React 19 的 `Attempted to synchronously unmount a root` 警告，并可能损坏重挂载实例（单元格无法输入）。**不要在 main.tsx 重新启用 StrictMode**。
2. **`univer.dispose()` 必须延后**（`setTimeout(0)`）：在 React 提交阶段同步 dispose 会卸载 Univer 内部 root 导致上述警告。延后到提交完成后执行。
3. **标签保护用 `VALIDATE_CELL` 拦截器**，而非 Univer 的区域保护（`getRangePermission().protect()`）：Univer 的区域保护面向协作者（当前用户总是 owner 可编辑），无法让标签对**当前用户**只读。`VALIDATE_CELL` 返回 false 会可靠阻止写入（键盘/公式栏均拦截，`setValue` facade 会绕过）。
4. **FUniver 导入**：`FUniver` 从 `@univerjs/core/facade` 导入；`getActiveWorkbook` 等 sheet facade 方法需要 `@univerjs/sheets/facade` 类型扩展（preset 内部已引入）。
5. **snapshot 即对象/字典**：前后端与 SQLite 落盘都直接用 dict，不做 Stringify/Parse 冗余处理。
6. **前后端字段命名**：前端类型用 snake_case 与后端一致（如 `row_label_cols`），Univer 组件内用 camelCase（`rowLabelCols`），在 API 层转换。
7. **默认密码统一**：`config.DEFAULT_USER_PASSWORD = "123456"`，角色默认账号用户名 = 角色名。
8. **bcrypt 版本锁定**：`bcrypt==4.0.1`（passlib 1.7.4 与 bcrypt≥4.1 有 `__about__` 兼容问题）。

## 启动与常用命令

```bash
# 后端（backend 目录）
.\.venv\Scripts\python.exe -m pip install -r requirements.txt   # 首次
.\.venv\Scripts\python.exe seed.py                              # 创建管理员 admin/admin123
.\.venv\Scripts\python.exe seed_demo.py                         # 创建演示角色/用户
.\.venv\Scripts\python.exe -m uvicorn main:app --reload         # 启动，端口 8000

# 前端（frontend 目录）
npm install
npm run dev        # 端口 5173，/api 代理到 8000
npm run build      # tsc -b && vite build（类型检查 + 产物）
npm run lint       # oxlint
```

演示账号：`admin/admin123`（管理员）、`运营部/123456` 或 `op1/pw123`（普通用户）。

## 端到端测试（Puppeteer + 本机 Chrome）

前置：先后台 `uvicorn` + 前端 `npm run dev` 已在运行，且数据库已 seed。

- `e2e.mjs` — 主流程：管理员登录→Modal 建表→绑定运营部→用户填报保存。
- `e2e_labels.mjs` — 标签模板 + 角色创建 + 用户填报时标签单元格只读。
- `e2e_fixes.mjs` — 保存后重进加载已存数据、退出登录跳转。
- `e2e_period.mjs` — 期间锁定（锁定→拒存→解锁→可存）+ 内容区数字校验 + 工作表级权限（新建工作表按钮禁用）。
- `e2e_import.mjs` — 模板导入（含合并单元格 xlsx→弹窗→保存）+ 导出 + 归档/恢复。

> 注：puppeteer 无法拦截浏览器 blob 下载，导出用「已导出」成功提示断言。

要点：
- 本机 Chrome 路径 `C:\Program Files\Google\Chrome\Application\chrome.exe`（`puppeteer-core` 直连）。
- **Vite 首次依赖优化会 504**，测试脚本需在首屏后 `reload` 重试。
- 自动化环境下 Univer 单元格输入的坐标映射可能漂移（有滚动/缩放偏移），**不要依赖 puppeteer 键盘输入精确验证「可编辑」**；「只读/被锁定」可用保存后快照对比验证。应用真实输入以浏览器手动测试为准。
- 测试会写库；如需干净环境：先停进程 → `Remove-Item backend/app.db` → 重新 seed。

## 开发约定

- 后端：Python 全量 Type Hints；路由处理用 `async/await`；新增接口在 `schemas.py` 补模型。
- 前端：仅函数组件（FC）；`async/await`；跨组件状态走 Zustand；antd v6（注意 `Space direction` 已弃用用 `orientation`、`Transfer listStyle` 弃用用 `styles.section`）。
- 新增前端 API 统一封装到 `src/api/*.ts`，用 `get/post/put/del` 泛型。
- 修改模板/工作簿相关字段时，同步更新：`backend/app/models.py`、`schemas.py`、对应 router、`frontend/src/api/types.ts`、相关页面与 `utils/usedRange.ts`/`utils/cellRef.ts`。
