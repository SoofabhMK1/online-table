"""轻量登录限流（按用户名维度，进程内）。

5 分钟内 ≥ 10 次失败 → 429；窗口随时间滑动。
仅保护最常见的口令爆破场景（短密码 + 单用户名），不做 IP 维度。
分布式部署需要替换为 Redis（保留接口 `_login_rate_limiter.check` 不变）。
"""

from collections import defaultdict, deque
from threading import Lock
import time

MAX_ATTEMPTS = 10
WINDOW_SECONDS = 300  # 5 分钟


class LoginRateLimiter:
    def __init__(self, max_attempts: int = MAX_ATTEMPTS, window: int = WINDOW_SECONDS) -> None:
        self._max_attempts = max_attempts
        self._window = window
        self._attempts: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, username: str) -> tuple[bool, int]:
        """返回 (allow, retry_after_seconds)；allow=False 时表示已限流。

        retry_after_seconds 为客户端应等待的秒数（基于最早一次失败的时间）。
        """
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


_login_rate_limiter = LoginRateLimiter()


def get_login_rate_limiter() -> LoginRateLimiter:
    return _login_rate_limiter