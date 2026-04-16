"""信号输出模块"""
from typing import Dict


def format_report(result: Dict) -> str:
    """
    格式化分析报告
    
    Args:
        result: 分析结果
    
    Returns:
        格式化的报告字符串
    """
    ticker = result.get("ticker", "Unknown")
    
    report = f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    report += f"🎯 {ticker} 择时信号\n\n"
    
    # 技术打分
    timing = result.get("timing", {})
    if timing:
        report += "📊 10 维度技术打分\n"
        for key, value in timing.items():
            if key in ("composite", "signal"):
                continue
            bar = "+" * max(0, int(value * 5)) + "-" * max(0, int(-value * 5))
            report += f"  {key:12}: {value:+.2f} [{bar}]\n"
        report += f"\n  综合得分: {timing.get('composite', 0):+.4f}\n"
        report += f"  技术信号: {timing.get('signal', 'N/A')}\n\n"
    
    # 多空辩论
    debate = result.get("debate", {})
    if debate:
        report += "⚔️ 多空辩论\n"
        bull = debate.get("bull", {})
        bear = debate.get("bear", {})
        report += f"  🐂 看多 ({bull.get('score', 5)}/10)：{bull.get('arguments', ['无'])[0]}\n"
        report += f"  🐻 看空 ({bear.get('score', 5)}/10)：{bear.get('rebuttals', ['无'])[0]}\n\n"
        report += f"  辩论差: {debate.get('debate_signal', 0):+.1f} → {'偏多' if debate.get('debate_signal', 0) > 0 else '偏空' if debate.get('debate_signal', 0) < 0 else '中性'}\n"
        report += f"  最终得分: 0.6×{debate.get('tech_score', 0):.2f} + 0.4×{debate.get('debate_signal', 0):.2f} = {debate.get('final_score', 0):+.2f}\n"
        report += f"  ✅ 信号: {debate.get('signal', 'HOLD')}\n\n"
    
    # 操作建议
    report += "📋 操作建议\n"
    report += "  ⚠️ 不追高：等待回踩 MA10 附近再介入\n"
    report += "  🎯 参考区间：回踩至 [MA10, MA20] 区间可考虑\n"
    report += "  🛑 风控：跌破 MA60 减仓\n\n"
    
    # 免责声明
    report += "⚠️ 以上仅为技术分析工具输出，不构成投资建议\n"
    report += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    return report


def push_notification(report: str):
    """
    推送通知
    
    Args:
        report: 报告内容
    """
    # 这里可以实现企微、Telegram 等推送功能
    # 暂时只打印到控制台
    print("\n=== 推送通知 ===")
    print(report)
    print("================\n")