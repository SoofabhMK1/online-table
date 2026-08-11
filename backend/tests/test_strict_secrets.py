"""SECRET_KEY 启动校验 — subprocess 验证。

通过 subprocess 启动 Python 解释器导入 `app.config.Settings`，
捕获 ValueError（启动失败）和 stdout/stderr 输出。
"""
import re
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
PYTHON_EXE = BACKEND_DIR / ".venv" / "Scripts" / "python.exe"


def _run_settings(SECRET_KEY: str, STRICT_SECRETS: str = "") -> subprocess.CompletedProcess:
    """subprocess 启动一个 Python 解释器，导入 Settings 并实例化。"""
    code = (
        "import sys; "
        f"sys.path.insert(0, r'{BACKEND_DIR}'); "
        "from app.config import Settings; "
        f"S = Settings(SECRET_KEY={SECRET_KEY!r}, STRICT_SECRETS={STRICT_SECRETS!r}); "
        "print('OK', len(S.SECRET_KEY))"
    )
    return subprocess.run(
        [str(PYTHON_EXE), "-c", code],
        capture_output=True,
        text=True,
        timeout=20,
        env={
            "PATH": str(BACKEND_DIR / ".venv" / "Scripts"),
            "SYSTEMROOT": "C:\\Windows",
        },
    )


class TestSecretKeyValidation:
    """AGENTS.md：SECRET_KEY 必须 ≥32 字节且不可为占位常量。"""

    def test_default_placeholder_with_strict_off_warns_but_passes(self):
        """默认占位 + STRICT_SECRETS=空 → 启动成功（仅 WARN）。"""
        result = _run_settings(
            "change-me-in-production-please-use-env-1234567890",
            STRICT_SECRETS="",
        )
        assert result.returncode == 0, (
            f"应成功启动，returncode={result.returncode}, "
            f"stderr={result.stderr}"
        )
        # 警告应输出到 stderr
        assert "SECRET_KEY" in result.stderr
        assert "WARN" in result.stderr.upper() or "不安全" in result.stderr
        # stdout 应有 OK
        assert "OK" in result.stdout

    def test_short_secret_key_with_strict_off_warns(self):
        """< 32 字节的 SECRET_KEY + STRICT_SECRETS=空 → 启动成功 + WARN。"""
        result = _run_settings("short_key_only_25_bytes!", STRICT_SECRETS="")
        assert result.returncode == 0
        assert "长度" in result.stderr or "32" in result.stderr

    def test_short_secret_with_strict_on_fails(self):
        """< 32 字节 + STRICT_SECRETS=1 → 启动失败（非零退出码）。"""
        result = _run_settings("short_key_only_25_bytes!", STRICT_SECRETS="1")
        assert result.returncode != 0, (
            f"应启动失败，returncode={result.returncode}, "
            f"stderr={result.stderr}"
        )
        # 错误信息应含「不安全」「STRICT_SECRETS」之一
        combined = result.stderr + result.stdout
        assert "SECRET_KEY" in combined
        assert "32" in combined or "不安全" in combined

    def test_placeholder_with_strict_on_fails(self):
        """占位 SECRET_KEY + STRICT_SECRETS=1 → 启动失败。"""
        # 含「change-me」占位
        result = _run_settings(
            "change-me-please-set-real-secret-32-bytes!!",
            STRICT_SECRETS="1",
        )
        assert result.returncode != 0, (
            f"应启动失败，returncode={result.returncode}, "
            f"stderr={result.stderr}"
        )
        combined = result.stderr + result.stdout
        assert "占位" in combined or "change-me" in combined
        assert "STRICT_SECRETS" in combined or "不安全" in combined

    def test_placeholder_with_strict_off_passes_but_warns(self):
        """占位 + STRICT_SECRETS=空 → 启动成功 + WARN。"""
        for placeholder in [
            "change-me-please-set-real-secret-32-bytes!!",
            "your-secret-here-replace-me-123456789",
            "this-is-just-a-placeholder-key-not-real",
        ]:
            r = _run_settings(placeholder, STRICT_SECRETS="")
            assert r.returncode == 0, f"占位 {placeholder[:20]}... 应启动成功"
            assert "WARN" in r.stderr.upper() or "占位" in r.stderr

    def test_strong_secret_with_strict_on_passes(self):
        """强 SECRET_KEY（≥32 字节 + 非占位）+ STRICT_SECRETS=1 → 启动成功。"""
        # 用不重复字符（避免触发 "xxxxxx" 占位检测）+ 长度 > 32
        strong = "abcdefghijklmnopqrstuvwxyz" * 2 + "0123456789"  # 52+10=62
        result = _run_settings(strong, STRICT_SECRETS="1")
        assert result.returncode == 0, (
            f"强密钥应启动成功，returncode={result.returncode}, "
            f"stderr={result.stderr}"
        )
        assert "OK" in result.stdout

    def test_placeholder_substrings_all_caught(self):
        """所有占位子串（change-me / placeholder / your-secret 等）都应被 STRICT_SECRETS=1 拦截。"""
        placeholders = [
            "change-me-32-bytes-padding-padding-pad",
            "this-is-a-placeholder-1234567890-padding",
            "your-secret-1234567890-padding-padding",
            "change_me_underscore_1234567890-padding",
            "example-secret-1234567890-padding-pad",
            "xxxxxx-1234567890-padding-padding-pad",
        ]
        for ph in placeholders:
            r = _run_settings(ph, STRICT_SECRETS="1")
            assert r.returncode != 0, (
                f"占位 {ph[:20]}... 应被 STRICT_SECRETS=1 拦截，"
                f"实际 returncode={r.returncode}"
            )

    def test_strong_secret_64_chars_passes_strict(self):
        """≥64 字符强密钥 + STRICT_SECRETS=1 → 启动成功。"""
        strong = "a" * 32 + "b" * 32 + "c" * 8
        r = _run_settings(strong, STRICT_SECRETS="1")
        assert r.returncode == 0
        assert "OK" in r.stdout

    def test_strict_off_with_short_key_warns(self):
        """STRICT_SECRETS=空 + 短 key → 启动成功 + WARN（不阻塞开发）。"""
        r = _run_settings("only_25_bytes_short_key", STRICT_SECRETS="")
        assert r.returncode == 0
        # 应警告「长度」
        assert "长度" in r.stderr or "32" in r.stderr