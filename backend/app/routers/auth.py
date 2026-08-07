from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.database import get_session
from app.dependencies import get_current_user
from app.models import Role, User
from app.schemas import (
    ChangeAccountRequest,
    ChangePasswordRequest,
    LoginRequest,
    TokenResponse,
)
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, session: Session = Depends(get_session)) -> TokenResponse:
    """接收用户名密码，校验成功后签发 JWT Token。"""
    user = session.exec(
        select(User).where(User.username == body.username)
    ).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
        )
    role = session.get(Role, user.role_id)
    token = create_access_token(user.id, user.role_id, role.name)
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        username=user.username,
        role_id=user.role_id,
        role_name=role.name,
    )


@router.post("/change-password", response_model=dict)
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """当前登录用户修改自己的密码。"""
    if not verify_password(body.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="原密码错误"
        )
    current_user.password_hash = hash_password(body.new_password)
    session.add(current_user)
    session.commit()
    return {"message": "密码修改成功"}


@router.post("/change-account", response_model=dict)
async def change_account(
    body: ChangeAccountRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """当前登录用户修改自己的用户名/密码（需输入原密码确认身份）。"""
    if not verify_password(body.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="原密码错误"
        )
    changed = False
    if body.new_username is not None and body.new_username != current_user.username:
        existing = session.exec(
            select(User).where(User.username == body.new_username)
        ).first()
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="用户名已被占用"
            )
        current_user.username = body.new_username
        changed = True
    if body.new_password is not None:
        current_user.password_hash = hash_password(body.new_password)
        changed = True
    if not changed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="没有需要修改的内容"
        )
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return {"username": current_user.username, "message": "账号设置已保存"}