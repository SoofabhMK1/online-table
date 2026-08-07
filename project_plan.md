# 企划书：轻量级权限控制在线表格系统 (Project Plan)

> ⚠️ **历史企划书**（阶段一 ~ 阶段五），部分内容已被实现取代：例如 `user_workbooks` 已迁到 `role_workbooks`、AntD 已升级 v6、Univer 改用 `preset-sheets-core` 预设、新增组织架构/期间锁定/归档/数字校验等。当前架构以 [AGENTS.md](./AGENTS.md) 为准。

## 1. 项目概述
本项目是一个带有 RBAC (基于角色的访问控制) 的极其轻量的在线表格 Web 应用。核心业务逻辑为：管理员可以在线绘制 Excel 模板并分配给特定角色；不同角色的用户登录后，仅能看到并使用自己拥有权限的 Excel 模板进行数据填报，填报数据独立保存。

## 2. 技术栈标准说明
项目采用严格的前后端分离架构，必须完全遵照以下设定的最新技术栈进行代码生成，不可出现任何替代方案。

### 2.1 前端 (Frontend)
*   **框架**：React 19
*   **构建工具**：Vite 8.x (TypeScript 模板)
*   **路由**：React Router DOM
*   **状态管理**：Zustand
*   **UI 组件库**：Ant Design v6
*   **网络请求**：Axios (必须配置统一拦截器处理 JWT Bearer 注入及 401/403 异常拦截)
*   **表格核心引擎**：Univer v0.25.x (包含 `@univerjs/core`, `@univerjs/ui`, `@univerjs/docs`, `@univerjs/sheets` 等基础依赖模块)

### 2.2 后端 (Backend)
*   **框架**：FastAPI v0.141+ 
*   **语言环境**：Python 3.12+
*   **ORM**：SQLModel (底层结合 SQLAlchemy 和 Pydantic)
*   **认证机制**：PyJWT (JSON Web Token)，采用 Bearer Token 规范
*   **密码哈希**：Passlib (Bcrypt 算法)

### 2.3 数据库 (Database)
*   **引擎**：SQLite (纯单文件数据库，无需额外部署与安装)
*   **数据存储要求**：Univer 表格的 Snapshot 数据必须直接利用 SQLite 的原生 `JSON` / `JSONB` 数据类型进行存储与读取，禁止自行做二次的 Stringify/Parse 冗余处理。

---

## 3. 数据库设计 (Database Schema)
系统包含以下 5 张核心数据表（在 SQLModel 中定义并映射到 SQLite）：

1.  **`users` (用户表)**
    *   `id`: Integer, Primary Key
    *   `username`: String, Unique
    *   `password_hash`: String
    *   `role_id`: Integer, Foreign Key -> `roles.id`
2.  **`roles` (角色表)**
    *   `id`: Integer, Primary Key
    *   `name`: String, Unique (例如：管理员、财务部、运营部)
3.  **`templates` (模板表 - 管理员创建)**
    *   `id`: Integer, Primary Key
    *   `name`: String
    *   `snapshot`: JSON (利用 SQLite 存储 Univer 工作簿快照字典)
    *   `created_at`: DateTime
4.  **`role_template_mapping` (权限关联表)**
    *   `role_id`: Integer, Foreign Key
    *   `template_id`: Integer, Foreign Key
    *   *(设置组合主键)*
5.  **`user_workbooks` (用户填报数据表)**
    *   `id`: Integer, Primary Key
    *   `user_id`: Integer, Foreign Key -> `users.id`
    *   `template_id`: Integer, Foreign Key -> `templates.id`
    *   `snapshot`: JSON (存储用户填报后的 Univer 完整快照)
    *   `updated_at`: DateTime

---

## 4. RESTful API 接口定义

### 4.1 认证模块 (`/api/auth`)
*   `POST /api/auth/login`：接收用户名和密码，返回生成的 JWT Token。

### 4.2 角色与用户管理 (`/api/admin`) [需配置 Depends 校验 Admin 权限]
*   `GET /api/admin/roles`：获取系统角色列表。
*   `POST /api/admin/roles/{role_id}/templates`：为特定角色绑定所辖的模板 ID 列表。

### 4.3 模板管理 (`/api/templates`) [需配置 Depends 校验 Admin 权限]
*   `POST /api/templates`：新建模板 (接收 `{name, snapshot}`)。
*   `GET /api/templates`：拉取系统全部模板列表。
*   `PUT /api/templates/{id}`：更新现有模板的 Snapshot 数据。

### 4.4 用户工作台 (`/api/workspace`) [需配置 Depends 校验普通用户登录 Token]
*   `GET /api/workspace/templates`：读取请求上下文中用户的 `role_id`，查询其拥有的模板列表 (仅返回 id 和 name，减小体积)。
*   `GET /api/workspace/templates/{id}`：获取指定模板的完整 Snapshot 数据字典，用于交由前端初始化 Univer 引擎。
*   `POST /api/workspace/workbooks`：提交用户基于模板修改后的表格数据，持久化插入 `user_workbooks` 表。

---

## 5. 开发实施路线图 (Execution Steps)

### 阶段一：后端基础设施构建 (Backend Init)
1.  建立 Python 3.12 虚拟环境，执行 `pip install fastapi[standard] sqlmodel pyjwt passlib bcrypt`。
2.  配置本地 `app.db` 为 SQLite 数据库文件连接。
3.  根据第 3 节完成 SQLModel 的 Model class 定义，并编写 `create_db_and_tables` 触发函数建表。
4.  实现基于 PyJWT 的 Token 生成工具函数，并编写验证拦截的 FastAPI Dependency 依赖项。

### 阶段二：后端核心业务 API 编写 (Backend API)
1.  编写 `/api/auth/login` 接口与伪造初始 Admin 账号的脚本。
2.  编写模板表 CRUD，利用 Python 原生 `dict` 结构收发数据，直接映射至 SQLite JSON 字段。
3.  编写 `/api/workspace/templates` 多表联查逻辑。

### 阶段三：前端脚手架与路由架设 (Frontend Init)
1.  执行 `npm create vite@latest frontend -- --template react-ts` 创建工程。
2.  安装 `axios`, `react-router-dom`, `zustand`, `antd`。
3.  设定 Zustand Store 负责存储全局 `token`。
4.  编写 Axios Interceptor，实现请求头拦截与 `Authorization: Bearer <token>` 自动附加。
5.  配置路由划分为 Login、Admin、Workspace 三大模块，设置简单的 Redirect 路由守卫。

### 阶段四：Univer 组件封装 (Univer Integration)
1.  安装 `@univerjs/core`, `@univerjs/ui` 及必要的 sheets plugin 依赖。
2.  构建 `UniverSheet.tsx` 独立组件：
    *   **Props 传入**: 接收 `initialSnapshot` 对象。
    *   **Lifecycle**: 使用 `useEffect` 初始化实例化 `Univer` 对象。**在 `return` 卸载函数中必须调用 `univer.dispose()` 销毁实例以防内存泄漏**。
    *   **Ref/方法暴露**: 借助 `useImperativeHandle` 向上级抛出 `getWorkbookData()` 接口（其底层调用 Univer 获取最新 snapshot）。

### 阶段五：页面拼装与全栈联调 (UI & Integration)
1.  **Admin 端**：使用 Ant Design 的 `Table` 呈现模板列表，通过 `Modal` 对话框包裹 `UniverSheet` 组件实现在线建表，采用 `Transfer` (穿梭框) 实现角色模板绑定配置。
2.  **User 端**：主页展示当前用户拥有的所有模板入口，点击后跳转至全屏的 `UniverSheet` 填报视图，提供 `Save` 按钮调取后端 POST 保存接口。

---

## 6. AI 编码指令与规范 (Instructions for AI)
1.  **强类型约束**：Python 代码必须写全 Type Hints；React 组件及 Axios 请求返回值必须全量定义 TypeScript Interface / Type。
2.  **异步编程优先**：前端数据请求与后端路由处理一律使用 `async/await` 语法。
3.  **Hooks 规范**：前端一律只写 Functional Components (FC)，禁止出现任何 Class 形式的组件；状态流转优先依靠 Zustand 解决跨级传参。
4.  **UI 实用主义**：后台管理直接调用 AntD 5.x 现成排版与组件，保持代码干净，谢绝自行通过 CSS/Tailwind 从零开始画复杂的样式。
5.  **数据交互防呆**：对于 Univer 的 Snapshot 数据，前后端通信与 SQLite 落盘时将其视作标准 Object / Dict，不要在 Python 中用 `json.dumps()` 将其二次序列化为带转义符的字符串存储。