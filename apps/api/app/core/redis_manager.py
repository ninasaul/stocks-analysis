"""Redis连接管理器"""
import redis
from dotenv import load_dotenv
import os
import logging

load_dotenv()

logger = logging.getLogger(__name__)

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")
REDIS_DB = int(os.getenv("REDIS_DB", "0"))


class RedisManager:
    """Redis连接管理器（单例模式）"""
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(RedisManager, cls).__new__(cls)
            cls._instance._client = None
        return cls._instance

    def initialize(self):
        """初始化Redis连接（延迟初始化，不阻塞启动）"""
        if self._client is not None:
            return

        try:
            self._client = redis.Redis(
                host=REDIS_HOST,
                port=REDIS_PORT,
                password=REDIS_PASSWORD if REDIS_PASSWORD else None,
                db=REDIS_DB,
                decode_responses=True
            )
            # 测试连接
            self._client.ping()
            logger.info(f"Redis连接成功: {REDIS_HOST}:{REDIS_PORT} (DB: {REDIS_DB})")
        except Exception as e:
            logger.error(f"Redis连接失败: {e}")
            # 不抛出异常，让应用继续运行，首次使用时再报错

    def close(self):
        """关闭Redis连接"""
        if self._client:
            self._client.close()
            self._client = None
            logger.info("Redis连接已关闭")

    def get_client(self) -> redis.Redis:
        """获取Redis客户端"""
        if self._client is None:
            self.initialize()
        if self._client is None:
            raise ConnectionError("Redis客户端未初始化，请检查Redis服务是否可用")
        return self._client


# 全局Redis管理器实例
redis_manager = RedisManager()


def get_redis_client() -> redis.Redis:
    """获取Redis客户端"""
    return redis_manager.get_client()
