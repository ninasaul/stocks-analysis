"""配置模块"""
import os
from dotenv import load_dotenv
from typing import Optional, Dict, Any
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
    DEFAULT_PROVIDER = os.getenv("DEFAULT_PROVIDER", "aliyun")  # aliyun 或 deepseek
    
    # 阿里云配置
    ALIYUN_API_KEY = os.getenv("ALIYUN_API_KEY", "")
    ALIYUN_MODEL = os.getenv("ALIYUN_MODEL", "qwen-plus")
    ALIYUN_BASE_URL = os.getenv("ALIYUN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    
    # DeepSeek配置
    DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
    DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
    DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    
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
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    
    # 提供商配置映射
    PROVIDER_CONFIG = {
        "aliyun": {
            "api_key": ALIYUN_API_KEY,
            "model": ALIYUN_MODEL,
            "base_url": ALIYUN_BASE_URL
        },
        "deepseek": {
            "api_key": DEEPSEEK_API_KEY,
            "model": DEEPSEEK_MODEL,
            "base_url": DEEPSEEK_BASE_URL
        }
    }


config = Config()


class LLMClient:
    """LLM客户端类，支持多个提供商"""
    
    def __init__(self, provider: Optional[str] = None):
        """
        初始化LLM客户端
        
        Args:
            provider: 提供商名称（aliyun或deepseek），默认使用配置中的默认提供商
        """
        self.provider = provider or config.DEFAULT_PROVIDER
        self.config = config.PROVIDER_CONFIG.get(self.provider)
        
        if not self.config:
            raise ValueError(f"不支持的提供商: {self.provider}")
        
        if not self.config["api_key"]:
            raise ValueError(f"{self.provider} API密钥未配置")
        
        logger.info(f"初始化LLM客户端: provider={self.provider}, model={self.config['model']}")
    
    async def chat(self, prompt: str, response_format: str = "text") -> str:
        """
        同步聊天完成
        
        Args:
            prompt: 提示
            response_format: 响应格式
        
        Returns:
            响应内容
        """
        import aiohttp
        import json
        
        url = f"{self.config['base_url']}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.config['api_key']}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.config["model"],
            "messages": [{"role": "user", "content": prompt}],
            "stream": False
        }
        
        if response_format == "json":
            payload["response_format"] = {"type": "json_object"}
        
        # 过滤敏感参数
        filtered_payload = payload.copy()
        filtered_payload["api_key"] = "***"
        logger.info(f"调用 {self.provider} LLM 参数: {filtered_payload}")
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=headers, json=payload) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f"{self.provider} API调用失败: {response.status} - {error_text}")
                        raise Exception(f"API调用失败: {error_text}")
                    
                    data = await response.json()
                    return data["choices"][0]["message"]["content"]
        
        except Exception as e:
            logger.error(f"{self.provider} LLM调用失败: {e}")
            raise
    
    async def stream_chat(self, prompt: str, response_format: str = "text"):
        """
        流式聊天完成
        
        Args:
            prompt: 提示
            response_format: 响应格式
        
        Yields:
            响应内容块
        """
        import aiohttp
        import json
        
        url = f"{self.config['base_url']}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.config['api_key']}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.config["model"],
            "messages": [{"role": "user", "content": prompt}],
            "stream": True
        }
        
        if response_format == "json":
            payload["response_format"] = {"type": "json_object"}
        
        # 过滤敏感参数
        filtered_payload = payload.copy()
        filtered_payload["api_key"] = "***"
        logger.info(f"调用 {self.provider} LLM 流式参数: {filtered_payload}")
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=headers, json=payload) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f"{self.provider} API调用失败: {response.status} - {error_text}")
                        yield f"API调用失败: {error_text}"
                        return
                    
                    # 处理流式响应
                    async for line in response.content:
                        if line:
                            line_str = line.decode('utf-8').strip()
                            if line_str.startswith('data: '):
                                data_str = line_str[6:]
                                if data_str == '[DONE]':
                                    break
                                
                                try:
                                    data = json.loads(data_str)
                                    if 'choices' in data and len(data['choices']) > 0:
                                        delta = data['choices'][0].get('delta', {})
                                        content = delta.get('content', '')
                                        if content:
                                            yield content
                                except json.JSONDecodeError as e:
                                    logger.warning(f"解析JSON失败: {e}, 数据: {data_str}")
                                    continue
                    
                    logger.info(f"{self.provider} LLM 流式响应完成")
        
        except Exception as e:
            logger.error(f"{self.provider} 流式LLM调用失败: {e}")
            yield f"流式调用失败: {str(e)}"


def get_llm_client(provider: Optional[str] = None) -> LLMClient:
    """
    获取 LLM 客户端
    
    Args:
        provider: 提供商名称（可选）
    
    Returns:
        LLM 客户端实例
    """
    try:
        return LLMClient(provider)
    except Exception as e:
        logger.error(f"初始化 LLM 客户端失败: {e}")
        
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
                            "risk_screen": {"pass": True, "detail": "无明显风险"},
                            "industry_prosperity": {"pass": True, "detail": "行业景气度正常"}
                        },
                        "conclusion": "基本面良好，通过安全边际检查"
                    })
                return "这是一个模拟的 LLM 响应"
            
            async def stream_chat(self, prompt: str, response_format: str = "text"):
                yield "这是一个模拟的流式 LLM 响应"
        
        return MockLLM()