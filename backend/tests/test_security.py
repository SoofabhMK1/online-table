"""security 模块单测：JWT encode/decode + iss/aud/leeway。"""
import time

import jwt
import pytest

from app.config import settings
from app.security import create_access_token, decode_token


def test_token_round_trip_basic():
    token = create_access_token(user_id=1, role_id=2, role_name="测试")
    payload = decode_token(token)
    assert payload["sub"] == "1"
    assert payload["role_id"] == 2
    assert payload["role_name"] == "测试"
    assert "exp" in payload
    assert "iat" in payload


def test_token_with_issuer_audience_round_trip():
    """JWT_ISSUER / JWT_AUDIENCE 启用时，签发与解码应通过。"""
    from app.config import Settings

    original_iss = settings.JWT_ISSUER
    original_aud = settings.JWT_AUDIENCE
    settings.JWT_ISSUER = "https://auth.example.com"
    settings.JWT_AUDIENCE = "online-table-api"
    try:
        token = create_access_token(user_id=42, role_id=1, role_name="x")
        payload = decode_token(token)
        assert payload["iss"] == "https://auth.example.com"
        assert payload["aud"] == "online-table-api"
    finally:
        settings.JWT_ISSUER = original_iss
        settings.JWT_AUDIENCE = original_aud


def test_token_rejects_wrong_audience():
    from app.config import Settings

    original_aud = settings.JWT_AUDIENCE
    settings.JWT_AUDIENCE = "online-table-api"
    try:
        # 手动伪造一个 aud=other 的 token
        payload = {
            "sub": "1",
            "role_id": 1,
            "role_name": "x",
            "aud": "evil-service",
            "exp": int(time.time()) + 60,
            "iat": int(time.time()),
        }
        bad = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        with pytest.raises(jwt.InvalidAudienceError):
            decode_token(bad)
    finally:
        settings.JWT_AUDIENCE = original_aud


def test_token_rejects_expired():
    expired = jwt.encode(
        {
            "sub": "1",
            "role_id": 1,
            "role_name": "x",
            "exp": int(time.time()) - 3600,  # 1 小时前过期
            "iat": int(time.time()) - 7200,
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    with pytest.raises(jwt.ExpiredSignatureError):
        decode_token(expired)


def test_token_leeway_accepts_just_expired():
    """JWT_LEEWAY_SECONDS=10 时，刚过期 5 秒仍可解码。"""
    from app.config import Settings

    original_leeway = settings.JWT_LEEWAY_SECONDS
    settings.JWT_LEEWAY_SECONDS = 10
    try:
        just_expired = jwt.encode(
            {
                "sub": "1",
                "role_id": 1,
                "role_name": "x",
                "exp": int(time.time()) - 5,  # 5 秒前过期
                "iat": int(time.time()) - 100,
            },
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM,
        )
        # 应通过（leeway 容忍）
        payload = decode_token(just_expired)
        assert payload["sub"] == "1"
    finally:
        settings.JWT_LEEWAY_SECONDS = original_leeway