"""信号输出模块"""
from typing import Dict


def format_report(result: Dict, stock_name: str = None) -> str:
    """
    格式化分析报告
    
    Args:
        result: 分析结果
    
    Returns:
        格式化的报告字符串
    """
    ticker = result.get("ticker", "Unknown")
    
    report = f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    report += f"🎯 {ticker} {stock_name} 择时信号\n\n"
    
    # 技术打分
    timing = result.get("timing", {})
    if timing:
        report += "📊 10 维度技术打分\n"
        for key, value in timing.items():
            if key in ("composite", "signal", "price_range"):
                continue
            bar = "+" * max(0, int(value * 5)) + "-" * max(0, int(-value * 5))
            report += f"  {key:12}: {value:+.2f} [{bar}]\n"
        report += f"\n  综合得分: {timing.get('composite', 0):+.4f}\n"
        report += f"  技术信号: {timing.get('signal', 'N/A')}\n\n"
        
        # 价格区间信息
        price_range = timing.get("price_range", {})
        if price_range:
            if "error" in price_range:
                report += f"⚠️ {price_range.get('error', '数据不足')}\n\n"
            else:
                report += "📈 价格区间分析\n"
                report += f"  当前价格: {price_range.get('current_price', 'N/A')}\n"
                
                # 布林带信息
                bollinger = price_range.get("bollinger", {})
                if bollinger:
                    report += f"  布林带上轨: {bollinger.get('upper', 'N/A')}\n"
                    report += f"  布林带中轨: {bollinger.get('middle', 'N/A')}\n"
                    report += f"  布林带下轨: {bollinger.get('lower', 'N/A')}\n"
                
                # 均线信息
                ma = price_range.get("ma", {})
                if ma:
                    report += f"  MA5: {ma.get('ma5', 'N/A')}\n"
                    report += f"  MA10: {ma.get('ma10', 'N/A')}\n"
                
                # 买入建议
                buy_range = price_range.get("buy_range", {})
                if buy_range:
                    report += f"\n  🛒 买入建议\n"
                    report += f"  最佳买点: {buy_range.get('best_buy_price', 'N/A')}\n"
                    report += f"  次优买点: {buy_range.get('secondary_buy_price', 'N/A')}\n"
                    report += f"  止损价格: {buy_range.get('stop_loss', 'N/A')}\n"
                    report += f"  止盈价格: {buy_range.get('take_profit', 'N/A')}\n"
                    report += f"  建议: {buy_range.get('suggestion', 'N/A')}\n"
                
                # 卖出建议
                sell_range = price_range.get("sell_range", {})
                if sell_range:
                    report += f"\n  📤 卖出建议\n"
                    report += f"  最佳卖点: {sell_range.get('best_sell_price', 'N/A')}\n"
                    report += f"  次优卖点: {sell_range.get('secondary_sell_price', 'N/A')}\n"
                    report += f"  止损价格: {sell_range.get('stop_loss', 'N/A')}\n"
                    report += f"  止盈价格: {sell_range.get('take_profit', 'N/A')}\n"
                    report += f"  建议: {sell_range.get('suggestion', 'N/A')}\n"
                report += "\n"
    
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
    
    # 根据实际数据生成动态建议
    price_range = timing.get("price_range", {}) if timing else {}
    if price_range and "error" not in price_range:
        buy_range = price_range.get("buy_range", {})
        sell_range = price_range.get("sell_range", {})
        
        if buy_range:
            report += f"  🛒 买入策略：\n"
            report += f"    - 最佳买入区间: {buy_range.get('low', 'N/A')} ~ {buy_range.get('high', 'N/A')}\n"
            report += f"    - 建议: {buy_range.get('suggestion', 'N/A')}\n"
            report += f"    - 止损位: {buy_range.get('stop_loss', 'N/A')}\n"
            report += f"    - 止盈位: {buy_range.get('take_profit', 'N/A')}\n"
        
        if sell_range:
            report += f"  📤 卖出策略：\n"
            report += f"    - 最佳卖出区间: {sell_range.get('low', 'N/A')} ~ {sell_range.get('high', 'N/A')}\n"
            report += f"    - 建议: {sell_range.get('suggestion', 'N/A')}\n"
            report += f"    - 止损位: {sell_range.get('stop_loss', 'N/A')}\n"
            report += f"    - 止盈位: {sell_range.get('take_profit', 'N/A')}\n"
        
        if not buy_range and not sell_range:
            report += f"  ⚠️ 当前无明确买卖信号，建议观望\n"
    else:
        report += "  ⚠️ 数据不足，无法生成操作建议\n"
    
    report += "\n"
    
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