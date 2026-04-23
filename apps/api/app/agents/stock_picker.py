import logging
logger = logging.getLogger(__name__)


"""选股智能体：基本面安全边际筛选"""


PICKER_PROMPT = """你是一位严格的基本面分析师。你的任务不是推荐股票，
而是评估 {ticker} 是否通过基本面安全边际检查。

## 财务数据
{fundamental_data}

## 评估标准（必须逐项检查）

1. **估值安全**：PE 是否低于行业均值的 1.5 倍？PB 是否合理？
2. **盈利质量**：ROE 是否 > 10%？毛利率是否稳定或提升？
3. **成长性**：营收和净利润是否连续 2 年正增长？
4. **财务健康**：资产负债率是否 < 70%？经营现金流是否为正？
5. **排雷检查**：是否存在商誉减值风险？是否有 ST 风险？
6. **行业景气度**：主营业务的行业景气度如何？机构是否持乐观态度？行业龙头企业的业绩增速是否还在正常范围内？
7. **催化剂分析**：是否存在潜在的催化剂因素，如新产品发布、政策支持、行业整合、并购重组等？

## 输出格式（JSON）
{{
  "pass": true/false,
  "score": 1-10,
  "checks": {{
    "valuation": {{"pass": true/false, "detail": "..."}},
    "profitability": {{"pass": true/false, "detail": "..."}},
    "growth": {{"pass": true/false, "detail": "..."}},
    "health": {{"pass": true/false, "detail": "..."}},
    "risk_screen": {{"pass": true/false, "detail": "...}},
    "industry_prosperity": {{"pass": true/false, "detail": "..."}},
    "catalyst": {{"pass": true/false, "detail": "..."}}
  }},
  "conclusion": "一句话总结",
  "catalyst": "催化剂分析总结"
}}

通过条件：第7项不用考虑，第5和第6项一定要pass，其他4项中至少1项pass。
严格评估，宁可错过不可错选。"""

async def run_fundamental_check(ticker: str, fundamental: dict, llm) -> dict:
    """
    运行基本面检查
    
    Args:
        ticker: 股票代码
        fundamental: 基本面数据
        llm: LLM 客户端
    
    Returns:
        基本面检查结果，如果失败则包含error字段
    """
    if not fundamental:
        return {
            "pass": False,
            "score": 0,
            "checks": {},
            "conclusion": "无法获取基本面数据",
            "error": "无法获取基本面数据"
        }
    
    # 格式化基本面数据
    fundamental_data = "\n".join([f"{k}: {v}" for k, v in fundamental.items()])
    
    # 调用 LLM 进行分析
    prompt = PICKER_PROMPT.format(
        ticker=ticker,
        fundamental_data=fundamental_data
    )
    
    try:
        response = await llm.chat(prompt, response_format="json")
        result = safe_parse_json(response)
        return result
    except Exception as e:
        error_msg = f"基本面检查失败: {str(e)}"
        logger.error(f"基本面检查失败: {str(e)}")
        return {
            "pass": False,
            "score": 0,
            "checks": {},
            "conclusion": "分析失败",
            "error": error_msg,
            "error_detail": str(e)
        }


def safe_parse_json(text: str) -> dict:
    """安全解析 JSON"""
    import json
    try:
        clean = text.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(clean)
    except (json.JSONDecodeError, IndexError):
        return {"error": "parse_failed", "raw": text[:300]}