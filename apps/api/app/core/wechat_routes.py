"""微信登录相关的 API 路由"""
import os
from typing import Optional
from datetime import timedelta
from fastapi import APIRouter, HTTPException, status, Depends, Query
from ..core.auth import create_access_token, create_refresh_token, get_current_user
from ..core.config import config
from ..user_management.schemas import (
    UserResponse,
    UserUpdate,
    WechatLoginResponse,
    WechatQrCodeResponse,
    WechatBindRequest,
    WechatUserResponse,
    MiniprogramPhoneBindRequest,
)
from ..user_management.services import WechatUserService, UserService
from datetime import datetime

router = APIRouter(prefix="/api/auth/wechat", tags=["微信登录"])


def _build_unified_profile(user, wechat_user):
    """统一 user + wechat_user 的展示字段，供前端直接使用。"""
    return {
        "user_id": user.id,
        "username": user.username,
        "display_name": (user.display_name or (wechat_user.nickname if wechat_user else None)),
        "avatar_url": (user.avatar_url or (wechat_user.avatar_url if wechat_user else None)),
        "phone": user.phone,
        "email": user.email,
        "openid": wechat_user.openid if wechat_user else None,
        "unionid": wechat_user.unionid if wechat_user else None,
    }


def _build_miniprogram_user_response(user):
    """
    小程序登录响应中不透出占位字段。
    - username 为 wechat_mp_*/wechat_* 占位时，优先返回 display_name，否则空字符串
    - email 为 @placeholder.com 占位邮箱时，返回空字符串
    """
    payload = user.to_dict()
    username = payload.get("username") or ""
    email = payload.get("email") or ""

    if username.startswith("wechat_mp_") or username.startswith("wechat_"):
        payload["username"] = payload.get("display_name") or ""

    if email.endswith("@placeholder.com"):
        payload["email"] = ""

    return UserResponse(**payload)


@router.get("/qrcode", response_model=WechatQrCodeResponse)
async def get_wechat_qrcode():
    """
    获取微信登录二维码

    返回开放平台「网站应用」扫码授权 URL（需 WECHAT_APP_ID 为开放平台网站应用，非公众号/小程序 AppID）。

    Returns:
        包含二维码URL和state参数
    """
    if not os.getenv("WECHAT_APP_ID", "").strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="微信登录未配置（缺少 WECHAT_APP_ID）",
        )
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
    wechat_user = WechatUserService.get_wechat_user_by_user_id(user.id)

    return WechatLoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=_build_miniprogram_user_response(user),
        wechat_user=WechatUserResponse(**wechat_user.to_dict()) if wechat_user else None,
        profile=_build_unified_profile(user, wechat_user),
        is_new_user=is_new_user
    )


@router.post("/miniprogram/login", response_model=WechatLoginResponse)
async def wechat_miniprogram_login(
    code: str = Query(..., description="wx.login 返回的 code"),
    nickname: Optional[str] = Query(None, description="小程序端已授权的昵称（可选）"),
    avatar_url: Optional[str] = Query(None, description="小程序端已授权的头像 URL（可选）"),
):
    """
    微信小程序登录

    使用 jscode2session 换取 openid；与网页扫码的 code 不可混用。
    """
    user, is_new_user, err_msg = WechatUserService.process_wechat_miniprogram_login(
        code,
        nickname=nickname,
        avatar_url=avatar_url,
    )

    if not user:
        detail = err_msg or "微信小程序登录失败"
        # 配置错误、code 无效等场景返回 400，前端可直接展示修复提示
        status_code = status.HTTP_400_BAD_REQUEST
        if "账号不可用" in detail:
            status_code = status.HTTP_401_UNAUTHORIZED
        raise HTTPException(
            status_code=status_code,
            detail=detail,
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
    wechat_user = WechatUserService.get_wechat_user_by_user_id(user.id)

    return WechatLoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=UserResponse(**user.to_dict()),
        wechat_user=WechatUserResponse(**wechat_user.to_dict()) if wechat_user else None,
        profile=_build_unified_profile(user, wechat_user),
        is_new_user=is_new_user
    )


@router.post("/miniprogram/phone", response_model=UserResponse)
async def bind_miniprogram_phone(
    body: MiniprogramPhoneBindRequest,
    current_user=Depends(get_current_user),
):
    """
    小程序用户绑定手机号（新版「手机号快速验证」）。

    客户端使用 `open-type=getPhoneNumber` 取得 `e.detail.code` 后 POST 本接口；
    服务端使用小程序 access_token 调用 `getuserphonenumber` 换手机号，**不需要** encryptedData + session_key 解密流程。
    """
    phone, err = WechatUserService.get_phone_number_from_wxa_code(body.code)
    if err or not phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err or "获取手机号失败",
        )

    other = UserService.get_user_by_phone(phone)
    if other and other.id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该手机号已绑定其他账号",
        )

    updated = UserService.update_user(current_user.id, UserUpdate(phone=phone))
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="更新用户手机号失败",
        )
    return UserResponse(**updated.to_dict())


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
