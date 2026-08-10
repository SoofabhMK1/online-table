# 轻量级权限控制在线表格系统

基于 RBAC（基于角色的访问控制）+ [Univer](https://univer.ai) 在线表格引擎的轻量级 Web 应用。管理员在线绘制 Excel 模板并分配权限，各部门按「年 + 月」周期填报预算/财务数据。

## 核心功能

- **模板管理**：管理员在 Univer 表格中在线绘制模板，支持 **Excel 导入**（含合并单元格，仅取第一张表）、**导出**、跨年复制、**归档**（归档后隐藏但保留历史，可恢复）
- **数据区域起始单元格**：新建模板只需填一个「数据区域起始单元格」（如 B3），系统依据工作表「使用区域」（类似 Excel UsedRange）自动推算：
  - 行标签 = 起始格左侧列（如 A3:A289）
  - 列标签 = 起始格上方行（如 A1:Q2）
  - 内容区 = 起始格右下矩形（如 B3:Q289），**仅此处允许用户填写**
- **填报保护**：用户进入填报视图后，标签区与内容区外的单元格一律只读，只能编辑内容区
- **填报周期**：同一模板每月独立保存一份（`period=YYYY-MM`），整个部门共享一份填报数据
- **提交/审核**：草稿 → 已提交 → 已通过/已退回；提交后锁定，管理员在「填报总览」矩阵审核，退回需填原因
- **填报期间锁定**：管理员可手动锁定/解锁某填报月，锁定后该月不可再保存/提交
- **内容区数字校验**：模板可开启「内容区仅允许数字」，提交时非数字单元格被拦截
- **角色与权限**：管理员创建角色（可按 业务板块→主体→部门 + 职能标签 分类）、为角色分配模板；角色自动生成默认账号，可一键重置密码
- **登录限流**：`/api/auth/login` 默认按用户名限流 5 分钟 10 次；设 `REDIS_URL` 后切换到 RedisLimiter 以支持分布式部署

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 · Vite 8 · TypeScript · Ant Design v6 · Zustand 5 · React Router 7 |
| 表格引擎 | Univer 0.25.x（`@univerjs/preset-sheets-core`） |
| 后端 | FastAPI 0.141+ · SQLModel（SQLAlchemy + Pydantic v2） · Alembic |
| 认证 | PyJWT（Bearer Token）· Passlib + Bcrypt |
| 限流 | 默认进程内 `InMemoryLimiter`，可切换 `RedisLimiter` |
| 数据库 | SQLite 单文件（`backend/app.db`） |

## 快速开始

### 后端（Python 3.12+）

```bash
cd backend
python -m venv .venv                          # 首次
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe seed.py            # 创建管理员 admin/admin123
.\.venv\Scripts\python.exe seed_demo.py       # 创建演示角色/用户（可选）
.\.venv\Scripts\python.exe -m uvicorn main:app --reload   # http://127.0.0.1:8000
```

数据库迁移由 Alembic 管理：应用启动时 `database.create_db_and_tables()` 会自动执行 `alembic upgrade head`。新 schema 改动请在 `backend/alembic/versions/` 下新增 revision，不要再使用旧的 `_migrate_*` 函数。

可选：安装并运行后端测试。

```bash
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest            # 后端单元/接口测试（pytest + httpx）
```

### 前端

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173（/api 自动代理到后端 8000）
npm run build      # 类型检查 + 产物构建
npm run type-check # tsc -b --noEmit
npm run lint       # oxlint
```

### 演示账号

| 账号 | 密码 | 角色 |
|---|---|---|
| admin | admin123 | 管理员 |
| `role_{demo_role_id}` | 123456 | 运营部（角色默认账号；用户名 = `role_{id}`，与角色名解耦） |
| op1 | pw123 | 运营部（额外演示用户，可用于多账号测试） |

## 使用流程

1. 管理员登录 → 侧栏「管理中心 / 模板管理」→ 新建/编辑模板（或导入 Excel），绘制表格后点「检测使用区域」，再填入**数据区域起始单元格**（如 B3）并保存
2. 「角色管理」→ 新增角色（自动生成默认账号）「组织架构」→ 先配置业务板块/主体/部门/职能标签
3. 「模板权限」→ 选择角色 → 从右侧「已绑定模板」中勾选可访问的模板
4. 用户用角色账号登录 → 侧栏「工作台」→ 选择填报月份 → 看到被授权的模板 → 进入填报视图填写内容区 → 保存草稿 / 提交
5. 管理员登录 → 「填报总览」→ 按月查看所有角色×模板的填报状态 → 点「审核」预览已提交内容 → 「审核通过」或「退回（需填原因）」
6. 「填报期间」→ 手动锁定/解锁某填报月；锁定后该月所有部门不可再保存/提交
7. 「归档模板」→ 归档后的模板从工作台/总览/绑定列表隐藏但保留历史数据；可在该页恢复

## 项目结构

```
backend/
├── alembic.ini                    # Alembic 配置（启动自动 upgrade head）
├── pytest.ini                     # pytest 配置（asyncio_mode=auto）
├── requirements.txt                # 运行依赖（fastapi/sqlmodel/pyjwt/passlib/bcrypt/alembic）
├── requirements-dev.txt            # 开发依赖（pytest/pytest-asyncio/httpx）
├── main.py                        # FastAPI 入口 + lifespan 建表 + 挂载 4 个 router + /api/health
├── seed.py / seed_demo.py         # 幂等初始化脚本（admin/admin123 与 运营部/op1）
├── alembic/                       # 数据库迁移
│   ├── env.py / script.py.mako
│   └── versions/                  # 各 revision（首版：10a3dea0e7527）
├── app/
│   ├── config.py                  # Settings：SECRET_KEY/JWT_*/STRICT_SECRETS/CORS/MAX_SNAPSHOT_BYTES
│   ├── database.py                # engine + FK 钩子 + create_db_and_tables（委托 alembic）
│   ├── models.py                  # 10 张 SQLModel 表（5 业务 + 4 组织 + filling_periods）
│   ├── schemas.py                 # Pydantic 请求/响应模型
│   ├── security.py                # bcrypt 哈希 + JWT 编解码（含 iss/aud/leeway）
│   ├── dependencies.py            # get_current_user / get_current_admin
│   ├── rate_limit.py              # LoginRateLimiter 接口 + InMemoryLimiter + RedisLimiter
│   ├── routers/                   # auth / admin / templates / workspace
│   └── services/                  # 业务逻辑下沉（P3-2）
│       ├── role_service.py        # 角色 CRUD + 默认账号 + 级联清理
│       ├── template_service.py    # 模板 CRUD + 复制 + 归档（含 MAX_SNAPSHOT_BYTES 校验）
│       └── workbook_service.py    # 填报保存/提交/审核状态机
└── tests/                         # pytest 后端测试
    ├── conftest.py                # 测试 fixture（隔离 SQLite 临时库）
    ├── test_api_smoke.py          # 关键接口冒烟测试
    ├── test_security.py           # JWT/bcrypt
    ├── test_rate_limit.py         # 限流（InMemoryLimiter）
    ├── test_role_service.py       # 角色服务
    ├── test_template_service.py   # 模板服务
    └── test_workbook_service.py   # 填报服务

frontend/
├── e2e_helpers.mjs                # 共享 e2e 辅助（BASE/Reporter/login/waitCanvas/...）
├── e2e.mjs / e2e_labels.mjs / e2e_fixes.mjs /
│   e2e_period.mjs / e2e_import.mjs / e2e_review.mjs   # Puppeteer 端到端回归
└── src/
    ├── main.tsx                   # 入口（不启用 StrictMode，见 AGENTS.md「关键决策」）
    ├── App.tsx                    # 占位组件（实际渲染在 main.tsx 由 RouterProvider 接管）
    ├── constants.ts               # ADMIN_ROLE_NAME/APP_NAME/色板
    ├── index.css                  # 全局基线 + CSS 变量 + 工具类
    ├── styles/
    │   ├── theme.ts               # antd ConfigProvider token（主色/圆角/阴影/字体）
    │   └── global.css             # CSS 变量 + 滚动条 + 焦点环 + 内容可见性
    ├── router/
    │   ├── index.tsx              # 装配 createBrowserRouter
    │   ├── routes.tsx             # 路由配置
    │   ├── pageComponents.ts      # 各页面 React.lazy 入口
    │   └── RouteFallback.tsx      # Suspense loading
    ├── api/                       # axios 封装 + 类型
    │   ├── http.ts                # Bearer 注入 + 401 处理 + get/post/put/del
    │   ├── auth.ts / admin.ts / workspace.ts
    │   └── types.ts               # 前后端共享接口类型（snake_case 对应后端字段）
    ├── store/                     # Zustand store（persist 到 localStorage）
    │   ├── useAuthStore.ts        # token / userId / username / roleId / roleName
    │   ├── useRolesStore.ts       # 角色 + 组织架构
    │   └── useTemplatesStore.ts   # active + archived 模板
    ├── hooks/
    │   └── useCachedFetch.ts      # 500ms dedup + refresh
    ├── components/
    │   ├── UniverSheet.tsx        # 核心表格组件（标签保护/只读/工作表权限）
    │   ├── OrgManager.tsx         # 组织架构管理（板块→主体→部门 + 职能标签）
    │   ├── AccountSettingsModal.tsx   # 用户自助修改用户名/密码弹窗
    │   ├── BrandMark.tsx          # 品牌 Logo 组件
    │   ├── univerLocales.ts       # 聚合 Univer 各包 zh-CN 语言包
    │   ├── layout/                # 应用外壳
    │   │   ├── AppShell.tsx       # 侧栏 + 顶部条 + 内容框
    │   │   ├── Sidebar.tsx        # 可折叠侧栏
    │   │   ├── sidebarGroups.tsx  # 菜单配置（管理员/普通用户不同）
    │   │   ├── Topbar.tsx         # 面包屑 + 用户下拉
    │   │   └── PageHeader.tsx     # 统一页头
    │   ├── feedback/              # 反馈组件
    │   │   ├── StatusChip.tsx     # 状态标签
    │   │   ├── EmptyState.tsx     # 空状态（含 EmptyPreset 插画）
    │   │   ├── EmptyPreset.tsx    # 插画 SVG
    │   │   └── ConfirmDialog.tsx  # 危险操作确认弹窗
    │   └── route-guards/          # 路由守卫
    │       ├── ProtectedRoute.tsx # 已登录
    │       ├── AdminRoute.tsx     # 仅管理员
    │       ├── WorkspaceRoute.tsx # 仅非管理员（管理员访问 /workspace 自动重定向 /admin）
    │       ├── RootRedirect.tsx   # 根路径按角色分流
    │       └── index.ts
    ├── pages/
    │   ├── LoginPage.tsx          # 左右分屏：左侧品牌面板 + 右侧登录表单
    │   ├── admin/
    │   │   ├── AdminLayout.tsx       # 侧栏外壳
    │   │   ├── AdminIndexRedirect.tsx# /admin → /admin/templates
    │   │   ├── TemplatesPage.tsx     # 模板 CRUD + 导入导出 + 归档
    │   │   ├── RolesPage.tsx         # 角色 CRUD + 重置密码 + 删除
    │   │   ├── OrgPage.tsx           # 组织架构
    │   │   ├── PermissionsPage.tsx   # Transfer 角色×模板
    │   │   ├── OverviewPage.tsx      # 填报总览（树形 + 级联筛选 + 审核）
    │   │   ├── PeriodsPage.tsx       # 期间锁定
    │   │   └── ArchivedPage.tsx      # 归档模板恢复
    │   └── workspace/
    │       ├── WorkspaceLayout.tsx   # 工作台外壳
    │       ├── WorkspaceListPage.tsx # 模板卡片 + 月份选择 + 状态
    │       └── WorkspaceEditPage.tsx # 全屏 Univer 编辑器
    └── utils/                     # cellRef / usedRange / excelBridge / workbookStatus /
                                   # validateContent / overviewTree
```

## 端到端测试

前置：先后台 `uvicorn` + 前端 `npm run dev`，并已 seed。在 `frontend/` 下运行：

```bash
npm run e2e            # 顺序跑全部 6 个
npm run e2e:main       # 主流程（管理员登录 → Modal 建表 → 绑定运营部 → 用户填报保存）
npm run e2e:labels     # 标签模板 + 角色创建 + 标签只读保护
npm run e2e:fixes      # 保存后重进加载已存数据 / 退出登录跳转
npm run e2e:period     # 期间锁定 + 内容区数字校验 + 工作表权限
npm run e2e:import     # 模板导入（含合并单元格）/ 导出 / 归档/恢复
npm run e2e:review     # 审核状态机（提交 → 退回需原因 → 修改再交 → 通过 → 已通过后拒存）
```

可用环境变量：`E2E_BASE`（默认 `http://localhost:5173`）、`CHROME_PATH`（Chrome 可执行路径）、`CI=true`（启用 headless）。

> ⚠️ 测试会写开发数据库。脚本均使用 `Date.now()` 后缀保证资源名唯一，并在 `finally` 中清理创建的资源，因此可重复运行；如需完全干净环境：先停后端 → `Remove-Item backend/app.db` → 重新 `seed.py` + `seed_demo.py`。

## 生产部署注意事项

- `backend/app/config.py` 中的 `SECRET_KEY` 为开发占位值，**生产环境务必通过环境变量覆盖 ≥ 32 字节随机密钥**，并设置 `STRICT_SECRETS=1` 让不合规密钥启动即报错。
- 跨域部署：设 `CORS_ALLOWED_ORIGINS=https://admin.example.com,https://app.example.com`；开发通过 Vite 代理同源请求无需 CORS。
- 大快照防护：`MAX_SNAPSHOT_BYTES`（默认 5 MB）控制单条 Univer 快照序列化后字节上限；超出返回 413。
- 分布式部署：设 `REDIS_URL=redis://host:6379/0` 启用 `RedisLimiter`；否则多进程间登录限流不互通。
- `frontend/vite.config.ts` 已开启 `strictPort: true`：端口被占用时直接报错（避免 5173→5174 静默切换导致反向代理 / e2e 连错端口）。
- `@univerjs/*` 全部锁精确版本（无 `^`），因依赖多处 Univer 私有 API；升级前需回归标签保护 / dispose 语义。
- 详细架构决策、数据库模型与开发约定见 [AGENTS.md](./AGENTS.md)
