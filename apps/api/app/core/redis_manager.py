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
        """初始化Redis连接"""
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
            raise

    def close(self):
        """关闭Redis连接"""
        if self._client:
            self._client.close()
            self._client = None
            logger.info("Redis连接已关闭")

    def get_client(self) -> redis.Redis:
        """获取Redis客户端"""
        if self._client is None:
            try:
                self.initialize()
            except Exception as e:
                logger.warning(f"Redis初始化失败，速率限制功能将被禁用: {e}")
                # 返回一个模拟的Redis客户端，所有操作都不做实际处理
                class MockRedis:
                    def pipeline(self):
                        class MockPipeline:
                            def zremrangebyscore(self, *args, **kwargs):
                                return self
                            def zadd(self, *args, **kwargs):
                                return self
                            def expire(self, *args, **kwargs):
                                return self
                            def zcard(self, *args, **kwargs):
                                return self
                            def execute(self):
                                return [0, 0, 0, 0]
                        return MockPipeline()
                    def zrange(self, *args, **kwargs):
                        return []
                    def zremrangebyscore(self, *args, **kwargs):
                        pass
                    def zcard(self, *args, **kwargs):
                        return 0
                self._client = MockRedis()
        return self._client


# 全局Redis管理器实例
redis_manager = RedisManager()


def get_redis_client() -> redis.Redis:
    """获取Redis客户端"""
    return redis_manager.get_client()
