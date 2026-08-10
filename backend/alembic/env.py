"""Alembic env：使用项目 settings 中的 DATABASE_URL，并基于 SQLModel metadata autogenerate。

参考：https://alembic.sqlalchemy.org/en/latest/autogenerate.html
"""
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# 项目内导入
from app.config import settings
from app.database import _enable_sqlite_foreign_keys  # noqa: F401  触发 FK pragma 事件监听
import app.models  # noqa: F401  注册 SQLModel.metadata
from sqlmodel import SQLModel

# Alembic Config 对象
config = context.config
# 用项目 settings 覆盖 sqlalchemy.url（alembic.ini 中的占位）
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# 启用日志
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# autogenerate 的 metadata 来源
target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    """offline 模式：仅用 SQL 字符串生成迁移脚本，无需 DB 连接。"""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,  # SQLite ALTER TABLE 需要 batch mode
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """online 模式：创建 Engine 连接数据库，逐 migration 执行。"""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # SQLite batch
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()