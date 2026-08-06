from collections.abc import Generator

from sqlmodel import SQLModel, Session, create_engine

from app.config import settings

# SQLite 单文件数据库连接引擎。
# 关闭 check_same_thread 以满足 FastAPI 在线程池中访问 SQLite 的需求。
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},
)


def create_db_and_tables() -> None:
    """依据 SQLModel 元数据创建所有数据表（若不存在）。"""
    # 导入 models 模块确保其被 SQLModel.metadata 注册。
    import app.models  # noqa: F401

    SQLModel.metadata.create_all(bind=engine)
    _migrate_templates_columns()


def _migrate_templates_columns() -> None:
    """轻量迁移：为已存在的 templates 表补充新增的标签列字段。"""
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    columns = {c["name"] for c in inspector.get_columns("templates")}
    with engine.connect() as conn:
        for col in ("row_label_cols", "col_label_rows", "content_rows", "content_cols"):
            if col not in columns:
                conn.execute(text(f"ALTER TABLE templates ADD COLUMN {col} INTEGER NOT NULL DEFAULT 0"))
        conn.commit()


def get_session() -> Generator[Session, None, None]:
    """FastAPI 依赖：为每个请求提供独立的数据库会话。"""
    with Session(engine) as session:
        yield session