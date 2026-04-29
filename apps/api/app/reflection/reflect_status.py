"""反思机制模块"""
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
import json
import logging

from ..core import database


logger = logging.getLogger(__name__)


def update_today_status(ticker: str, user_id: int, date: str, today_signal: str):
    """
    获取指定日期前一天的记录数据，生成今日状态并存储

    流程：
    1. 查询昨日分析结果
    2. 提取有用的字段（状态、方向、信号）
    3. 调用 status_change 生成今日状态
    4. 更新并存储结果

    Returns:
        True: 更新成功
        False: 查询失败或更新失败
    """
    # 1. 查询昨日记录
    query = """
        SELECT analysis_date, analysis_result
        FROM stock_analysis_results
        WHERE user_id = %s AND stock_code = %s AND analysis_date < %s
        ORDER BY analysis_date DESC
        LIMIT 1
    """
    row = database.execute_query(query, (user_id, ticker, date), fetch=True)
    # 未查到记录时，使用默认值
    if row:
        yesterday_date, yesterday_result_raw = row
        yesterday_result = json.loads(yesterday_result_raw) if isinstance(yesterday_result_raw, str) else yesterday_result_raw

        record_match = yesterday_result.get("reflection", {}).get("record_match", {})
        yesterday_status = record_match.get("status", "IGNORE")
        yesterday_direction = record_match.get("currrent_direction", "none")
    else:
        yesterday_status = "IGNORE"
        yesterday_direction = "none"

    # 判断今日状态
    today_status, today_direction = status_change(yesterday_status, yesterday_direction, today_signal)

    # 计算 FINISH 所需要的详细数据
    settle_result = None
    loss_record = False
    if today_status == "FINISH":
        settle_result = settlement(ticker, user_id, date)
        if settle_result:
            loss_record = any(item["return"] <= 0 for item in settle_result)

    return {
        "status": today_status,
        "currrent_direction": today_direction,
        "record": settle_result or [],
        "loss_record": loss_record
    }



def status_change(yesterday_status: str, yesterday_direction: str,today_signal: str):
    """判断今日状态"""
    if today_signal == "hold":
        if yesterday_status == "FINISH":
            return "IGNORE","none"
        return "IGNORE",yesterday_direction
    else:
        if yesterday_status == "FINISH":
            return  "START" , today_signal
        if yesterday_direction == "none":
            return  "START" , today_signal
        else:
            if today_signal != yesterday_direction:
                return "FINISH" , yesterday_direction
            else :
                return "MORE" , today_signal



def settlement(ticker: str, user_id: int, finish_date: str):
    """
    结算方法：当状态为 FINISH 时，计算从 START 到 FINISH 的收益

    步骤1：获取从 finish_date 到往回找第一个 status 为 START 的所有记录（仅保留 START 和 MORE）
    """
    # 查询：从 finish_date 往前，找到第一个 START 状态的记录，然后获取这段区间的所有记录（只保留 START 和 MORE）
    query = """
        WITH start_record AS (
            SELECT analysis_date
            FROM stock_analysis_results
            WHERE user_id = %s
              AND stock_code = %s
              AND analysis_date <= %s
              AND (analysis_result->'reflection'->'record_match'->>'status') = 'START'
            ORDER BY analysis_date DESC
            LIMIT 1
        )
        SELECT analysis_date, analysis_result
        FROM stock_analysis_results, start_record
        WHERE user_id = %s
          AND stock_code = %s
          AND analysis_date >= start_record.analysis_date
          AND analysis_date <= %s
          AND (analysis_result->'reflection'->'record_match'->>'status') IN ('START', 'MORE')
        ORDER BY analysis_date ASC
    """
    rows = database.execute_query(query, (user_id, ticker, finish_date, user_id, ticker, finish_date), fetch=True)

    # 从结果中提取 START 记录的日期
    if not rows or len(rows) == 0:
        return
    start_date = rows[0][0]  # 第一条是 START

    # 步骤2：获取 START 到 FINISH 期间的历史价格
    price_data = settlement_stock_query(start_date, finish_date, ticker)
    # price_data: [(date, open_price, close_price), ...]

    # 步骤3：提取 direction
    last_record_raw = rows[-1][1]
    last_record = json.loads(last_record_raw) if isinstance(last_record_raw, str) else last_record_raw
    direction = (last_record.get("reflection", {}).get("record_match", {}).get("currrent_direction") or "BUY").upper()

    # 步骤4：构建日期→(开盘价, 收盘价)映射
    price_map = {date: (open_p, close_p) for date, open_p, close_p in price_data}

    # 步骤5：获取 FINISH 前一天的收盘价（平仓价）
    date_keys = list(price_map.keys())
    finish_idx = date_keys.index(finish_date) if finish_date in price_map else -1
    if finish_idx > 0:
        finish_close_price = price_map[date_keys[finish_idx - 1]][1]
    else:
        finish_close_price = price_map[date_keys[-1]][1]  # 兜底

    # 步骤6：计算每个 START/MORE 记录的收益率
    # 开仓价 = 当日开盘价，平仓价 = FINISH前一日收盘价
    dates = []
    returns = []

    for record_date, _ in rows:
        if record_date not in price_map:
            continue

        entry_price = price_map[record_date][0]  # 当日开盘价

        if entry_price and entry_price != 0:
            ret = (finish_close_price - entry_price) / entry_price
            if direction == "SELL":
                ret = -ret

            dates.append(record_date)
            returns.append(round(ret, 4))

    # 返回结果（对象数组结构）
    record = [{"date": d, "return": r} for d, r in zip(dates, returns)]
    return record


def settlement_stock_query(start_date: str, finish_date: str, ticker: str):
    """
    获取指定股票在日期区间内的历史价格

    Args:
        start_date: 开始日期
        finish_date: 结束日期
        ticker: 股票代码

    Returns:
        List[Tuple[str, float, float]]: [(date, open_price, close_price), ...]
    """
    from datetime import datetime, timedelta

    from ..core.stock_service import StockService

    # 计算需要获取的天数（区间天数 + 多取10天保险）
    start = datetime.strptime(start_date, "%Y-%m-%d")
    finish = datetime.strptime(finish_date, "%Y-%m-%d")
    days = (finish - start).days + 10

    stock_service = StockService()
    history_data = stock_service.get_stock_history(ticker, period="daily", days=days)

    # 过滤日期区间，返回日期、开盘价、收盘价
    price_data = []
    for record in history_data.get("data", []):
        record_date = record.get("date", "")
        if start_date <= record_date <= finish_date:
            open_price = float(record.get("open", 0))
            close_price = float(record.get("close", 0))
            price_data.append((record_date, open_price, close_price))

    return price_data






