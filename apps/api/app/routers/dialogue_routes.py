"""对话相关的 API 路由"""
from fastapi import APIRouter, Query, Depends, HTTPException
from fastapi.responses import StreamingResponse
from typing import Optional, List, Dict, Any
import json

from ..dialogue import dialogue_manager
from ..user_management.models import User
from ..core.auth import get_current_user
from ..core.logging import logger
from ..llm.llm_service import LLMService

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

    # 确保从数据库加载了用户的会话
    if not any(session.get("user_id") == current_user.id for session in dialogue_manager.sessions.values()):
        dialogue_manager.load_sessions_from_db(current_user.id)

    # 获取用户偏好的 LLM 客户端
    try:
        llm_client = LLMService.get_user_default_client(current_user.id)
    except ValueError:
        llm_client = None

    # 获取 LLM 响应（对话历史已在 DialogueManager 中存储）
    result = await dialogue_manager.get_response(message, None, session_id, mode, current_user.id, llm_client)
    response = result.get("response", "")
    extension_questions = result.get("extension_questions", [])
    
    # 获取对话历史
    history = dialogue_manager.get_history(session_id)
    
    # 获取当前选股条件
    criteria = dialogue_manager.get_criteria(session_id)
    
    # 获取会话主题
    session = dialogue_manager._get_session(session_id)
    topic = session.get("topic", "")
    
    return {
        "response": response,
        "extension_questions": extension_questions,
        "session_id": session_id or dialogue_manager.current_session_id,
        "history": history,
        "criteria": criteria,
        "topic": topic
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
    success = dialogue_manager.clear_history(session_id, current_user.id)
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
    
    # 确保从数据库加载了用户的会话
    if not any(session.get("user_id") == current_user.id for session in dialogue_manager.sessions.values()):
        dialogue_manager.load_sessions_from_db(current_user.id)
    
    history = dialogue_manager.get_history(session_id)
    
    # 获取会话主题
    session = dialogue_manager._get_session(session_id)
    topic = session.get("topic", "")
    
    return {
        "history": history,
        "session_id": session_id or dialogue_manager.current_session_id,
        "topic": topic
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

    # 确保从数据库加载了用户的会话
    if not any(session.get("user_id") == current_user.id for session in dialogue_manager.sessions.values()):
        dialogue_manager.load_sessions_from_db(current_user.id)

    # 获取用户偏好的 LLM 客户端
    try:
        llm_client = LLMService.get_user_default_client(current_user.id)
    except ValueError:
        llm_client = None

    async def stream_generator():
        async for item in dialogue_manager.get_streaming_response(message, None, session_id, mode, current_user.id, llm_client):
            # 确保数据可序列化
            chunk = item.get('chunk', '')
            extension_questions = item.get('extension_questions', [])
            
            # 处理 chunk 类型
            if not isinstance(chunk, str):
                chunk = str(chunk) if chunk else ''
            
            # 处理 extension_questions 中的不可序列化对象
            try:
                # 使用 default=str 处理不可序列化的对象
                yield f"data: {json.dumps({'chunk': chunk, 'extension_questions': extension_questions}, default=str)}\n\n"
            except Exception as e:
                logger.error(f"JSON序列化失败: {e}")
                # 返回安全的默认值
                yield f"data: {json.dumps({'chunk': chunk, 'extension_questions': []})}\n\n"
    
    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    )


@router.get("/sessions")
async def get_user_sessions(
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    获取用户的所有对话会话

    Returns:
        会话列表
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 获取会话列表")
    sessions = dialogue_manager.get_sessions(current_user.id)
    return {
        "sessions": sessions,
        "total": len(sessions)
    }


@router.put("/sessions/{session_id}/topic")
async def update_session_topic(
    session_id: str,
    topic: str = Query(..., description="新的会话主题"),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    更新会话主题

    Args:
        session_id: 会话ID
        topic: 新的会话主题

    Returns:
        操作结果
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 更新会话主题: {topic}, session_id: {session_id}")
    success = dialogue_manager.update_topic(session_id, topic, current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="会话不存在")
    return {
        "success": success,
        "message": "会话主题已更新",
        "topic": topic
    }


@router.get("/sessions/{session_id}")
async def get_session_detail(
    session_id: str,
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    获取会话详情

    Args:
        session_id: 会话ID

    Returns:
        会话详情
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 获取会话详情, session_id: {session_id}")
    
    # 确保从数据库加载了用户的会话
    if not any(session.get("user_id") == current_user.id for session in dialogue_manager.sessions.values()):
        dialogue_manager.load_sessions_from_db(current_user.id)
    
    # 检查会话是否存在
    if session_id not in dialogue_manager.sessions:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    session = dialogue_manager.sessions[session_id]
    history = session.get("history", [])
    topic = session.get("topic", "")
    
    return {
        "session_id": session_id,
        "topic": topic,
        "history": history,
        "message_count": len(history)
    }


@router.delete("/sessions/{session_id}/messages/{message_id}")
async def delete_message(
    session_id: str,
    message_id: int,
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    删除会话中的某条消息

    Args:
        session_id: 会话ID
        message_id: 消息ID

    Returns:
        操作结果
    """
    logger.info(f"用户 {current_user.id} ({current_user.username}) 删除会话 {session_id} 中ID为 {message_id} 的消息")
    
    # 确保从数据库加载了用户的会话
    if not any(session.get("user_id") == current_user.id for session in dialogue_manager.sessions.values()):
        dialogue_manager.load_sessions_from_db(current_user.id)
    
    # 检查会话是否存在
    if session_id not in dialogue_manager.sessions:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    success = dialogue_manager.delete_message(session_id, message_id, current_user.id)
    if not success:
        raise HTTPException(status_code=400, detail="删除消息失败，消息ID可能不存在")
    
    return {
        "success": success,
        "message": "消息已删除",
        "session_id": session_id,
        "message_id": message_id
    }