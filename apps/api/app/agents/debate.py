"""简化版 Bull/Bear 辩论"""

from ..core.logging import logger

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
                     fundamental: dict, llm) -> dict:
    """
    执行一轮 Bull/Bear 辩论，输出最终信号

    不用 Judge LLM——用规则直接算：
    - Bull 评分 - Bear 评分 > 3  → BUY
    - Bull 评分 - Bear 评分 < -3 → SELL
    - 其他 → HOLD

    再与技术打分做加权融合：
    最终信号 = 0.4 × 辩论信号 + 0.6 × 技术打分信号
    
    Returns:
        辩论结果，如果失败则包含error字段
    """
    try:
        # Bull 发言
        bull_response = await llm.chat(
            BULL_PROMPT.format(
                ticker=ticker,
                timing_scores=format_scores(timing_scores),
                fundamental_check=str(fundamental)
            ),
            response_format="json",
            temperature=0.1,  # 降低温度，减少随机性
            seed=42  # 固定种子，确保结果可重复
        )
        bull = safe_parse_json(bull_response)

        # Bear 发言
        bear_response = await llm.chat(
            BEAR_PROMPT.format(
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

        # 规则打分（替代 Judge LLM，省 1 次 API 调用）
        bull_score = bull.get("score", 5)
        bear_score = bear.get("score", 5)
        debate_diff = bull_score - bear_score

        if debate_diff > 3:
            debate_signal = 1.0
        elif debate_diff < -3:
            debate_signal = -1.0
        else:
            debate_signal = debate_diff / 5.0

        # 融合：60% 技术打分 + 40% 辩论结果
        tech_score = timing_scores.get("composite", 0)
        final_score = 0.6 * tech_score + 0.4 * debate_signal

        return {
            "bull": bull,
            "bear": bear,
            "debate_signal": round(debate_signal, 2),
            "tech_score": round(tech_score, 4),
            "final_score": round(final_score, 4),
            "signal": score_to_signal(final_score),
        }
    except Exception as e:
        error_msg = f"多空辩论失败: {str(e)}"
        logger.error(f"多空辩论失败: {str(e)}")
        return {
            "bull": {},
            "bear": {},
            "debate_signal": 0,
            "tech_score": 0,
            "final_score": 0,
            "signal": "HOLD",
            "error": error_msg,
            "error_detail": str(e)
        }


def score_to_signal(score: float) -> str:
    if score >= 0.33:
        return "BUY"
    elif score <= -0.33:
        return "SELL"
    else:
        return "HOLD"


def format_scores(scores: dict) -> str:
    lines = []
    for k, v in scores.items():
        if k in ("composite", "signal", "price_range"):
            continue
        if isinstance(v, (int, float)):
            bar = "+" * max(0, int(v * 5)) + "-" * max(0, int(-v * 5))
            lines.append(f"  {k}: {v:+.2f} [{bar}]")
    lines.append(f"\n  综合得分: {scores.get('composite', 0):+.4f}")
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