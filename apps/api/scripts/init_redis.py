"""Redis 初始化脚本"""
import redis
import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

def init_redis():
    """初始化 Redis 连接和配置"""
    # Redis 连接配置
    redis_host = os.getenv("REDIS_HOST", "localhost")
    redis_port = int(os.getenv("REDIS_PORT", "6379"))
    redis_password = os.getenv("REDIS_PASSWORD", "")
    redis_db = int(os.getenv("REDIS_DB", "0"))
    
    try:
        # 连接到 Redis
        r = redis.Redis(
            host=redis_host,
            port=redis_port,
            password=redis_password,
            decode_responses=True,
            db=redis_db
        )
        
        # 测试连接
        r.ping()
        print(f"✅ 成功连接到 Redis: {redis_host}:{redis_port}")
        
        # 测试速率限制键的设置
        test_key = "test:rate_limit"
        r.set(test_key, "test_value")
        value = r.get(test_key)
        print(f"✅ 测试键值设置成功: {test_key} = {value}")
        
        # 删除测试键
        r.delete(test_key)
        print("✅ 测试键删除成功")
        
        # 测试有序集合（用于速率限制）
        test_zset = "test:zset"
        r.zadd(test_zset, {"member1": 1, "member2": 2})
        members = r.zrange(test_zset, 0, -1)
        print(f"✅ 测试有序集合设置成功: {members}")
        
        # 删除测试有序集合
        r.delete(test_zset)
        print("✅ 测试有序集合删除成功")
        
        print("\n🎉 Redis 初始化完成，速率限制功能可以正常使用！")
        
    except Exception as e:
        print(f"❌ Redis 初始化失败: {e}")
        print("请确保 Redis 服务器已启动，并且配置正确")

if __name__ == "__main__":
    init_redis()