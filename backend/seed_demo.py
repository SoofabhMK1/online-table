"""初始化演示数据：创建普通角色及其默认账号（幂等）。

用法：python seed_demo.py
"""

from sqlmodel import Session, select

from app.config import settings
from app.database import create_db_and_tables, engine
from app.models import Role, User
from app.security import hash_password

DEMO_ROLE = "运营部"
DEMO_USER = "op1"
DEMO_PASSWORD = "pw123"


def ensure_demo() -> None:
    create_db_and_tables()
    with Session(engine) as session:
        role = session.exec(
            select(Role).where(Role.name == DEMO_ROLE)
        ).first()
        if role is None:
            role = Role(name=DEMO_ROLE)
            session.add(role)
            session.commit()
            session.refresh(role)

        # 角色的默认账号（用户名=角色名，密码=统一初始密码）
        default = session.exec(
            select(User).where(User.username == role.name)
        ).first()
        if default is None:
            default = User(
                username=role.name,
                password_hash=hash_password(settings.DEFAULT_USER_PASSWORD),
                role_id=role.id,
            )
            session.add(default)
            session.commit()

        user = session.exec(
            select(User).where(User.username == DEMO_USER)
        ).first()
        if user is None:
            user = User(
                username=DEMO_USER,
                password_hash=hash_password(DEMO_PASSWORD),
                role_id=role.id,
            )
            session.add(user)
            session.commit()

        print(
            f"演示角色: {DEMO_ROLE}（默认账号 {DEMO_ROLE} / {settings.DEFAULT_USER_PASSWORD}）"
        )
        print(f"演示用户: {DEMO_USER} / {DEMO_PASSWORD}（角色：{DEMO_ROLE}）")


if __name__ == "__main__":
    ensure_demo()