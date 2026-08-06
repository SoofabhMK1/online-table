from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.database import get_session
from app.dependencies import get_current_user
from app.models import Role, User
from app.schemas import ChangePasswordRequest, LoginRequest, TokenResponse
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