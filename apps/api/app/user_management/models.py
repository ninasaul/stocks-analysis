"""数据模型"""
from datetime import datetime
from typing import Optional, Dict, List
from enum import Enum


class UserStatus(str, Enum):
    """用户状态"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"


class MembershipType(str, Enum):
    """会员类型"""
    NORMAL = "normal"
    PREMIUM_MONTHLY = "premium_monthly"
    PREMIUM_QUARTERLY = "premium_quarterly"
    PREMIUM_YEARLY = "premium_yearly"


class MembershipStatus(str, Enum):
    """会员状态"""
    ACTIVE = "active"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class RefreshTokenStatus(str, Enum):
    """刷新令牌状态"""
    ACTIVE = "active"
    REVOKED = "revoked"
    EXPIRED = "expired"


class User:
    """用户模型"""

    def __init__(
        self,
        id: Optional[int] = None,
        username: str = "",
        email: str = "",
        password_hash: str = "",
        phone: Optional[str] = None,
        status: UserStatus = UserStatus.ACTIVE,
        created_at: Optional[datetime] = None,
        updated_at: Optional[datetime] = None
    ):
        self.id = id
        self.username = username
        self.email = email
        self.password_hash = password_hash
        self.phone = phone
        self.status = status
        self.created_at = created_at or datetime.now()
        self.updated_at = updated_at or datetime.now()

    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "phone": self.phone,
            "status": self.status.value,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'User':
        """从字典创建用户对象"""
        return cls(
            id=data.get("id"),
            username=data.get("username", ""),
            email=data.get("email", ""),
            password_hash=data.get("password_hash", ""),
            phone=data.get("phone"),
            status=UserStatus(data.get("status", UserStatus.ACTIVE.value)),
            created_at=datetime.fromisoformat(data["created_at"]) if data.get("created_at") else None,
            updated_at=datetime.fromisoformat(data["updated_at"]) if data.get("updated_at") else None
        )

    @classmethod
    def from_db_row(cls, row: tuple) -> 'User':
        """从数据库行创建用户对象"""
        return cls(
            id=row[0],
            username=row[1],
            email=row[2],
            password_hash=row[3],
            phone=row[4],
            status=UserStatus(row[5]),
            created_at=row[6],
            updated_at=row[7]
        )


class Membership:
    """会员模型"""

    API_CALL_LIMITS = {
        MembershipType.NORMAL: 10,
        MembershipType.PREMIUM_MONTHLY: 100,
        MembershipType.PREMIUM_QUARTERLY: 350,
        MembershipType.PREMIUM_YEARLY: 1500
    }

    def __init__(
        self,
        id: Optional[int] = None,
        user_id: int = 0,
        type: MembershipType = MembershipType.NORMAL,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        api_call_limit: int = 100,
        api_call_used: int = 0,
        status: MembershipStatus = MembershipStatus.ACTIVE,
        created_at: Optional[datetime] = None,
        updated_at: Optional[datetime] = None
    ):
        self.id = id
        self.user_id = user_id
        self.type = type
        self.start_date = start_date or datetime.now()
        self.end_date = end_date
        self.api_call_limit = api_call_limit
        self.api_call_used = api_call_used
        self.status = status
        self.created_at = created_at or datetime.now()
        self.updated_at = updated_at or datetime.now()

    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "type": self.type.value,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "api_call_limit": self.api_call_limit,
            "api_call_used": self.api_call_used,
            "api_call_remaining": self.api_call_limit - self.api_call_used,
            "status": self.status.value,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'Membership':
        """从字典创建会员对象"""
        return cls(
            id=data.get("id"),
            user_id=data.get("user_id", 0),
            type=MembershipType(data.get("type", MembershipType.NORMAL.value)),
            start_date=datetime.fromisoformat(data["start_date"]) if data.get("start_date") else None,
            end_date=datetime.fromisoformat(data["end_date"]) if data.get("end_date") else None,
            api_call_limit=data.get("api_call_limit", 100),
            api_call_used=data.get("api_call_used", 0),
            status=MembershipStatus(data.get("status", MembershipStatus.ACTIVE.value)),
            created_at=datetime.fromisoformat(data["created_at"]) if data.get("created_at") else None,
            updated_at=datetime.fromisoformat(data["updated_at"]) if data.get("updated_at") else None
        )

    @classmethod
    def from_db_row(cls, row: tuple) -> 'Membership':
        """从数据库行创建会员对象"""
        return cls(
            id=row[0],
            user_id=row[1],
            type=MembershipType(row[2]),
            start_date=row[3],
            end_date=row[4],
            api_call_limit=row[5],
            api_call_used=row[6],
            status=MembershipStatus(row[7]),
            created_at=row[8],
            updated_at=row[9]
        )

    def is_expired(self) -> bool:
        """检查会员是否过期"""
        if not self.end_date:
            return False
        return datetime.now() > self.end_date

    def can_call_api(self) -> bool:
        """检查是否还能调用API"""
        if self.is_expired():
            return False
        if self.status != MembershipStatus.ACTIVE:
            return False
        return self.api_call_used < self.api_call_limit

    def increment_api_call(self):
        """增加API调用次数"""
        self.api_call_used += 1


class ApiCallLog:
    """API调用日志模型"""

    def __init__(
        self,
        id: Optional[int] = None,
        user_id: int = 0,
        endpoint: str = "",
        method: str = "",
        call_time: Optional[datetime] = None,
        response_status: Optional[int] = None
    ):
        self.id = id
        self.user_id = user_id
        self.endpoint = endpoint
        self.method = method
        self.call_time = call_time or datetime.now()
        self.response_status = response_status

    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "endpoint": self.endpoint,
            "method": self.method,
            "call_time": self.call_time.isoformat() if self.call_time else None,
            "response_status": self.response_status
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'ApiCallLog':
        """从字典创建API调用日志对象"""
        return cls(
            id=data.get("id"),
            user_id=data.get("user_id", 0),
            endpoint=data.get("endpoint", ""),
            method=data.get("method", ""),
            call_time=datetime.fromisoformat(data["call_time"]) if data.get("call_time") else None,
            response_status=data.get("response_status")
        )

    @classmethod
    def from_db_row(cls, row: tuple) -> 'ApiCallLog':
        """从数据库行创建API调用日志对象"""
        return cls(
            id=row[0],
            user_id=row[1],
            endpoint=row[2],
            method=row[3],
            call_time=row[4],
            response_status=row[5]
        )


class RefreshToken:
    """刷新令牌模型"""

    def __init__(
        self,
        id: Optional[int] = None,
        user_id: int = 0,
        token: str = "",
        expires_at: Optional[datetime] = None,
        status: RefreshTokenStatus = RefreshTokenStatus.ACTIVE,
        created_at: Optional[datetime] = None,
        updated_at: Optional[datetime] = None
    ):
        self.id = id
        self.user_id = user_id
        self.token = token
        self.expires_at = expires_at
        self.status = status
        self.created_at = created_at or datetime.now()
        self.updated_at = updated_at or datetime.now()

    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "token": self.token,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "status": self.status.value,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'RefreshToken':
        """从字典创建刷新令牌对象"""
        return cls(
            id=data.get("id"),
            user_id=data.get("user_id", 0),
            token=data.get("token", ""),
            expires_at=datetime.fromisoformat(data["expires_at"]) if data.get("expires_at") else None,
            status=RefreshTokenStatus(data.get("status", RefreshTokenStatus.ACTIVE.value)),
            created_at=datetime.fromisoformat(data["created_at"]) if data.get("created_at") else None,
            updated_at=datetime.fromisoformat(data["updated_at"]) if data.get("updated_at") else None
        )

    @classmethod
    def from_db_row(cls, row: tuple) -> 'RefreshToken':
        """从数据库行创建刷新令牌对象"""
        return cls(
            id=row[0],
            user_id=row[1],
            token=row[2],
            expires_at=row[3],
            status=RefreshTokenStatus(row[4]),
            created_at=row[5],
            updated_at=row[6]
        )

    def is_expired(self) -> bool:
        """检查刷新令牌是否过期"""
        if not self.expires_at:
            return False
        return datetime.now() > self.expires_at

    def is_valid(self) -> bool:
        """检查刷新令牌是否有效（未过期且未撤销）"""
        if self.status != RefreshTokenStatus.ACTIVE:
            return False
        return not self.is_expired()


class WechatUser:
    """微信用户模型"""

    def __init__(
        self,
        id: Optional[int] = None,
        user_id: int = 0,
        openid: str = "",
        unionid: Optional[str] = None,
        nickname: Optional[str] = None,
        avatar_url: Optional[str] = None,
        created_at: Optional[datetime] = None,
        updated_at: Optional[datetime] = None
    ):
        self.id = id
        self.user_id = user_id
        self.openid = openid
        self.unionid = unionid
        self.nickname = nickname
        self.avatar_url = avatar_url
        self.created_at = created_at or datetime.now()
        self.updated_at = updated_at or datetime.now()

    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "openid": self.openid,
            "unionid": self.unionid,
            "nickname": self.nickname,
            "avatar_url": self.avatar_url,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'WechatUser':
        """从字典创建微信用户对象"""
        return cls(
            id=data.get("id"),
            user_id=data.get("user_id", 0),
            openid=data.get("openid", ""),
            unionid=data.get("unionid"),
            nickname=data.get("nickname"),
            avatar_url=data.get("avatar_url"),
            created_at=datetime.fromisoformat(data["created_at"]) if data.get("created_at") else None,
            updated_at=datetime.fromisoformat(data["updated_at"]) if data.get("updated_at") else None
        )

    @classmethod
    def from_db_row(cls, row: tuple) -> 'WechatUser':
        """从数据库行创建微信用户对象"""
        return cls(
            id=row[0],
            user_id=row[1],
            openid=row[2],
            unionid=row[3],
            nickname=row[4],
            avatar_url=row[5],
            created_at=row[6],
            updated_at=row[7]
        )
