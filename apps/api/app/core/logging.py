import logging
import os
from datetime import datetime
import time

# 确保环境变量已加载
from dotenv import load_dotenv
load_dotenv()

# 日志级别
LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO').upper()

# 日志格式
LOG_FORMAT = '%(levelname)s - %(asctime)s.%(msecs)03d - %(filename)s - %(funcName)s:%(lineno)d - %(message)s'
DATE_FORMAT = '%Y-%m-%d %H:%M:%S'

# 创建 logs 目录
logs_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'logs')
os.makedirs(logs_dir, exist_ok=True)

# 获取当前日期作为日志文件名
current_date = datetime.now().strftime('%Y-%m-%d')
log_filename = os.path.join(logs_dir, f"app-{current_date}.log")

# 配置日志
logger = logging.getLogger(__name__)
logger.setLevel(LOG_LEVEL)

# 清除现有处理器（防止重复添加）
logger.handlers = []

# 创建控制台处理器
console_handler = logging.StreamHandler()
console_handler.setLevel(LOG_LEVEL)
console_formatter = logging.Formatter(fmt=LOG_FORMAT, datefmt=DATE_FORMAT)
console_handler.setFormatter(console_formatter)
logger.addHandler(console_handler)

# 自定义日志处理器，支持跨天自动切换
class DateRotatingFileHandler(logging.Handler):
    """支持跨天自动切换的日志处理器"""
    
    def __init__(self, logs_dir, log_format, date_format):
        super().__init__()
        self.logs_dir = logs_dir
        self.log_format = log_format
        self.date_format = date_format
        self.current_date = datetime.now().strftime('%Y-%m-%d')
        self.log_filename = os.path.join(logs_dir, f"app-{self.current_date}.log")
        self.file_handler = logging.FileHandler(self.log_filename, mode='a', encoding='utf-8')
        self.file_handler.setFormatter(logging.Formatter(fmt=log_format, datefmt=date_format))
        
    def emit(self, record):
        """发送日志记录"""
        # 检查日期是否变化
        today = datetime.now().strftime('%Y-%m-%d')
        if today != self.current_date:
            # 日期变化，切换日志文件
            self.current_date = today
            self.log_filename = os.path.join(self.logs_dir, f"app-{self.current_date}.log")
            self.file_handler.close()
            self.file_handler = logging.FileHandler(self.log_filename, mode='a', encoding='utf-8')
            self.file_handler.setFormatter(logging.Formatter(fmt=self.log_format, datefmt=self.date_format))
        
        # 写入日志
        self.file_handler.emit(record)
        
    def close(self):
        """关闭处理器"""
        self.file_handler.close()
        super().close()

# 创建日期滚动文件处理器
date_rotating_handler = DateRotatingFileHandler(logs_dir, LOG_FORMAT, DATE_FORMAT)
date_rotating_handler.setLevel(LOG_LEVEL)
logger.addHandler(date_rotating_handler)

# 测试日志
if __name__ == '__main__':
    logger.debug('这是一条调试日志')
    logger.info('这是一条信息日志')
    logger.warning('这是一条警告日志')
    logger.error('这是一条错误日志')
    logger.critical('这是一条严重错误日志')
    print(f"日志已保存到: {log_filename}")
    print(f"当前日志日期: {current_date}")
