"""对话相关的 API 路由"""
from fastapi import APIRouter, Query, Depends
from fastapi.responses import StreamingResponse
from typing import Optional
import json

from ..dialogue.manager import dialogue_manager
from ..user_management.models import User
from ..core.auth import get_current_user
from ..core.logging import logger

router = APIRouter(prefix="/api/dialogue", tags=["AI对话"])


@router.post("/sync")
async def dialogue_sync(
    message: str = Query(..., description="用户消息"),
    session_id: Optional[str] = Query(None, description="会话ID"),
    mode: str = Query("prompt", description="对话模式: prompt(有提示词) 或 direct(无提示词)"),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    选股对话接口 - 同步响应版本

    Args:
        message: 用户消息
        session_id: 会话ID（可选，用于区分不同会话）
        mode: 对话模式: prompt(有提示词) 或 direct(无提示词)

    Returns:
        对话响应
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 发送同步对话请求: {message[:50]}..., session_id: {session_id}, mode: {mode}")
    
    # 获取 LLM 响应（对话历史已在 DialogueManager 中存储）
    result = await dialogue_manager.get_response(message, None, session_id, mode)
    response = result.get("response", "")
    extension_questions = result.get("extension_questions", [])
    
    # 获取对话历史
    history = dialogue_manager.get_history(session_id)
    
    # 获取当前选股条件
    criteria = dialogue_manager.get_criteria()
    
    return {
        "response": response,
        "extension_questions": extension_questions,
        "session_id": session_id or dialogue_manager.current_session_id,
        "history": history,
        "criteria": criteria
    }


@router.delete("/history")
async def clear_dialogue_history(
    session_id: Optional[str] = Query(None, description="会话ID"),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    清除对话历史

    Args:
        session_id: 会话ID（可选）

    Returns:
        操作结果
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 清除对话历史, session_id: {session_id}")
    success = dialogue_manager.clear_history(session_id)
    return {
        "success": success,
        "message": "对话历史已清除" if success else "会话不存在"
    }


@router.get("/history")
async def get_dialogue_history(
    session_id: Optional[str] = Query(None, description="会话ID"),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    获取对话历史

    Args:
        session_id: 会话ID（可选）

    Returns:
        对话历史
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 获取对话历史, session_id: {session_id}")
    history = dialogue_manager.get_history(session_id)
    return {
        "history": history,
        "session_id": session_id or dialogue_manager.current_session_id
    }

# TODO 增加参数选项，用以区分普通聊天和选股对话
@router.post("/stream")
async def dialogue_stream(
    message: str = Query(..., description="用户消息"),
    session_id: Optional[str] = Query(None, description="会话ID"),
    mode: str = Query("prompt", description="对话模式: prompt(选股对话) 或 direct(直接对话)"),
    current_user: User = Depends(get_current_user)
) -> StreamingResponse:
    """
    选股对话接口 - 流式响应版本

    Args:
        message: 用户消息
        session_id: 会话ID（可选，用于区分不同会话）
        mode: 对话模式: prompt(选股对话，有提示词) 或 direct(直接对话，无提示词)

    Returns:
        流式响应
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 发送流式对话请求: {message[:50]}..., session_id: {session_id}, mode: {mode}")
    
    async def stream_generator():
        async for item in dialogue_manager.get_streaming_response(message, None, session_id, mode):
            # 以SSE格式发送数据
            yield f"data: {json.dumps({'chunk': item.get('chunk', ''), 'extension_questions': item.get('extension_questions', [])})}\n\n"
    
    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    )