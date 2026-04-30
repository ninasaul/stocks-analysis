"""定时任务管理"""
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import logging
from ..user_management.services import MembershipService
from .auth import cleanup_expired_blacklist_tokens

logger = logging.getLogger(__name__)


class SchedulerManager:
    """定时任务管理器（单例模式）"""
    _instance = None
    _scheduler_started = False  # 类级标志，跨进程共享

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(SchedulerManager, cls).__new__(cls)
            cls._instance.scheduler = BackgroundScheduler()
        return cls._instance

    def start(self):
        """启动定时任务（使用 Redis 分布式锁确保只启动一次）"""
        if SchedulerManager._scheduler_started:
            logger.info("定时任务已在其他进程启动，跳过")
            return
            
        if not self.scheduler.running:
            # 使用 Redis 分布式锁确保只有一个进程启动定时任务
            try:
                from .redis_manager import get_redis_client
                redis_client = get_redis_client()
                lock_key = "scheduler:lock"
                lock_value = "locked"
                
                # 尝试获取锁（60秒过期，防止进程意外退出导致锁无法释放）
                acquired = redis_client.set(lock_key, lock_value, ex=60, nx=True)
                if not acquired:
                    logger.info("定时任务锁已被其他进程持有，跳过启动")
                    return
                
                # 获取锁成功，启动任务
                self.scheduler.add_job(
                    MembershipService.reset_daily_api_calls,
                    trigger=CronTrigger(hour=0, minute=0, second=0),
                    id='reset_daily_api_calls',
                    name='重置每日 API 调用次数',
                    replace_existing=True
                )
                
                # 每天 1 时 0 分 0 秒清理过期的黑名单令牌
                self.scheduler.add_job(
                    cleanup_expired_blacklist_tokens,
                    trigger=CronTrigger(hour=1, minute=0, second=0),
                    id='cleanup_expired_blacklist',
                    name='清理过期的黑名单令牌',
                    replace_existing=True
                )
                
                self.scheduler.start()
                SchedulerManager._scheduler_started = True
                logger.info("定时任务已启动")
                
                # 锁会自动过期，不需要手动释放
            except Exception as e:
                logger.error(f"启动定时任务失败: {e}")
                # 如果获取锁失败或其他错误，仍然尝试启动（单进程环境下可用）
                try:
                    self.scheduler.add_job(
                        MembershipService.reset_daily_api_calls,
                        trigger=CronTrigger(hour=0, minute=0, second=0),
                        id='reset_daily_api_calls',
                        name='重置每日 API 调用次数',
                        replace_existing=True
                    )
                    self.scheduler.add_job(
                        cleanup_expired_blacklist_tokens,
                        trigger=CronTrigger(hour=1, minute=0, second=0),
                        id='cleanup_expired_blacklist',
                        name='清理过期的黑名单令牌',
                        replace_existing=True
                    )
                    self.scheduler.start()
                    SchedulerManager._scheduler_started = True
                    logger.info("定时任务已启动（备用模式）")
                except Exception as fallback_e:
                    logger.error(f"备用模式启动定时任务也失败: {fallback_e}")

    def shutdown(self):
        """关闭定时任务"""
        if self.scheduler.running:
            self.scheduler.shutdown()
            logger.info("定时任务已关闭")

    def get_jobs(self):
        """获取所有定时任务"""
        return [{
            'id': job.id,
            'name': job.name,
            'next_run_time': job.next_run_time.isoformat() if job.next_run_time else None
        } for job in self.scheduler.get_jobs()]


# 全局定时任务管理器实例
scheduler_manager = SchedulerManager()
