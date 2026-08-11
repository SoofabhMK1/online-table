"""测试辅助：还原 op1 用户到 (op1, pw123)。

用法：python _test_helper_reset_op1.py
"""
import sqlite3
import sys
from pathlib import Path

# 用 backend 的 venv 与模块
backend_dir = Path(__file__).resolve().parent.parent / 'backend'
sys.path.insert(0, str(backend_dir))

from app.security import hash_password  # noqa: E402

db_path = backend_dir / 'app.db'
conn = sqlite3.connect(str(db_path))
new_hash = hash_password('pw123')

# 1) 把所有 op1_renamed_* 用户的 username 改回 'op1'，password 改回 pw123
#    先看是否有冲突（已存在 op1）
exists = conn.execute("SELECT id FROM users WHERE username='op1'").fetchone()
if exists:
    # 已存在 op1（不是 renamed 起源），删除 renamed 残留
    conn.execute("DELETE FROM users WHERE username LIKE 'op1_renamed_%'")
else:
    conn.execute(
        "UPDATE users SET username='op1', password_hash=? WHERE username LIKE 'op1_renamed_%'",
        (new_hash,),
    )
conn.commit()
conn.close()
print('op1 restored to (op1, pw123)')