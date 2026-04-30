from typing import List, Dict, Any, Optional, AsyncGenerator
from datetime import datetime, timezone
import asyncio
from app.core.logging import logger
from app.core.stock_service import StockService
from app.core.database import execute_query
from app.llm.llm_service import LLMManager
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
            self.sessions: Dict[str, Dict] = {}  # 存储多个会话 {session_id: {"history": [...], "criteria": {...}, "user_id": int, "topic": str}}
            self.current_session_id: Optional[str] = None
            self.initialized = True
            logger.info("DialogueManager 初始化完成")
            # 从数据库加载对话历史
            # 注意：这里暂时不加载，因为需要用户上下文

    def _get_session(self, session_id: Optional[str], user_id: Optional[int] = None) -> Dict:
        """获取或创建会话"""
        if not session_id:
            session_id = self.current_session_id

        if not session_id:
            if self.current_session_id:
                return self.sessions.get(self.current_session_id, {"history": [], "criteria": {}})
            return {"history": [], "criteria": {}}

        is_new_session = session_id not in self.sessions

        if is_new_session:
            self.sessions[session_id] = {"history": [], "criteria": {}, "user_id": user_id, "topic": ""}
            if user_id:
                self._create_session_in_db(user_id, session_id)

        if session_id != self.current_session_id:
            self.current_session_id = session_id

        return self.sessions[session_id]

    def _create_session_in_db(self, user_id: int, session_id: str) -> bool:
        """在数据库中创建会话"""
        try:
            insert_query = """
            INSERT INTO dialogue_sessions (user_id, session_id, topic, created_at)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (user_id, session_id) DO NOTHING
            """
            from datetime import date
            execute_query(insert_query, (user_id, session_id, "", date.today()), fetch=False)
            logger.debug(f"会话已创建到数据库: user_id={user_id}, session_id={session_id}")
            return True
        except Exception as e:
            logger.error(f"创建会话到数据库失败: {e}")
            return False

    def add_user_message(self, message: str, session_id: Optional[str] = None, user_id: Optional[int] = None) -> None:
        """添加用户消息到历史"""
        session = self._get_session(session_id, user_id)
        
        timestamp = datetime.now().astimezone().isoformat()
        message_id = None
        
        # 如果提供了用户ID，保存消息到数据库
        if user_id and session_id:
            message_id = self._save_message_to_db(user_id, session_id, "user", message, timestamp)
        
        session["history"].append({
            "role": "user",
            "content": message,
            "timestamp": timestamp,
            "id": message_id
        })
        
        # 如果是第一条消息，设置主题
        if len(session["history"]) == 1 and message:
            topic = message[:200]  # 截取前200个字符作为主题
            session["topic"] = topic
            # 如果提供了用户ID，保存到数据库
            if user_id:
                self._save_session_to_db(user_id, session_id, topic)
        
        # logger.debug(f"添加用户消息: {message[:50]}...")

    def add_assistant_message(self, message: str, session_id: Optional[str] = None, user_id: Optional[int] = None) -> None:
        """添加助手消息到历史"""
        session = self._get_session(session_id)
        
        timestamp = datetime.now().astimezone().isoformat()
        message_id = None
        
        # 处理 LLM 响应可能是列表的情况
        actual_message = message
        if isinstance(message, list) and len(message) > 0:
            # 取列表的第一个元素作为实际消息内容
            if isinstance(message[0], str):
                actual_message = message[0]
        elif isinstance(message, tuple) and len(message) > 0:
            # 处理 LLM 响应是元组的情况（通常包含消息内容和使用量信息）
            if isinstance(message[0], str):
                actual_message = message[0]
        
        # 确保消息是字符串类型
        if not isinstance(actual_message, str):
            actual_message = str(actual_message)
        
        # 如果提供了用户ID，保存消息到数据库
        if user_id and session_id:
            message_id = self._save_message_to_db(user_id, session_id, "assistant", actual_message, timestamp)
        
        session["history"].append({
            "role": "assistant",
            "content": actual_message,
            "timestamp": timestamp,
            "id": message_id
        })
        
        # logger.debug(f"添加助手消息: {actual_message[:50]}...")

    def _save_session_to_db(self, user_id: int, session_id: str, topic: str) -> None:
        """保存会话到数据库"""
        try:
            # 检查会话是否已存在
            check_query = """
            SELECT id FROM dialogue_sessions
            WHERE user_id = %s AND session_id = %s
            """
            existing = execute_query(check_query, (user_id, session_id))
            
            if existing:
                # 更新会话
                update_query = """
                UPDATE dialogue_sessions
                SET topic = %s, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = %s AND session_id = %s
                """
                execute_query(update_query, (topic, user_id, session_id), fetch=False)
            else:
                # 创建新会话
                insert_query = """
                INSERT INTO dialogue_sessions (user_id, session_id, topic)
                VALUES (%s, %s, %s)
                """
                execute_query(insert_query, (user_id, session_id, topic), fetch=False)
            
            logger.debug(f"会话 {session_id} 已保存到数据库")
        except Exception as e:
            logger.error(f"保存会话到数据库失败: {e}")

    def _save_message_to_db(self, user_id: int, session_id: str, role: str, content: str, timestamp: str) -> Optional[int]:
        """保存消息到数据库，返回消息ID"""
        try:
            # 获取会话ID
            session_query = """
            SELECT id FROM dialogue_sessions
            WHERE user_id = %s AND session_id = %s
            """
            session_result = execute_query(session_query, (user_id, session_id))
            
            if session_result:
                dialogue_session_id = session_result[0][0]
                # 插入消息并返回ID
                insert_query = """
                INSERT INTO dialogue_messages (session_id, role, content, timestamp)
                VALUES (%s, %s, %s, %s)
                RETURNING id
                """
                result = execute_query(insert_query, (dialogue_session_id, role, content, timestamp))
                if result:
                    message_id = result[0][0]
                    logger.debug(f"消息已保存到数据库，ID: {message_id}")
                    return message_id
            else:
                logger.warning(f"会话 {session_id} 不存在，无法保存消息")
                return None
        except Exception as e:
            logger.error(f"保存消息到数据库失败: {e}")
            return None

    def load_sessions_from_db(self, user_id: int) -> None:
        """从数据库加载用户的对话会话"""
        try:
            # 获取用户的所有会话
            sessions_query = """
            SELECT session_id, topic, created_at
            FROM dialogue_sessions
            WHERE user_id = %s
            ORDER BY created_at DESC
            """
            sessions_result = execute_query(sessions_query, (user_id,))
            
            for session_row in sessions_result:
                session_id = session_row[0]
                topic = session_row[1]
                
                # 获取会话的消息
                messages_query = """
                SELECT id, role, content, timestamp
                FROM dialogue_messages
                WHERE session_id = (
                    SELECT id FROM dialogue_sessions
                    WHERE user_id = %s AND session_id = %s
                )
                ORDER BY timestamp ASC
                """
                messages_result = execute_query(messages_query, (user_id, session_id))
                
                history = []
                for message_row in messages_result:
                    history.append({
                        "role": message_row[1],
                        "content": message_row[2],
                        "timestamp": message_row[3].isoformat() if hasattr(message_row[3], 'isoformat') else message_row[3],
                        "id": message_row[0]
                    })
                
                # 保存到内存
                self.sessions[session_id] = {
                    "history": history,
                    "criteria": {},
                    "user_id": user_id,
                    "topic": topic
                }
            
            logger.info(f"从数据库加载了 {len(sessions_result)} 个会话")
        except Exception as e:
            logger.error(f"从数据库加载会话失败: {e}")

    def update_criteria(self, criteria: Dict[str, Any], session_id: Optional[str] = None) -> None:
        """更新用户选股条件"""
        session = self._get_session(session_id)
        session["criteria"].update(criteria)
        logger.debug(f"更新选股条件: {criteria}")

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

    def merge_criteria(self, current_criteria: Dict[str, Any], new_criteria: Dict[str, Any]) -> Dict[str, Any]:
        """合并选股条件"""
        merged = current_criteria.copy()
        for key, value in new_criteria.items():
            if key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
                merged[key].update(value)
            else:
                merged[key] = value
        return merged

    def build_prompt(self, user_message: str, context: Optional[Dict[str, Any]] = None, session_id: Optional[str] = None) -> str:
        """构建发送给 LLM 的提示"""
        session = self._get_session(session_id)
        user_criteria = session.get("criteria", {})
        conversation_history = session.get("history", [])
        
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
            "7. 列出股票时使用\"股票代码.股票市场缩写\"的格式，例如：\"000001.SZ\"\n"
        ]

        if user_criteria:
            prompt_parts.append("# 已确定的选股条件\n")
            for key, value in user_criteria.items():
                prompt_parts.append(f"- {key}: {value}\n")
            prompt_parts.append("\n")

        if context:
            prompt_parts.append("# 当前分析上下文\n")
            prompt_parts.append(f"{json.dumps(context, ensure_ascii=False, indent=2)}\n\n")

        if conversation_history:
            prompt_parts.append("# 对话历史\n")
            for msg in conversation_history[-10:]:
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
        prompt_parts.append("6. 在回答结尾提供3-5个关于此类问题的延伸问题，格式如下：\n")
        prompt_parts.append("【延伸问题】\n")
        prompt_parts.append("1. [问题1]\n")
        prompt_parts.append("2. [问题2]\n")
        prompt_parts.append("3. [问题3]\n")
        prompt_parts.append("4. [问题4]\n")
        prompt_parts.append("5. [问题5]\n")

        return "".join(prompt_parts)

    async def get_response(self, user_message: str, context: Optional[Dict[str, Any]] = None, session_id: Optional[str] = None, mode: str = "prompt", user_id: Optional[int] = None, llm_client=None) -> Dict[str, Any]:
        """获取 LLM 响应"""
        self.add_user_message(user_message, session_id, user_id)

        # 提取选股条件（仅在 prompt 模式下）
        if mode == "prompt":
            new_criteria = self.extract_criteria(user_message)
            if new_criteria:
                current_criteria = self.get_criteria(session_id)
                merged_criteria = self.merge_criteria(current_criteria, new_criteria)
                self.update_criteria(merged_criteria, session_id)
                logger.info(f"提取到选股条件: {merged_criteria}")

            # 构建提示词
            prompt = self.build_prompt(user_message, context, session_id)
            logger.debug(f"构建提示: {prompt[:200]}...")
        else:
            # direct 模式：直接使用用户消息作为提示词
            prompt = user_message
            logger.debug(f"直接对话模式: {prompt[:200]}...")

        try:
            if llm_client is None:
                llm_client = LLMManager.get_default_client(user_id)
                if not llm_client:
                    logger.error(f"获取LLM客户端失败，用户: {user_id}")
                    response = "抱歉，当前LLM服务不可用，请稍后再试。"
                    self.add_assistant_message(response, session_id, user_id)
                    return {
                        "response": response,
                        "extension_questions": []
                    }
            response = await llm_client.chat(prompt)
            
            # 处理 LLM 响应可能是列表的情况
            actual_response = response
            if isinstance(response, list) and len(response) > 0:
                if isinstance(response[0], str):
                    actual_response = response[0]
                elif isinstance(response[0], tuple) and len(response[0]) > 0:
                    actual_response = str(response[0][0]) if response[0][0] else ""
            
            # 确保是字符串
            if not isinstance(actual_response, str):
                actual_response = str(actual_response)
            
            self.add_assistant_message(actual_response, session_id, user_id)
            logger.info(f"user_id: {user_id} LLM 响应成功")
            
            # 提取延伸问题（仅在 prompt 模式下）
            if mode == "prompt":
                extension_questions = self._extract_extension_questions(actual_response)
            else:
                extension_questions = []
            
            return {
                "response": actual_response,
                "extension_questions": extension_questions
            }
        except Exception as e:
            logger.error(f"LLM 调用失败: {e}")
            return {
                "response": "抱歉，我现在无法回答您的问题，请稍后再试。",
                "extension_questions": []
            }
            
    def _extract_extension_questions(self, response: str) -> List[str]:
        """从响应中提取延伸问题"""
        import re
        # 处理 response 可能是列表的情况
        actual_response = response
        if isinstance(response, list) and len(response) > 0:
            if isinstance(response[0], str):
                actual_response = response[0]
            elif isinstance(response[0], tuple) and len(response[0]) > 0:
                actual_response = str(response[0][0]) if response[0][0] else ""
        
        # 确保是字符串
        if not isinstance(actual_response, str):
            actual_response = str(actual_response)
        
        # 匹配【延伸问题】部分
        match = re.search(r'【延伸问题】\n(.*?)(?=\n\n|$)', actual_response, re.DOTALL)
        if match:
            questions_text = match.group(1)
            # 提取每个问题
            questions = re.findall(r'\d+\.\s*(.+?)\n', questions_text)
            return questions[:5]  # 最多返回5个问题
        return []

    async def get_streaming_response(self, user_message: str, context: Optional[Dict[str, Any]] = None, session_id: Optional[str] = None, mode: str = "prompt", user_id: Optional[int] = None, llm_client=None) -> AsyncGenerator[Dict[str, Any], None]:
        """获取 LLM 流式响应"""
        self.add_user_message(user_message, session_id, user_id)

        # 提取选股条件（仅在 prompt 模式下）
        if mode == "prompt":
            new_criteria = self.extract_criteria(user_message)
            if new_criteria:
                current_criteria = self.get_criteria(session_id)
                merged_criteria = self.merge_criteria(current_criteria, new_criteria)
                self.update_criteria(merged_criteria, session_id)
                logger.info(f"提取到选股条件: {merged_criteria}")

        # 根据模式决定是否构建提示词
        if mode == "prompt":
            prompt = self.build_prompt(user_message, context, session_id)
            logger.debug(f"构建提示: {prompt[:200]}...")
        else:
            # direct 模式：直接使用用户消息作为提示词
            prompt = user_message
            logger.debug(f"直接对话模式: {prompt[:200]}...")

        try:
            if llm_client is None:
                llm_client = LLMManager.get_default_client(user_id)
                if not llm_client:
                    logger.error(f"获取LLM客户端失败，用户: {user_id}")
                    response = "抱歉，当前LLM服务不可用，请稍后再试。"
                    self.add_assistant_message(response, session_id, user_id)
                    yield response
                    return
            
            # 使用真正的流式LLM调用
            full_response = ""
            async for chunk in llm_client.stream_chat(prompt):
                if chunk:
                    # 处理 chunk 可能是列表的情况
                    actual_chunk = chunk
                    if isinstance(chunk, list) and len(chunk) > 0:
                        if isinstance(chunk[0], str):
                            actual_chunk = chunk[0]
                        elif isinstance(chunk[0], tuple) and len(chunk[0]) > 0:
                            actual_chunk = str(chunk[0][0]) if chunk[0][0] else ""
                    
                    # 确保是字符串
                    if not isinstance(actual_chunk, str):
                        actual_chunk = str(actual_chunk)
                    yield {"chunk": actual_chunk, "extension_questions": []}
                    full_response += actual_chunk
            
            self.add_assistant_message(full_response, session_id, user_id)
            logger.info(f"user_id: {user_id} LLM 流式响应成功")
            
            # 提取延伸问题（仅在 prompt 模式下）
            if mode == "prompt":
                extension_questions = self._extract_extension_questions(full_response)
                # 发送包含延伸问题的最终响应
                yield {"chunk": "", "extension_questions": extension_questions}
            else:
                # direct模式不提取延伸问题
                yield {"chunk": "", "extension_questions": []}
        except Exception as e:
            logger.error(f"LLM 调用失败: {e}")
            yield {"chunk": "抱歉，我现在无法回答您的问题，请稍后再试。", "extension_questions": []}

    def get_history(self, session_id: Optional[str] = None) -> List[Dict[str, str]]:
        """获取对话历史"""
        session = self._get_session(session_id)
        return session.get("history", [])

    def get_criteria(self, session_id: Optional[str] = None) -> Dict[str, Any]:
        """获取当前选股条件"""
        session = self._get_session(session_id)
        return session.get("criteria", {}).copy()

    def clear_history(self, session_id: Optional[str] = None, user_id: Optional[int] = None) -> bool:
        """清除对话历史"""
        if session_id:
            # 清除指定会话
            if session_id in self.sessions:
                # 从数据库删除
                if user_id:
                    try:
                        # 删除会话的消息
                        delete_messages_query = """
                        DELETE FROM dialogue_messages
                        WHERE session_id = (
                            SELECT id FROM dialogue_sessions
                            WHERE user_id = %s AND session_id = %s
                        )
                        """
                        execute_query(delete_messages_query, (user_id, session_id), fetch=False)
                        
                        # 删除会话
                        delete_session_query = """
                        DELETE FROM dialogue_sessions
                        WHERE user_id = %s AND session_id = %s
                        """
                        execute_query(delete_session_query, (user_id, session_id), fetch=False)
                        logger.info(f"从数据库删除会话 {session_id}")
                    except Exception as e:
                        logger.error(f"从数据库删除会话失败: {e}")
                
                del self.sessions[session_id]
                if session_id == self.current_session_id:
                    self.current_session_id = None
                logger.info(f"会话 {session_id} 历史已清除")
                return True
        else:
            # 清除当前会话
            if self.current_session_id and self.current_session_id in self.sessions:
                # 从数据库删除
                if user_id:
                    try:
                        # 删除会话的消息
                        delete_messages_query = """
                        DELETE FROM dialogue_messages
                        WHERE session_id = (
                            SELECT id FROM dialogue_sessions
                            WHERE user_id = %s AND session_id = %s
                        )
                        """
                        execute_query(delete_messages_query, (user_id, self.current_session_id), fetch=False)
                        
                        # 删除会话
                        delete_session_query = """
                        DELETE FROM dialogue_sessions
                        WHERE user_id = %s AND session_id = %s
                        """
                        execute_query(delete_session_query, (user_id, self.current_session_id), fetch=False)
                        logger.info(f"从数据库删除会话 {self.current_session_id}")
                    except Exception as e:
                        logger.error(f"从数据库删除会话失败: {e}")
                
                del self.sessions[self.current_session_id]
                self.current_session_id = None
                logger.info("当前会话历史已清除")
                return True
        return False

    def update_topic(self, session_id: str, topic: str, user_id: int) -> bool:
        """更新会话主题"""
        if session_id in self.sessions:
            self.sessions[session_id]["topic"] = topic
            # 同步到数据库
            try:
                update_query = """
                UPDATE dialogue_sessions
                SET topic = %s, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = %s AND session_id = %s
                """
                execute_query(update_query, (topic, user_id, session_id), fetch=False)
                logger.info(f"会话 {session_id} 主题已更新为: {topic}")
                return True
            except Exception as e:
                logger.error(f"更新会话主题失败: {e}")
        return False

    def get_sessions(self, user_id: int) -> List[Dict[str, Any]]:
        """获取用户的所有会话"""
        # 从数据库获取
        try:
            query = """
            SELECT session_id, topic, created_at, updated_at
            FROM dialogue_sessions
            WHERE user_id = %s
            ORDER BY updated_at DESC
            """
            result = execute_query(query, (user_id,))
            
            sessions = []
            for row in result:
                sessions.append({
                    "session_id": row[0],
                    "topic": row[1],
                    "created_at": row[2].isoformat() if hasattr(row[2], 'isoformat') else row[2],
                    "updated_at": row[3].isoformat() if hasattr(row[3], 'isoformat') else row[3]
                })
            return sessions
        except Exception as e:
            logger.error(f"获取用户会话列表失败: {e}")
            return []

    def delete_message(self, session_id: str, message_id: int, user_id: int) -> bool:
        """删除会话中的某条消息"""
        if session_id not in self.sessions:
            logger.warning(f"会话 {session_id} 不存在")
            return False
        
        session = self.sessions[session_id]
        history = session.get("history", [])
        
        # 在历史记录中查找消息
        message_found = False
        for i, msg in enumerate(history):
            if msg.get("id") == message_id:
                # 从内存中删除
                history.pop(i)
                message_found = True
                logger.info(f"从会话 {session_id} 中删除了ID为 {message_id} 的消息")
                break
        
        if not message_found:
            logger.warning(f"消息ID {message_id} 在会话 {session_id} 中未找到")
            return False
        
        # 从数据库中删除
        try:
            delete_query = """
            DELETE FROM dialogue_messages
            WHERE id = %s
            """
            execute_query(delete_query, (message_id,), fetch=False)
            logger.info(f"从数据库删除了ID为 {message_id} 的消息")
        except Exception as e:
            logger.error(f"从数据库删除消息失败: {e}")
            return False
        
        return True

dialogue_manager = DialogueManager()