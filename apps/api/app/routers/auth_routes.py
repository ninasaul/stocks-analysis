"""认证相关的 API 路由"""
from fastapi import APIRouter, HTTPException, status, Depends, Request, Body
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta, datetime
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext

from ..core.config import config
from ..user_management.models import User
from ..user_management.schemas import LoginRequest, UserResponse, LoginResponse, RefreshTokenRequest, RefreshTokenResponse, UserCreate, LogoutRequest
from ..user_management.services import UserService, RefreshTokenService, TokenBlacklistService
from ..core.auth import create_access_token, create_refresh_token, get_current_user, get_password_hash, verify_password, oauth2_scheme
from ..core.logging import logger
from ..core.rate_limit import check_rate_limit

router = APIRouter(prefix="/api/auth", tags=["认证"])


@router.post("/register", response_model=UserResponse)
async def register(
    username: str = Body(..., min_length=3, max_length=50, description="用户名"),
    password: str = Body(..., min_length=8, max_length=16, description="密码"),
    email: Optional[str] = Body(None, description="邮箱"),
    phone: Optional[str] = Body(None, description="手机号")
) -> UserResponse:
    """
    用户注册

    Args:
        username: 用户名
        password: 密码
        email: 邮箱（可选）
        phone: 手机号（可选）

    Returns:
        注册成功的用户信息
    """
    # 检查用户名是否已存在
    if UserService.get_user_by_username(username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已存在"
        )

    # 检查邮箱是否已存在
    if email and UserService.get_user_by_email(email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="邮箱已被注册"
        )

    # 检查手机号是否已存在
    if phone and UserService.get_user_by_phone(phone):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="手机号已被注册"
        )

    # 创建新用户
    # 生成占位邮箱（如果未提供）
    if not email:
        email = f"{username}@placeholder.com"
    
    user_data = UserCreate(
        username=username,
        password=password,
        email=email,
        phone=phone
    )
    user = UserService.create_user(user_data)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="用户创建失败"
        )

    logger.info(f"新用户注册: {username}")
    return UserResponse(**user.to_dict())


@router.post("/login", response_model=LoginResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    request: Request = None
) -> LoginResponse:
    """
    用户登录

    Args:
        form_data: 登录表单数据

    Returns:
        访问令牌和刷新令牌
    """
    # 获取客户端IP地址
    client_ip = request.client.host if request else "unknown"
    
    # 检查登录速率限制（基于IP）
    ip_key = f"login:ip:{client_ip}"
    ip_allowed, ip_remaining, ip_retry_after = check_rate_limit(ip_key, 20, 60)  # 20次/分钟
    if not ip_allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"登录尝试过于频繁，请 {ip_retry_after} 秒后再试",
            headers={"Retry-After": str(ip_retry_after)}
        )
    
    # 检查登录速率限制（基于用户名）
    username_key = f"login:user:{form_data.username}"
    user_allowed, user_remaining, user_retry_after = check_rate_limit(username_key, 10, 60)  # 10次/分钟
    if not user_allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"该账号登录尝试过于频繁，请 {user_retry_after} 秒后再试",
            headers={"Retry-After": str(user_retry_after)}
        )

    # 验证用户 - 支持用户名、邮箱或手机号登录
    user = None
    # 尝试按用户名查找
    user = UserService.get_user_by_username(form_data.username)
    # 如果不是用户名，尝试按邮箱查找
    if not user and '@' in form_data.username:
        user = UserService.get_user_by_email(form_data.username)
    # 如果不是邮箱，尝试按手机号查找
    if not user:
        user = UserService.get_user_by_phone(form_data.username)
    
    if not user or not verify_password(form_data.password, user.password_hash):
        logger.warning(f"登录失败: {form_data.username} (IP: {client_ip})")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 创建访问令牌
    access_token_expires = timedelta(minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username},
        expires_delta=access_token_expires
    )

    # 创建刷新令牌
    refresh_token_expires = timedelta(days=7)
    refresh_token = create_refresh_token(
        data={"sub": user.username, "type": "refresh"},
        expires_delta=refresh_token_expires
    )
    refresh_token_expires_at = user.created_at + refresh_token_expires

    # 保存刷新令牌到数据库
    RefreshTokenService.create_refresh_token(user.id, refresh_token, refresh_token_expires_at)

    logger.info(f"用户登录成功: {user.username} (IP: {client_ip})")
    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=UserResponse(**user.to_dict())
    )


@router.post("/refresh", response_model=RefreshTokenResponse)
async def refresh_token(
    request: RefreshTokenRequest
) -> RefreshTokenResponse:
    """
    刷新访问令牌

    Args:
        request: 包含刷新令牌的请求

    Returns:
        新的访问令牌和刷新令牌
    """
    refresh_token = request.refresh_token
    
    # 检查刷新令牌是否在黑名单中
    if TokenBlacklistService.is_token_blacklisted(refresh_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="刷新令牌已失效",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        # 验证刷新令牌
        payload = jwt.decode(
            refresh_token,
            config.SECRET_KEY,
            algorithms=[config.ALGORITHM]
        )
        username: str = payload.get("sub")
        token_type: str = payload.get("type")
        
        if username is None or token_type != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="无效的刷新令牌",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # 检查刷新令牌是否存在于数据库
        user = UserService.get_user_by_username(username)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户不存在",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # 验证刷新令牌是否有效
        if not RefreshTokenService.is_refresh_token_valid(user.id, refresh_token):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="刷新令牌已失效",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的刷新令牌",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 创建新的访问令牌
    access_token_expires = timedelta(minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username},
        expires_delta=access_token_expires
    )

    # 创建新的刷新令牌
    refresh_token_expires = timedelta(days=7)
    new_refresh_token = create_refresh_token(
        data={"sub": user.username},
        expires_delta=refresh_token_expires
    )
    refresh_token_expires_at = datetime.utcnow() + refresh_token_expires

    # 保存新的刷新令牌到数据库
    RefreshTokenService.create_refresh_token(user.id, new_refresh_token, refresh_token_expires_at)
    
    # 将旧的刷新令牌加入黑名单
    TokenBlacklistService.blacklist_token(refresh_token, user_id=user.id, token_type='refresh')

    logger.info(f"用户令牌刷新成功: {user.username}")
    return RefreshTokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        user=UserResponse(**user.to_dict())
    )


@router.post("/logout")
async def logout(
    request: LogoutRequest,
    current_user: User = Depends(get_current_user),
    token: str = Depends(oauth2_scheme)
) -> dict:
    """
    用户登出

    Args:
        request: 包含刷新令牌的请求
        current_user: 当前登录的用户
        token: 当前的访问令牌

    Returns:
        登出成功消息
    """
    # 将访问令牌加入黑名单
    TokenBlacklistService.blacklist_token(token, user_id=current_user.id, token_type='access')
    # 将刷新令牌加入黑名单
    TokenBlacklistService.blacklist_token(request.refresh_token, user_id=current_user.id, token_type='refresh')
    logger.info(f"用户登出: {current_user.username}")
    return {"message": "登出成功"}


@router.post("/logout/all")
async def logout_all(
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    用户登出所有设备

    Args:
        current_user: 当前登录的用户

    Returns:
        登出成功消息
    """
    # 清除用户的所有刷新令牌
    RefreshTokenService.delete_user_refresh_tokens(current_user.id)
    logger.info(f"用户登出所有设备: {current_user.username}")
    return {"message": "已从所有设备登出"}