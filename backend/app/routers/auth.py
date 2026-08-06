from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.database import get_session
from app.models import Role, User
from app.schemas import LoginRequest, TokenResponse
from app.security import create_access_token, verify_password

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