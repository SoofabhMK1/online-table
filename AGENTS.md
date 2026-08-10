# AGENTS.md

轻量级权限控制在线表格系统（RBAC + Univer 在线表格）的项目说明与开发指南。

## 项目概述

一个带有基于角色的访问控制（RBAC）的在线表格 Web 应用。核心业务：

- **管理员** 在线绘制 Excel 模板（Univer 表格），指定**填报年份**，并只填一个「**数据区域起始单元格**」（如 B3）：系统依据工作表「使用区域」（类似 Excel UsedRange，含内容/样式/合并单元格）自动推算 行标签 = 起始格左侧列、列标签 = 起始格上方行、内容区 = 起始格右下矩形。模板支持一键复制到新年份（跨年不同模板，可同时复制角色绑定）。
- **普通用户**（按角色）登录后，在工作台选择**填报月份**，仅能看到本部门在该年份被授权的模板；进入填报视图后，**只能编辑内容区**，标签区与内容区外的单元格一律只读。
- **填报周期**：`role_workbooks` 以「部门(角色) + 模板 + 周期(YYYY-MM)」为唯一键，同一模板每月独立保存一份，互不覆盖。
- **提交/审核流程**：填报状态为 草稿(draft) → 已提交(submitted) → 已通过(approved)/已退回(rejected)。提交后锁定编辑；管理员在「填报总览」矩阵中预览并审核，退回需填写原因，部门可修改后重新提交。
- **填报期间锁定**：管理员在「填报期间」页手动锁定/解锁某月（`filling_periods`），锁定后该月所有部门不可再保存/提交（无自动截止时间）。
- **内容区数字校验**：模板可选「内容区仅允许数字」（`content_numeric`），提交时非空单元格必须为数值，否则返回非法单元格坐标（如「B2 需为数字」）。
- **角色分类**：角色按「业务板块 → 主体 → 部门 + 职能标签」分类（在「组织架构」页统一配置三层与全局职能标签）；「角色管理」页通过弹窗**级联选择**分类并填写角色名（一个部门可建多个角色），分类为组织元数据、填报仍按角色独立。
- **角色** 由管理员创建，**角色名在同一部门内唯一**（不同部门可有同名角色，如多个财务部的「财务主管」）；创建时自动生成默认账号，**用户名自动生成 `role_{id}`**（全局唯一、与角色名解耦、改名不影响），统一初始密码，管理员可一键重置密码。
- **登录限流**：`/api/auth/login` 按用户名限流 5 分钟 10 次（`MAX_ATTEMPTS=10`、`WINDOW_SECONDS=300`）；设 `REDIS_URL` 后切换到 `RedisLimiter` 以支持分布式部署。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | React 19 + Vite 8（TypeScript 6 strict） |
| 路由 | React Router DOM v7（数据路由 + 路由级 lazy） |
| 状态管理 | Zustand 5（`persist` 到 localStorage） |
| UI 组件库 | Ant Design v6（`@ant-design/icons`） |
| 网络请求 | Axios（统一拦截器注入 JWT、401 跳转） |
| 表格引擎 | Univer 0.25.x（官方 `@univerjs/preset-sheets-core` 预设） |
| 后端框架 | FastAPI 0.141+（Python 3.12+） |
| ORM | SQLModel（SQLAlchemy 2.x + Pydantic v2） |
| 迁移 | Alembic 1.13+（启动时自动 `upgrade head`） |
| 认证 | PyJWT（Bearer Token），Passlib + Bcrypt 4.0.1 |
| 数据库 | SQLite 单文件（`backend/app.db`） |
| 后端测试 | pytest + pytest-asyncio + httpx |

## 目录结构

```
AGENTS.md
README.md
backend/
├── alembic.ini                    # Alembic 配置（启动自动 upgrade head）
├── pytest.ini                     # pytest 配置（asyncio_mode=auto）
├── requirements.txt               # 运行时依赖：fastapi[standard]、sqlmodel、pyjwt、passlib、bcrypt==4.0.1、alembic
├── requirements-dev.txt           # 开发依赖：pytest、pytest-asyncio、httpx（运行时已间接安装）
├── main.py                        # FastAPI 入口 + lifespan 建表 + 挂载 4 个 router + /api/health
├── seed.py                        # 幂等创建管理员角色 + admin/admin123
├── seed_demo.py                   # 幂等创建演示角色「运营部」+ 默认账号 + op1/pw123
├── alembic/
│   ├── env.py / script.py.mako
│   └── versions/                  # 各 revision（首版 10a3dea0e7527：10 张表）
├── app/
│   ├── __init__.py
│   ├── config.py                  # Settings：SECRET_KEY、ALGORITHM、JWT_*/iss/aud/leeway、ADMIN_ROLE_NAME、
│   │                              #         DEFAULT_USER_PASSWORD、STRICT_SECRETS、CORS_ALLOWED_ORIGINS、
│   │                              #         MAX_SNAPSHOT_BYTES（默认 5MB）
│   ├── database.py                # SQLite engine + FK 钩子 + create_db_and_tables（委托 alembic upgrade head）+ get_session
│   ├── models.py                  # 10 张 SQLModel 表（5 业务 + 4 组织 + filling_periods）
│   ├── schemas.py                 # Pydantic 请求/响应模型
│   ├── security.py                # bcrypt 哈希 + JWT 编解码（含 iss/aud 校验与 leeway）
│   ├── dependencies.py            # get_current_user（Bearer → User）、get_current_admin（追加角色名校验）
│   ├── rate_limit.py              # LoginRateLimiter 协议 + InMemoryLimiter（默认）+ RedisLimiter（REDIS_URL）
│   ├── routers/
│   │   ├── auth.py                # POST /api/auth/{login, change-password, change-account}
│   │   ├── admin.py               # 角色/组织架构/模板绑定/填报总览/审核/期间
│   │   ├── templates.py           # 模板 CRUD + 复制 + 归档/恢复
│   │   └── workspace.py           # 用户工作台：模板列表/详情/保存
│   └── services/                  # 业务逻辑下沉（router 仅做参数解析与服务调用）
│       ├── role_service.py        # 角色 CRUD、默认账号生成、删除时级联清理
│       ├── template_service.py    # 模板 CRUD、复制（含 MAX_SNAPSHOT_BYTES 校验）、归档/恢复
│       └── workbook_service.py    # 填报保存/提交/审核状态机
└── tests/                         # pytest 后端测试（httpx AsyncClient 调 FastAPI）
    ├── conftest.py                # 测试 fixture（隔离 SQLite 临时库 + 注入依赖）
    ├── test_api_smoke.py          # 关键接口冒烟测试
    ├── test_security.py           # JWT 编解码 + bcrypt
    ├── test_rate_limit.py         # InMemoryLimiter 默认行为
    ├── test_role_service.py       # 角色服务（创建/重置密码/删除）
    ├── test_template_service.py   # 模板服务（CRUD/复制/归档）
    └── test_workbook_service.py   # 填报服务（保存/提交/审核/期间锁定）

frontend/
├── vite.config.ts                 # dev 端口 5173（strictPort），/api 代理到 127.0.0.1:8000
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── .oxlintrc.json                 # oxlint 规则（react rules-of-hooks / only-export-components warn）
├── package.json
├── e2e_helpers.mjs                # e2e 共享辅助（BASE/Reporter/login/apiLogin/waitCanvas/clickByText/gotoWithRetry/uniqueSuffix）
├── e2e.mjs / e2e_labels.mjs / e2e_fixes.mjs /
│   e2e_period.mjs / e2e_import.mjs / e2e_review.mjs   # Puppeteer 端到端回归（6 套件）
└── src/
    ├── main.tsx                   # 入口（不启用 StrictMode，见下文「关键决策」）
    ├── App.tsx                    # 占位（实际渲染在 main.tsx 由 RouterProvider 接管）
    ├── constants.ts               # ADMIN_ROLE_NAME、APP_NAME/VERSION/色板常量
    ├── index.css                  # 全局基线 + CSS 变量 + 工具类
    ├── styles/
    │   ├── theme.ts               # antd ConfigProvider 主题 token（主色/圆角/阴影/字体/组件 variant）
    │   └── global.css             # CSS 变量 + 滚动条 + 焦点环 + content-visibility 工具类
    ├── router/                    # 路由层（数据路由风格）
    │   ├── index.tsx              # 装配 createBrowserRouter + Suspense withSuspense()
    │   ├── routes.tsx             # 路由树（/login /admin/* /workspace/*）
    │   ├── pageComponents.ts      # 各页面 React.lazy 入口（按需 chunk）
    │   └── RouteFallback.tsx      # 加载态 Spin
    ├── api/                       # axios 封装 + 类型
    │   ├── http.ts                # axios 实例 + Bearer 注入 + 401 处理 + get/post/put/del
    │   ├── auth.ts / admin.ts / workspace.ts
    │   └── types.ts               # 前后端共享接口类型（snake_case 对应后端字段）
    ├── store/                     # Zustand store（persist 到 localStorage）
    │   ├── useAuthStore.ts        # token / userId / username / roleId / roleName
    │   ├── useRolesStore.ts       # 角色列表 + 组织架构树
    │   └── useTemplatesStore.ts   # active + archived 模板
    ├── hooks/
    │   └── useCachedFetch.ts      # 轻量请求去重 hook（500ms 同 key 复用响应 + refresh）
    ├── components/
    │   ├── UniverSheet.tsx        # 核心表格组件（标签保护/只读/工作表权限）
    │   ├── OrgManager.tsx         # 组织架构管理（板块→主体→部门 + 职能标签）
    │   ├── AccountSettingsModal.tsx   # 用户自助修改用户名/密码弹窗
    │   ├── BrandMark.tsx          # 品牌 Logo + 文字组件（OT 渐变方块 + 文字）
    │   ├── univerLocales.ts       # 聚合 Univer 各包 zh-CN 语言包
    │   ├── layout/                # 应用外壳
    │   │   ├── AppShell.tsx       # Sider + Header + Content 组合
    │   │   ├── Sidebar.tsx        # 可折叠侧栏菜单
    │   │   ├── sidebarGroups.tsx  # 菜单配置（管理员/普通用户不同）
    │   │   ├── Topbar.tsx         # 面包屑 + 用户下拉菜单
    │   │   └── PageHeader.tsx     # 统一页头（eyebrow + title + description + actions）
    │   ├── feedback/              # 反馈组件
    │   │   ├── StatusChip.tsx     # 状态标签（draft/submitted/approved/rejected/none）
    │   │   ├── EmptyState.tsx     # 空状态外壳
    │   │   ├── EmptyPreset.tsx    # 配套插画 SVG（templates/roles/workbooks/archived/search）
    │   │   └── ConfirmDialog.tsx  # 危险操作确认弹窗（替代 Popconfirm 关键路径）
    │   └── route-guards/          # 路由守卫
    │       ├── ProtectedRoute.tsx # 已登录
    │       ├── AdminRoute.tsx     # 仅管理员（否则跳 /workspace）
    │       ├── WorkspaceRoute.tsx # 仅非管理员（管理员访问 /workspace 自动跳 /admin）
    │       ├── RootRedirect.tsx   # 根路径按角色分流（未登录 /login）
    │       └── index.ts
    ├── pages/
    │   ├── LoginPage.tsx          # 左右分屏：左侧品牌面板（渐变 + Slogan + 价值点） + 右侧表单
    │   ├── admin/
    │   │   ├── AdminLayout.tsx        # 管理端侧栏外壳（接受 Outlet）
    │   │   ├── AdminIndexRedirect.tsx # /admin → /admin/templates
    │   │   ├── TemplatesPage.tsx      # 模板 CRUD（新建 / 编辑 / 复制 / 导入 / 导出 / 归档）
    │   │   ├── RolesPage.tsx          # 角色 CRUD（弹窗级联分类 / 重置密码 / 删除）
    │   │   ├── OrgPage.tsx            # 组织架构
    │   │   ├── PermissionsPage.tsx    # Transfer 角色 × 模板
    │   │   ├── OverviewPage.tsx       # 填报总览（树形 + 级联筛选 + 审核/预览/导出）
    │   │   ├── PeriodsPage.tsx        # 期间锁定
    │   │   └── ArchivedPage.tsx       # 归档模板（恢复 → 自动跳回模板管理）
    │   └── workspace/
    │       ├── WorkspaceLayout.tsx    # 工作台侧栏外壳
    │       ├── WorkspaceListPage.tsx  # 模板卡片网格 + 月份选择 + 状态筛选
    │       └── WorkspaceEditPage.tsx  # 全屏 Univer 编辑器（顶部 toolbar + 锁定/拒绝提示）
    └── utils/
        ├── cellRef.ts             # Excel 单元格引用解析/格式化（A1、B3 等）
        ├── usedRange.ts           # 计算工作表「使用区域」（类似 Excel UsedRange，含内容/样式/合并单元格）
        ├── workbookStatus.ts      # 填报状态文案/颜色 + 周期(YYYY-MM) 工具函数
        ├── validateContent.ts     # 内容区数字校验（与后端同逻辑，提交前即时提示）
        ├── overviewTree.ts        # 填报总览树形分组（板块/主体/部门/角色）+ 状态统计
        └── excelBridge.ts         # Univer 快照 ⇄ .xlsx（exceljs：值/合并单元格/样式/列宽行高；导入仅取第一张 sheet）
```

## 数据库模型（`backend/app/models.py`）

10 张表：`BusinessSegment` / `OrgEntity` / `OrgDepartment` / `FunctionTag`（组织架构 + 职能标签）、`Role` / `User` / `Template` / `RoleTemplateMapping` / `RoleWorkbook`（业务核心）、`FillingPeriod`（期间锁定）。snapshot 均以 SQLAlchemy `Column(JSON)` 存 SQLite（自动序列化，**禁止二次 json.dumps**）。

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

> 迁移：使用 **Alembic**（`backend/alembic/`）作为数据库迁移管理工具，`database.create_db_and_tables()` 在启动时调用 `alembic upgrade head` 把数据库升级到最新 schema。`backend/alembic/versions/` 目录存放各 revision；env.py 用 `SQLModel.metadata` 作 autogenerate 来源。`script.py.mako` 已预 `import sqlmodel` 防止 autogenerate 失败。SQLite 用 `render_as_batch=True` 支持 ALTER TABLE。

> 旧版 `_migrate_*` 函数（`templates_columns` / `workbooks` / `roles_classification` / `role_name_uniqueness` / `users_default_flag`）已**不再被 `create_db_and_tables` 调用**，其语义已被初始 Alembic revision 0a3dea0e7527 涵盖。新部署直接走 alembic；老库建议先 `alembic stamp head` 再 `alembic upgrade head`（schema 已存在，跳过）。**新 schema 改动请直接在 `backend/alembic/versions/` 新增 revision**，不要重新启用 `_migrate_*`。

> SQLite FK 约束：每个新连接通过 `event.listens_for(engine, "connect")` 钩子执行 `PRAGMA foreign_keys=ON`（SQLite 默认 OFF）。删除角色时级联清理其模板绑定 + 填报历史（详见 `admin.delete_role`）。

> 大快照防护：`template_service` 与 `workbook_service` 在序列化前检查 `len(json.dumps(...))`，超过 `settings.MAX_SNAPSHOT_BYTES`（默认 5 MB）直接返回 413。

## RESTful API（全部前缀 `/api`）

- **认证**（`/api/auth`）
  - `POST /auth/login` {username, password} → `{access_token, user_id, username, role_id, role_name}`。**登录限流**：默认按用户名 5 分钟 10 次（`LoginRateLimiter`），超限返回 429 + `Retry-After` 头。
  - `POST /auth/change-password` {old_password, new_password} → 当前登录用户修改自己的密码（需登录）
  - `POST /auth/change-account` {old_password, new_username?, new_password?} → 当前登录用户修改自己的用户名/密码（需输入原密码确认身份；用户名唯一）
- **管理员**（需 `get_current_admin`，即角色名为「管理员」）
  - `GET /admin/roles` → 角色列表（**不含管理员角色**，含组织分类名称）
  - `POST /admin/roles` {name, segment_id?, entity_id?, department_id?, function_tag_id?} → 创建角色（提供 department_id 自动补全其所属 entity/segment）+ 自动创建默认账号
  - `PUT /admin/roles/{id}` → 编辑角色名称/分类（改名同步更新默认账号 username）
  - `POST /admin/roles/{id}/reset-password` → 重置角色默认账号密码
  - `DELETE /admin/roles/{id}` {confirm_name} → 删除角色（管理员角色不可删；要求回传 confirm_name 与角色名一致；级联清理模板绑定 + 填报历史 + 默认账号；角色下仍有非默认用户时拒绝）
  - `GET /admin/org` → 组织架构全量树（segments→entities→departments）+ tags
  - `POST/PUT/DELETE /admin/org/segments`、`/org/entities`、`/org/departments`、`/org/tags` → 组织架构与职能标签增删改（有子级/被引用时拒绝删除）
  - `GET /admin/roles/{id}/templates` → 该角色已绑定模板 id 列表
  - `POST /admin/roles/{id}/templates` {template_ids} → 全量覆盖绑定
  - `GET /admin/overview?period=YYYY-MM` → 填报总览：该年份所有 角色×模板 绑定及周期状态（含未填报），带组织分类（板块/主体/部门/职能）
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

## 业务分层（`backend/app/`）

- **routers/** — FastAPI 路由层：参数解析（Pydantic schema）、权限校验（Depends get_current_admin / get_current_user）、调用 service、返回响应模型。**不允许在 router 内直接写 SQL 或业务规则**。
- **services/** — 业务逻辑层（`role_service` / `template_service` / `workbook_service`）：
  - 接收 `Session` + DTO/参数，返回 ORM 模型或抛 `HTTPException`；
  - 跨表事务编排（如：删除角色时级联清理 `role_template_mapping` + `role_workbooks` + `users`）；
  - 大快照校验（`MAX_SNAPSHOT_BYTES`）放在 `template_service` / `workbook_service`；
  - 状态机约束（workbook save/submit/review）放在 `workbook_service`。
- **models/** — SQLModel 表定义（10 张表 + 关系）；
- **schemas/** — Pydantic 请求/响应模型（DTO）。

> 修改业务规则时：先定位到 `app/services/*`，而不是直接改 `routers/*`。Router 仅做参数/响应适配。

## 前端设计系统（`frontend/src/styles/`）

- `theme.ts` — antd `ConfigProvider` 主题 token：主色 `#2D5BFF`、圆角 6/8/12、阴影三档、字体 system-ui 优先；同步配置 `Layout / Menu / Card / Button / Input / Select / Table / Modal / Form` 等组件的 variant 与间距。
- `global.css` — CSS 变量（`--ot-color-primary` / `--ot-radius-lg` / `--ot-shadow-md` / `--ot-space-*`），全局滚动条样式、focus 可见环、`.ot-cv-auto`（`content-visibility: auto` + `contain-intrinsic-size` 用于大表格懒渲染）、`.ot-fade-in` 路由淡入。
- `constants.ts` — `BRAND_PRIMARY` / `COLOR_*` / `STATUS_*` 色板常量；前端组件优先用语义常量，避免硬编码。
- 新增组件请遵循：硬编码颜色 → 用 CSS 变量或 `constants.ts` 常量；阴影 → 用 `--ot-shadow-*`；圆角 → 用 `--ot-radius-*`。

## 核心组件：`UniverSheet.tsx`

封装 Univer 表格编辑器的通用组件，通过 `useImperativeHandle` 暴露 `getWorkbookData()`。

- **Props**：`initialSnapshot?: IWorkbookData`、`protectedLabels?: ProtectedLabels`、`readOnly?: boolean`、`disableSheetOps?: boolean`、`onReady?`
- **装配**：用官方 `UniverSheetsCorePreset({ container })` 预设注册插件（render/docs/sheets/sheets-ui/formula-ui 等），需同时导入 `@univerjs/preset-sheets-core/lib/index.css` 及各组件 CSS。中文语言包由 `buildLocales()` 聚合（Univer 0.25 必须显式传 `locales`，否则抛 `Locale not initialized`）。
- **初始化**：在 **第一个** `useEffect`（依赖 `[]`，仅 mount 时执行）内 `new Univer()` → 注册 preset → `createUnit(UNIVER_SHEET, snapshot)`；卸载时通过 `setTimeout(0)` 延后执行 `univer.dispose()`。
- **标签保护 + 只读**：在 **第二个** `useEffect`（依赖 `[readOnly, protectedLabels]`）内**重新注册** `SheetInterceptorService.writeCellInterceptor.intercept(VALIDATE_CELL, ...)` 拦截器。`readOnly=true` 拦截所有写入；`protectedLabels` 存在时，**内容矩形之外**返回 `Promise.resolve(false)` 阻止写入，内容区内放行；`contentRows/contentCols` 均为 0 时退化为「仅锁定标签区」。**关键**：拦截器随 prop 变化重注册，**父组件无需通过更换 `key` 重新挂载整个 Univer 实例**（后者会导致大表白屏与状态丢失）。
- **工作表级权限**：普通用户填报视图（`disableSheetOps` 或 `readOnly`）下，通过 `fWorkbook.getWorkbookPermission().setPoint(...)` 关闭 `WorkbookCreateSheet / WorkbookDeleteSheet / WorkbookRenameSheet / WorkbookMoveSheet / WorkbookHideSheet / WorkbookCopySheet` 权限点，禁用「新建/删除/重命名/移动/隐藏/复制工作表」（工作表栏「+」按钮、右键菜单、命令均被拦截）。管理员模板编辑场景不传该 prop，保留完整工作表操作。

## 路由结构（`frontend/src/router/`）

```
/                              RootRedirect（未登录 /login；管理员 /admin；普通用户 /workspace）
/login                         LoginPage（左右分屏）
/admin                         AdminIndexRedirect → /admin/templates
/admin/templates                TemplatesPage
/admin/roles                    RolesPage
/admin/organization             OrgPage
/admin/permissions              PermissionsPage
/admin/overview                 OverviewPage
/admin/periods                  PeriodsPage
/admin/archived                 ArchivedPage
/workspace                      WorkspaceLayout → Outlet
/workspace/templates/:templateId  WorkspaceEditPage（全屏编辑器）
```

路由级 `React.lazy` + `<Suspense>`：每个 admin 面板与 WorkspaceEditPage 各自一个 chunk；`UniverSheet` 体积大，仅在 WorkspaceEditPage / TemplatesPage（弹窗）/ OverviewPage（预览弹窗）按需加载。

路由守卫（`components/route-guards/`）：
- `ProtectedRoute` — 已登录才可访问，未登录跳 `/login`；
- `AdminRoute` — 仅管理员访问 `/admin/*`，否则跳 `/workspace`；
- **`WorkspaceRoute`** — 仅非管理员访问 `/workspace/*`；**管理员访问 `/workspace` 自动跳 `/admin`**，故管理员侧栏不展示「工作台」入口；
- `RootRedirect` — `/` 路径按登录态分流。

## 关键架构决策与坑（务必阅读）

1. **移除 React StrictMode（`main.tsx`）**：Univer 会把内部 React root 渲染进容器；StrictMode 双挂载（mount→unmount→mount）与 `univer.dispose()` 冲突，触发 React 19 的 `Attempted to synchronously unmount a root` 警告，并可能损坏重挂载实例（单元格无法输入）。**不要在 main.tsx 重新启用 StrictMode**。
2. **`univer.dispose()` 必须延后**（`setTimeout(0)`）：在 React 提交阶段同步 dispose 会卸载 Univer 内部 root 导致上述警告。延后到提交完成后执行。
3. **标签保护 / 只读用 `VALIDATE_CELL` 拦截器**（见上文），而非 Univer 的区域保护（`getRangePermission().protect()`）：Univer 的区域保护面向协作者（当前用户总是 owner 可编辑），无法让标签对**当前用户**只读。`VALIDATE_CELL` 返回 false 会可靠阻止写入（键盘/公式栏均拦截，`setValue` facade 会绕过）。
4. **只读状态切换不重挂载 Univer**：拦截器随 prop 变化在第二个 useEffect 中重新注册；不要在外层加 `key={readOnly ? 'ro' : 'rw'}` 强制 remount（会丢数据 + 白屏）。
5. **FUniver 导入**：`FUniver` 从 `@univerjs/core/facade` 导入；`getActiveWorkbook` 等 sheet facade 方法需要 `@univerjs/sheets/facade` 类型扩展（preset 内部已引入）。
6. **snapshot 即对象/字典**：前后端与 SQLite 落盘都直接用 dict，不做 Stringify/Parse 冗余处理。**禁止二次 `json.dumps`**（SQLAlchemy `JSON` 列自动序列化）。
7. **前后端字段命名**：前端类型用 snake_case 与后端一致（如 `row_label_cols`），Univer 组件内用 camelCase（`rowLabelCols`），在 API 层转换。
8. **默认账号用户名 = `role_{id}`**（与角色名解耦、改名不影响）；默认密码统一：`config.DEFAULT_USER_PASSWORD = "123456"`。账号用户名可在账号设置中自行修改；旧 scheme（`username=role.name`）的历史数据由 `_migrate_users_default_flag()` 回填 `is_default` 标记。
9. **bcrypt 版本锁定**：`bcrypt==4.0.1`（passlib 1.7.4 与 bcrypt≥4.1 有 `__about__` 兼容问题）。**Univer 版本锁定**：所有 `@univerjs/*` 与 `preset-sheets-core` 锁精确版本（无 `^`），因 5 处依赖私有 API（`VALIDATE_CELL`、`SheetInterceptorService.writeCellInterceptor`、`FUniver` facade、`workbookPermission.setPoint`、`univer.dispose()` 延后语义），升级需回归这些点。
10. **SECRET_KEY 校验**：开发环境打印 WARN；生产环境设 `STRICT_SECRETS=1`，启动时若 SECRET_KEY 长度 < 32 或含占位串立即抛错。占位检测列表见 `app/config.py::_PLACEHOLDER_SUBSTRINGS`（含 `change-me` / `placeholder` / `your-secret` / `xxxxxx` 等）。
11. **CORS**：开发通过 Vite 代理同源请求无需 CORS；跨域部署设 `CORS_ALLOWED_ORIGINS`（逗号分隔）。
12. **登录限流**：默认进程内 `InMemoryLimiter`（5 分钟 10 次），重启后状态丢失；分布式部署设 `REDIS_URL` 切换 `RedisLimiter`（Redis 不可用时自动降级为放行，避免单点锁死）。
13. **Alembic 迁移**：新 schema 改动请新增 revision（在 `backend/alembic/versions/` 用 `alembic revision --autogenerate -m "..."`），不要重新启用 `database._migrate_*` 函数（已废弃）。
14. **业务分层**：router 只做参数/响应；业务规则、跨表事务、状态机放在 `app/services/`。改业务时先看 service，不要直接改 router。

## 启动与常用命令

```bash
# 后端（backend 目录）
.\.venv\Scripts\python.exe -m pip install -r requirements.txt            # 首次
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt        # 可选（后端测试）
.\.venv\Scripts\python.exe seed.py                                       # 创建管理员 admin/admin123
.\.venv\Scripts\python.exe seed_demo.py                                  # 创建演示角色/用户
.\.venv\Scripts\python.exe -m alembic upgrade head                       # 手动跑迁移（通常启动时自动）
.\.venv\Scripts\python.exe -m uvicorn main:app --reload                  # 启动，端口 8000
.\.venv\Scripts\python.exe -m pytest                                     # 后端测试

# 前端（frontend 目录）
npm install
npm run dev          # 端口 5173（strictPort），/api 代理到 8000
npm run type-check   # tsc -b --noEmit
npm run lint         # oxlint
npm run build        # tsc -b && vite build
```

演示账号：`admin/admin123`（管理员）、`role_{demo_role_id}/123456`（运营部默认账号；具体 ID 由 seed 时分配）、`op1/pw123`（额外演示用户）。

## 端到端测试（Puppeteer + 本机 Chrome）

前置：先后台 `uvicorn` + 前端 `npm run dev` 已在运行，且数据库已 seed。

共享辅助：`frontend/e2e_helpers.mjs`（`BASE` / `Reporter` / `launchBrowser` / `login` / `apiLogin` / `waitCanvas` / `clickByText` / `gotoWithRetry` / `uniqueSuffix`）。

可用 npm 脚本（在 `frontend/` 下）：

- `npm run e2e` — 顺序运行全部 **6** 个 e2e
- `npm run e2e:main` — `e2e.mjs`：主流程（管理员登录 → Modal 建表 → 绑定运营部 → 用户填报保存）
- `npm run e2e:labels` — `e2e_labels.mjs`：标签模板 + 角色创建 + 用户填报时标签单元格只读（含「输入是否落地」负向断言）
- `npm run e2e:fixes` — `e2e_fixes.mjs`：保存后重进加载已存数据、退出登录跳转
- `npm run e2e:period` — `e2e_period.mjs`：期间锁定（锁定 → 拒存 → 解锁 → 可存）+ 内容区数字校验 + 工作表级权限
- `npm run e2e:import` — `e2e_import.mjs`：模板导入（含合并单元格 xlsx → 弹窗 → 保存）+ 导出 + 归档/恢复
- `npm run e2e:review` — `e2e_review.mjs`：审核状态机（提交 → 退回需原因 → 修改再交 → 审核通过 → 锁定）

环境变量：
- `E2E_BASE`（默认 `http://localhost:5173`）：覆盖前端地址（CI 换端口）
- `CHROME_PATH`（默认 `C:/Program Files/Google/Chrome/Application/chrome.exe`）：Chrome 可执行路径
- `CI=true`：启用 puppeteer `headless: true`

> 注：puppeteer 无法拦截浏览器 blob 下载，导出用「已导出」成功提示断言。

要点：
- 本机 Chrome 路径可通过 `CHROME_PATH` 环境变量覆盖。
- **Vite 首次依赖优化会 504**，测试脚本需在首屏后 `reload` 重试（`gotoWithRetry` 自动处理）。
- 自动化环境下 Univer 单元格输入的坐标映射可能漂移（有滚动/缩放偏移），**不要依赖 puppeteer 键盘输入精确验证「可编辑」**；「只读/被锁定」可用保存后快照对比验证。应用真实输入以浏览器手动测试为准。
- 测试会写库；脚本均通过 `Date.now()` 后缀保证资源名唯一（角色名/模板名），并在 `finally` 中清理创建的资源，因此可重复运行。如需完全干净环境：先停进程 → `Remove-Item backend/app.db` → 重新 seed。

## 后端测试（pytest + httpx）

```bash
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest
```

- 测试通过 `httpx.AsyncClient` 调起 FastAPI 应用（`conftest.py` 提供 `client` fixture 与隔离 SQLite 临时库）；
- `asyncio_mode = auto`：测试函数默认视为异步，无需显式标记；
- 新增业务规则请同步在 `tests/` 下补单元测试（service 层首选，避免起整套 HTTP 流程）。

## 开发约定

- 后端：Python 全量 Type Hints；路由处理用 `async/await`；新增接口在 `schemas.py` 补模型，在 `services/` 写业务，`routers/` 仅做适配。**不允许在 router 内直接写业务规则或 SQL**。
- 前端：仅函数组件（FC）；`async/await`；跨组件状态走 Zustand；antd v6（注意 `Space direction` 已弃用用 `orientation`、`Card bordered` 已弃用用默认 `variant="outlined"`、`Transfer listStyle` 弃用用 `styles.section`）。
- 新增前端 API 统一封装到 `src/api/*.ts`，用 `get/post/put/del` 泛型。
- 修改模板/工作簿相关字段时，同步更新：`backend/app/models.py`、`schemas.py`、`services/template_service.py` 或 `services/workbook_service.py`、对应 router、`frontend/src/api/types.ts`、相关页面与 `utils/usedRange.ts`/`utils/cellRef.ts`。
- 前端硬编码颜色 → 改用 `constants.ts` 语义常量或 `global.css` CSS 变量。
- 前端新增请求接口 → 优先用 `useCachedFetch`（500ms 同 key dedup）；store action 仅在需要跨页面共享或持久化时使用。
