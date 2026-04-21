"""API 路由"""
from fastapi import APIRouter, HTTPException, Query, Depends, status
from typing import Optional
import logging
from ..core.auth import get_current_user
from .schemas import (
    UserCreate, UserUpdate, UserResponse, UserListResponse,
    MembershipCreate, MembershipUpdate, MembershipResponse, MembershipListResponse,
    ApiCallLogResponse, ApiCallStatsResponse,
    RenewMembershipRequest, UpgradeMembershipRequest
)
from .services import UserService, MembershipService, ApiCallService
from .models import UserStatus, MembershipStatus, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["用户和会员管理"])


# ==================== 用户管理路由 ====================

@router.post("/users/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(user_data: UserCreate):
    """
    用户注册

    Args:
        user_data: 用户注册信息

    Returns:
        创建的用户信息
    """
    try:
        if UserService.get_user_by_username(user_data.username):
            raise HTTPException(status_code=400, detail="用户名已存在")

        if UserService.get_user_by_email(user_data.email):
            raise HTTPException(status_code=400, detail="邮箱已被注册")

        user = UserService.create_user(user_data)
        if not user:
            raise HTTPException(status_code=500, detail="创建用户失败")

        return UserResponse(**user.to_dict())
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"用户注册失败: {e}")
        raise HTTPException(status_code=500, detail="服务器内部错误")


@router.get("/users/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """
    获取当前用户信息

    Returns:
        当前用户信息
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 获取当前用户信息")
    return UserResponse(**current_user.to_dict())


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, current_user: User = Depends(get_current_user)):
    """
    获取用户信息

    Args:
        user_id: 用户ID

    Returns:
        用户信息
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 获取用户 {user_id} 的信息")
    try:
        user = UserService.get_user_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")

        return UserResponse(**user.to_dict())
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取用户信息失败: {e}")
        raise HTTPException(status_code=500, detail="服务器内部错误")


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(user_id: int, user_data: UserUpdate, current_user: User = Depends(get_current_user)):
    """
    更新用户信息

    Args:
        user_id: 用户ID
        user_data: 更新数据

    Returns:
        更新后的用户信息
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 更新用户 {user_id} 的信息")
    try:
        user = UserService.update_user(user_id, user_data)
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")

        return UserResponse(**user.to_dict())
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新用户信息失败: {e}")
        raise HTTPException(status_code=500, detail="服务器内部错误")


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: int, current_user: User = Depends(get_current_user)):
    """
    删除用户

    Args:
        user_id: 用户ID
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 删除用户 {user_id}")
    try:
        success = UserService.delete_user(user_id)
        if not success:
            raise HTTPException(status_code=404, detail="用户不存在")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除用户失败: {e}")
        raise HTTPException(status_code=500, detail="服务器内部错误")


@router.get("/users", response_model=UserListResponse)
async def list_users(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=100, description="每页条数"),
    status: Optional[UserStatus] = Query(None, description="用户状态"),
    current_user: User = Depends(get_current_user)
):
    """
    获取用户列表

    Args:
        page: 页码
        page_size: 每页条数
        status: 用户状态（可选）

    Returns:
        用户列表
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 获取用户列表, 页码: {page}, 每页: {page_size}, 状态: {status}")
    try:
        users, total = UserService.list_users(page=page, page_size=page_size, status=status)
        return UserListResponse(
            users=[UserResponse(**user.to_dict()) for user in users],
            total=total,
            page=page,
            page_size=page_size
        )
    except Exception as e:
        logger.error(f"获取用户列表失败: {e}")
        raise HTTPException(status_code=500, detail="服务器内部错误")


# ==================== 会员管理路由 ====================

@router.post("/memberships", response_model=MembershipResponse, status_code=status.HTTP_201_CREATED)
async def create_membership(membership_data: MembershipCreate, current_user: User = Depends(get_current_user)):
    """
    开通会员

    Args:
        membership_data: 会员信息

    Returns:
        创建的会员信息
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 为用户 {membership_data.user_id} 开通会员")
    try:
        existing_membership = MembershipService.get_membership_by_user_id(membership_data.user_id)
        if existing_membership:
            raise HTTPException(status_code=400, detail="用户已有会员，请先取消或升级")

        membership = MembershipService.create_membership(membership_data)
        if not membership:
            raise HTTPException(status_code=500, detail="创建会员失败")

        return MembershipResponse(**membership.to_dict())
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"开通会员失败: {e}")
        raise HTTPException(status_code=500, detail="服务器内部错误")


@router.get("/memberships/{user_id}", response_model=MembershipResponse)
async def get_user_membership(user_id: int, current_user: User = Depends(get_current_user)):
    """
    获取用户会员信息

    Args:
        user_id: 用户ID

    Returns:
        会员信息
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 获取用户 {user_id} 的会员信息")
    try:
        membership = MembershipService.get_membership_by_user_id(user_id)
        if not membership:
            raise HTTPException(status_code=404, detail="会员不存在")

        return MembershipResponse(**membership.to_dict())
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取会员信息失败: {e}")
        raise HTTPException(status_code=500, detail="服务器内部错误")


@router.put("/memberships/{user_id}", response_model=MembershipResponse)
async def update_membership(user_id: int, membership_data: MembershipUpdate, current_user: User = Depends(get_current_user)):
    """
    更新会员信息

    Args:
        user_id: 用户ID
        membership_data: 更新数据

    Returns:
        更新后的会员信息
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 更新用户 {user_id} 的会员信息")
    try:
        membership = MembershipService.get_membership_by_user_id(user_id)
        if not membership:
            raise HTTPException(status_code=404, detail="会员不存在")

        updated_membership = MembershipService.update_membership(membership.id, membership_data)
        if not updated_membership:
            raise HTTPException(status_code=500, detail="更新会员失败")

        return MembershipResponse(**updated_membership.to_dict())
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新会员信息失败: {e}")
        raise HTTPException(status_code=500, detail="服务器内部错误")


@router.get("/memberships", response_model=MembershipListResponse)
async def list_memberships(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=100, description="每页条数"),
    status: Optional[MembershipStatus] = Query(None, description="会员状态"),
    current_user: User = Depends(get_current_user)
):
    """
    获取会员列表

    Args:
        page: 页码
        page_size: 每页条数
        status: 会员状态（可选）

    Returns:
        会员列表
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 获取会员列表, 页码: {page}, 每页: {page_size}, 状态: {status}")
    try:
        memberships, total = MembershipService.list_memberships(page=page, page_size=page_size, status=status)
        return MembershipListResponse(
            memberships=[MembershipResponse(**m.to_dict()) for m in memberships],
            total=total,
            page=page,
            page_size=page_size
        )
    except Exception as e:
        logger.error(f"获取会员列表失败: {e}")
        raise HTTPException(status_code=500, detail="服务器内部错误")


@router.post("/memberships/renew", response_model=MembershipResponse)
async def renew_membership(user_id: int = Query(..., description="用户ID"), renew_data: RenewMembershipRequest = None, current_user: User = Depends(get_current_user)):
    """
    会员续费

    Args:
        user_id: 用户ID
        renew_data: 续费信息

    Returns:
        续费后的会员信息
    """
    try:
        membership = MembershipService.get_membership_by_user_id(user_id)
        if not membership:
            raise HTTPException(status_code=404, detail="会员不存在")

        if membership.type.value == "normal":
            raise HTTPException(status_code=400, detail="普通会员不能续费")

        if not renew_data:
            raise HTTPException(status_code=400, detail="请提供续费时长")

        renewed_membership = MembershipService.renew_membership(membership.id, renew_data.duration_months)
        if not renewed_membership:
            raise HTTPException(status_code=500, detail="续费失败")

        return MembershipResponse(**renewed_membership.to_dict())
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"会员续费失败: {e}")
        raise HTTPException(status_code=500, detail="服务器内部错误")


@router.post("/memberships/upgrade", response_model=MembershipResponse)
async def upgrade_membership(user_id: int = Query(..., description="用户ID"), upgrade_data: UpgradeMembershipRequest = None, current_user: User = Depends(get_current_user)):
    """
    会员升级

    Args:
        user_id: 用户ID
        upgrade_data: 升级信息

    Returns:
        升级后的会员信息
    """
    try:
        membership = MembershipService.get_membership_by_user_id(user_id)
        if not membership:
            raise HTTPException(status_code=404, detail="会员不存在")

        if not upgrade_data:
            raise HTTPException(status_code=400, detail="请提供升级信息")

        upgraded_membership = MembershipService.upgrade_membership(
            membership.id,
            upgrade_data.new_type,
            upgrade_data.duration_months
        )
        if not upgraded_membership:
            raise HTTPException(status_code=500, detail="升级失败")

        return MembershipResponse(**upgraded_membership.to_dict())
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"会员升级失败: {e}")
        raise HTTPException(status_code=500, detail="服务器内部错误")


# ==================== API调用统计路由 ====================

@router.get("/memberships/{user_id}/api-calls", response_model=ApiCallStatsResponse)
async def get_api_call_stats(user_id: int, current_user: User = Depends(get_current_user)):
    """
    获取API调用统计

    Args:
        user_id: 用户ID

    Returns:
        API调用统计信息
    """
    try:
        stats = ApiCallService.get_user_api_stats(user_id)
        return ApiCallStatsResponse(**stats)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"获取API调用统计失败: {e}")
        raise HTTPException(status_code=500, detail="服务器内部错误")


@router.get("/memberships/{user_id}/api-logs")
async def get_api_call_logs(
    user_id: int,
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=100, description="每页数量"),
    current_user: User = Depends(get_current_user)
):
    """
    获取API调用日志

    Args:
        user_id: 用户ID
        page: 页码
        page_size: 每页数量

    Returns:
        API调用日志列表
    """
    try:
        logs, total = ApiCallService.get_user_api_logs(user_id, page, page_size)
        return {
            "logs": [ApiCallLogResponse(**log.to_dict()) for log in logs],
            "total": total,
            "page": page,
            "page_size": page_size
        }
    except Exception as e:
        logger.error(f"获取API调用日志失败: {e}")
        raise HTTPException(status_code=500, detail="服务器内部错误")


# ==================== 管理员路由 ====================

@router.post("/admin/reset-api-calls")
async def reset_all_api_calls(current_user: User = Depends(get_current_user)):
    """
    重置所有会员的每日API调用次数（管理员功能）

    Returns:
        操作结果
    """
    try:
        MembershipService.reset_daily_api_calls()
        return {"success": True, "message": "API调用次数已重置"}
    except Exception as e:
        logger.error(f"重置API调用次数失败: {e}")
        raise HTTPException(status_code=500, detail="服务器内部错误")
