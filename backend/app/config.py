from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """全局配置项，从环境变量或默认值加载。"""

    SECRET_KEY: str = "change-me-in-production-please-use-env-1234567890"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    # SQLite 数据库文件路径（相对 backend 目录）。
    DATABASE_URL: str = f"sqlite:///{Path(__file__).resolve().parent.parent / 'app.db'}"

    # 管理员默认角色名（阶段二初始化脚本会用到）。
    ADMIN_ROLE_NAME: str = "管理员"

    # 角色默认账号的初始密码（管理员可为每个角色重置回该密码）。
    DEFAULT_USER_PASSWORD: str = "123456"

    class Config:
        env_file = ".env"


settings = Settings()