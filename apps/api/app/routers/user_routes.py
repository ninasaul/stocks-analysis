"""用户管理相关的 API 路由"""
from fastapi import APIRouter, HTTPException, status, Depends, Query, Body
from typing import List, Optional
from datetime import datetime, timedelta

from ..user_management.models import User
from ..user_management.schemas import (
    UserResponse,
    UserUpdate,
    MembershipResponse,
    MembershipCreate,
    MembershipUpdate,
    RenewMembershipRequest,
    UpgradeMembershipRequest,
    ApiCallLogResponse
)
from ..user_management.services import UserService, MembershipService, ApiCallService
from ..core.auth import get_current_user
from ..core.logging import logger

router = APIRouter(prefix="/api/users", tags=["用户管理"])


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
) -> UserResponse:
    """
    获取当前用户信息

    Args:
        current_user: 当前登录的用户

    Returns:
        用户信息
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 获取个人信息")
    return UserResponse(**current_user.to_dict())


@router.put("/me", response_model=UserResponse)
async def update_current_user(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user)
) -> UserResponse:
    """
    更新当前用户信息

    Args:
        user_update: 用户更新信息
        current_user: 当前登录的用户

    Returns:
        更新后的用户信息
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 更新个人信息")
    updated_user = UserService.update_user(current_user.id, user_update)
    if not updated_user:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="更新用户信息失败"
        )
    return UserResponse(**updated_user.to_dict())


@router.get("/me/membership", response_model=MembershipResponse)
async def get_current_user_membership(
    current_user: User = Depends(get_current_user)
) -> MembershipResponse:
    """
    获取当前用户的会员信息

    Args:
        current_user: 当前登录的用户

    Returns:
        会员信息
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 获取会员信息")
    membership = MembershipService.get_membership_by_user_id(current_user.id)
    if not membership:
        # 如果用户没有会员信息，自动创建普通会员
        membership = MembershipService.create_membership_for_user(current_user.id)
        if not membership:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="获取会员信息失败"
            )
    return MembershipResponse(**membership.to_dict())


@router.post("/me/membership/renew", response_model=MembershipResponse)
async def renew_membership(
    renew_request: RenewMembershipRequest,
    current_user: User = Depends(get_current_user)
) -> MembershipResponse:
    """
    会员续费

    Args:
        renew_request: 续费请求
        current_user: 当前登录的用户

    Returns:
        更新后的会员信息
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 会员续费: {renew_request.duration_months}个月")
    membership = MembershipService.get_membership_by_user_id(current_user.id)
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="会员信息不存在"
        )
    membership = MembershipService.renew_membership(
        membership.id,
        renew_request.duration_months
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="会员续费失败"
        )
    return MembershipResponse(**membership.to_dict())


@router.post("/me/membership/upgrade", response_model=MembershipResponse)
async def upgrade_membership(
    upgrade_request: UpgradeMembershipRequest,
    current_user: User = Depends(get_current_user)
) -> MembershipResponse:
    """
    会员升级

    Args:
        upgrade_request: 升级请求
        current_user: 当前登录的用户

    Returns:
        更新后的会员信息
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 会员升级: {upgrade_request.new_type}")
    membership = MembershipService.get_membership_by_user_id(current_user.id)
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="会员信息不存在"
        )
    membership = MembershipService.upgrade_membership(
        membership.id,
        upgrade_request.new_type,
        upgrade_request.duration_months
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="会员升级失败"
        )
    return MembershipResponse(**membership.to_dict())


@router.get("/me/api-calls", response_model=List[ApiCallLogResponse])
async def get_user_api_calls(
    limit: int = Query(10, ge=1, le=100, description="返回记录数量"),
    offset: int = Query(0, ge=0, description="偏移量"),
    current_user: User = Depends(get_current_user)
) -> List[ApiCallLogResponse]:
    """
    获取用户的API调用记录

    Args:
        limit: 返回记录数量
        offset: 偏移量
        current_user: 当前登录的用户

    Returns:
        API调用记录列表
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 获取API调用记录")
    logs, _ = ApiCallService.get_user_api_logs(
        current_user.id,
        page=offset//limit + 1,
        page_size=limit
    )
    return [ApiCallLogResponse(**log.to_dict()) for log in logs]


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    current_user: User = Depends(get_current_user)
) -> UserResponse:
    """
    获取指定用户信息

    Args:
        user_id: 用户ID
        current_user: 当前登录的用户

    Returns:
        用户信息
    """
    # 这里可以添加权限检查，例如只有管理员可以查看其他用户信息
    logger.info(f"用户 {current_user.id} ({current_user.username}) 获取用户 {user_id} 信息")
    user = UserService.get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    return UserResponse(**user.to_dict())


@router.get("/{user_id}/membership", response_model=MembershipResponse)
async def get_user_membership(
    user_id: int,
    current_user: User = Depends(get_current_user)
) -> MembershipResponse:
    """
    获取指定用户的会员信息

    Args:
        user_id: 用户ID
        current_user: 当前登录的用户

    Returns:
        会员信息
    """
    # 这里可以添加权限检查
    logger.info(f"用户 {current_user.id} ({current_user.username}) 获取用户 {user_id} 会员信息")
    membership = MembershipService.get_user_membership(user_id)
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="会员信息不存在"
        )
    return MembershipResponse(**membership.to_dict())