import logging
import os
from datetime import datetime

# 确保环境变量已加载
from dotenv import load_dotenv
load_dotenv()

# 日志级别
LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO').upper()

# 日志格式
LOG_FORMAT = '%(levelname)s - %(asctime)s.%(msecs)03d - %(funcName)s:%(lineno)d - %(message)s'
DATE_FORMAT = '%Y-%m-%d %H:%M:%S'

# 创建 logs 目录
logs_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'logs')
os.makedirs(logs_dir, exist_ok=True)

# 生成日志文件名（包含时间戳，避免覆盖）
log_filename = os.path.join(logs_dir, f"{datetime.now().strftime('%Y-%m-%d-%H-%M-%S')}.log")

# 配置日志
logger = logging.getLogger(__name__)
logger.setLevel(LOG_LEVEL)

# 清除现有处理器
logger.handlers = []

# 创建控制台处理器
console_handler = logging.StreamHandler()
console_handler.setLevel(LOG_LEVEL)
console_formatter = logging.Formatter(fmt=LOG_FORMAT, datefmt=DATE_FORMAT)
console_handler.setFormatter(console_formatter)
logger.addHandler(console_handler)

# 创建文件处理器
file_handler = logging.FileHandler(log_filename, encoding='utf-8')
file_handler.setLevel(LOG_LEVEL)
file_formatter = logging.Formatter(fmt=LOG_FORMAT, datefmt=DATE_FORMAT)
file_handler.setFormatter(file_formatter)
logger.addHandler(file_handler)

# 测试日志
if __name__ == '__main__':
    logger.debug('这是一条调试日志')
    logger.info('这是一条信息日志')
    logger.warning('这是一条警告日志')
    logger.error('这是一条错误日志')
    logger.critical('这是一条严重错误日志')
    print(f"日志已保存到: {log_filename}")
