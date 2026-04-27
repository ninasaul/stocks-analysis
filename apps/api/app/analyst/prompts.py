"""分析师LLM提示词配置"""
from typing import Dict, List, Optional
from .depth_config import AnalystDepth


class AnalystPromptConfig:
    """分析师提示词配置"""
    
    @staticmethod
    def get_market_analyst_prompt(depth: int) -> str:
        """
        获取市场分析师的LLM提示词
        
        Args:
            depth: 分析深度 (1-3)
            
        Returns:
            提示词字符串
        """
        if depth == AnalystDepth.QUICK:
            return """
你是一位专业的市场分析师，专注于技术分析。请对以下股票进行快速技术分析：

股票代码: {ticker}
股票名称: {stock_name}

请分析：
1. 基于MA指标的趋势判断
2. 简要的技术面评估
3. 短期投资建议（买入/持有/卖出）
4. 关键支撑位和阻力位

请保持分析简洁明了，重点突出。
"""
        elif depth == AnalystDepth.DEEP:
            return """
你是一位专业的市场分析师，专注于技术分析。请对以下股票进行深度技术分析：

股票代码: {ticker}
股票名称: {stock_name}

请分析：
1. 基于MA和MACD指标的详细趋势分析
2. 技术指标的综合评估
3. 中期投资建议（买入/持有/卖出）及理由
4. 关键支撑位和阻力位
5. 技术形态分析

请提供详细的技术分析结果。
"""
        else:  # AnalystDepth.COMPREHENSIVE
            return """
你是一位专业的市场分析师，专注于技术分析。请对以下股票进行全面技术分析：

股票代码: {ticker}
股票名称: {stock_name}

请分析：
1. 基于MA、MACD和BOLL指标的全面趋势分析
2. 技术指标的详细评估和交叉分析
3. 长期投资建议（买入/持有/卖出）及详细理由
4. 关键支撑位和阻力位的详细分析
5. 技术形态分析和量价关系
6. 与历史走势的对比分析

请提供全面、详细的技术分析报告。
"""
    
    @staticmethod
    def get_fundamental_analyst_prompt(depth: int) -> str:
        """
        获取基本面分析师的LLM提示词
        
        Args:
            depth: 分析深度 (1-3)
            
        Returns:
            提示词字符串
        """
        if depth == AnalystDepth.QUICK:
            return """
你是一位专业的基本面分析师，专注于财务分析。请对以下股票进行快速基本面分析：

股票代码: {ticker}
股票名称: {stock_name}

请分析：
1. 基于PE和PB指标的估值分析
2. 简要的财务状况评估
3. 短期投资建议（买入/持有/卖出）

请保持分析简洁明了，重点突出。
"""
        elif depth == AnalystDepth.DEEP:
            return """
你是一位专业的基本面分析师，专注于财务分析。请对以下股票进行深度基本面分析：

股票代码: {ticker}
股票名称: {stock_name}

请分析：
1. 基于PE、PB和ROE指标的详细估值分析
2. 财务状况的综合评估
3. 中期投资建议（买入/持有/卖出）及理由
4. 行业地位分析

请提供详细的基本面分析结果。
"""
        else:  # AnalystDepth.COMPREHENSIVE
            return """
你是一位专业的基本面分析师，专注于财务分析。请对以下股票进行全面基本面分析：

股票代码: {ticker}
股票名称: {stock_name}

请分析：
1. 基于PE、PB、ROE和现金流的全面估值分析
2. 财务状况的详细评估，包括盈利能力、偿债能力、运营能力
3. 长期投资建议（买入/持有/卖出）及详细理由
4. 行业地位和竞争优势分析
5. 未来增长潜力评估
6. 与同行业公司的对比分析

请提供全面、详细的基本面分析报告。
"""
    
    @staticmethod
    def get_news_analyst_prompt(depth: int) -> str:
        """
        获取新闻分析师的LLM提示词
        
        Args:
            depth: 分析深度 (1-3)
            
        Returns:
            提示词字符串
        """
        if depth == AnalystDepth.QUICK:
            return """
你是一位专业的新闻分析师，专注于市场情绪分析。请对以下股票进行快速新闻分析：

股票代码: {ticker}
股票名称: {stock_name}

请分析：
1. 最近5条相关新闻的情绪分析
2. 市场对该股票的整体情绪评估
3. 短期投资建议（买入/持有/卖出）
4. 对新闻影响的简要反思

请保持分析简洁明了，重点突出。
"""
        elif depth == AnalystDepth.DEEP:
            return """
你是一位专业的新闻分析师，专注于市场情绪分析。请对以下股票进行深度新闻分析：

股票代码: {ticker}
股票名称: {stock_name}

请分析：
1. 最近8条相关新闻的详细情绪分析
2. 市场对该股票的整体情绪评估
3. 中期投资建议（买入/持有/卖出）及理由
4. 对新闻影响的深度反思
5. 情绪分析的详细评估

请提供详细的新闻分析结果。
"""
        else:  # AnalystDepth.COMPREHENSIVE
            return """
你是一位专业的新闻分析师，专注于市场情绪分析。请对以下股票进行全面新闻分析：

股票代码: {ticker}
股票名称: {stock_name}

请分析：
1. 最近20条相关新闻的全面情绪分析
2. 市场对该股票的整体情绪评估
3. 长期投资建议（买入/持有/卖出）及详细理由
4. 对新闻影响的深度反思
5. 风险评估分析
6. 新闻事件对公司未来发展的潜在影响

请提供全面、详细的新闻分析报告。
"""


ANALYST_PROMPTS = {
    "market": AnalystPromptConfig.get_market_analyst_prompt,
    "fundamental": AnalystPromptConfig.get_fundamental_analyst_prompt,
    "news": AnalystPromptConfig.get_news_analyst_prompt
}


def get_analyst_prompt(analyst_type: str, depth: int) -> str:
    """
    获取指定分析师类型和深度的提示词
    
    Args:
        analyst_type: 分析师类型 (market/fundamental/news)
        depth: 分析深度 (1-3)
        
    Returns:
        提示词字符串
    """
    prompt_func = ANALYST_PROMPTS.get(analyst_type)
    if prompt_func:
        return prompt_func(depth)
    return """请对以下股票进行分析：\n股票代码: {ticker}\n股票名称: {stock_name}\n"""
