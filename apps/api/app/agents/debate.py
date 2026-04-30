"""简化版 Bull/Bear 辩论"""

from fastapi import HTTPException
from ..core.logging import logger
from ..llm.llm_service import LLMService


def is_llm_error(error_msg: str) -> bool:
    """检查错误是否是LLM相关的错误"""
    if not error_msg:
        return False
    llm_keywords = [
        "API调用失败", "LLM", "模型", "model", "LLM调用",
        "InternalError", "ServiceUnavailable", "Too many requests",
        "rate limit", "限流", "token", "chat", "openai"
    ]
    return any(keyword.lower() in error_msg.lower() for keyword in llm_keywords)


BULL_PROMPT = """你是看多研究员。请严格基于以下数据为 {ticker} 构建看多论点，重点参考择时分析，不要添加个人主观意见。

## 技术打分（10 维度）
{timing_scores}

## 基本面检查
{fundamental_check}

规则：
- 必须用具体数据支撑每个论点
- 至少 3 个论点
- 给出看多评分（1-10）
- JSON 格式输出

{{
  "arguments": ["论点1", "论点2", "论点3"],
  "score": 7,
  "best_entry_condition": "最佳入场条件描述"
}}"""


BEAR_PROMPT = """你是看空研究员。请严格基于以下数据对 {ticker} 提出风险警告，重点参考择时分析，不要添加个人主观意见。

## 技术打分（10 维度）
{timing_scores}

## 基本面检查
{fundamental_check}

## 看多方论点
{bull_args}

规则：
- 必须针对看多方的论点逐条反驳
- 指出被忽略的风险因素
- 给出看空评分（1-10）
- JSON 格式输出

{{
  "rebuttals": ["反驳1", "反驳2", "反驳3"],
  "risks": ["风险1", "风险2"],
  "score": 5,
  "worst_case": "最差情况描述"
}}"""


async def run_debate(ticker: str, timing_scores: dict, 
                     fundamental: dict, llm, analyst_insights: dict = None, 
                     user_id: int = None, preset_id: int = None, user_config_id: int = None) -> tuple:
    """
    执行一轮 Bull/Bear 辩论，输出最终信号

    不用 Judge LLM——用规则直接算：
    - Bull 评分 - Bear 评分 > 3  → BUY
    - Bull 评分 - Bear 评分 < -3 → SELL
    - 其他 → HOLD

    再与技术打分做加权融合：
    最终信号 = 0.4 × 辩论信号 + 0.6 × 技术打分信号
    
    Args:
        ticker: 股票代码
        timing_scores: 技术指标评分
        fundamental: 基本面数据
        llm: LLM客户端
        analyst_insights: 分析师的LLM分析结果
        user_id: 用户ID（用于记录使用量）
        preset_id: 预设ID（用于记录使用量）
        user_config_id: 用户配置ID（用于记录使用量）
        
    Returns:
        (辩论结果, token消耗)，如果失败则包含error字段
    """
    try:
        logger.info(f"开始多空辩论: ticker={ticker}")
        logger.info(f"技术打分: {timing_scores}")
        logger.info(f"基本面数据: {fundamental}")
        
        # 准备分析师洞察信息
        analyst_info = ""
        if analyst_insights:
            if analyst_insights.get("market_analysis"):
                analyst_info += f"## 市场分析师观点\n{analyst_insights['market_analysis']}\n\n"
            if analyst_insights.get("fundamental_analysis"):
                analyst_info += f"## 基本面分析师观点\n{analyst_insights['fundamental_analysis']}\n\n"
            if analyst_insights.get("news_analysis"):
                analyst_info += f"## 新闻分析师观点\n{analyst_insights['news_analysis']}\n\n"

        # Bull 发言
        bull_prompt = BULL_PROMPT
        if analyst_info:
            bull_prompt = bull_prompt.replace("## 基本面检查", f"## 分析师洞察\n{analyst_info}\n## 基本面检查")
        
        if user_id:
            bull_response, bull_tokens = await LLMService.wrap_chat(
                llm_client=llm,
                user_id=user_id,
                prompt=bull_prompt.format(
                    ticker=ticker,
                    timing_scores=format_scores(timing_scores),
                    fundamental_check=str(fundamental)
                ),
                response_format="json",
                temperature=0.1,
                seed=42,
                preset_id=preset_id,
                user_config_id=user_config_id
            )
        else:
            bull_response, bull_tokens = await llm.chat(
                bull_prompt.format(
                    ticker=ticker,
                    timing_scores=format_scores(timing_scores),
                    fundamental_check=str(fundamental)
                ),
                response_format="json",
                temperature=0.1,  # 降低温度，减少随机性
                seed=42  # 固定种子，确保结果可重复
            )
        bull = safe_parse_json(bull_response)
        logger.info(f"Bull观点: score={bull.get('score', 'N/A')}, 论点数量={len(bull.get('arguments', []))}")

        # Bear 发言
        bear_prompt = BEAR_PROMPT
        if analyst_info:
            bear_prompt = bear_prompt.replace("## 基本面检查", f"## 分析师洞察\n{analyst_info}\n## 基本面检查")
        
        if user_id:
            bear_response, bear_tokens = await LLMService.wrap_chat(
                llm_client=llm,
                user_id=user_id,
                prompt=bear_prompt.format(
                    ticker=ticker,
                    timing_scores=format_scores(timing_scores),
                    fundamental_check=str(fundamental),
                    bull_args=str(bull.get("arguments", []))
                ),
                response_format="json",
                temperature=0.1,
                seed=42,
                preset_id=preset_id,
                user_config_id=user_config_id
            )
        else:
            bear_response, bear_tokens = await llm.chat(
                bear_prompt.format(
                    ticker=ticker,
                    timing_scores=format_scores(timing_scores),
                    fundamental_check=str(fundamental),
                    bull_args=str(bull.get("arguments", []))
                ),
                response_format="json",
                temperature=0.1,  # 降低温度，减少随机性
                seed=42  # 固定种子，确保结果可重复
            )
        bear = safe_parse_json(bear_response)
        logger.info(f"Bear观点: score={bear.get('score', 'N/A')}, 论点数量={len(bear.get('arguments', []))}")

        # 规则打分（替代 Judge LLM，省 1 次 API 调用）
        bull_score = bull.get("score", 5)
        bear_score = bear.get("score", 5)
        debate_diff = bull_score - bear_score

        logger.info(f"多空辩论评分: Bull={bull_score}, Bear={bear_score}, 差异={debate_diff}")

        if debate_diff > 3:
            debate_signal = 1.0
            logger.info(f"辩论信号: BUY (差异 {debate_diff} > 3)")
        elif debate_diff < -3:
            debate_signal = -1.0
            logger.info(f"辩论信号: SELL (差异 {debate_diff} < -3)")
        else:
            debate_signal = debate_diff / 5.0
            logger.info(f"辩论信号: HOLD (差异 {debate_diff}，信号值 {debate_signal})")

        # 获取行业景气度（从基本面分析结果中获取）
        industry_sentiment = fundamental.get("industry_sentiment", 0.5)  # 默认中性
        sentiment_tokens = 0
        
        logger.info(f"行业景气度: {industry_sentiment:.4f}")

        # 融合：60% 技术打分 + 30% 辩论结果 + 10% 行业景气度
        # 行业景气度从 [0,1] 转换到 [-1,1]
        tech_score = timing_scores.get("total", 0) / 100  # 归一化到 [0, 1]
        tech_score = tech_score * 2 - 1  # 转换到 [-1, 1]
        sentiment_signal = industry_sentiment * 2 - 1  # 转换到 [-1, 1]
        
        logger.info(f"技术打分: {timing_scores.get('total', 0)} (归一化后: {tech_score:.4f})")
        logger.info(f"行业景气度: {industry_sentiment:.4f} (转换后: {sentiment_signal:.4f})")
        
        final_score = 0.6 * tech_score + 0.3 * debate_signal + 0.1 * sentiment_signal
        logger.info(f"最终得分计算: 0.6 * {tech_score:.4f} + 0.3 * {debate_signal:.4f} + 0.1 * {sentiment_signal:.4f} = {final_score:.4f}")

        total_tokens = bull_tokens.get('total_tokens', 0) + bear_tokens.get('total_tokens', 0) + sentiment_tokens

        return {
            "bull": bull,
            "bear": bear,
            "debate_signal": round(debate_signal, 2),
            "tech_score": round(tech_score, 4),
            "industry_sentiment": round(industry_sentiment, 4),
            "final_score": round(final_score, 4),
            "signal": score_to_signal(final_score),
        }, total_tokens
    except Exception as e:
        logger.error(f"多空辩论失败: {str(e)}")
        raise HTTPException(status_code=503, detail=f"LLM模型服务不可用: {str(e)}")


def score_to_signal(score: float) -> str:
    # 设定买卖阈值
    threshold = 0.25
    if score >= threshold:
        return "BUY"
    elif score <= -threshold:
        return "SELL"
    else:
        return "HOLD"


def format_scores(scores: dict) -> str:
    lines = []
    for k, v in scores.items():
        if k in ("composite", "signal", "price_range", "total"):
            continue
        if isinstance(v, (int, float)):
            lines.append(f"  {k}: {v:+.2f}")
    lines.append(f"\n  综合得分: {scores.get('total', 0):+.4f}")
    lines.append(f"  技术信号: {scores.get('signal', 'N/A')}")
    return "\n".join(lines)


def safe_parse_json(text: str) -> dict:
    import json
    try:
        clean = text.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(clean)
    except (json.JSONDecodeError, IndexError):
        return {"error": "parse_failed", "raw": text[:300]}