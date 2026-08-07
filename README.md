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

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 · Vite 8 · TypeScript · Ant Design v6 · Zustand 5 · React Router 7 |
| 表格引擎 | Univer 0.25.x（`@univerjs/preset-sheets-core`） |
| 后端 | FastAPI · SQLModel（SQLAlchemy + Pydantic） |
| 认证 | PyJWT（Bearer Token）· Passlib + Bcrypt |
| 数据库 | SQLite 单文件 |

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

### 前端

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173（/api 自动代理到后端 8000）
npm run build      # 类型检查 + 产物构建
```

### 演示账号

| 账号 | 密码 | 角色 |
|---|---|---|
| admin | admin123 | 管理员 |
| `role_{demo_role_id}` | 123456 | 运营部（角色默认账号，用户名 = `role_{id}`；具体 ID 由 seed 分配，查看 AdminPage「角色管理」或 `SELECT id FROM roles WHERE name='运营部';`） |
| op1 | pw123 | 运营部（演示用户，与默认账号解耦） |

## 使用流程

1. 管理员登录 → 「模板管理」→ 新建/编辑模板（或导入 Excel），绘制表格后点「检测使用区域」，再填入**数据区域起始单元格**（如 B3）并保存
2. 「角色与权限」→ 新增角色（自动生成默认账号）、将模板绑定给角色
3. 用户用角色账号登录 → 工作台选择填报月份 → 看到被授权的模板 → 进入填报视图填写内容区 → 保存草稿 / 提交

## 项目结构

```
backend/
├── main.py                # FastAPI 入口（启动建表、挂载路由）
├── seed.py / seed_demo.py # 幂等初始化脚本
└── app/
    ├── models.py          # 5 张 SQLModel 表
    ├── schemas.py         # Pydantic 请求/响应模型
    ├── security.py        # bcrypt + JWT
    ├── dependencies.py    # get_current_user / get_current_admin
    └── routers/           # auth / admin / templates / workspace
frontend/
└── src/
    ├── components/UniverSheet.tsx   # 核心表格组件（含标签保护/只读/工作表权限）
    ├── api/                          # axios 封装与类型
    ├── pages/                        # 登录 / 管理端 / 工作台 / 填报视图
    ├── store/useAuthStore.ts        # 登录态（Zustand persist）
    └── utils/                        # cellRef / usedRange / excelBridge / workbookStatus / validateContent
```

## 端到端测试

前置：先后台 `uvicorn` + 前端 `npm run dev`，并已 seed。在 `frontend/` 下运行：

```bash
npm run e2e            # 顺序跑全部 5 个
npm run e2e:main       # 主流程
npm run e2e:labels     # 标签保护
npm run e2e:fixes      # 保存回读 / 退出登录
npm run e2e:period     # 期间锁定 + 数字校验 + 工作表权限
npm run e2e:import     # 模板导入/导出/归档
```

可用环境变量：`E2E_BASE`（默认 `http://localhost:5173`）、`CHROME_PATH`（Chrome 可执行路径）、`CI=true`（启用 headless）。

> ⚠️ 测试会写开发数据库。脚本均使用 `Date.now()` 后缀保证资源名唯一，并在 `finally` 中清理创建的资源，因此可重复运行；如需完全干净环境：先停后端 → `Remove-Item backend/app.db` → 重新 `seed.py` + `seed_demo.py`。

## 生产部署注意事项

- `backend/app/config.py` 中的 `SECRET_KEY` 为开发占位值，**生产环境务必通过环境变量覆盖 ≥ 32 字节随机密钥**，并设置 `STRICT_SECRETS=1` 让不合规密钥启动即报错。
- `frontend/vite.config.ts` 已开启 `strictPort: true`：端口被占用时直接报错（避免 5173→5174 静默切换导致反向代理 / e2e 连错端口）。
- `@univerjs/*` 全部锁精确版本（无 `^`），因依赖多处 Univer 私有 API；升级前需回归标签保护 / dispose 语义。
- 更多架构决策与开发约定见 [AGENTS.md](./AGENTS.md)
