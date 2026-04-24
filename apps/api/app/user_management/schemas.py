"""Pydantic 模型 - 用于请求和响应验证"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field, validator
from .models import UserStatus, MembershipType, MembershipStatus


class UserCreate(BaseModel):
    """用户创建请求模型"""
    username: str = Field(..., min_length=3, max_length=50, description="用户名")
    email: EmailStr = Field(..., description="邮箱")
    password: str = Field(..., min_length=8, max_length=16, description="密码长度必须在8-16位之间")
    phone: Optional[str] = Field(None, max_length=20, description="手机号")

    @validator('username')
    def username_alphanumeric(cls, v):
        import re
        if not re.match(r'^[a-zA-Z0-9_-]+$', v):
            raise ValueError('用户名只能包含字母、数字、下划线和连字符')
        return v


class UserUpdate(BaseModel):
    """用户更新请求模型"""
    email: Optional[EmailStr] = Field(None, description="邮箱")
    phone: Optional[str] = Field(None, max_length=20, description="手机号")
    status: Optional[UserStatus] = Field(None, description="用户状态")


class UserResponse(BaseModel):
    """用户响应模型"""
    id: int
    username: str
    email: str
    phone: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    """用户列表响应模型"""
    users: List[UserResponse]
    total: int
    page: int
    page_size: int


class MembershipCreate(BaseModel):
    """会员创建请求模型"""
    user_id: int = Field(..., description="用户ID")
    type: MembershipType = Field(..., description="会员类型")
    duration_months: Optional[int] = Field(None, description="会员时长（月）")

    @validator('duration_months')
    def validate_duration(cls, v, values):
        membership_type = values.get('type')
        if membership_type == MembershipType.NORMAL:
            return None
        if v is None or v <= 0:
            raise ValueError('会员时长必须大于0')
        return v


class MembershipUpdate(BaseModel):
    """会员更新请求模型"""
    type: Optional[MembershipType] = Field(None, description="会员类型")
    end_date: Optional[datetime] = Field(None, description="结束日期")
    status: Optional[MembershipStatus] = Field(None, description="会员状态")


class MembershipResponse(BaseModel):
    """会员响应模型"""
    id: int
    user_id: int
    type: str
    start_date: datetime
    end_date: Optional[datetime] = None
    api_call_limit: int
    api_call_used: int
    api_call_remaining: int
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MembershipListResponse(BaseModel):
    """会员列表响应模型"""
    memberships: List[MembershipResponse]
    total: int
    page: int
    page_size: int


class ApiCallLogResponse(BaseModel):
    """API调用日志响应模型"""
    id: int
    user_id: int
    endpoint: str
    method: str
    call_time: datetime
    response_status: Optional[int] = None

    class Config:
        from_attributes = True


class ApiCallStatsResponse(BaseModel):
    """API调用统计响应模型"""
    user_id: int
    total_calls: int
    successful_calls: int
    failed_calls: int
    today_calls: int
    api_call_limit: int
    api_call_used: int
    api_call_remaining: int
    membership_type: str
    membership_status: str


class LoginRequest(BaseModel):
    """登录请求模型"""
    username: str = Field(..., description="用户名")
    password: str = Field(..., description="密码")


class LoginResponse(BaseModel):
    """登录响应模型"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class RefreshTokenRequest(BaseModel):
    """刷新令牌请求模型"""
    refresh_token: str = Field(..., description="刷新令牌")


class RefreshTokenResponse(BaseModel):
    """刷新令牌响应模型"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class LogoutRequest(BaseModel):
    """登出请求模型"""
    refresh_token: str = Field(..., description="刷新令牌")


class RenewMembershipRequest(BaseModel):
    """会员续费请求模型"""
    duration_months: int = Field(..., gt=0, description="续费时长（月）")


class UpgradeMembershipRequest(BaseModel):
    """会员升级请求模型"""
    new_type: MembershipType = Field(..., description="新会员类型")
    duration_months: Optional[int] = Field(None, description="会员时长（月）")


class WechatUserResponse(BaseModel):
    """微信用户响应模型"""
    id: int
    user_id: int
    openid: str
    unionid: Optional[str] = None
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WechatBindRequest(BaseModel):
    """微信绑定请求模型"""
    code: str = Field(..., description="微信授权码")
    invite_code: Optional[str] = Field(None, description="邀请码（可选，用于新用户自动创建账号）")


class MiniprogramPhoneBindRequest(BaseModel):
    """
    小程序绑定手机号请求。

    注意：此处的 code 来自 getPhoneNumber 按钮回调里的 e.detail.code，
    与 wx.login 的 code 完全不同；服务端通过 getuserphonenumber 换手机号，无需 session_key 解密。
    """
    code: str = Field(..., description="getPhoneNumber 返回的动态令牌")


class WechatLoginRequest(BaseModel):
    """微信登录请求模型"""
    code: str = Field(..., description="微信授权码")


class UnifiedUserProfileResponse(BaseModel):
    """统一用户资料（跨 user / wechat_user 展示）"""
    user_id: int
    username: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    phone: Optional[str] = None
    email: str
    openid: Optional[str] = None
    unionid: Optional[str] = None


class WechatLoginResponse(BaseModel):
    """微信登录响应模型"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse
    wechat_user: Optional[WechatUserResponse] = Field(
        None,
        description="微信侧用户资料（openid/unionid/nickname/avatar_url）"
    )
    profile: UnifiedUserProfileResponse = Field(..., description="统一用户资料字段（推荐前端优先使用）")
    is_new_user: bool = Field(..., description="是否为新用户")


class WechatQrCodeResponse(BaseModel):
    """微信二维码响应模型"""
    qr_url: str = Field(..., description="微信登录二维码URL")
    state: str = Field(..., description="状态参数，用于防止CSRF攻击")
