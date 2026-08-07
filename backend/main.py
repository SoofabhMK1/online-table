from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import create_db_and_tables
from app.routers import admin, auth, templates, workspace


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用启动时自动创建数据表。"""
    create_db_and_tables()
    yield


app = FastAPI(
    title="轻量级权限控制在线表格系统 API",
    version="0.2.0",
    lifespan=lifespan,
)

# CORS：仅在显式配置 CORS_ALLOWED_ORIGINS 时启用；开发通过 Vite 代理同源请求无需 CORS。
# 跨域部署时由环境变量注入（如 CORS_ALLOWED_ORIGINS="https://admin.example.com,https://app.example.com"）。
_cors_origins = [o.strip() for o in settings.CORS_ALLOWED_ORIGINS.split(",") if o.strip()]
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(templates.router)
app.include_router(workspace.router)


@app.get("/api/health")
async def health_check() -> dict:
    """健康检查接口。"""
    return {"status": "ok"}