"""配置模块"""
import os
from dotenv import load_dotenv
from typing import Optional

# 加载环境变量
load_dotenv()

# 禁用 LiteLLM 远程成本映射请求
os.environ["LITELLM_LOG"] = "ERROR"


class Config:
    """配置类"""
    # LLM 配置
    LLM_API_KEY = os.getenv("LLM_API_KEY", "")
    LLM_MODEL = os.getenv("LLM_MODEL", "qwen/qwen3.6-plus")
    LLM_BASE_URL = os.getenv("LLM_BASE_URL", "")
    
    # 应用配置
    APP_NAME = "Timing Agent API"
    APP_VERSION = "0.1.0"
    DEBUG = os.getenv("DEBUG", "False").lower() == "true"
    
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


config = Config()


def get_llm_client():
    """
    获取 LLM 客户端
    
    Returns:
        LLM 客户端实例
    """
    try:
        from litellm import completion
        
        print(f"LLM 配置: model={config.LLM_MODEL}, base_url={config.LLM_BASE_URL}")
        
        class LLMWrapper:
            """LLM 客户端包装器"""
            
            async def chat(self, prompt: str, response_format: str = "text") -> str:
                """
                聊天完成
                
                Args:
                    prompt: 提示
                    response_format: 响应格式
                
                Returns:
                    响应内容
                """
                import json
                
                messages = [{
                    "role": "user",
                    "content": prompt
                }]
                
                # 构建参数，使用完整的模型名称
                kwargs = {
                    "model": config.LLM_MODEL,
                    "messages": messages,
                    "api_key": config.LLM_API_KEY
                }
                
                # 添加 base_url（如果存在）
                if config.LLM_BASE_URL:
                    kwargs["base_url"] = config.LLM_BASE_URL
                
                # 添加响应格式（如果需要）
                if response_format == "json":
                    kwargs["response_format"] = {"type": "json_object"}
                
                print(f"调用 LLM 参数: {kwargs}")
                
                # 调用 LLM
                response = completion(**kwargs)
                
                return response.choices[0].message.content
        
        return LLMWrapper()
    except Exception as e:
        print(f"初始化 LLM 客户端失败: {e}")
        
        # 返回一个 mock 客户端
        class MockLLM:
            async def chat(self, prompt: str, response_format: str = "text") -> str:
                import json
                if response_format == "json":
                    return json.dumps({
                        "pass": True,
                        "score": 8,
                        "checks": {
                            "valuation": {"pass": True, "detail": "估值合理"},
                            "profitability": {"pass": True, "detail": "盈利质量良好"},
                            "growth": {"pass": True, "detail": "有成长性"},
                            "health": {"pass": True, "detail": "财务健康"},
                            "risk_screen": {"pass": True, "detail": "无明显风险"}
                        },
                        "conclusion": "基本面良好，通过安全边际检查"
                    })
                return "这是一个模拟的 LLM 响应"
        
        return MockLLM()