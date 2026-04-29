"""反思生成器模块"""
import json
from typing import Dict, Any, List, Optional
import logging

from ..core import database


logger = logging.getLogger(__name__)


def query_loss_records(user_id: int) :
    """
    查询 reflection 中 loss_record 为 True 的记录

    步骤1：查询 record_match 中存在、且 loss_record 为 true 的记录

    Returns:
        List[Dict]: 包含 record 数据的记录列表
    """
    query = """
        SELECT stock_code, analysis_date, analysis_result
        FROM stock_analysis_results
        WHERE user_id = %s
          AND analysis_result->'reflection'->>'loss_record' = 'true'
        ORDER BY analysis_date DESC
        LIMIT 1
    """
    row = database.execute_query(query, (user_id,), fetch=True)

    if not row:
        return None

    stock_code, analysis_date, result_raw = row
    result = json.loads(result_raw) if isinstance(result_raw, str) else result_raw
    record = result.get("reflection", {}).get("record", [])

    return {
        "stock_code": stock_code,
        "analysis_date": analysis_date,
        "record": record
    }


async def generate_reflection(user_id: int) -> Dict[str, Any]:
    """
    查询亏损记录并生成反思

    步骤1：查询亏损记录
    步骤2：构建提示词并调用大模型
    """
    from ..services.llm_service import LLMService

    # 查询亏损记录
    loss_record = query_loss_records(user_id)
    if not loss_record:
        return {
            "lessons": "",
            "suggestion": ""
        }

    # 获取 LLM 客户端
    llm = LLMService.get_user_default_client(user_id)

    # 构建提示词（加入 reflector 分析要点）
    prompt = """你是一位专业的金融分析师，负责对交易决策中的亏损进行反思分析。
请严格按照以下步骤进行分析：

1. 决策评估：
   - 分析交易决策是否正确
   - 考虑市场情报、技术指标、价格走势、基本面数据等因素

2. 原因分析：
   - 分析亏损的具体原因
   - 评估各因素在决策过程中的重要性

3. 改进建议：
   - 提出具体的修正措施
   - 提供详细的改进建议

4. 经验总结：
   - 总结从本次亏损中获得的经验教训
   - 说明这些经验如何应用于未来的交易场景

请分析以下亏损记录：

亏损记录：
股票代码：""" + loss_record["stock_code"] + """
分析日期：""" + loss_record["analysis_date"] + """
开仓记录：""" + json.dumps(loss_record["record"], ensure_ascii=False) + """

请按照以下格式返回 JSON：
{
  "lessons": "从本次亏损中获得的经验教训（详细描述）",
  "suggestion": "对未来交易的改进建议（具体可操作）"
}

请确保 JSON 格式正确，不要包含其他内容。
"""

    # 调用大模型
    response, token_usage = await llm.chat(prompt, response_format="json")

    # 解析响应
    result = _safe_parse_json(response)

    return result


def _safe_parse_json(text: str) -> dict:
    """安全解析 JSON"""
    try:
        clean = text.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(clean)
    except json.JSONDecodeError:
        return {
            "lessons": "",
            "suggestion": ""
        }


async def generate_full_reflection(user_id: int, ticker: str, date: str, today_signal: str) -> Dict[str, Any]:
    """
    汇总反思方法：
    1. 调用 update_today_status 获取今日状态
    2. 若存在亏损记录，调用 generate_reflection 生成反思
    3. 整合为完整 JSON
    """
    from .reflect_status import update_today_status

    # 步骤1：获取今日状态
    status_data = update_today_status(ticker, user_id, date, today_signal)

    # 步骤2：生成反思（仅亏损时）
    reflection_data = await generate_reflection(user_id)

    # 步骤3：整合结果
    result = {
        "record_match": {
            "status": status_data.get("status", "IGNORE"),
            "currrent_direction": status_data.get("currrent_direction", "none"),
            "loss_record": status_data.get("loss_record", False),
            "record": status_data.get("record", [])
        },
        "lessons": reflection_data.get("lessons", ""),
        "suggestion": reflection_data.get("suggestion", "")
    }

    return result




