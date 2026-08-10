"""rate_limit 模块单测：InMemoryLimiter（默认后端）。"""
import time

from app.rate_limit import InMemoryLimiter, LoginRateLimiter


def test_inmemory_check_allows_when_under_limit():
    lim = InMemoryLimiter(max_attempts=3, window=60)
    for _ in range(3):
        assert lim.check("user") == (True, 0)


def test_inmemory_check_blocks_after_limit():
    lim = InMemoryLimiter(max_attempts=3, window=60)
    for _ in range(3):
        lim.record_failure("user")
    allowed, retry_after = lim.check("user")
    assert allowed is False
    assert retry_after > 0
    assert retry_after <= 60


def test_inmemory_separate_users_have_independent_buckets():
    lim = InMemoryLimiter(max_attempts=2, window=60)
    lim.record_failure("alice")
    lim.record_failure("alice")
    # alice 已超限
    assert lim.check("alice")[0] is False
    # bob 独立
    assert lim.check("bob")[0] is True


def test_inmemory_reset_clears_bucket():
    lim = InMemoryLimiter(max_attempts=2, window=60)
    lim.record_failure("user")
    lim.record_failure("user")
    assert lim.check("user")[0] is False
    lim.reset("user")
    assert lim.check("user")[0] is True


def test_inmemory_sliding_window():
    """窗口外的旧记录应被忽略。"""
    lim = InMemoryLimiter(max_attempts=2, window=1)
    lim.record_failure("user")
    lim.record_failure("user")
    assert lim.check("user")[0] is False
    time.sleep(1.1)
    # 窗口已过，bucket 应清空
    assert lim.check("user")[0] is True


def test_inmemory_satisfies_protocol():
    """InMemoryLimiter 必须实现 LoginRateLimiter 的 3 个方法。"""
    lim: LoginRateLimiter = InMemoryLimiter()
    assert hasattr(lim, "check")
    assert hasattr(lim, "record_failure")
    assert hasattr(lim, "reset")