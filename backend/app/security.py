from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """使用 Bcrypt 算法生成密码哈希。"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    """校验明文密码与哈希是否匹配。"""
    return pwd_context.verify(plain_password, password_hash)


def _build_payload(user_id: int, role_id: int, role_name: str, expire: datetime) -> dict:
    payload: dict = {
        "sub": str(user_id),
        "role_id": role_id,
        "role_name": role_name,
        "iat": datetime.now(timezone.utc),
        "exp": expire,
    }
    if settings.JWT_ISSUER:
        payload["iss"] = settings.JWT_ISSUER
    if settings.JWT_AUDIENCE:
        payload["aud"] = settings.JWT_AUDIENCE
    return payload


def create_access_token(user_id: int, role_id: int, role_name: str) -> str:
    """生成 JWT Token，载荷中携带用户 ID、角色 ID 与角色名称。

    若 JWT_ISSUER / JWT_AUDIENCE 已配置则写入 iss / aud，便于跨服务防 token 复用。
    始终写入 iat（签发时间），便于审计。
    """
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = _build_payload(user_id, role_id, role_name, expire)
    return jwt.encode(
        payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )


def decode_token(token: str) -> dict:
    """解码 JWT Token，校验失败时抛出 jwt.PyJWTError。

    - 校验 iss / aud（若 JWT_ISSUER / JWT_AUDIENCE 已配置）
    - 容忍 ±JWT_LEEWAY_SECONDS 秒的时钟偏差（PyJWT 2.x: leeway 是顶层 kwarg）
    """
    decode_kwargs: dict = {
        "algorithms": [settings.ALGORITHM],
        "leeway": settings.JWT_LEEWAY_SECONDS,
    }
    if settings.JWT_AUDIENCE:
        decode_kwargs["audience"] = settings.JWT_AUDIENCE
    if settings.JWT_ISSUER:
        decode_kwargs["issuer"] = settings.JWT_ISSUER
    return jwt.decode(token, settings.SECRET_KEY, **decode_kwargs)