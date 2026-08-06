# AGENTS.md

轻量级权限控制在线表格系统（RBAC + Univer 在线表格）的项目说明与开发指南。

## 项目概述

一个带有基于角色的访问控制（RBAC）的在线表格 Web 应用。核心业务：

- **管理员** 在线绘制 Excel 模板（Univer 表格），为模板配置「行标签 / 列标签 / 内容区」结构，并将模板分配给特定角色。
- **普通用户**（按角色）登录后，仅能看到自己角色被授权的模板；进入填报视图后，**只能编辑内容区**，标签区与内容区外的单元格一律只读；填报数据按用户独立保存。
- **角色** 由管理员创建，创建时自动生成默认账号（用户名=角色名，统一初始密码），管理员可一键重置角色密码。

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
    ├── database.py          # SQLite engine、create_db_and_tables、轻量迁移、get_session
    ├── models.py            # 5 张 SQLModel 数据表
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
├── e2e.mjs / e2e_labels.mjs / e2e_fixes.mjs   # Puppeteer 端到端回归测试
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
    │   ├── UniverSheet.tsx  # 核心表格组件（见下文）
    │   ├── univerLocales.ts # 聚合各 Univer 包的 zh-CN 语言包
    │   ├── ProtectedRoute.tsx / AdminRoute.tsx / RootRedirect.tsx
    ├── pages/
    │   ├── LoginPage.tsx
    │   ├── admin/AdminPage.tsx      # 模板管理 + 角色与权限
    │   └── workspace/WorkspacePage.tsx / WorkspaceEditPage.tsx
    └── utils/detectLabels.ts # 自动识别行/列标签与内容区尺寸
```

## 数据库模型（`backend/app/models.py`）

5 张表，snapshot 均以 SQLAlchemy `Column(JSON)` 存 SQLite（自动序列化，**禁止二次 json.dumps**）。

- **roles**: `id`, `name`(unique)
- **users**: `id`, `username`(unique), `password_hash`, `role_id`→roles.id
- **templates**: `id`, `name`, `snapshot`(JSON), `row_label_cols`, `col_label_rows`, `content_rows`, `content_cols`, `created_at`
  - 标签/内容区语义：左侧 `row_label_cols` 列为行标签；上方 `col_label_rows` 行为列标签；**内容区 = 行 `[col_label_rows, +content_rows)` × 列 `[row_label_cols, +content_cols)`**
- **role_template_mapping**: 组合主键 `(role_id, template_id)`
- **user_workbooks**: `id`, `user_id`, `template_id`, `snapshot`(JSON), `updated_at` —— 每个用户对每个模板一行（存在即更新）

> 迁移：`database._migrate_templates_columns()` 在启动时对已存在的 templates 表 `ALTER TABLE ADD COLUMN` 补齐标签/内容区字段（幂等）。

## RESTful API（全部前缀 `/api`）

- **认证**
  - `POST /auth/login` {username, password} → `{access_token, user_id, username, role_id, role_name}`
- **管理员**（需 `get_current_admin`，即角色名为「管理员」）
  - `GET /admin/roles` → 角色列表（**不含管理员角色**）
  - `POST /admin/roles` {name} → 创建角色 + 自动创建默认账号（用户名=角色名，密码=DEFAULT_USER_PASSWORD）
  - `POST /admin/roles/{id}/reset-password` → 重置角色默认账号密码
  - `DELETE /admin/roles/{id}` → 删除角色（管理员角色不可删；角色下存在其他用户时拒绝）
  - `GET /admin/roles/{id}/templates` → 该角色已绑定模板 id 列表
  - `POST /admin/roles/{id}/templates` {template_ids} → 全量覆盖绑定
  - `POST /templates` {name, snapshot, row_label_cols, col_label_rows, content_rows, content_cols}
  - `GET /templates` / `GET /templates/{id}` / `PUT /templates/{id}`
- **用户工作台**（需登录）
  - `GET /workspace/templates` → 按当前用户 role_id 联查可访问模板（id+name）
  - `GET /workspace/templates/{id}` → 模板详情；**snapshot 优先返回该用户已保存的填报数据**（`has_saved` 标记），否则返回模板原始快照
  - `POST /workspace/workbooks` {template_id, snapshot} → 保存/更新填报数据
- 健康检查：`GET /api/health`

## 核心组件：`UniverSheet.tsx`

封装 Univer 表格编辑器的通用组件，通过 `useImperativeHandle` 暴露 `getWorkbookData()`。

- **Props**：`initialSnapshot?: IWorkbookData`、`protectedLabels?: ProtectedLabels`、`onReady?`
- **装配**：用官方 `UniverSheetsCorePreset({ container })` 预设注册插件（render/docs/sheets/sheets-ui/formula-ui 等），需同时导入 `@univerjs/preset-sheets-core/lib/index.css` 及各组件 CSS。中文语言包由 `buildLocales()` 聚合（Univer 0.25 必须显式传 `locales`，否则抛 `Locale not initialized`）。
- **初始化**：`useEffect` 内 `new Univer()` → 注册 preset → `createUnit(UNIVER_SHEET, snapshot)`。
- **标签保护**：当传入 `protectedLabels` 时，注册 `SheetInterceptorService.writeCellInterceptor.intercept(VALIDATE_CELL, ...)` 拦截器。拦截器对**内容矩形之外**的单元格返回 `Promise.resolve(false)`（阻止写入），内容区内放行。
  - 若 `contentRows/contentCols` 均为 0（未配置内容区），退化为「仅锁定标签区」。

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

要点：
- 本机 Chrome 路径 `C:\Program Files\Google\Chrome\Application\chrome.exe`（`puppeteer-core` 直连）。
- **Vite 首次依赖优化会 504**，测试脚本需在首屏后 `reload` 重试。
- 自动化环境下 Univer 单元格输入的坐标映射可能漂移（有滚动/缩放偏移），**不要依赖 puppeteer 键盘输入精确验证「可编辑」**；「只读/被锁定」可用保存后快照对比验证。应用真实输入以浏览器手动测试为准。
- 测试会写库；如需干净环境：先停进程 → `Remove-Item backend/app.db` → 重新 seed。

## 开发约定

- 后端：Python 全量 Type Hints；路由处理用 `async/await`；新增接口在 `schemas.py` 补模型。
- 前端：仅函数组件（FC）；`async/await`；跨组件状态走 Zustand；antd v6（注意 `Space direction` 已弃用用 `orientation`、`Transfer listStyle` 弃用用 `styles.section`）。
- 新增前端 API 统一封装到 `src/api/*.ts`，用 `get/post/put/del` 泛型。
- 修改模板/工作簿相关字段时，同步更新：`backend/app/models.py`、`schemas.py`、对应 router、`frontend/src/api/types.ts`、相关页面与 `detectLabels.ts`。
