"""登录限流接口与多种后端实现。

默认使用进程内 InMemoryLimiter（适合单进程 / 单机部署）。
配置 REDIS_URL 环境变量后切换到 RedisLimiter（分布式部署）：

- REDIS_URL=redis://localhost:6379/0        启用 Redis
- 不设置 / 空                                   退化为 InMemory

接口契约三个方法：
- check(key) -> (allow: bool, retry_after: int)
- record_failure(key)
- reset(key)
"""

from __future__ import annotations

import os
from collections import defaultdict, deque
from threading import Lock
import time
from typing import Protocol


MAX_ATTEMPTS = 10
WINDOW_SECONDS = 300  # 5 分钟


class LoginRateLimiter(Protocol):
    """限流器接口。`check` 返回是否放行 + 客户端应等待的秒数。"""

    def check(self, key: str) -> tuple[bool, int]: ...
    def record_failure(self, key: str) -> None: ...
    def reset(self, key: str) -> None: ...


class InMemoryLimiter:
    """进程内滑动窗口实现（线程安全）。重启后状态丢失。"""

    def __init__(self, max_attempts: int = MAX_ATTEMPTS, window: int = WINDOW_SECONDS) -> None:
        self._max_attempts = max_attempts
        self._window = window
        self._attempts: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, username: str) -> tuple[bool, int]:
        with self._lock:
            now = time.monotonic()
            dq = self._attempts[username]
            cutoff = now - self._window
            while dq and dq[0] < cutoff:
                dq.popleft()
            if len(dq) >= self._max_attempts:
                retry_after = int(self._window - (now - dq[0])) + 1
                return False, max(retry_after, 1)
            return True, 0

    def record_failure(self, username: str) -> None:
        with self._lock:
            self._attempts[username].append(time.monotonic())

    def reset(self, username: str) -> None:
        with self._lock:
            self._attempts.pop(username, None)


class RedisLimiter:
    """Redis 后端实现（分布式部署）。

    使用固定窗口（每 window 一个 key，TTL = window）+ 简单 INCR；
    损失一定的窗口精度，换取与 Redis 的原子性 + 跨进程一致性。
    """

    def __init__(self, redis_url: str, max_attempts: int = MAX_ATTEMPTS, window: int = WINDOW_SECONDS) -> None:
        try:
            import redis  # noqa: F401
        except ImportError as exc:
            raise RuntimeError(
                "RedisLimiter 需要 redis 依赖：pip install redis"
            ) from exc
        import redis as redis_pkg

        self._client = redis_pkg.Redis.from_url(redis_url, decode_responses=True)
        self._max = max_attempts
        self._window = window
        self._prefix = "login_rl:"

    def _key(self, username: str) -> str:
        # 固定窗口 key：秒级粒度
        bucket = int(time.time()) // self._window
        return f"{self._prefix}{username}:{bucket}"

    def check(self, username: str) -> tuple[bool, int]:
        try:
            count = int(self._client.get(self._key(username)) or 0)
        except Exception:
            # Redis 不可用时降级为放行（避免单点故障锁死登录）
            return True, 0
        if count >= self._max:
            retry_after = self._window - (int(time.time()) % self._window)
            return False, max(retry_after, 1)
        return True, 0

    def record_failure(self, username: str) -> None:
        try:
            key = self._key(username)
            pipe = self._client.pipeline()
            pipe.incr(key)
            pipe.expire(key, self._window)
            pipe.execute()
        except Exception:
            # 失败不阻塞业务
            pass

    def reset(self, username: str) -> None:
        try:
            # 清掉当前及前后一个窗口（避免跨窗口残留）
            cur_bucket = int(time.time()) // self._window
            for b in (cur_bucket - 1, cur_bucket, cur_bucket + 1):
                self._client.delete(f"{self._prefix}{username}:{b}")
        except Exception:
            pass


def _build_default_limiter() -> LoginRateLimiter:
    """根据 REDIS_URL 环境变量选择后端。"""
    redis_url = os.environ.get("REDIS_URL", "").strip()
    if redis_url:
        try:
            return RedisLimiter(redis_url)
        except Exception as exc:
            # 启动期 Redis 不可用时降级到内存实现（避免整个应用挂掉）
            import sys
            print(
                f"[WARN] 启用 Redis 限流失败：{exc}，回退到 InMemoryLimiter",
                file=sys.stderr,
            )
            return InMemoryLimiter()
    return InMemoryLimiter()


_login_rate_limiter: LoginRateLimiter = _build_default_limiter()


def get_login_rate_limiter() -> LoginRateLimiter:
    """返回当前配置的限流器实例（auth.py 通过此入口获取）。"""
    return _login_rate_limiter