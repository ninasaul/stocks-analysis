"""分析师模块的深度控制配置"""
from enum import IntEnum
from typing import Dict, Any, List, Optional


class AnalystDepth(IntEnum):
    """分析师深度枚举"""
    QUICK = 1       # 快速分析
    DEEP = 2        # 深度分析
    COMPREHENSIVE = 3  # 全面分析


class AnalystType:
    """分析师类型枚举"""
    MARKET = "market"
    FUNDAMENTAL = "fundamental"
    NEWS = "news"
    SOCIAL = "social"


ANALYST_DEPTH_CONFIG = {
    AnalystDepth.QUICK: {
        "name": "快速",
        "chinese_name": "快速分析",
        "description": "快速获取关键信息，适用于初步筛选",
        "data_days": 20,
        "max_news_count": 5,
        "time_estimate": 30,
        "report_detail_level": 1,
        "features": {
            "fundamental_metrics": ["PE", "PB"],
            "sentiment_analysis": False,
            "risk_assessment": False,
            "llm_analysis": False, # 快速分析不使用LLM
            "peer_comparison": False,
            "historical_analysis": False,
            "scenario_analysis": False,
            "sensitivity_analysis": False,
            "reflection": True,
            "investment_advice": True
        }
    },
    AnalystDepth.DEEP: {
        "name": "深度",
        "chinese_name": "深度分析",
        "description": "深度分析挖掘投资机会，适用于重点关注",
        "data_days": 30,
        "max_news_count": 8,
        "time_estimate": 60,
        "report_detail_level": 2,
        "features": {
            "fundamental_metrics": ["PE", "PB", "ROE"],
            "sentiment_analysis": True,
            "risk_assessment": False,
            "llm_analysis": True, # 深度分析使用LLM
            "peer_comparison": False,
            "historical_analysis": False,
            "scenario_analysis": False,
            "sensitivity_analysis": False,
            "reflection": True,
            "investment_advice": True
        }
    },
    AnalystDepth.COMPREHENSIVE: {
        "name": "全面",
        "chinese_name": "全面分析",
        "description": "全面分析提供决策支持，适用于重大投资决策",
        "data_days": 60,
        "max_news_count": 20,
        "time_estimate": 120,
        "report_detail_level": 3,
        "features": {
            "fundamental_metrics": ["PE", "PB", "ROE", "GROSS_PROFIT_RATE", "ASSET_LIABILITY_RATIO"],
            "sentiment_analysis": True,
            "risk_assessment": True,
            "llm_analysis": True, # 全面分析使用LLM
            "peer_comparison": True,
            "historical_analysis": True,
            "scenario_analysis": True,
            "sensitivity_analysis": True,
            "reflection": True,
            "investment_advice": True
        }
    }
}


def get_analyst_depth_config(depth: Any) -> Dict[str, Any]:
    """
    获取分析师深度配置

    Args:
        depth: 分析深度 (1-3)

    Returns:
        深度配置字典
    """
    if isinstance(depth, bool):
        depth = 1
    if isinstance(depth, (int, float)):
        depth = int(depth)
        if 1 <= depth <= 3:
            return ANALYST_DEPTH_CONFIG.get(depth, ANALYST_DEPTH_CONFIG[AnalystDepth.QUICK])
    return ANALYST_DEPTH_CONFIG[AnalystDepth.QUICK]

def get_fundamental_metrics_for_depth(depth: Any) -> List[str]:
    """获取指定深度使用的基本面指标"""
    config = get_analyst_depth_config(depth)
    return config.get("features", {}).get("fundamental_metrics", ["PE", "PB"])


def is_feature_enabled_for_depth(depth: Any, feature: str) -> bool:
    """检查指定深度是否启用某个特性"""
    config = get_analyst_depth_config(depth)
    return config.get("features", {}).get(feature, False)


def get_data_days_for_depth(depth: Any) -> int:
    """获取指定深度需要的数据天数"""
    config = get_analyst_depth_config(depth)
    return config.get("data_days", 20)


def get_max_news_count_for_depth(depth: Any) -> int:
    """获取指定深度允许的最大新闻数量"""
    config = get_analyst_depth_config(depth)
    return config.get("max_news_count", 5)


def get_report_detail_level_for_depth(depth: Any) -> int:
    """获取指定深度的报告详细程度"""
    config = get_analyst_depth_config(depth)
    return config.get("report_detail_level", 1)


def should_enable_reflection(depth: Any) -> bool:
    """判断是否应该启用反思分析"""
    return is_feature_enabled_for_depth(depth, "reflection")


def should_enable_investment_advice(depth: Any) -> bool:
    """判断是否应该启用投资建议"""
    return is_feature_enabled_for_depth(depth, "investment_advice")


def should_enable_cash_flow_analysis(depth: Any) -> bool:
    """判断是否应该启用现金流分析"""
    metrics = get_fundamental_metrics_for_depth(depth)
    return "CashFlow" in metrics


NUMERIC_TO_CHINESE = {
    1: "快速",
    2: "深度",
    3: "全面"
}

CHINESE_TO_NUMERIC = {
    "快速": 1,
    "深度": 2,
    "全面": 3,
    "快速分析": 1,
    "深度分析": 2,
    "全面分析": 3
}


def normalize_depth(depth: Any) -> int:
    """
    标准化分析深度参数为数字

    Args:
        depth: 分析深度，支持数字(1-3)或字符串("快速", "深度", "全面")

    Returns:
        标准化的分析深度数字 (1-3)
    """
    if isinstance(depth, bool):
        raise ValueError("分析深度不能是布尔值")

    if isinstance(depth, (int, float)):
        depth_int = int(depth)
        if 1 <= depth_int <= 3:
            return depth_int
        return 1

    if isinstance(depth, str):
        depth_str = depth.strip()
        numeric_value = CHINESE_TO_NUMERIC.get(depth_str)
        if numeric_value:
            return numeric_value

        try:
            depth_int = int(depth_str)
            if 1 <= depth_int <= 3:
                return depth_int
        except ValueError:
            pass

        return 1

    return 1


def get_depth_config(depth: Any) -> Dict[str, Any]:
    """获取分析深度配置"""
    return get_analyst_depth_config(depth)


def get_time_estimate(depth: Any) -> int:
    """获取指定分析深度的预估时间（秒）"""
    config = get_analyst_depth_config(depth)
    return config.get("time_estimate", 30)


def get_analysts_for_depth(depth: Any) -> tuple:
    """获取指定分析深度所需的分析师列表"""
    config = get_analyst_depth_config(depth)
    required = [AnalystType.MARKET, AnalystType.FUNDAMENTAL, AnalystType.NEWS]
    optional = []
    return required, optional


def is_feature_enabled(depth: Any, feature: str) -> bool:
    """检查指定深度是否启用某个特性"""
    return is_feature_enabled_for_depth(depth, feature)

def get_depth_fundamental_metrics(depth: Any) -> List[str]:
    """获取指定深度涉及的基本面指标"""
    return get_fundamental_metrics_for_depth(depth)


def get_report_detail_level(depth: Any) -> int:
    """获取指定分析深度的报告详细程度等级"""
    return get_report_detail_level_for_depth(depth)


def get_depth_info(depth: Any) -> Dict[str, Any]:
    """
    获取指定分析深度的完整信息

    Args:
        depth: 分析深度

    Returns:
        包含深度信息的字典
    """
    depth_value = normalize_depth(depth)
    config = get_analyst_depth_config(depth)

    return {
        "depth_value": depth_value,
        "depth_name": config.get("name", ""),
        "chinese_name": config.get("chinese_name", ""),
        "description": config.get("description", ""),
        "data_days": config.get("data_days", 20),
        "max_news_count": config.get("max_news_count", 5),
        "time_estimate": config.get("time_estimate", 30),
        "report_detail_level": config.get("report_detail_level", 1),
        "features": config.get("features", {})
    }


class AnalysisDepthController:
    """分析深度控制器"""

    def __init__(self, depth: Any = AnalystDepth.QUICK):
        """
        初始化分析深度控制器

        Args:
            depth: 分析深度 (1-3)
        """
        self.depth = normalize_depth(depth)
        self.config = get_analyst_depth_config(self.depth)

    @property
    def depth_value(self) -> int:
        """获取深度数值"""
        return self.depth

    @property
    def depth_name(self) -> str:
        """获取深度名称"""
        return self.config.get("name", "")

    @property
    def chinese_name(self) -> str:
        """获取中文名称"""
        return self.config.get("chinese_name", "")

    @property
    def description(self) -> str:
        """获取深度描述"""
        return self.config.get("description", "")

    @property
    def data_days(self) -> int:
        """获取所需数据天数"""
        return self.config.get("data_days", 20)

    @property
    def max_news_count(self) -> int:
        """获取最大新闻数量"""
        return self.config.get("max_news_count", 5)

    @property
    def time_estimate(self) -> int:
        """获取预估时间"""
        return self.config.get("time_estimate", 30)

    @property
    def report_detail_level(self) -> int:
        """获取报告详细程度"""
        return self.config.get("report_detail_level", 1)

    def get_required_analysts(self) -> List[str]:
        """获取必须启用的分析师列表"""
        return [AnalystType.MARKET, AnalystType.FUNDAMENTAL, AnalystType.NEWS]

    def get_optional_analysts(self) -> List[str]:
        """获取可选的分析师列表"""
        return []

    def is_analyst_required(self, analyst_type: str) -> bool:
        """
        检查分析师是否为当前深度必须

        Args:
            analyst_type: 分析师类型

        Returns:
            是否必须
        """
        required = self.get_required_analysts()
        return analyst_type in required

    def is_analyst_optional(self, analyst_type: str) -> bool:
        """
        检查分析师是否为当前深度可选

        Args:
            analyst_type: 分析师类型

        Returns:
            是否可选
        """
        optional = self.get_optional_analysts()
        return analyst_type in optional

    def is_feature_enabled(self, feature: str) -> bool:
        """
        检查特性是否启用

        Args:
            feature: 特性名称

        Returns:
            是否启用
        """
        features = self.config.get("features", {})
        return features.get(feature, False)

    def get_fundamental_metrics(self) -> List[str]:
        """获取基本面指标列表"""
        features = self.config.get("features", {})
        return features.get("fundamental_metrics", ["PE", "PB"])

    def should_enable_market_analyst(self, market_analyst_enabled: bool) -> bool:
        """
        判断市场分析师是否应该启用

        Args:
            market_analyst_enabled: 用户指定的是否启用

        Returns:
            是否启用
        """
        return True

    def should_enable_fundamental_analyst(self, fundamental_analyst_enabled: bool) -> bool:
        """
        判断基本面分析师是否应该启用

        Args:
            fundamental_analyst_enabled: 用户指定的是否启用

        Returns:
            是否启用
        """
        return True

    def should_enable_news_analyst(self, news_analyst_enabled: bool) -> bool:
        """
        判断新闻分析师是否应该启用

        Args:
            news_analyst_enabled: 用户指定的是否启用

        Returns:
            是否启用
        """
        return True

    def get_summary(self) -> Dict[str, Any]:
        """
        获取当前深度的完整摘要

        Returns:
            包含所有配置信息的字典
        """
        return {
            "depth": self.depth,
            "name": self.depth_name,
            "chinese_name": self.chinese_name,
            "description": self.description,
            "data_days": self.data_days,
            "max_news_count": self.max_news_count,
            "time_estimate": self.time_estimate,
            "report_detail_level": self.report_detail_level,
            "required_analysts": self.get_required_analysts(),
            "optional_analysts": self.get_optional_analysts(),
            "fundamental_metrics": self.get_fundamental_metrics(),
            "features": self.config.get("features", {})
        }


def get_all_depths_info() -> List[Dict[str, Any]]:
    """
    获取所有分析深度的信息列表

    Returns:
        包含所有深度信息的列表
    """
    return [
        {
            "depth": depth.value,
            "name": config.get("name", ""),
            "chinese_name": config.get("chinese_name", ""),
            "description": config.get("description", ""),
            "time_estimate": config.get("time_estimate", 30)
        }
        for depth, config in ANALYST_DEPTH_CONFIG.items()
    ]
