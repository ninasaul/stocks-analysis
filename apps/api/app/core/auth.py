"""JWT 认证和授权模块"""
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
import os
from dotenv import load_dotenv
import logging

from .database import execute_query
from .config import config
from ..user_management.models import User, UserStatus

load_dotenv()

logger = logging.getLogger(__name__)

# 配置
SECRET_KEY = config.SECRET_KEY
ALGORITHM = config.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = config.ACCESS_TOKEN_EXPIRE_MINUTES
# 刷新令牌过期时间（天）
REFRESH_TOKEN_EXPIRE_DAYS = 7

# OAuth2 密码承载令牌
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    验证密码

    Args:
        plain_password: 明文密码
        hashed_password: 哈希密码

    Returns:
        是否验证成功
    """
    # 截断密码到72字节，因为bcrypt最多只能处理72字节
    if len(plain_password) > 72:
        plain_password = plain_password[:72]
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


def get_password_hash(password: str) -> str:
    """
    获取密码哈希

    Args:
        password: 明文密码

    Returns:
        哈希密码
    """
    # 截断密码到72字节，因为bcrypt最多只能处理72字节
    if len(password) > 72:
        password = password[:72]
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    创建访问令牌

    Args:
        data: 要编码的数据
        expires_delta: 过期时间

    Returns:
        JWT 令牌
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    创建刷新令牌

    Args:
        data: 要编码的数据
        expires_delta: 过期时间

    Returns:
        JWT 刷新令牌
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    
    to_encode.update({"exp": expire})
    to_encode.update({"type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def is_token_blacklisted(token: str) -> bool:
    """
    检查令牌是否在黑名单中

    Args:
        token: JWT 令牌

    Returns:
        如果令牌在黑名单中返回 True，否则返回 False
    """
    try:
        query = "SELECT * FROM token_blacklist WHERE token = %s AND expires_at > %s"
        result = execute_query(query, (token, datetime.utcnow()))
        return len(result) > 0
    except Exception as e:
        logger.error(f"检查令牌黑名单失败: {e}")
        # 出错时默认认为令牌有效，避免误判
        return False


def add_token_to_blacklist(token: str, token_type: str, user_id: int, expires_at: datetime) -> bool:
    """
    将令牌加入黑名单

    Args:
        token: JWT 令牌
        token_type: 令牌类型 ('access' 或 'refresh')
        user_id: 用户 ID
        expires_at: 令牌过期时间

    Returns:
        是否添加成功
    """
    try:
        # 记录添加黑名单的操作
        logger.info(f"尝试将令牌加入黑名单: token={token[:20]}..., type={token_type}, user_id={user_id}")
        
        query = """
            INSERT INTO token_blacklist (token, token_type, user_id, expires_at)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (token) DO NOTHING
        """
        params = (token, token_type, user_id, expires_at)
        # 设置 fetch=False，确保执行 commit
        execute_query(query, params, fetch=False)
        
        # 验证令牌是否已加入黑名单
        is_blacklisted = is_token_blacklisted(token)
        if is_blacklisted:
            logger.info(f"令牌成功加入黑名单: token={token[:20]}...")
        else:
            logger.warning(f"令牌未成功加入黑名单: token={token[:20]}...")
        
        return is_blacklisted
    except Exception as e:
        logger.error(f"添加令牌到黑名单失败: {e}")
        return False


def cleanup_expired_blacklist_tokens():
    """
    清理过期的黑名单令牌
    """
    try:
        from .database import execute_delete
        query = "DELETE FROM token_blacklist WHERE expires_at < %s"
        affected = execute_delete(query, (datetime.utcnow(),))
        if affected > 0:
            logger.info(f"清理了 {affected} 个过期的黑名单令牌")
        else:
            logger.info("清理过期黑名单令牌完成")
    except Exception as e:
        logger.error(f"清理过期黑名单令牌失败: {e}")


def verify_token(token: str) -> Optional[Dict[str, Any]]:
    """
    验证令牌

    Args:
        token: JWT 令牌

    Returns:
        解码后的数据，如果验证失败返回 None
    """
    # 检查令牌是否在黑名单中
    if is_token_blacklisted(token):
        logger.info(f"令牌在黑名单中: token={token[:20]}...")
        return None
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        logger.info(f"令牌解码失败: token={token[:20]}...")
        return None


def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """
    获取当前用户

    Args:
        token: JWT 令牌

    Returns:
        当前用户

    Raises:
        HTTPException: 如果令牌无效或用户不存在
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = verify_token(token)
    if payload is None:
        raise credentials_exception

    username: str = payload.get("sub")
    if username is None:
        raise credentials_exception

    # 查询用户
    query = "SELECT * FROM users WHERE username = %s"
    result = execute_query(query, (username,))
    if not result:
        raise credentials_exception

    user = User.from_db_row(result[0])
    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已被禁用"
        )

    return user


def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    """
    获取当前活跃用户

    Args:
        current_user: 当前用户

    Returns:
        当前活跃用户

    Raises:
        HTTPException: 如果用户未激活
    """
    if current_user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户未激活"
        )
    return current_user


def authenticate_user(identifier: str, password: str) -> Optional[User]:
    """
    认证用户，支持多种登录方式

    Args:
        identifier: 可以是用户名、邮箱或手机号
        password: 密码

    Returns:
        认证成功返回用户，否则返回 None
    """
    # 尝试通过用户名查找
    query = "SELECT * FROM users WHERE username = %s"
    result = execute_query(query, (identifier,))
    if not result:
        # 尝试通过邮箱查找
        query = "SELECT * FROM users WHERE email = %s"
        result = execute_query(query, (identifier,))
        if not result:
            # 尝试通过手机号查找
            query = "SELECT * FROM users WHERE phone = %s"
            result = execute_query(query, (identifier,))
            if not result:
                return None

    user = User.from_db_row(result[0])
    if not verify_password(password, user.password_hash):
        return None



def get_current_user_optional(token: Optional[str] = Depends(oauth2_scheme)) -> Optional[User]:
    """
    获取当前用户（可选），如果令牌无效返回 None

    Args:
        token: JWT 令牌

    Returns:
        当前用户或 None
    """
    if not token:
        return None

    try:
        payload = verify_token(token)
        if payload is None:
            return None

        username: str = payload.get("sub")
        if username is None:
            return None

        # 查询用户
        query = "SELECT * FROM users WHERE username = %s"
        result = execute_query(query, (username,))
        if not result:
            return None

        user = User.from_db_row(result[0])
        if user.status != "active":
            return None

        return user
    except Exception:
        return None
