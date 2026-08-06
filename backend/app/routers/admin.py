from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.config import settings
from app.database import get_session
from app.dependencies import get_current_admin
from app.models import Role, RoleTemplateMapping, Template, User
from app.schemas import RoleCreate, RoleRead, RoleTemplateBind
from app.security import hash_password

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(get_current_admin)])


def _ensure_role_default_user(session: Session, role: Role) -> User:
    """确保角色存在默认账号（用户名=角色名），不存在则创建。"""
    user = session.exec(
        select(User).where(User.username == role.name)
    ).first()
    if user is None:
        user = User(
            username=role.name,
            password_hash=hash_password(settings.DEFAULT_USER_PASSWORD),
            role_id=role.id,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
    return user


@router.get("/roles", response_model=list[RoleRead])
async def list_roles(session: Session = Depends(get_session)) -> list[Role]:
    """获取系统角色列表（不含管理员角色，避免管理员误删自身）。"""
    return session.exec(
        select(Role).where(Role.name != settings.ADMIN_ROLE_NAME)
    ).all()


@router.post("/roles", response_model=RoleRead, status_code=status.HTTP_201_CREATED)
async def create_role(
    body: RoleCreate, session: Session = Depends(get_session)
) -> Role:
    """创建新角色，并自动为其创建默认账号（用户名=角色名，密码=初始密码）。"""
    if body.name == settings.ADMIN_ROLE_NAME:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="管理员角色为系统保留角色"
        )
    existing = session.exec(
        select(Role).where(Role.name == body.name)
    ).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="角色已存在"
        )
    role = Role(name=body.name)
    session.add(role)
    session.commit()
    session.refresh(role)
    _ensure_role_default_user(session, role)
    return role


@router.post("/roles/{role_id}/reset-password", response_model=dict)
async def reset_role_password(
    role_id: int, session: Session = Depends(get_session)
) -> dict:
    """将角色的默认账号密码重置为统一初始密码。"""
    role = session.get(Role, role_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="角色不存在")
    if role.name == settings.ADMIN_ROLE_NAME:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="管理员角色不可重置"
        )
    user = _ensure_role_default_user(session, role)
    user.password_hash = hash_password(settings.DEFAULT_USER_PASSWORD)
    session.add(user)
    session.commit()
    return {"username": user.username, "password": settings.DEFAULT_USER_PASSWORD}


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(role_id: int, session: Session = Depends(get_session)) -> None:
    """删除角色（同时解除其模板绑定与默认账号，并要求角色下无其他用户）。"""
    role = session.get(Role, role_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="角色不存在")
    if role.name == settings.ADMIN_ROLE_NAME:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="管理员角色不可删除"
        )
    other_users = session.exec(
        select(User).where(User.role_id == role_id, User.username != role.name)
    ).all()
    if other_users:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="该角色下存在用户，无法删除"
        )
    for link in session.exec(
        select(RoleTemplateMapping).where(RoleTemplateMapping.role_id == role_id)
    ).all():
        session.delete(link)
    default_user = session.exec(
        select(User).where(User.username == role.name)
    ).first()
    if default_user is not None:
        session.delete(default_user)
    session.delete(role)
    session.commit()


@router.get("/roles/{role_id}/templates", response_model=list[int])
async def get_role_templates(
    role_id: int,
    session: Session = Depends(get_session),
) -> list[int]:
    """获取指定角色当前绑定的模板 ID 列表。"""
    role = session.get(Role, role_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="角色不存在")

    links = session.exec(
        select(RoleTemplateMapping).where(RoleTemplateMapping.role_id == role_id)
    ).all()
    return [link.template_id for link in links]


@router.post("/roles/{role_id}/templates", response_model=dict)
async def bind_templates(
    role_id: int,
    body: RoleTemplateBind,
    session: Session = Depends(get_session),
) -> dict:
    """为特定角色绑定所辖的模板 ID 列表（全量覆盖）。"""
    role = session.get(Role, role_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="角色不存在")

    for template_id in body.template_ids:
        if session.get(Template, template_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"模板 {template_id} 不存在",
            )

    for link in session.exec(
        select(RoleTemplateMapping).where(RoleTemplateMapping.role_id == role_id)
    ).all():
        session.delete(link)

    for template_id in body.template_ids:
        session.add(
            RoleTemplateMapping(role_id=role_id, template_id=template_id)
        )
    session.commit()
    return {"role_id": role_id, "template_ids": body.template_ids}