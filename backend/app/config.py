from pathlib import Path
import os
import sys

from pydantic import model_validator
from pydantic_settings import BaseSettings

_PLACEHOLDER_SUBSTRINGS = (
    "change-me",
    "change_me",
    "placeholder",
    "your-secret",
    "your_secret",
    "example",
    "xxxxxx",
)


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

    # 生产环境校验开关：设为 "1" 时 SECRET_KEY 必须非占位且 ≥ 32 字节（启动即抛错）。
    # 开发环境留空，仅打印警告，避免本地开发摩擦。
    STRICT_SECRETS: str = ""

    class Config:
        env_file = ".env"

    @model_validator(mode="after")
    def _validate_secret_key(self) -> "Settings":
        """生产环境必须显式设置 SECRET_KEY：长度 ≥ 32 且不可为占位常量。

        - STRICT_SECRETS=1（生产部署建议开启）：任何不合规即抛错，启动失败。
        - 默认（开发环境）：仅打印 WARNING，不阻塞启动。
        """
        key = self.SECRET_KEY
        is_weak = False
        reasons: list[str] = []
        if len(key) < 32:
            is_weak = True
            reasons.append(f"长度 {len(key)} < 32")
        lowered = key.lower()
        for token in _PLACEHOLDER_SUBSTRINGS:
            if token in lowered:
                is_weak = True
                reasons.append(f"含占位串「{token}」")
                break
        if not is_weak:
            return self
        message = (
            "[WARN] SECRET_KEY 不安全（{reasons}）。生产部署请设置 STRICT_SECRETS=1 "
            "并通过环境变量注入 ≥32 字节随机密钥。"
        ).format(reasons="; ".join(reasons))
        if self.STRICT_SECRETS == "1":
            raise ValueError(message.replace("[WARN]", "[ERROR]"))
        print(message, file=sys.stderr)
        return self


settings = Settings()