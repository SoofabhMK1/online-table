"""初始化脚本：创建初始 Admin 账号与基础角色，幂等可重复执行。

用法：python seed.py
"""

from sqlmodel import Session, select

from app.config import settings
from app.database import create_db_and_tables, engine
from app.models import Role, User
from app.security import hash_password

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"


def ensure_admin() -> None:
    """创建（若不存在）管理员角色与初始 Admin 账号。"""
    create_db_and_tables()

    with Session(engine) as session:
        role = session.exec(
            select(Role).where(Role.name == settings.ADMIN_ROLE_NAME)
        ).first()
        if role is None:
            role = Role(name=settings.ADMIN_ROLE_NAME)
            session.add(role)
            session.commit()
            session.refresh(role)

        user = session.exec(
            select(User).where(User.username == ADMIN_USERNAME)
        ).first()
        if user is None:
            user = User(
                username=ADMIN_USERNAME,
                password_hash=hash_password(ADMIN_PASSWORD),
                role_id=role.id,
            )
            session.add(user)
            session.commit()

        print(f"管理员账号: {user.username} / {ADMIN_PASSWORD}")


if __name__ == "__main__":
    ensure_admin()