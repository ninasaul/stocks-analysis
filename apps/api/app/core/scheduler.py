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

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(SchedulerManager, cls).__new__(cls)
            cls._instance.scheduler = BackgroundScheduler()
        return cls._instance

    def start(self):
        """启动定时任务"""
        if not self.scheduler.running:
            # 每月 1 号 0 时 0 分 0 秒重置 API 调用次数
            self.scheduler.add_job(
                MembershipService.reset_monthly_api_calls,
                trigger=CronTrigger(day=1, hour=0, minute=0, second=0),
                id='reset_monthly_api_calls',
                name='重置每月 API 调用次数',
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
            logger.info("定时任务已启动")

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
