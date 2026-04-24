"""速率限制模块"""
import time
from typing import Tuple, Optional
from fastapi import HTTPException, status, Request
import logging

from .redis_manager import get_redis_client

logger = logging.getLogger(__name__)


def check_rate_limit(
    key: str,
    limit: int,
    window_seconds: int
) -> Tuple[bool, int, int]:
    """
    检查速率限制

    Args:
        key: 限制键（如IP地址或用户名）
        limit: 时间窗口内的最大请求次数
        window_seconds: 时间窗口大小（秒）

    Returns:
        (是否允许请求, 剩余次数, 距离下次可用的秒数)
    """
    try:
        r = get_redis_client()
        current_time = int(time.time())
        window_start = current_time - window_seconds

        pipe = r.pipeline()

        pipe.zremrangebyscore(key, 0, window_start)

        pipe.zadd(key, {str(current_time): current_time})

        pipe.expire(key, window_seconds)

        pipe.zcard(key)

        results = pipe.execute()
        count = results[3]

        if count > limit:
            oldest_time = r.zrange(key, 0, 0, withscores=True)
            if oldest_time:
                oldest_timestamp = int(oldest_time[0][1])
                retry_after = window_seconds - (current_time - oldest_timestamp)
                return False, 0, max(retry_after, 1)
            return False, 0, window_seconds

        return True, limit - count, 0

    except Exception as e:
        logger.error(f"速率限制检查失败: {e}")
        return True, limit, 0


def get_rate_limit_key(ip: str, username: Optional[str] = None) -> str:
    """
    生成速率限制键

    Args:
        ip: IP地址
        username: 用户名（可选）

    Returns:
        速率限制键
    """
    if username:
        return f"rate_limit:login:user:{username}"
    return f"rate_limit:login:ip:{ip}"


def rate_limit_login(
    request: Request,
    username: Optional[str] = None,
    ip_limit: int = 5,
    ip_window: int = 60,
    user_limit: int = 3,
    user_window: int = 60
) -> Tuple[bool, int, int]:
    """
    登录接口速率限制检查

    Args:
        request: FastAPI请求对象
        username: 用户名（可选）
        ip_limit: IP限制次数
        ip_window: IP时间窗口（秒）
        user_limit: 用户限制次数
        user_window: 用户时间窗口（秒）

    Returns:
        (是否允许, 剩余次数, 距离下次可用的秒数)
    """
    ip = request.client.host if request.client else "unknown"

    ip_key = get_rate_limit_key(ip)
    ip_allowed, ip_remaining, retry_after = check_rate_limit(ip_key, ip_limit, ip_window)

    if not ip_allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"登录尝试过于频繁，请 {retry_after} 秒后再试（IP限制）",
            headers={"Retry-After": str(retry_after)}
        )

    if username:
        user_key = get_rate_limit_key(ip, username)
        user_allowed, user_remaining, user_retry_after = check_rate_limit(
            user_key, user_limit, user_window
        )

        if not user_allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"该账户登录尝试过于频繁，请 {user_retry_after} 秒后再试（账户限制）",
                headers={"Retry-After": str(user_retry_after)}
            )

        return True, min(ip_remaining, user_remaining), max(retry_after, user_retry_after)

    return True, ip_remaining, retry_after


def record_failed_login(ip: str, username: Optional[str] = None):
    """
    记录失败的登录尝试（增加限制计数）

    Args:
        ip: IP地址
        username: 用户名（可选）
    """
    r = get_redis_client()
    current_time = int(time.time())

    if username:
        key = f"rate_limit:login:failed:user:{username}"
    else:
        key = f"rate_limit:login:failed:ip:{ip}"

    try:
        pipe = r.pipeline()
        pipe.zadd(key, {str(current_time): current_time})
        pipe.expire(key, 300)
        pipe.execute()
    except Exception as e:
        logger.error(f"记录失败登录尝试失败: {e}")


def get_login_attempts(ip: str, username: Optional[str] = None) -> int:
    """
    获取登录尝试次数

    Args:
        ip: IP地址
        username: 用户名（可选）

    Returns:
        尝试次数
    """
    r = get_redis_client()
    current_time = int(time.time())
    window_start = current_time - 300

    if username:
        key = f"rate_limit:login:failed:user:{username}"
    else:
        key = f"rate_limit:login:failed:ip:{ip}"

    try:
        r.zremrangebyscore(key, 0, window_start)
        return r.zcard(key)
    except Exception as e:
        logger.error(f"获取登录尝试次数失败: {e}")
        return 0

