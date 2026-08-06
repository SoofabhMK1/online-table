from contextlib import asynccontextmanager

from fastapi import FastAPI

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

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(templates.router)
app.include_router(workspace.router)


@app.get("/api/health")
async def health_check() -> dict:
    """健康检查接口。"""
    return {"status": "ok"}