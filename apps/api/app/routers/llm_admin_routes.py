"""LLM 管理员管理 API 路由"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

from ..llm.llm_service import LLMService
from ..user_management.models import User
from ..core.admin import require_admin
from ..core.logging import logger

router = APIRouter(prefix="/api/llm", tags=["LLM管理（管理员）"])


class CreatePresetRequest(BaseModel):
    name: str
    display_name: str
    base_url: str
    default_model: str
    api_key: Optional[str] = ""
    is_active: bool = True


class UpdatePresetRequest(BaseModel):
    display_name: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    default_model: Optional[str] = None
    models: Optional[List[str]] = None
    is_active: Optional[bool] = None


@router.post("/presets")
async def create_llm_preset(
    request: CreatePresetRequest,
    current_user: User = Depends(require_admin)
) -> Dict[str, Any]:
    """
    创建预定义LLM模型（仅管理员）

    Returns:
        创建的预设
    """
    try:
        preset = LLMService.create_preset(
            name=request.name,
            display_name=request.display_name,
            api_key=request.api_key or "",
            base_url=request.base_url,
            default_model=request.default_model,
            is_active=request.is_active
        )
        logger.info(f"用户 {current_user.id} 创建预设模型: {request.name}")
        return {"preset": preset.to_dict(), "message": "创建成功"}
    except Exception as e:
        logger.error(f"创建预设模型失败: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/presets/{preset_id}")
async def update_llm_preset(
    preset_id: int,
    request: UpdatePresetRequest,
    current_user: User = Depends(require_admin)
) -> Dict[str, Any]:
    """
    更新预定义LLM模型（仅管理员）

    Returns:
        更新后的预设
    """
    preset = LLMService.update_preset(
        preset_id=preset_id,
        display_name=request.display_name,
        api_key=request.api_key,
        base_url=request.base_url,
        default_model=request.default_model,
        models=request.models,
        is_active=request.is_active
    )
    if not preset:
        raise HTTPException(status_code=404, detail="预设模型不存在")
    logger.info(f"用户 {current_user.id} 更新预设模型: {preset_id}")
    return {"preset": preset.to_dict(), "message": "更新成功"}


@router.delete("/presets/{preset_id}")
async def delete_llm_preset(
    preset_id: int,
    current_user: User = Depends(require_admin)
) -> Dict[str, Any]:
    """
    删除预定义LLM模型（仅管理员，系统预设不可删除）

    Returns:
        操作结果
    """
    success = LLMService.delete_preset(preset_id)
    if not success:
        raise HTTPException(status_code=400, detail="无法删除系统预设")
    logger.info(f"用户 {current_user.id} 删除预设模型: {preset_id}")
    return {"message": "删除成功"}