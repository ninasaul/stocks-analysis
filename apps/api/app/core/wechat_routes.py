"""微信登录相关的 API 路由"""
from datetime import timedelta
from fastapi import APIRouter, HTTPException, status, Depends, Query
from ..core.auth import create_access_token, create_refresh_token, get_current_user
from ..core.config import config
from ..user_management.schemas import (
    UserResponse, WechatLoginResponse, WechatQrCodeResponse,
    WechatBindRequest, WechatUserResponse
)
from ..user_management.services import WechatUserService, UserService
from datetime import datetime

router = APIRouter(prefix="/api/auth/wechat", tags=["微信登录"])


@router.get("/qrcode", response_model=WechatQrCodeResponse)
async def get_wechat_qrcode():
    """
    获取微信登录二维码

    返回微信授权登录URL，可以生成二维码供用户扫码

    Returns:
        包含二维码URL和state参数
    """
    import uuid
    state = str(uuid.uuid4())
    qr_url = WechatUserService.get_wechat_login_url(state)
    return WechatQrCodeResponse(qr_url=qr_url, state=state)


@router.post("/login", response_model=WechatLoginResponse)
async def wechat_login(code: str = Query(..., description="微信授权码")):
    """
    微信登录

    使用微信授权码进行登录
    - 如果是已绑定微信的老用户，直接登录成功
    - 如果是新用户，自动创建账号并登录

    Args:
        code: 微信授权码

    Returns:
        包含访问令牌、刷新令牌、用户信息和是否新用户
    """
    user, is_new_user = WechatUserService.process_wechat_login(code)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="微信登录失败",
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

    from ..user_management.services import RefreshTokenService
    RefreshTokenService.create_refresh_token(user.id, refresh_token, refresh_token_expires_at)

    return WechatLoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=UserResponse(**user.to_dict()),
        is_new_user=is_new_user
    )


@router.get("/bind/status", response_model=dict)
async def get_wechat_bind_status(current_user = Depends(get_current_user)):
    """
    获取当前用户的微信绑定状态

    Args:
        current_user: 当前登录的用户

    Returns:
        包含绑定状态的字典
    """
    is_bound = WechatUserService.is_wechat_bound(current_user.id)
    wechat_user = None

    if is_bound:
        wechat_user = WechatUserService.get_wechat_user_by_user_id(current_user.id)

    return {
        "is_bound": is_bound,
        "wechat_user": WechatUserResponse(**wechat_user.to_dict()) if wechat_user else None
    }


@router.post("/bind", response_model=WechatUserResponse)
async def bind_wechat(request: WechatBindRequest, current_user = Depends(get_current_user)):
    """
    绑定微信到当前用户

    需要用户已登录，通过微信授权码将微信绑定到当前账号
    一个用户只能绑定一个微信，一个微信只能绑定一个用户

    Args:
        request: 包含微信授权码的请求
        current_user: 当前登录的用户

    Returns:
        绑定成功返回微信用户信息
    """
    if WechatUserService.is_wechat_bound(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该用户已绑定微信"
        )

    token_info = WechatUserService.get_wechat_access_token(request.code)
    if token_info.get("errcode"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"微信授权失败: {token_info.get('errmsg', '未知错误')}"
        )

    openid = token_info.get("openid")
    unionid = token_info.get("unionid")
    access_token = token_info.get("access_token")

    if WechatUserService.get_wechat_user_by_openid(openid):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该微信已被其他用户绑定"
        )

    user_info = WechatUserService.get_wechat_user_info(access_token, openid)
    nickname = user_info.get("nickname")
    avatar_url = user_info.get("headimgurl")

    wechat_user = WechatUserService.bind_wechat_to_user(
        current_user.id, openid, unionid, nickname, avatar_url
    )

    if not wechat_user:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="绑定失败"
        )

    return WechatUserResponse(**wechat_user.to_dict())


@router.delete("/bind")
async def unbind_wechat(current_user = Depends(get_current_user)):
    """
    解除当前用户的微信绑定

    Args:
        current_user: 当前登录的用户

    Returns:
        解除成功消息
    """
    if not WechatUserService.is_wechat_bound(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该用户未绑定微信"
        )

    success = WechatUserService.unbind_wechat_from_user(current_user.id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="解除绑定失败"
        )

    return {"message": "成功解除微信绑定"}
