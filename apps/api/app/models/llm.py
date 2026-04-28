"""LLM 数据模型"""
from datetime import datetime
from typing import Optional, Dict, Any
from dataclasses import dataclass, field


@dataclass
class LLMPreset:
    """预定义LLM模型"""
    id: Optional[int] = None
    name: str = ""
    display_name: str = ""
    api_key: str = ""
    base_url: str = ""
    default_model: str = ""
    models: list = field(default_factory=list)
    is_active: bool = True
    is_system: bool = False
    config: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "display_name": self.display_name,
            "api_key": "***" if self.api_key else "",
            "base_url": self.base_url,
            "default_model": self.default_model,
            "models": self.models,
            "is_active": self.is_active,
            "is_system": self.is_system,
            "config": self.config,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }

    def to_db_tuple(self) -> tuple:
        import json
        return (
            self.name, self.display_name, self.api_key, self.base_url,
            self.default_model, json.dumps(self.models), self.is_active, self.is_system,
            self.config if self.config else None
        )

    @classmethod
    def from_dict(cls, data: dict) -> "LLMPreset":
        import json
        models = data.get("models", [])
        if isinstance(models, str):
            models = json.loads(models)
        return cls(
            id=data.get("id"),
            name=data.get("name", ""),
            display_name=data.get("display_name", ""),
            api_key=data.get("api_key", ""),
            base_url=data.get("base_url", ""),
            default_model=data.get("default_model", ""),
            models=models,
            is_active=data.get("is_active", True),
            is_system=data.get("is_system", False),
            config=data.get("config"),
            created_at=datetime.fromisoformat(data["created_at"]) if data.get("created_at") else None,
            updated_at=datetime.fromisoformat(data["updated_at"]) if data.get("updated_at") else None
        )

    @classmethod
    def from_db_row(cls, row: tuple) -> "LLMPreset":
        import json
        models = row[11] if len(row) > 11 else []
        if isinstance(models, str):
            models = json.loads(models)
        return cls(
            id=row[0],
            name=row[1],
            display_name=row[2],
            api_key=row[3] or "",
            base_url=row[4],
            default_model=row[5],
            models=models or [],
            is_active=row[6],
            is_system=row[7],
            config=row[8],
            created_at=row[9],
            updated_at=row[10]
        )


@dataclass
class UserLLMConfig:
    """用户自定义LLM配置"""
    id: Optional[int] = None
    user_id: int = 0
    name: str = ""
    provider: Optional[str] = None
    api_key: str = ""
    base_url: str = ""
    model: str = ""
    is_active: bool = True
    config: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    def to_dict(self, hide_api_key: bool = True) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "provider": self.provider,
            "api_key": "***" if hide_api_key and self.api_key else self.api_key,
            "base_url": self.base_url,
            "model": self.model,
            "is_active": self.is_active,
            "config": self.config,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }

    def to_db_tuple(self) -> tuple:
        return (
            self.user_id, self.name, self.provider, self.api_key,
            self.base_url, self.model, self.is_active, self.config if self.config else None
        )

    @classmethod
    def from_dict(cls, data: dict) -> "UserLLMConfig":
        return cls(
            id=data.get("id"),
            user_id=data.get("user_id", 0),
            name=data.get("name", ""),
            provider=data.get("provider"),
            api_key=data.get("api_key", ""),
            base_url=data.get("base_url", ""),
            model=data.get("model", ""),
            is_active=data.get("is_active", True),
            config=data.get("config"),
            created_at=datetime.fromisoformat(data["created_at"]) if data.get("created_at") else None,
            updated_at=datetime.fromisoformat(data["updated_at"]) if data.get("updated_at") else None
        )

    @classmethod
    def from_db_row(cls, row: tuple) -> "UserLLMConfig":
        return cls(
            id=row[0],
            user_id=row[1],
            name=row[2],
            provider=row[3],
            api_key=row[4],
            base_url=row[5],
            model=row[6],
            is_active=row[7],
            config=row[8],
            created_at=row[9],
            updated_at=row[10]
        )


@dataclass
class UserLLMUsage:
    """用户LLM使用量统计"""
    id: Optional[int] = None
    user_id: int = 0
    preset_id: Optional[int] = None
    user_config_id: Optional[int] = None
    provider: Optional[str] = None
    model: str = ""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cost: float = 0.0
    called_at: Optional[datetime] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "preset_id": self.preset_id,
            "user_config_id": self.user_config_id,
            "provider": self.provider,
            "model": self.model,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "total_tokens": self.total_tokens,
            "cost": self.cost,
            "called_at": self.called_at.isoformat() if self.called_at else None
        }

    def to_db_tuple(self) -> tuple:
        return (
            self.user_id, self.preset_id, self.user_config_id,
            self.provider, self.model, self.prompt_tokens,
            self.completion_tokens, self.total_tokens, self.cost
        )

    @classmethod
    def from_dict(cls, data: dict) -> "UserLLMUsage":
        return cls(
            id=data.get("id"),
            user_id=data.get("user_id", 0),
            preset_id=data.get("preset_id"),
            user_config_id=data.get("user_config_id"),
            provider=data.get("provider"),
            model=data.get("model", ""),
            prompt_tokens=data.get("prompt_tokens", 0),
            completion_tokens=data.get("completion_tokens", 0),
            total_tokens=data.get("total_tokens", 0),
            cost=data.get("cost", 0.0),
            called_at=datetime.fromisoformat(data["called_at"]) if data.get("called_at") else None
        )

    @classmethod
    def from_db_row(cls, row: tuple) -> "UserLLMUsage":
        return cls(
            id=row[0],
            user_id=row[1],
            preset_id=row[2],
            user_config_id=row[3],
            provider=row[4],
            model=row[5],
            prompt_tokens=row[6],
            completion_tokens=row[7],
            total_tokens=row[8],
            cost=row[9] or 0.0,
            called_at=row[10]
        )


@dataclass
class LLMChatRequest:
    """LLM聊天请求"""
    prompt: str
    model: Optional[str] = None
    preset_id: Optional[int] = None
    user_config_id: Optional[int] = None
    response_format: str = "text"
    temperature: float = 0.1
    seed: int = 42
    stream: bool = False


@dataclass
class LLMChatResponse:
    """LLM聊天响应"""
    content: str
    model: str
    provider: Optional[str] = None
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cost: float = 0.0
    usage_recorded: bool = False


@dataclass
class UserLLMPreference:
    """用户LLM偏好"""
    user_id: int = 0
    preset_id: Optional[int] = None
    user_config_id: Optional[int] = None
    updated_at: Optional[datetime] = None

    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "preset_id": self.preset_id,
            "user_config_id": self.user_config_id,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }

    @classmethod
    def from_dict(cls, data: dict) -> "UserLLMPreference":
        return cls(
            user_id=data.get("user_id", 0),
            preset_id=data.get("preset_id"),
            user_config_id=data.get("user_config_id"),
            updated_at=datetime.fromisoformat(data["updated_at"]) if data.get("updated_at") else None
        )

    @classmethod
    def from_db_row(cls, row: tuple) -> "UserLLMPreference":
        return cls(
            user_id=row[0],
            preset_id=row[1],
            user_config_id=row[2],
            updated_at=row[3]
        )
