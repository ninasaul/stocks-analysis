"""管理员权限管理模块"""
from fastapi import Depends, HTTPException, status
from typing import Optional

from ..user_management.models import User
from ..core.auth import get_current_user
from ..core.database import execute_query


def is_admin(user_id: int) -> bool:
    """
    检查用户是否为管理员

    Args:
        user_id: 用户ID

    Returns:
        是否为管理员
    """
    query = "SELECT role FROM admins WHERE user_id = %s"
    rows = execute_query(query, (user_id,))
    return len(rows) > 0


def is_super_admin(user_id: int) -> bool:
    """
    检查用户是否为超级管理员

    Args:
        user_id: 用户ID

    Returns:
        是否为超级管理员
    """
    query = "SELECT role FROM admins WHERE user_id = %s AND role = 'super_admin'"
    rows = execute_query(query, (user_id,))
    return len(rows) > 0


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """
    管理员权限依赖 - 要求用户是管理员

    Args:
        current_user: 当前用户（通过 get_current_user 依赖注入）

    Returns:
        管理员用户对象

    Raises:
        HTTPException: 非管理员用户会抛出 403 错误
    """
    if not is_admin(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限才能执行此操作"
        )
    return current_user


def require_super_admin(current_user: User = Depends(get_current_user)) -> User:
    """
    超级管理员权限依赖 - 要求用户是超级管理员

    Args:
        current_user: 当前用户（通过 get_current_user 依赖注入）

    Returns:
        超级管理员用户对象

    Raises:
        HTTPException: 非超级管理员用户会抛出 403 错误
    """
    if not is_super_admin(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要超级管理员权限才能执行此操作"
        )
    return current_user
