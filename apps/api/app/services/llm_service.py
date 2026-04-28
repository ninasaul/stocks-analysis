"""LLM 服务层"""
from typing import Optional, List, Dict, Any, AsyncGenerator
from datetime import datetime, timedelta
import aiohttp
import json
import logging
import os

from app.core.database import execute_query, execute_write
from app.core.logging import logger
from app.models.llm import LLMPreset, UserLLMConfig, UserLLMUsage, LLMChatRequest, LLMChatResponse, UserLLMPreference

_user_preference_cache: Dict[int, UserLLMPreference] = {}
_cache_loaded = False

# 加密相关配置
def get_encryption_key() -> str:
    """获取加密密钥"""
    key = os.getenv("DB_ENCRYPTION_KEY", "")
    if not key:
        logger.warning("未设置DB_ENCRYPTION_KEY环境变量，API Key将以明文存储")
    return key

def should_encrypt() -> bool:
    """判断是否应该使用加密"""
    key = os.getenv("DB_ENCRYPTION_KEY", "")
    return bool(key and key.strip())


class UnifiedLLMClient:
    """统一LLM客户端，支持系统预设和用户自定义配置"""
    
    def __init__(
        self,
        api_key: str,
        base_url: str,
        model: str,
        provider: str = "custom"
    ):
        """
        初始化LLM客户端
        
        Args:
            api_key: API密钥
            base_url: 基础URL
            model: 模型名称
            provider: 提供商名称
        """
        self.provider = provider
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        
        logger.info(f"初始化UnifiedLLM客户端: provider={self.provider}, model={self.model}")
    
    async def chat(self, prompt: str, response_format: str = "text", temperature: float = 0.1, seed: int = 42) -> tuple:
        """
        同步聊天完成
        
        Args:
            prompt: 提示
            response_format: 响应格式
            temperature: 温度参数，控制输出随机性（0-2）
            seed: 随机种子，确保结果可重复
        
        Returns:
            (响应内容, token使用情况)
        """
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "temperature": temperature,
            "seed": seed
        }
        
        if response_format == "json":
            payload["response_format"] = {"type": "json_object"}
        
        # 过滤敏感参数
        filtered_payload = payload.copy()
        filtered_payload["api_key"] = "***"
        logger.debug(f"调用 {self.provider} LLM 参数: {filtered_payload}")
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=headers, json=payload) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f"{self.provider} API调用失败: {response.status} - {error_text}")
                        raise Exception(f"API调用失败: {error_text}")
                    
                    data = await response.json()
                    content = data["choices"][0]["message"]["content"]
                    # 获取token使用情况
                    token_usage = data.get("usage", {})
                    return content, token_usage
        
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
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
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


class LLMService:
    """LLM 服务类"""

    @staticmethod
    def get_all_presets(include_inactive: bool = False) -> List[LLMPreset]:
        """获取所有预定义模型（解密API Key）"""
        encryption_key = get_encryption_key()
        use_encryption = should_encrypt()
        
        if use_encryption:
            # 加密模式：需要解密
            if include_inactive:
                query = """
                SELECT id, name, display_name, 
                       CASE WHEN api_key IS NOT NULL THEN pgp_sym_decrypt(api_key, %s) ELSE NULL END as api_key,
                       base_url, default_model, models, is_active, is_system, config,
                       created_at, updated_at
                FROM llm_presets ORDER BY is_system DESC, id ASC
                """
                rows = execute_query(query, (encryption_key,))
            else:
                query = """
                SELECT id, name, display_name, 
                       CASE WHEN api_key IS NOT NULL THEN pgp_sym_decrypt(api_key, %s) ELSE NULL END as api_key,
                       base_url, default_model, models, is_active, is_system, config,
                       created_at, updated_at
                FROM llm_presets WHERE is_active = true ORDER BY is_system DESC, id ASC
                """
                rows = execute_query(query, (encryption_key,))
        else:
            # 明文模式：直接读取
            if include_inactive:
                query = """
                SELECT id, name, display_name, api_key,
                       base_url, default_model, models, is_active, is_system, config,
                       created_at, updated_at
                FROM llm_presets ORDER BY is_system DESC, id ASC
                """
                rows = execute_query(query)
            else:
                query = """
                SELECT id, name, display_name, api_key,
                       base_url, default_model, models, is_active, is_system, config,
                       created_at, updated_at
                FROM llm_presets WHERE is_active = true ORDER BY is_system DESC, id ASC
                """
                rows = execute_query(query)
        return [LLMPreset.from_db_row(row) for row in rows]

    @staticmethod
    def get_preset_by_id(preset_id: int) -> Optional[LLMPreset]:
        """根据ID获取预定义模型（解密API Key）"""
        encryption_key = get_encryption_key()
        use_encryption = should_encrypt()
        
        if use_encryption:
            query = """
            SELECT id, name, display_name, 
                   CASE WHEN api_key IS NOT NULL THEN pgp_sym_decrypt(api_key, %s) ELSE NULL END as api_key,
                   base_url, default_model, models, is_active, is_system, config,
                   created_at, updated_at
            FROM llm_presets WHERE id = %s
            """
            rows = execute_query(query, (encryption_key, preset_id))
        else:
            query = """
            SELECT id, name, display_name, api_key,
                   base_url, default_model, models, is_active, is_system, config,
                   created_at, updated_at
            FROM llm_presets WHERE id = %s
            """
            rows = execute_query(query, (preset_id,))
        if rows:
            return LLMPreset.from_db_row(rows[0])
        return None

    @staticmethod
    def get_preset_by_name(name: str) -> Optional[LLMPreset]:
        """根据名称获取预定义模型（解密API Key）"""
        encryption_key = get_encryption_key()
        use_encryption = should_encrypt()
        
        if use_encryption:
            query = """
            SELECT id, name, display_name, 
                   CASE WHEN api_key IS NOT NULL THEN pgp_sym_decrypt(api_key, %s) ELSE NULL END as api_key,
                   base_url, default_model, models, is_active, is_system, config,
                   created_at, updated_at
            FROM llm_presets WHERE name = %s
            """
            rows = execute_query(query, (encryption_key, name))
        else:
            query = """
            SELECT id, name, display_name, api_key,
                   base_url, default_model, models, is_active, is_system, config,
                   created_at, updated_at
            FROM llm_presets WHERE name = %s
            """
            rows = execute_query(query, (name,))
        if rows:
            return LLMPreset.from_db_row(rows[0])
        return None

    @staticmethod
    def create_preset(
        name: str, display_name: str, base_url: str, default_model: str,
        api_key: str = "", models: Optional[List[str]] = None, is_active: bool = True, config: Optional[Dict] = None
    ) -> LLMPreset:
        """创建预定义模型（支持加密和明文存储API Key）"""
        encryption_key = get_encryption_key()
        use_encryption = should_encrypt()
        
        # 加密API Key（如果启用加密）
        encrypted_api_key = api_key
        if api_key and use_encryption:
            query = "SELECT pgp_sym_encrypt(%s, %s)::bytea"
            rows = execute_query(query, (api_key, encryption_key))
            encrypted_api_key = rows[0][0] if rows else None
        
        query = """
        INSERT INTO llm_presets (name, display_name, api_key, base_url, default_model, models, is_active, is_system, config)
        VALUES (%s, %s, %s, %s, %s, %s, %s, false, %s)
        RETURNING id
        """
        rows = execute_query(query, (name, display_name, encrypted_api_key, base_url, default_model, json.dumps(models or []), is_active, json.dumps(config) if config else None))
        if rows:
            return LLMService.get_preset_by_id(rows[0][0])
        return None

    @staticmethod
    def update_preset(
        preset_id: int, display_name: Optional[str] = None, api_key: Optional[str] = None,
        base_url: Optional[str] = None, default_model: Optional[str] = None,
        models: Optional[List[str]] = None, is_active: Optional[bool] = None, config: Optional[Dict] = None
    ) -> Optional[LLMPreset]:
        """更新预定义模型（支持加密和明文存储API Key）"""
        encryption_key = get_encryption_key()
        use_encryption = should_encrypt()
        
        updates = []
        params = []

        if display_name is not None:
            updates.append("display_name = %s")
            params.append(display_name)
        if api_key is not None:
            # 加密API Key（如果启用加密）
            if use_encryption and api_key:
                query = "SELECT pgp_sym_encrypt(%s, %s)::bytea"
                rows = execute_query(query, (api_key, encryption_key))
                encrypted_key = rows[0][0] if rows else None
            else:
                encrypted_key = api_key
            updates.append("api_key = %s")
            params.append(encrypted_key)
        if base_url is not None:
            updates.append("base_url = %s")
            params.append(base_url)
        if default_model is not None:
            updates.append("default_model = %s")
            params.append(default_model)
        if models is not None:
            updates.append("models = %s")
            params.append(json.dumps(models))
        if is_active is not None:
            updates.append("is_active = %s")
            params.append(is_active)
        if config is not None:
            updates.append("config = %s")
            params.append(json.dumps(config))

        if not updates:
            return LLMService.get_preset_by_id(preset_id)

        updates.append("updated_at = %s")
        params.append(datetime.now())
        params.append(preset_id)

        query = f"UPDATE llm_presets SET {', '.join(updates)} WHERE id = %s RETURNING id"
        rows = execute_query(query, tuple(params))
        if rows:
            return LLMService.get_preset_by_id(rows[0][0])
        return None

    @staticmethod
    def delete_preset(preset_id: int) -> bool:
        """删除预定义模型"""
        preset = LLMService.get_preset_by_id(preset_id)
        if preset and preset.is_system:
            logger.warning(f"无法删除系统预设: {preset_id}")
            return False

        query = "DELETE FROM llm_presets WHERE id = %s AND is_system = false"
        execute_write(query, (preset_id,))
        return True

    @staticmethod
    def get_user_configs(user_id: int, include_inactive: bool = False) -> List[UserLLMConfig]:
        """获取用户所有自定义配置（解密API Key）"""
        encryption_key = get_encryption_key()
        use_encryption = should_encrypt()
        
        if use_encryption:
            # 加密模式：需要解密
            if include_inactive:
                query = """
                SELECT id, user_id, name, provider,
                       CASE WHEN api_key IS NOT NULL THEN pgp_sym_decrypt(api_key, %s) ELSE NULL END as api_key,
                       base_url, model, is_active, config, created_at, updated_at
                FROM user_llm_configs WHERE user_id = %s ORDER BY is_active DESC, id ASC
                """
                rows = execute_query(query, (encryption_key, user_id))
            else:
                query = """
                SELECT id, user_id, name, provider,
                       CASE WHEN api_key IS NOT NULL THEN pgp_sym_decrypt(api_key, %s) ELSE NULL END as api_key,
                       base_url, model, is_active, config, created_at, updated_at
                FROM user_llm_configs WHERE user_id = %s AND is_active = true ORDER BY id ASC
                """
                rows = execute_query(query, (encryption_key, user_id))
        else:
            # 明文模式：直接读取
            if include_inactive:
                query = """
                SELECT id, user_id, name, provider, api_key,
                       base_url, model, is_active, config, created_at, updated_at
                FROM user_llm_configs WHERE user_id = %s ORDER BY is_active DESC, id ASC
                """
                rows = execute_query(query, (user_id,))
            else:
                query = """
                SELECT id, user_id, name, provider, api_key,
                       base_url, model, is_active, config, created_at, updated_at
                FROM user_llm_configs WHERE user_id = %s AND is_active = true ORDER BY id ASC
                """
                rows = execute_query(query, (user_id,))
        return [UserLLMConfig.from_db_row(row) for row in rows]

    @staticmethod
    def get_user_config_by_id(user_id: int, config_id: int) -> Optional[UserLLMConfig]:
        """获取用户指定配置（解密API Key）"""
        encryption_key = get_encryption_key()
        use_encryption = should_encrypt()
        
        if use_encryption:
            query = """
            SELECT id, user_id, name, provider,
                   CASE WHEN api_key IS NOT NULL THEN pgp_sym_decrypt(api_key, %s) ELSE NULL END as api_key,
                   base_url, model, is_active, config, created_at, updated_at
            FROM user_llm_configs WHERE id = %s AND user_id = %s
            """
            rows = execute_query(query, (encryption_key, config_id, user_id))
        else:
            query = """
            SELECT id, user_id, name, provider, api_key,
                   base_url, model, is_active, config, created_at, updated_at
            FROM user_llm_configs WHERE id = %s AND user_id = %s
            """
            rows = execute_query(query, (config_id, user_id))
        if rows:
            return UserLLMConfig.from_db_row(rows[0])
        return None

    @staticmethod
    def create_user_config(
        user_id: int, name: str, api_key: str, base_url: str, model: str,
        provider: Optional[str] = None, is_active: bool = True, config: Optional[Dict] = None
    ) -> UserLLMConfig:
        """创建用户自定义配置（支持加密和明文存储API Key）"""
        from app.core.database import db_manager
        
        encryption_key = get_encryption_key()
        use_encryption = should_encrypt()
        
        # 加密API Key（如果启用加密）
        encrypted_api_key = api_key
        if api_key and use_encryption:
            query = "SELECT pgp_sym_encrypt(%s, %s)::bytea"
            rows = execute_query(query, (api_key, encryption_key))
            encrypted_api_key = rows[0][0] if rows else None
        
        query = """
        INSERT INTO user_llm_configs (user_id, name, provider, api_key, base_url, model, is_active, config)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """
        with db_manager.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(query, (user_id, name, provider, encrypted_api_key, base_url, model, is_active, json.dumps(config) if config else None))
                result = cursor.fetchone()
                conn.commit()
                config_id = result[0] if result else None
        
        # 获取完整的配置信息
        config = LLMService.get_user_config_by_id(user_id, config_id)
        return config

    @staticmethod
    def update_user_config(
        user_id: int, config_id: int, name: Optional[str] = None,
        api_key: Optional[str] = None, base_url: Optional[str] = None, model: Optional[str] = None,
        provider: Optional[str] = None, is_active: Optional[bool] = None, config: Optional[Dict] = None
    ) -> Optional[UserLLMConfig]:
        """更新用户自定义配置（支持加密和明文存储API Key）"""
        encryption_key = get_encryption_key()
        use_encryption = should_encrypt()
        
        updates = []
        params = []

        if name is not None:
            updates.append("name = %s")
            params.append(name)
        if api_key is not None:
            # 加密API Key（如果启用加密）
            if use_encryption and api_key:
                query = "SELECT pgp_sym_encrypt(%s, %s)::bytea"
                rows = execute_query(query, (api_key, encryption_key))
                encrypted_key = rows[0][0] if rows else None
            else:
                encrypted_key = api_key
            updates.append("api_key = %s")
            params.append(encrypted_key)
        if base_url is not None:
            updates.append("base_url = %s")
            params.append(base_url)
        if model is not None:
            updates.append("model = %s")
            params.append(model)
        if provider is not None:
            updates.append("provider = %s")
            params.append(provider)
        if is_active is not None:
            updates.append("is_active = %s")
            params.append(is_active)
        if config is not None:
            updates.append("config = %s")
            params.append(json.dumps(config))

        if not updates:
            return LLMService.get_user_config_by_id(user_id, config_id)

        updates.append("updated_at = %s")
        params.append(datetime.now())
        params.append(config_id)
        params.append(user_id)

        query = f"UPDATE user_llm_configs SET {', '.join(updates)} WHERE id = %s AND user_id = %s RETURNING id"
        rows = execute_query(query, tuple(params))
        if rows:
            return LLMService.get_user_config_by_id(user_id, rows[0][0])
        return None

    @staticmethod
    def delete_user_config(user_id: int, config_id: int) -> bool:
        """删除用户自定义配置"""
        query = "DELETE FROM user_llm_configs WHERE id = %s AND user_id = %s"
        execute_write(query, (config_id, user_id))
        return True

    @staticmethod
    def record_usage(
        user_id: int, model: str, prompt_tokens: int, completion_tokens: int,
        total_tokens: int, cost: float = 0.0,
        preset_id: Optional[int] = None, user_config_id: Optional[int] = None,
        provider: Optional[str] = None
    ) -> bool:
        """记录LLM使用量"""
        query = """
        INSERT INTO user_llm_usage
        (user_id, preset_id, user_config_id, provider, model, prompt_tokens, completion_tokens, total_tokens, cost)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        try:
            execute_write(query, (user_id, preset_id, user_config_id, provider, model, prompt_tokens, completion_tokens, total_tokens, cost))
            return True
        except Exception as e:
            logger.error(f"记录LLM使用量失败: {e}")
            return False

    @staticmethod
    def get_user_usage_summary(user_id: int, days: int = 30) -> Dict[str, Any]:
        """获取用户使用量汇总"""
        start_date = datetime.now() - timedelta(days=days)
        query = """
        SELECT
            COUNT(*) as call_count,
            COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
            COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
            COALESCE(SUM(total_tokens), 0) as total_tokens,
            COALESCE(SUM(cost), 0) as total_cost,
            date_trunc('day', called_at) as day
        FROM user_llm_usage
        WHERE user_id = %s AND called_at >= %s
        GROUP BY day
        ORDER BY day DESC
        """
        rows = execute_query(query, (user_id, start_date))

        total_query = """
        SELECT
            COUNT(*) as total_calls,
            COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
            COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
            COALESCE(SUM(total_tokens), 0) as total_tokens,
            COALESCE(SUM(cost), 0) as total_cost
        FROM user_llm_usage
        WHERE user_id = %s AND called_at >= %s
        """
        total_rows = execute_query(total_query, (user_id, start_date))

        daily_usage = []
        for row in rows:
            daily_usage.append({
                "date": row[5].strftime("%Y-%m-%d") if row[5] else None,
                "call_count": row[0],
                "prompt_tokens": row[1],
                "completion_tokens": row[2],
                "total_tokens": row[3],
                "cost": float(row[4]) if row[4] else 0.0
            })

        total = total_rows[0] if total_rows else (0, 0, 0, 0, 0)
        return {
            "period_days": days,
            "total_calls": total[0],
            "total_prompt_tokens": total[1],
            "total_completion_tokens": total[2],
            "total_tokens": total[3],
            "total_cost": float(total[4]) if total[4] else 0.0,
            "daily_usage": daily_usage
        }

    @staticmethod
    def _load_preference_cache():
        """从数据库加载用户偏好到缓存"""
        global _user_preference_cache, _cache_loaded
        if _cache_loaded:
            return

        try:
            query = "SELECT * FROM user_llm_preferences"
            rows = execute_query(query)
            for row in rows:
                pref = UserLLMPreference.from_db_row(row)
                _user_preference_cache[pref.user_id] = pref
            _cache_loaded = True
            logger.info(f"已加载 {len(_user_preference_cache)} 个用户LLM偏好到缓存")
        except Exception as e:
            logger.error(f"加载用户偏好缓存失败: {e}")

    @staticmethod
    def get_user_preference(user_id: int, use_cache: bool = True) -> Optional[UserLLMPreference]:
        """获取用户LLM偏好"""
        if use_cache:
            LLMService._load_preference_cache()
            return _user_preference_cache.get(user_id)

        query = "SELECT * FROM user_llm_preferences WHERE user_id = %s"
        rows = execute_query(query, (user_id,))
        if rows:
            pref = UserLLMPreference.from_db_row(rows[0])
            _user_preference_cache[user_id] = pref
            return pref
        return None

    @staticmethod
    def set_user_preference(
        user_id: int,
        preset_id: Optional[int] = None,
        user_config_id: Optional[int] = None
    ) -> UserLLMPreference:
        """设置用户LLM偏好"""
        if not preset_id and not user_config_id:
            raise ValueError("必须指定 preset_id 或 user_config_id")

        if preset_id and user_config_id:
            raise ValueError("preset_id 和 user_config_id 不能同时设置")

        if preset_id:
            preset = LLMService.get_preset_by_id(preset_id)
            if not preset:
                raise ValueError(f"预设模型不存在: {preset_id}")
            if not preset.is_active:
                raise ValueError(f"预设模型已禁用: {preset_id}")

        if user_config_id:
            config = LLMService.get_user_config_by_id(user_id, user_config_id)
            if not config:
                raise ValueError(f"用户配置不存在: {user_config_id}")
            if not config.is_active:
                raise ValueError(f"用户配置已禁用: {user_config_id}")

        query = """
        INSERT INTO user_llm_preferences (user_id, preset_id, user_config_id, updated_at)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (user_id) DO UPDATE SET
            preset_id = EXCLUDED.preset_id,
            user_config_id = EXCLUDED.user_config_id,
            updated_at = EXCLUDED.updated_at
        RETURNING *
        """
        now = datetime.now()
        rows = execute_query(query, (user_id, preset_id, user_config_id, now))
        pref = UserLLMPreference.from_db_row(rows[0])

        _user_preference_cache[user_id] = pref
        if preset_id:
            preset = LLMService.get_preset_by_id(preset_id)
        else:
            config = LLMService.get_user_config_by_id(user_id, user_config_id)
        return pref

    @staticmethod
    def delete_user_preference(user_id: int) -> bool:
        """删除用户LLM偏好"""
        query = "DELETE FROM user_llm_preferences WHERE user_id = %s"
        execute_write(query, (user_id,))
        if user_id in _user_preference_cache:
            del _user_preference_cache[user_id]
        logger.info(f"用户 {user_id} 删除LLM偏好")
        return True

    @staticmethod
    def get_user_default_client(user_id: int) -> "UnifiedLLMClient":
        """根据用户偏好获取LLM客户端"""
        from app.core.config import Config

        pref = LLMService.get_user_preference(user_id)
        if not pref:
            default_provider = Config.DEFAULT_PROVIDER
            preset = LLMService.get_preset_by_name(default_provider)
            if not preset:
                raise ValueError(f"默认提供商 {default_provider} 不存在，请检查配置")
            LLMService.set_user_preference(user_id, preset_id=preset.id)
            pref = LLMService.get_user_preference(user_id)

        if pref.preset_id:
            preset = LLMService.get_preset_by_id(pref.preset_id)
            logger.info(f"用户 {user_id} 使用LLM: 预设模型={preset.name}, 模型={preset.default_model}")
            return LLMManager.get_preset_client(pref.preset_id)
        elif pref.user_config_id:
            config = LLMService.get_user_config_by_id(user_id, pref.user_config_id)
            logger.info(f"用户 {user_id} 使用LLM: 自定义配置={config.name}, 模型={config.model}")
            return LLMManager.get_user_client(user_id, pref.user_config_id)
        else:
            raise ValueError(f"用户 {user_id} 的LLM偏好配置无效")

    @staticmethod
    def init_llm_presets_from_config() -> int:
        """从环境变量配置初始化LLM预设到数据库，返回初始化/更新数量"""
        from app.core.config import Config
        from app.core.database import db_manager

        encryption_key = get_encryption_key()
        use_encryption = should_encrypt()

        # 检查数据库表结构
        logger.info("检查数据库表结构...")
        try:
            # 检查llm_presets表是否存在
            result = execute_query("SELECT COUNT(*) FROM llm_presets")
            logger.info(f"llm_presets表存在，当前有 {result[0][0]} 条记录")
        except Exception as e:
            logger.error(f"检查数据库表失败: {e}")

        presets = Config.get_llm_presets()
        logger.info(f"获取到 {len(presets)} 个预设配置")

        if not presets:
            logger.warning("未找到 LLM_PRESETS 配置")
            return 0

        count = 0
        # 使用显式事务
        with db_manager.get_connection() as conn:
            with conn.cursor() as cursor:
                for preset in presets:
                    name = preset.get("name")
                    if not name:
                        logger.warning("跳过缺少name字段的预设")
                        continue

                    # 获取 API Key 并加密（如果启用加密）
                    api_key = preset.get("api_key", "")
                    if api_key and use_encryption:
                        enc_query = "SELECT pgp_sym_encrypt(%s, %s)::bytea"
                        enc_rows = execute_query(enc_query, (api_key, encryption_key))
                        encrypted_api_key = enc_rows[0][0] if enc_rows else None
                    else:
                        encrypted_api_key = api_key

                    # 检查预设是否存在
                    cursor.execute("SELECT id FROM llm_presets WHERE name = %s", (name,))
                    existing = cursor.fetchone()

                    if existing:
                        # 更新预设
                        update_query = """
                        UPDATE llm_presets SET
                            display_name = %s,
                            base_url = %s,
                            default_model = %s,
                            api_key = %s,
                            models = %s,
                            is_active = %s,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE name = %s
                        """
                        cursor.execute(update_query, (
                            preset.get("display_name", name),
                            preset.get("base_url", ""),
                            preset.get("default_model", ""),
                            encrypted_api_key,
                            json.dumps(preset.get("models", [])),
                            preset.get("is_active", True),
                            name
                        ))
                        logger.info(f"更新LLM预设: {name}, 默认模型: {preset.get('default_model', '')}, 支持模型: {preset.get('models', [])}")
                    else:
                        # 创建预设
                        insert_query = """
                        INSERT INTO llm_presets (name, display_name, api_key, base_url, default_model, models, is_active, is_system, config)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, false, %s)
                        """
                        cursor.execute(insert_query, (
                            name,
                            preset.get("display_name", name),
                            encrypted_api_key,
                            preset.get("base_url", ""),
                            preset.get("default_model", ""),
                            json.dumps(preset.get("models", [])),
                            preset.get("is_active", True),
                            json.dumps(preset.get("config")) if preset.get("config") else None
                        ))
                        count += 1
                        logger.info(f"初始化LLM预设: {name}, 默认模型: {preset.get('default_model', '')}, 支持模型: {preset.get('models', [])}")

                # 提交事务
                conn.commit()

        logger.info(f"LLM预设初始化完成，共处理 {len(presets)} 个预设，新增 {count} 个")
        return count


class LLMManager:
    """LLM统一管理器"""

    @staticmethod
    def get_preset_client(preset_id: int, model: Optional[str] = None) -> "UnifiedLLMClient":
        """根据预设ID获取LLM客户端"""
        preset = LLMService.get_preset_by_id(preset_id)
        if not preset:
            raise ValueError(f"预设模型不存在: {preset_id}")

        if not preset.is_active:
            raise ValueError(f"预设模型已禁用: {preset_id}")

        api_key = preset.api_key
        if not api_key:
            env_key_map = {
                "aliyun": "ALIYUN_API_KEY",
                "deepseek": "DEEPSEEK_API_KEY"
            }
            env_key = env_key_map.get(preset.name)
            if env_key:
                import os
                api_key = os.getenv(env_key, "")

        if not api_key:
            raise ValueError(f"预设模型 {preset.name} 的API密钥未配置")

        target_model = model or preset.default_model
        return UnifiedLLMClient(api_key, preset.base_url, target_model, preset.name)

    @staticmethod
    def get_user_client(user_id: int, config_id: int) -> "UnifiedLLMClient":
        """根据用户配置ID获取LLM客户端"""
        config = LLMService.get_user_config_by_id(user_id, config_id)
        if not config:
            raise ValueError(f"用户配置不存在: {config_id}")

        if not config.is_active:
            raise ValueError(f"用户配置已禁用: {config_id}")

        return UnifiedLLMClient(config.api_key, config.base_url, config.model, config.provider)

    @staticmethod
    def get_custom_client(api_key: str, base_url: str, model: str, provider: str = "custom") -> "UnifiedLLMClient":
        """使用自定义配置获取LLM客户端"""
        return UnifiedLLMClient(api_key, base_url, model, provider)

    @staticmethod
    def get_default_client(user_id: int) -> Optional["UnifiedLLMClient"]:
        """获取用户默认LLM客户端"""
        # 检查用户偏好
        preference = LLMService.get_user_preference(user_id)
        
        if preference and preference.preset_id:
            # 使用预设
            try:
                return LLMManager.get_preset_client(preference.preset_id)
            except Exception as e:
                logger.warning(f"使用预设失败: {e}")
        
        # 尝试使用用户配置（第一个激活的）
        user_configs = LLMService.get_user_configs(user_id)
        active_configs = [config for config in user_configs if config.is_active]
        
        if active_configs:
            try:
                return LLMManager.get_user_client(user_id, active_configs[0].id)
            except Exception as e:
                logger.warning(f"使用用户配置失败: {e}")
        
        # 尝试使用系统默认预设
        from app.core.config import Config
        try:
            preset = LLMService.get_preset_by_name(Config.DEFAULT_PROVIDER)
            if preset and preset.is_active:
                return LLMManager.get_preset_client(preset.id)
        except Exception as e:
            logger.warning(f"使用系统默认预设失败: {e}")
        
        return None

    @staticmethod
    async def chat(
        request: LLMChatRequest, user_id: int
    ) -> LLMChatResponse:
        """统一的LLM聊天接口"""
        try:
            if request.preset_id:
                client = LLMManager.get_preset_client(request.preset_id, request.model)
                preset = LLMService.get_preset_by_id(request.preset_id)
                provider = preset.name if preset else None
                model = request.model or (preset.default_model if preset else None)
            elif request.user_config_id:
                client = LLMManager.get_user_client(user_id, request.user_config_id)
                user_config = LLMService.get_user_config_by_id(user_id, request.user_config_id)
                provider = user_config.provider if user_config else None
                model = request.model or (user_config.model if user_config else None)
            else:
                # 尝试使用默认客户端
                client = LLMManager.get_default_client(user_id)
                if not client:
                    raise ValueError("必须指定 preset_id 或 user_config_id，且未找到默认配置")
                provider = client.provider
                model = request.model or client.model

            content, token_usage = await client.chat(
                request.prompt,
                response_format=request.response_format,
                temperature=request.temperature,
                seed=request.seed
            )

            prompt_tokens = token_usage.get("prompt_tokens", 0)
            completion_tokens = token_usage.get("completion_tokens", 0)
            total_tokens = token_usage.get("total_tokens", prompt_tokens + completion_tokens)
            cost = LLMManager.calculate_cost(provider, model, prompt_tokens, completion_tokens)

            usage_recorded = LLMService.record_usage(
                user_id=user_id,
                preset_id=request.preset_id,
                user_config_id=request.user_config_id,
                provider=provider,
                model=model or request.model or "unknown",
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                cost=cost
            )

            return LLMChatResponse(
                content=content,
                model=model or "unknown",
                provider=provider,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                cost=cost,
                usage_recorded=usage_recorded
            )

        except Exception as e:
            logger.error(f"LLM聊天失败: {e}")
            raise

    @staticmethod
    async def stream_chat(request: LLMChatRequest, user_id: int):
        """统一的LLM流式聊天接口"""
        try:
            if request.preset_id:
                client = LLMManager.get_preset_client(request.preset_id, request.model)
            elif request.user_config_id:
                client = LLMManager.get_user_client(user_id, request.user_config_id)
            else:
                # 尝试使用默认客户端
                client = LLMManager.get_default_client(user_id)
                if not client:
                    raise ValueError("必须指定 preset_id 或 user_config_id，且未找到默认配置")

            async for chunk in client.stream_chat(request.prompt, request.response_format):
                yield chunk

        except Exception as e:
            logger.error(f"LLM流式聊天失败: {e}")
            yield f"调用失败: {str(e)}"

    @staticmethod
    def calculate_cost(provider: Optional[str], model: str, prompt_tokens: int, completion_tokens: int) -> float:
        """计算API调用成本（基于估算）"""
        cost_per_1k_tokens = {
            ("aliyun", "qwen-plus"): 0.004,
            ("aliyun", "qwen-max"): 0.02,
            ("deepseek", "deepseek-chat"): 0.001,
            ("deepseek", "deepseek-coder"): 0.002,
        }

        key = (provider, model) if provider else ("custom", model)
        rate = cost_per_1k_tokens.get(key, 0.001)

        total_tokens = prompt_tokens + completion_tokens
        return (total_tokens / 1000) * rate
