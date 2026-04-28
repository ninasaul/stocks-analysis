"""配置模块"""
import os
import json
from dotenv import load_dotenv
from typing import Dict, Any, List
import logging

logger = logging.getLogger(__name__)

# 加载环境变量
load_dotenv()


class Config:
    """配置类"""
    # 应用配置
    APP_NAME = "Timing Agent API"
    APP_VERSION = "0.1.0"
    DEBUG = os.getenv("DEBUG", "False").lower() == "true"

    # LLM 提供商配置
    DEFAULT_PROVIDER = os.getenv("DEFAULT_PROVIDER", "aliyun")

    # LLM 预设配置（从环境变量加载）
    @staticmethod
    def get_llm_presets() -> List[Dict[str, Any]]:
        """从环境变量获取LLM预设配置"""
        presets_str = os.getenv("LLM_PRESETS", "[]")
        try:
            presets = json.loads(presets_str)
            return presets
        except json.JSONDecodeError as e:
            logger.error(f"LLM_PRESETS 解析失败: {e}")
            return []

    # 数据配置
    DEFAULT_DAYS = 60  # 基于最大指标需求
    
    # 各指标最小数据需求（天数）
    INDICATOR_MIN_DAYS = {
        "ma_alignment": 60,  # 均线排列需要MA60
        "new_high_low_ratio": 60,  # 创新高比例需要60天
        "volume_price_sync": 11,  # 量价配合需要10天变化
        "turnover_volatility": 60,  # 换手率波动需要60天
        "macd_strength": 35,  # MACD强度需要EMA26
        "rsi_position": 15,  # RSI位置需要14天
        "bollinger_position": 20,  # 布林带位置需要20天
        "atr_change": 34,  # ATR变化需要14天ATR + 20天
        "main_flow": 5  # 主力资金需要5天
    }
    
    # 计算最大数据需求天数
    MAX_INDICATOR_DAYS = max(INDICATOR_MIN_DAYS.values())
    
    # JWT 配置
    SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
    ALGORITHM = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))


config = Config()