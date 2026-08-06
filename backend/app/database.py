from collections.abc import Generator
from datetime import datetime

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
    _migrate_workbooks()


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


def _migrate_workbooks() -> None:
    """轻量迁移：为 templates 补 year 字段；将旧 user_workbooks 迁移到 role_workbooks。"""
    from sqlalchemy import inspect, text

    inspector = inspect(engine)

    # 1. templates 补 year 列（默认当前年份）。
    t_columns = {c["name"] for c in inspector.get_columns("templates")}
    if "year" not in t_columns:
        with engine.connect() as conn:
            conn.execute(
                text(f"ALTER TABLE templates ADD COLUMN year INTEGER NOT NULL DEFAULT {datetime.now().year}")
            )
            conn.commit()

    # 2. 旧 user_workbooks 存在时，归并到新的 role_workbooks（role 维度共享），随后删除旧表。
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    if "user_workbooks" in tables:
        period = datetime.now().strftime("%Y-%m")
        with engine.begin() as conn:
            conn.execute(
                text(
                    f"""
                    INSERT INTO role_workbooks
                        (role_id, template_id, period, snapshot, status, submit_at, review_at, reject_reason, updated_at)
                    SELECT u.role_id, wb.template_id, '{period}', wb.snapshot, 'draft', NULL, NULL, NULL, wb.updated_at
                    FROM user_workbooks wb
                    JOIN users u ON u.id = wb.user_id
                    WHERE NOT EXISTS (
                        SELECT 1 FROM role_workbooks rw
                        WHERE rw.role_id = u.role_id
                          AND rw.template_id = wb.template_id
                          AND rw.period = '{period}'
                    )
                    """
                )
            )
            conn.execute(text("DROP TABLE user_workbooks"))


def get_session() -> Generator[Session, None, None]:
    """FastAPI 依赖：为每个请求提供独立的数据库会话。"""
    with Session(engine) as session:
        yield session