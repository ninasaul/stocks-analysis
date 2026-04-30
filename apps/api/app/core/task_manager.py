"""异步任务管理器"""
import json
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from enum import Enum

from .redis_manager import get_redis_client
from .logging import logger

TASK_EXPIRE_SECONDS = 3600


class TaskStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class TaskManager:
    """异步任务管理器（使用Redis存储）"""

    def _get_redis_client(self):
        return get_redis_client()

    def _get_task_key(self, task_id: str) -> str:
        return f"analysis_task:{task_id}"

    def create_task(self, user_id: int, params: Dict[str, Any]) -> str:
        """创建新任务，返回task_id"""
        task_id = str(uuid.uuid4())
        task_data = {
            "task_id": task_id,
            "user_id": user_id,
            "status": TaskStatus.PENDING.value,
            "progress": 0,
            "progress_message": "任务已创建，等待处理...",
            "params": params,
            "result": None,
            "error": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        redis_client = self._get_redis_client()
        key = self._get_task_key(task_id)
        redis_client.setex(key, TASK_EXPIRE_SECONDS, json.dumps(task_data, ensure_ascii=False))
        logger.info(f"任务已创建: {task_id}, 用户: {user_id}")
        
        return task_id

    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """获取任务状态和结果"""
        redis_client = self._get_redis_client()
        key = self._get_task_key(task_id)
        data = redis_client.get(key)
        
        if data is None:
            return None
        
        return json.loads(data)

    def get_task_for_user(self, task_id: str, user_id: int) -> Optional[Dict[str, Any]]:
        """获取任务状态和结果，验证用户权限"""
        task = self.get_task(task_id)
        if task is None:
            return None
        if task.get("user_id") != user_id:
            logger.warning(f"用户 {user_id} 试图访问任务 {task_id}，但该任务属于用户 {task.get('user_id')}")
            return None
        return task

    def update_task_progress(self, task_id: str, progress: int, progress_message: str):
        """更新任务进度"""
        redis_client = self._get_redis_client()
        key = self._get_task_key(task_id)
        data = redis_client.get(key)
        
        if data is None:
            logger.warning(f"尝试更新不存在的任务: {task_id}")
            return
        
        task_data = json.loads(data)
        task_data["progress"] = progress
        task_data["progress_message"] = progress_message
        task_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        redis_client.setex(key, TASK_EXPIRE_SECONDS, json.dumps(task_data, ensure_ascii=False))

    def update_task_status(self, task_id: str, status: TaskStatus):
        """更新任务状态"""
        redis_client = self._get_redis_client()
        key = self._get_task_key(task_id)
        data = redis_client.get(key)
        
        if data is None:
            logger.warning(f"尝试更新不存在的任务: {task_id}")
            return
        
        task_data = json.loads(data)
        task_data["status"] = status.value
        task_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        redis_client.setex(key, TASK_EXPIRE_SECONDS, json.dumps(task_data, ensure_ascii=False))

    def complete_task(self, task_id: str, result: Dict[str, Any]):
        """完成任务，保存结果"""
        redis_client = self._get_redis_client()
        key = self._get_task_key(task_id)
        data = redis_client.get(key)
        
        if data is None:
            logger.warning(f"尝试完成不存在的任务: {task_id}")
            return
        
        task_data = json.loads(data)
        task_data["status"] = TaskStatus.COMPLETED.value
        task_data["progress"] = 100
        task_data["progress_message"] = "分析完成"
        task_data["result"] = result
        task_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        redis_client.setex(key, TASK_EXPIRE_SECONDS, json.dumps(task_data, ensure_ascii=False))
        logger.info(f"任务已完成: {task_id}")

    def fail_task(self, task_id: str, error: str):
        """标记任务失败"""
        redis_client = self._get_redis_client()
        key = self._get_task_key(task_id)
        data = redis_client.get(key)
        
        if data is None:
            logger.warning(f"尝试标记不存在的任务失败: {task_id}")
            return
        
        task_data = json.loads(data)
        task_data["status"] = TaskStatus.FAILED.value
        task_data["error"] = error
        task_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        redis_client.setex(key, TASK_EXPIRE_SECONDS, json.dumps(task_data, ensure_ascii=False))
        logger.error(f"任务已失败: {task_id}, 错误: {error}")


task_manager = TaskManager()