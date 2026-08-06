# 轻量级权限控制在线表格系统

基于 RBAC（基于角色的访问控制）+ [Univer](https://univer.ai) 在线表格引擎的轻量级 Web 应用。管理员在线绘制 Excel 模板并分配权限，各角色用户登录后按权限填报数据，数据按用户独立保存。

## 核心功能

- **模板管理**：管理员在 Univer 表格中在线绘制模板（新建/编辑）
- **标签与内容区**：为模板配置「行标签 / 列标签 / 内容区」结构
  - 行标签：表格最左侧若干列（每列一层）
  - 列标签：表格最上方若干行（每行一层）
  - 内容区：标签之后的矩形区域，**仅此处允许用户填写**
- **填报保护**：用户进入填报视图后，标签区与内容区外的单元格一律只读，只能编辑内容区
- **角色与权限**：管理员创建角色、为角色分配模板；角色自动生成默认账号，可一键重置密码
- **独立保存**：每个用户针对每个模板的填报数据独立保存，再次进入自动加载已填内容

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
| 运营部 | 123456 | 运营部（角色默认账号，用户名=角色名） |
| op1 | pw123 | 运营部（演示用户） |

## 使用流程

1. 管理员登录 → 「模板管理」→ 新建/编辑模板，绘制表格并配置行标签列数、列标签行数、内容区行数列数（可「自动识别」）
2. 「角色与权限」→ 新增角色（自动生成默认账号）、将模板绑定给角色
3. 用户用角色账号登录 → 工作台看到被授权的模板 → 进入填报视图，填写内容区 → 保存

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
    ├── components/UniverSheet.tsx   # 核心表格组件（含标签保护）
    ├── api/                          # axios 封装与类型
    ├── pages/                        # 登录 / 管理端 / 工作台 / 填报视图
    ├── store/useAuthStore.ts        # 登录态（Zustand persist）
    └── utils/detectLabels.ts        # 标签自动识别
```

## 端到端测试

前置：先后台 `uvicorn` + 前端 `npm run dev`，并已 seed。在 `frontend/` 下运行：

```bash
node e2e.mjs          # 主流程
node e2e_labels.mjs   # 标签保护
node e2e_fixes.mjs    # 保存回读 / 退出登录
```

## 生产部署注意事项

- `backend/app/config.py` 中的 `SECRET_KEY` 为开发占位值，**生产环境务必通过环境变量覆盖**
- 更多架构决策与开发约定见 [AGENTS.md](./AGENTS.md)
