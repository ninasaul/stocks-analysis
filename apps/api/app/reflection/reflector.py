"""反思机制模块"""
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)

class Reflector:
    """处理决策反思和经验总结"""

    def __init__(self, llm):
        """初始化反思器"""
        self.llm = llm
        self.reflection_prompt = self._get_reflection_prompt()

    def _get_reflection_prompt(self) -> str:
        """获取反思系统提示"""
        return """
你是一位专业的金融分析师，负责对交易决策进行全面的反思和分析。
你的目标是提供详细的洞察，分析投资决策的成功或失败原因，并提出改进建议。

请严格按照以下步骤进行分析：

1. 决策评估：
   - 分析交易决策是否正确
   - 考虑市场情报、技术指标、价格走势、基本面数据等因素

2. 原因分析：
   - 分析成功或失败的具体原因
   - 评估各因素在决策过程中的重要性

3. 改进建议：
   - 对于错误决策，提出具体的修正措施
   - 提供详细的改进建议

4. 经验总结：
   - 总结从成功和失败中获得的经验教训
   - 说明这些经验如何应用于未来的交易场景

请提供详细、准确且可操作的分析结果。
"""

    async def reflect_on_decision(self, decision_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        对交易决策进行反思
        
        Args:
            decision_data: 包含决策相关数据的字典
        
        Returns:
            反思结果，如果失败则包含error字段
        """
        # 构建反思提示
        prompt = f"""
交易决策数据：
ticker: {decision_data.get('ticker', '')}

技术打分：
{decision_data.get('timing', {})}

基本面检查：
{decision_data.get('fundamental', {})}

多空辩论：
{decision_data.get('debate', {})}

最终信号：
{decision_data.get('signal', '')}

最终得分：
{decision_data.get('score', 0)}

请对以上决策进行全面反思和分析，并以 JSON 格式返回结果。

JSON 格式示例：
{{
  "evaluation": "决策评估",
  "analysis": "原因分析",
  "suggestions": "改进建议",
  "lessons": "经验总结"
}}
        """
        
        # 调用 LLM 进行反思
        try:
            response = await self.llm.chat(
                self.reflection_prompt + "\n" + prompt,
                response_format="json"
            )
            result = self._safe_parse_json(response)
            return result
        except Exception as e:
            error_msg = f"反思分析失败: {str(e)}"
            logger.error(f"反思分析失败: {str(e)}")
            return {
                "evaluation": "反思分析失败",
                "analysis": "",
                "suggestions": "",
                "lessons": "",
                "error": error_msg,
                "error_detail": str(e)
            }
    
    async def reflect_on_trade(self, trade_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        对交易结果进行反思
        
        Args:
            trade_data: 包含交易相关数据的字典
        
        Returns:
            反思结果
        """
        # 构建反思提示
        prompt = f"""
交易结果数据：
ticker: {trade_data.get('ticker', '')}
action: {trade_data.get('action', '')}
signal: {trade_data.get('signal', '')}
price: {trade_data.get('price', 0)}
quantity: {trade_data.get('quantity', 0)}
profit: {trade_data.get('profit', 0)}
timestamp: {trade_data.get('timestamp', '')}

请对以上交易结果进行全面反思和分析，包括：
1. 交易决策是否正确
2. 信号与实际结果是否一致
3. 如何改进交易策略
4. 从本次交易中获得的经验教训

并以 JSON 格式返回结果。

JSON 格式示例：
{{
  "evaluation": "交易评估",
  "analysis": "原因分析",
  "suggestions": "改进建议",
  "lessons": "经验总结"
}}
        """
        
        # 调用 LLM 进行反思
        try:
            response = await self.llm.chat(
                self.reflection_prompt + "\n" + prompt,
                response_format="json"
            )
            result = self._safe_parse_json(response)
            return result
        except Exception as e:
            logger.error(f"交易反思分析失败: {e}")
            return {
                "error": "交易反思分析失败",
                "message": str(e)
            }

    def _safe_parse_json(self, text: str) -> dict:
        """安全解析 JSON"""
        import json
        try:
            clean = text.strip()
            if clean.startswith("```"):
                clean = clean.split("\n", 1)[1].rsplit("```", 1)[0]
            return json.loads(clean)
        except (json.JSONDecodeError, IndexError):
            return {
                "error": "parse_failed",
                "raw": text[:500],
                "summary": "分析结果解析失败"
            }