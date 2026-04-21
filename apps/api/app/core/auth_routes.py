"""JWT 认证相关的 API 路由"""
from datetime import timedelta
from fastapi import APIRouter, HTTPException, status, Depends, Request
from fastapi.security import OAuth2PasswordRequestForm
from ..core.auth import authenticate_user, create_access_token, create_refresh_token, get_current_user, verify_token, add_token_to_blacklist
from ..core.config import config
from ..core.rate_limit import rate_limit_login
from ..user_management.schemas import UserCreate, UserResponse, LoginResponse, RefreshTokenRequest, RefreshTokenResponse, LogoutRequest
from ..user_management.services import UserService, RefreshTokenService
from datetime import datetime

router = APIRouter(prefix="/api/auth", tags=["认证"])


@router.post("/login", response_model=LoginResponse)
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    """
    用户登录

    使用 OAuth2 密码流进行登录，返回 JWT 访问令牌和刷新令牌
    支持多种登录方式：用户名+密码、邮箱+密码、手机号+密码

    Args:
        request: HTTP 请求对象（用于速率限制）
        form_data: 登录表单数据（用户名和密码）

    Returns:
        包含访问令牌、刷新令牌和用户信息的响应

    Raises:
        HTTPException: 如果登录凭证错误
    """
    rate_limit_login(request, form_data.username)

    user = authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录凭证错误",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username},
        expires_delta=access_token_expires
    )

    refresh_token_expires = timedelta(days=7)
    refresh_token = create_refresh_token(
        data={"sub": user.username, "type": "refresh"},
        expires_delta=refresh_token_expires
    )
    refresh_token_expires_at = datetime.utcnow() + refresh_token_expires

    RefreshTokenService.create_refresh_token(user.id, refresh_token, refresh_token_expires_at)

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=UserResponse(**user.to_dict())
    )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate):
    """
    用户注册

    创建新用户并返回用户信息

    Args:
        user_data: 用户注册信息

    Returns:
        创建的用户信息

    Raises:
        HTTPException: 如果用户名或邮箱已存在
    """
    if UserService.get_user_by_username(user_data.username):
        raise HTTPException(status_code=400, detail="用户名已存在")

    if UserService.get_user_by_email(user_data.email):
        raise HTTPException(status_code=400, detail="邮箱已被注册")

    user = UserService.create_user(user_data)
    if not user:
        raise HTTPException(status_code=500, detail="创建用户失败")

    return UserResponse(**user.to_dict())


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user = Depends(get_current_user)):
    """
    获取当前用户信息

    需要在请求头中提供有效的 JWT 令牌

    Args:
        current_user: 当前登录的用户（通过依赖注入获取）

    Returns:
        当前用户的信息
    """
    return UserResponse(**current_user.to_dict())


@router.post("/refresh", response_model=RefreshTokenResponse)
async def refresh_access_token(request_data: RefreshTokenRequest):
    """
    刷新访问令牌

    使用刷新令牌获取新的访问令牌（旧刷新令牌会被撤销，新刷新令牌会返回）

    Args:
        request_data: 包含刷新令牌的请求数据

    Returns:
        包含新访问令牌和新刷新令牌的响应

    Raises:
        HTTPException: 如果刷新令牌无效或已过期
    """
    refresh_token = RefreshTokenService.get_refresh_token_by_token(request_data.refresh_token)
    if not refresh_token or not refresh_token.is_valid():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效或已过期的刷新令牌",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = UserService.get_user_by_id(refresh_token.user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )

    access_token_expires = timedelta(minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES)
    new_access_token = create_access_token(
        data={"sub": user.username},
        expires_delta=access_token_expires
    )

    new_refresh_token_expires = timedelta(days=7)
    new_refresh_token = create_refresh_token(
        data={"sub": user.username, "type": "refresh"},
        expires_delta=new_refresh_token_expires
    )
    new_refresh_token_expires_at = datetime.utcnow() + new_refresh_token_expires

    old_refresh_token_obj = RefreshTokenService.get_refresh_token_by_token(request_data.refresh_token)
    if old_refresh_token_obj:
        add_token_to_blacklist(request_data.refresh_token, "refresh", user.id, old_refresh_token_obj.expires_at)

    RefreshTokenService.rotate_refresh_token(
        request_data.refresh_token,
        new_refresh_token,
        new_refresh_token_expires_at
    )

    return RefreshTokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        token_type="bearer"
    )


@router.post("/logout")
async def logout(request: Request, request_data: LogoutRequest, current_user = Depends(get_current_user)):
    """
    用户登出

    撤销指定的刷新令牌或用户的所有刷新令牌，并将令牌加入黑名单

    Args:
        request: HTTP 请求对象
        request_data: 登出请求数据
        current_user: 当前登录的用户

    Returns:
        成功登出的消息
    """
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        access_token = auth_header.split(" ")[1]
        payload = verify_token(access_token)
        if payload:
            expires_at = datetime.fromtimestamp(payload.get("exp"))
            add_token_to_blacklist(access_token, "access", current_user.id, expires_at)

    if request_data.refresh_token:
        refresh_token = RefreshTokenService.get_refresh_token_by_token(request_data.refresh_token)
        if refresh_token and refresh_token.user_id == current_user.id:
            add_token_to_blacklist(request_data.refresh_token, "refresh", current_user.id, refresh_token.expires_at)
            RefreshTokenService.revoke_refresh_token(refresh_token.id)
    else:
        RefreshTokenService.revoke_all_user_tokens(current_user.id)

    return {"message": "成功登出"}
