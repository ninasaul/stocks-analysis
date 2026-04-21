from typing import List, Dict, Any, Optional, AsyncGenerator
from datetime import datetime
import asyncio
from app.core.config import get_llm_client
from app.core.logging import logger
from app.core.stock_service import StockService
import json
import re

class DialogueManager:
    """对话管理器 - 管理和存储用户对话历史，对接 LLM 进行智能分析"""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not hasattr(self, 'initialized'):
            self.conversation_history: List[Dict[str, str]] = []
            self.current_session_id: Optional[str] = None
            self.user_criteria: Dict[str, Any] = {}
            self.initialized = True
            logger.info("DialogueManager 初始化完成")

    def add_user_message(self, message: str, session_id: Optional[str] = None) -> None:
        """添加用户消息到历史"""
        if session_id != self.current_session_id:
            self.conversation_history = []
            self.user_criteria = {}
            self.current_session_id = session_id

        self.conversation_history.append({
            "role": "user",
            "content": message,
            "timestamp": datetime.now().isoformat()
        })
        # logger.debug(f"添加用户消息: {message[:50]}...")

    def add_assistant_message(self, message: str) -> None:
        """添加助手消息到历史"""
        self.conversation_history.append({
            "role": "assistant",
            "content": message,
            "timestamp": datetime.now().isoformat()
        })
        # logger.debug(f"添加助手消息: {message[:50]}...")

    def extract_criteria(self, message: str) -> Dict[str, Any]:
        """提取用户消息中的选股条件"""
        criteria = {}

        # 提取价格区间
        price_match = re.search(r'(\d+\.?\d*)-(\d+\.?\d*)元', message)
        if price_match:
            criteria['price_range'] = {'min': float(price_match.group(1)), 'max': float(price_match.group(2))}

        # 提取股价大于/小于条件
        price_gt_match = re.search(r'股价[大于高于]*(\d+\.?\d*)', message)
        if price_gt_match:
            criteria['price'] = {'min': float(price_gt_match.group(1))}
        
        price_lt_match = re.search(r'股价[小于低于]*(\d+\.?\d*)', message)
        if price_lt_match:
            criteria['price'] = {'max': float(price_lt_match.group(1))}

        # 提取PE值
        pe_match = re.search(r'PE[为是]?[小于小于]*(\d+\.?\d*)', message, re.IGNORECASE)
        if pe_match:
            criteria['pe'] = {'max': float(pe_match.group(1))}

        # 提取ROE值
        roe_match = re.search(r'ROE[为是]?[大于大于]*(\d+\.?\d*)', message, re.IGNORECASE)
        if roe_match:
            criteria['roe'] = {'min': float(roe_match.group(1))}

        # 提取行业板块和题材（从StockService获取）
        try:
            stock_service = StockService()
            industry_list = stock_service.get_industry_list()
            concept_list = stock_service.get_concept_list()
            
            # 合并行业和题材列表
            all_keywords = industry_list + concept_list
            
            # 匹配行业或题材
            for keyword in all_keywords:
                if keyword in message:
                    criteria['industry'] = keyword
                    break
        except Exception as e:
            logger.error(f"获取行业和题材信息失败: {e}")

        # 提取市场类型
        market_match = re.search(r'(沪市|深市|主板|创业板|科创板|北交所|A股|a股|港股|美股)', message, re.IGNORECASE)
        if market_match:
            criteria['market'] = market_match.group(1)

        # 提取成交量
        volume_match = re.search(r'成交量[大于高于]*(\d+\.?\d*)[万手亿]', message)
        if volume_match:
            criteria['volume'] = float(volume_match.group(1))

        # 提取趋势和技术指标
        trend_match = re.search(r'(上涨|下跌|横盘|突破|回调|均线多头|多头排列|均线空头|空头排列|金叉|死叉|超买|超卖|MACD|KDJ|RSI|布林带|成交量|量价配合|量价背离)', message)
        if trend_match:
            criteria['trend'] = trend_match.group(1)

        return criteria

    def merge_criteria(self, new_criteria: Dict[str, Any]) -> Dict[str, Any]:
        """合并新旧条件"""
        merged = self.user_criteria.copy()
        for key, value in new_criteria.items():
            if key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
                merged[key].update(value)
            else:
                merged[key] = value
        return merged

    def build_prompt(self, user_message: str, context: Optional[Dict[str, Any]] = None) -> str:
        """构建发送给 LLM 的提示"""
        prompt_parts = [
            "# 角色定义\n",
            "你是一个专业的股票投资顾问，擅长分析股票的技术面和基本面。\n\n",
            "# 核心职责\n",
            "1. 理解用户的选股条件，提供专业、简洁的分析和建议\n",
            "2. 直接回答用户的问题，不要添加过多额外条件\n",
            "3. 当用户提出选股条件时，提供具体的股票建议\n",
            "4. 当用户要求提供买卖建议时，才能提供股票的买卖区间、支撑位、压力位等具体交易建议\n",
            "5. 回复要简洁明了，避免冗长的分析\n",
            "6. 推荐股票时必须带上免责声明，且必须排除以下风险股票：\n",
            "   - ST和*ST股票\n",
            "   - 可能触及退市条件的股票\n",
            "   - 财务状况异常的股票（如连续亏损、资不抵债等）\n",
            "   - 有重大违法违规记录的股票\n\n"
        ]

        if self.user_criteria:
            prompt_parts.append("# 已确定的选股条件\n")
            for key, value in self.user_criteria.items():
                prompt_parts.append(f"- {key}: {value}\n")
            prompt_parts.append("\n")

        if context:
            prompt_parts.append("# 当前分析上下文\n")
            prompt_parts.append(f"{json.dumps(context, ensure_ascii=False, indent=2)}\n\n")

        if self.conversation_history:
            prompt_parts.append("# 对话历史\n")
            for msg in self.conversation_history[-10:]:
                role = "用户" if msg["role"] == "user" else "助手"
                prompt_parts.append(f"{role}：{msg['content']}\n")
            prompt_parts.append("\n")

        prompt_parts.append("# 用户最新问题\n")
        prompt_parts.append(f"{user_message}\n\n")

        prompt_parts.append("# 回答要求\n")
        prompt_parts.append("1. 简洁分析用户的选股条件\n")
        prompt_parts.append("2. 提供符合条件的具体股票建议，用户要多少只股票就提供多少只股票，如果没有指定数量，默认数量在3-5只之间\n")
        prompt_parts.append("3. 为每只推荐的股票提供简要的趋势分析\n")
        prompt_parts.append("4. 回复要简洁明了，不要添加过多额外的条件限制\n")
        prompt_parts.append("5. 在回答结尾提供2-3个简短的后续操作建议，格式如下：\n")
        prompt_parts.append("【后续建议】\n")
        prompt_parts.append("1. [建议内容]\n")
        prompt_parts.append("2. [建议内容]\n")
        prompt_parts.append("3. [建议内容]\n")

        return "".join(prompt_parts)

    async def get_response(self, user_message: str, context: Optional[Dict[str, Any]] = None, session_id: Optional[str] = None) -> str:
        """获取 LLM 响应"""
        self.add_user_message(user_message, session_id)

        new_criteria = self.extract_criteria(user_message)
        if new_criteria:
            self.user_criteria = self.merge_criteria(new_criteria)
            logger.info(f"提取到选股条件: {self.user_criteria}")

        prompt = self.build_prompt(user_message, context)
        logger.debug(f"构建提示: {prompt[:200]}...")

        try:
            llm_client = get_llm_client()
            response = await llm_client.chat(prompt)
            self.add_assistant_message(response)
            logger.info(f"LLM 响应成功")
            return response
        except Exception as e:
            logger.error(f"LLM 调用失败: {e}")
            return "抱歉，我现在无法回答您的问题，请稍后再试。"

    async def get_streaming_response(self, user_message: str, context: Optional[Dict[str, Any]] = None, session_id: Optional[str] = None) -> AsyncGenerator[str, None]:
        """获取 LLM 流式响应"""
        self.add_user_message(user_message, session_id)

        new_criteria = self.extract_criteria(user_message)
        if new_criteria:
            self.user_criteria = self.merge_criteria(new_criteria)
            logger.info(f"提取到选股条件: {self.user_criteria}")

        prompt = self.build_prompt(user_message, context)
        logger.debug(f"构建提示: {prompt[:200]}...")

        try:
            llm_client = get_llm_client()
            
            # 发送一些提示信息
            yield "正在分析您的选股条件..."
            await asyncio.sleep(0.2)
            yield "\n\n"
            await asyncio.sleep(0.2)
            yield "我需要思考一下..."
            await asyncio.sleep(0.2)
            yield "\n\n"
            
            # 使用真正的流式LLM调用
            full_response = ""
            async for chunk in llm_client.stream_chat(prompt):
                if chunk:
                    yield chunk
                    full_response += chunk
            
            self.add_assistant_message(full_response)
            logger.info(f"LLM 流式响应成功")
        except Exception as e:
            logger.error(f"LLM 调用失败: {e}")
            yield "抱歉，我现在无法回答您的问题，请稍后再试。"

    def get_history(self, session_id: Optional[str] = None) -> List[Dict[str, str]]:
        """获取对话历史"""
        if session_id == self.current_session_id:
            return self.conversation_history
        return []

    def get_criteria(self) -> Dict[str, Any]:
        """获取当前选股条件"""
        return self.user_criteria.copy()

    def clear_history(self, session_id: Optional[str] = None) -> bool:
        """清除对话历史"""
        if session_id == self.current_session_id or session_id is None:
            self.conversation_history = []
            self.user_criteria = {}
            self.current_session_id = None
            logger.info("对话历史已清除")
            return True
        return False

dialogue_manager = DialogueManager()