"""LLM 配置和调用 API 路由"""
from fastapi import APIRouter, Query, Depends, HTTPException
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

from ..services.llm_service import LLMService, LLMManager, UnifiedLLMClient
from ..user_management.models import User
from ..core.auth import get_current_user, get_current_user_optional
from ..core.admin import require_admin
from ..core.logging import logger

router = APIRouter(prefix="/api/llm", tags=["LLM管理"])


class CreatePresetRequest(BaseModel):
    name: str
    display_name: str
    base_url: str
    default_model: str
    api_key: Optional[str] = ""
    is_active: bool = True
    config: Optional[Dict[str, Any]] = None


class UpdatePresetRequest(BaseModel):
    display_name: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    default_model: Optional[str] = None
    models: Optional[List[str]] = None
    is_active: Optional[bool] = None
    config: Optional[Dict[str, Any]] = None


class CreateUserConfigRequest(BaseModel):
    name: str
    api_key: str
    base_url: str
    model: str
    provider: Optional[str] = "custom"
    is_active: bool = True
    config: Optional[Dict[str, Any]] = None


class UpdateUserConfigRequest(BaseModel):
    name: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None
    provider: Optional[str] = None
    is_active: Optional[bool] = None
    config: Optional[Dict[str, Any]] = None





@router.get("/presets")
async def get_llm_presets(
    include_inactive: bool = Query(False, description="包含已禁用的预设")
) -> Dict[str, Any]:
    """
    获取所有预定义LLM模型

    Returns:
        预设列表
    """
    presets = LLMService.get_all_presets(include_inactive)
    return {
        "presets": [p.to_dict() for p in presets],
        "total": len(presets)
    }


@router.get("/presets/{preset_id}")
async def get_llm_preset(preset_id: int) -> Dict[str, Any]:
    """
    获取指定预定义模型

    Returns:
        预设详情
    """
    preset = LLMService.get_preset_by_id(preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail="预设模型不存在")
    return {"preset": preset.to_dict()}


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
            is_active=request.is_active,
            config=request.config
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
        is_active=request.is_active,
        config=request.config
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


@router.get("/user/configs")
async def get_user_llm_configs(
    include_inactive: bool = Query(False, description="包含已禁用的配置"),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    获取当前用户的自定义LLM配置

    Returns:
        用户配置列表
    """
    configs = LLMService.get_user_configs(current_user.id, include_inactive)
    return {
        "configs": [c.to_dict() for c in configs],
        "total": len(configs)
    }


@router.get("/user/configs/{config_id}")
async def get_user_llm_config(
    config_id: int,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    获取用户指定配置

    Returns:
        配置详情
    """
    config = LLMService.get_user_config_by_id(current_user.id, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")
    return {"config": config.to_dict()}


@router.post("/user/configs")
async def create_user_llm_config(
    request: CreateUserConfigRequest,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    创建用户自定义LLM配置

    Returns:
        创建的配置
    """
    try:
        config = LLMService.create_user_config(
            user_id=current_user.id,
            name=request.name,
            api_key=request.api_key,
            base_url=request.base_url,
            model=request.model,
            provider=request.provider,
            is_active=request.is_active,
            config=request.config
        )
        logger.info(f"用户 {current_user.id} 创建LLM配置: {request.name}")
        return {"config": config.to_dict(), "message": "创建成功"}
    except Exception as e:
        logger.error(f"创建用户LLM配置失败: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/user/configs/{config_id}")
async def update_user_llm_config(
    config_id: int,
    request: UpdateUserConfigRequest,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    更新用户自定义LLM配置

    Returns:
        更新后的配置
    """
    config = LLMService.update_user_config(
        user_id=current_user.id,
        config_id=config_id,
        name=request.name,
        api_key=request.api_key,
        base_url=request.base_url,
        model=request.model,
        provider=request.provider,
        is_active=request.is_active,
        config=request.config
    )
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")
    logger.info(f"用户 {current_user.id} 更新LLM配置: {config_id}")
    return {"config": config.to_dict(), "message": "更新成功"}


@router.delete("/user/configs/{config_id}")
async def delete_user_llm_config(
    config_id: int,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    删除用户自定义LLM配置

    Returns:
        操作结果
    """
    LLMService.delete_user_config(current_user.id, config_id)
    logger.info(f"用户 {current_user.id} 删除LLM配置: {config_id}")
    return {"message": "删除成功"}


@router.post("/user/configs/{config_id}/test")
async def test_user_llm_config(
    config_id: int,
    prompt: str = Query("Hello, this is a test.", description="测试提示词"),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    测试用户自定义LLM配置是否可用

    Returns:
        测试结果
    """
    config = LLMService.get_user_config_by_id(current_user.id, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    try:
        client = UnifiedLLMClient(config.api_key, config.base_url, config.model, config.provider)
        content, usage = await client.chat(prompt)
        return {
            "success": True,
            "message": "配置可用",
            "response": content[:500] + "..." if len(content) > 500 else content,
            "usage": usage
        }
    except Exception as e:
        logger.error(f"测试LLM配置失败: {e}")
        return {
            "success": False,
            "message": f"配置不可用: {str(e)}",
            "response": None,
            "usage": None
        }





@router.get("/usage/summary")
async def get_usage_summary(
    days: int = Query(30, ge=1, le=365, description="统计天数"),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    获取用户LLM使用量汇总

    Args:
        days: 统计天数（1-365）

    Returns:
        使用量汇总
    """
    summary = LLMService.get_user_usage_summary(current_user.id, days)
    return summary


class SetPreferenceRequest(BaseModel):
    preset_id: Optional[int] = None
    user_config_id: Optional[int] = None


@router.get("/user/preference")
async def get_user_preference(
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    获取当前用户的LLM偏好设置

    Returns:
        用户偏好设置
    """
    pref = LLMService.get_user_preference(current_user.id, use_cache=False)
    if not pref:
        return {
            "has_preference": False,
            "preference": None,
            "message": "用户尚未设置LLM偏好"
        }

    result = {
        "has_preference": True,
        "preference": pref.to_dict()
    }

    if pref.preset_id:
        preset = LLMService.get_preset_by_id(pref.preset_id)
        if preset:
            result["preset_info"] = preset.to_dict()

    if pref.user_config_id:
        config = LLMService.get_user_config_by_id(current_user.id, pref.user_config_id)
        if config:
            result["config_info"] = config.to_dict()

    return result


@router.put("/user/preference")
async def set_user_preference(
    request: SetPreferenceRequest,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    设置当前用户的LLM偏好

    Args:
        preset_id: 预定义模型ID（与user_config_id二选一）
        user_config_id: 用户自定义配置ID（与preset_id二选一）

    Returns:
        操作结果
    """
    if not request.preset_id and not request.user_config_id:
        raise HTTPException(status_code=400, detail="必须指定 preset_id 或 user_config_id")

    try:
        pref = LLMService.set_user_preference(
            user_id=current_user.id,
            preset_id=request.preset_id,
            user_config_id=request.user_config_id
        )

        result = {
            "message": "偏好设置成功",
            "preference": pref.to_dict()
        }

        if request.preset_id:
            preset = LLMService.get_preset_by_id(request.preset_id)
            if preset:
                result["preset_info"] = preset.to_dict()

        if request.user_config_id:
            config = LLMService.get_user_config_by_id(current_user.id, request.user_config_id)
            if config:
                result["config_info"] = config.to_dict()

        logger.info(f"用户 {current_user.id} 设置LLM偏好成功")
        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"设置用户LLM偏好失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/user/preference")
async def delete_user_preference(
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    删除当前用户的LLM偏好设置

    Returns:
        操作结果
    """
    LLMService.delete_user_preference(current_user.id)
    logger.info(f"用户 {current_user.id} 删除LLM偏好")
    return {"message": "偏好删除成功"}
