"""数据获取模块 - 使用 AkShare 获取股票数据"""
import akshare as ak
from typing import List, Dict, Optional
from datetime import datetime, timedelta
from ..core.logging import logger


def fetch_stock_data(ticker: str, days: int = 60, buffer_days: int = 30) -> List[Dict]:
    """
    获取股票历史日线数据
    
    Args:
        ticker: 股票代码
        days: 获取天数
        buffer_days: 额外获取的天数，以确保数据充足
    
    Returns:
        日线数据列表，每项包含 {date, open, high, low, close, volume, amount}
    """
    logger.info(f"开始获取股票 {ticker} 的 {days} 天历史日线数据")
    try:
        # 确定股票类型
        if ticker.startswith('6'):
            # 沪市
            symbol = f"sh{ticker}"
        elif ticker.startswith('0') or ticker.startswith('3'):
            # 深市
            symbol = f"sz{ticker}"
        elif ticker.startswith('8') or ticker.startswith('920'):
            # 北交所
            symbol = f"bj{ticker}"
        else:
            # TODO 其他市场目前不支持获取数据，返回空列表
            symbol = ticker
            logger.warning(f"不支持的股票市场: {ticker}")
            return []

        logger.info(f"使用符号 {symbol} 获取数据")
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days + buffer_days)  # 多取 buffer_days 天以确保数据充足
        
        # 使用 AkShare 获取数据
        logger.debug(f"开始获取数据: {symbol}, 开始日期: {start_date.strftime('%Y%m%d')}, 结束日期: {end_date.strftime('%Y%m%d')}")
        stock_zh_a_hist_df = ak.stock_zh_a_daily(
            symbol=symbol, 
            start_date=start_date.strftime("%Y%m%d"),
            end_date=end_date.strftime("%Y%m%d"),
            adjust="qfq")

        logger.debug(f"获取到的前1条数据:\n{stock_zh_a_hist_df.head(1)}")
        logger.debug(f"获取到的后1条数据:\n{stock_zh_a_hist_df.tail(1)}")

        # 转换为所需格式
        data = []
        for _, row in stock_zh_a_hist_df.iterrows():
            data.append({
                "date": row["date"],
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": float(row["volume"]),
                "amount": float(row["amount"])
            })

        logger.info(f"获取到 {len(data)} 条数据")
        return data
    except Exception as e:
        logger.error(f"获取股票数据失败: {e}")
        return []


def fetch_fundamental(ticker: str) -> Dict:
    """
    获取股票基本面数据
    
    Args:
        ticker: 股票代码
    
    Returns:
        基本面数据字典
    """
    # TODO 当天获取的数据进行缓存，避免重复获取
    logger.info(f"开始获取股票 {ticker} 的基本面数据")
    try:
        # 确定股票类型
        if ticker.startswith('6'):
            # 沪市
            symbol = f"SH{ticker}"
        elif ticker.startswith('0') or ticker.startswith('3'):
            # 深市
            symbol = f"SZ{ticker}"
        elif ticker.startswith('8') or ticker.startswith('920'):
            # 北交所
            symbol = f"BJ{ticker}"
        else:
            # TODO 其他市场目前不支持获取数据，返回空列表
            symbol = ticker
            logger.warning(f"不支持的股票市场: {ticker}")
            return {}

        # 获取股票基本信息
        stock_individual_basic_info_xq_df = ak.stock_individual_basic_info_xq(symbol=symbol)
        # 筛选出item为affiliate_industry的行
        industry_row = stock_individual_basic_info_xq_df[stock_individual_basic_info_xq_df["item"] == "affiliate_industry"]
        # 获取字典值
        industry_dict = industry_row["value"].values[0]
        # 提取行业名称
        industry_name = industry_dict.get("ind_name")
        # 提取股票名称
        org_short_name_cn = stock_individual_basic_info_xq_df[stock_individual_basic_info_xq_df["item"] == "org_short_name_cn"].iloc[0]["value"]

        # 获取股票估值信息
        stock_info = ak.stock_value_em(symbol=ticker)
        if stock_info.empty:
            logger.warning(f"获取估值信息为空: {ticker}")
            return {}
        
        # 获取财务指标
        try:
            previous_year = str(datetime.now().year - 1)
            finance_data = ak.stock_financial_analysis_indicator(symbol=ticker, start_year=previous_year)
            logger.debug(f"获取到的财务指标数量: {len(finance_data)}")
            logger.debug(f"获取到的最新财务指标:\n{finance_data.tail(1)}")
            
            # 取最新财务指标
            finance_data = finance_data.tail(1)
            if finance_data.empty:
                logger.error(f"获取财务指标为空: {ticker}")
                return {}

        except Exception as e:
            logger.warning(f"获取财务指标失败: {e}")
            return {}
        
        fundamental = {
            "name": org_short_name_cn,
            "industry": industry_name,
            "pe": float(stock_info.iloc[-1]["PE(TTM)"]) if not pd.isna(stock_info.iloc[-1]["PE(TTM)"]) else None,
            "pb": float(stock_info.iloc[-1]["市净率"]) if not pd.isna(stock_info.iloc[-1]["市净率"]) else None,
        }
        
        if finance_data is not None and not finance_data.empty:
            # 获取第一行数据
            row = finance_data.iloc[0]
            fundamental.update({
                "roe": float(row["加权净资产收益率(%)"]) if not pd.isna(row["加权净资产收益率(%)"]) else None,
                "gross_profit_rate": float(row["销售毛利率(%)"]) if not pd.isna(row["销售毛利率(%)"]) else None,
                "asset_liability_ratio": float(row["资产负债率(%)"]) if not pd.isna(row["资产负债率(%)"]) else None,
            })
        
        logger.info(f"获取基本面数据完成: {ticker}")
        logger.debug(f"获取到的基本面数据: {fundamental}")
        return fundamental
    except Exception as e:
        logger.error(f"获取基本面数据失败: {e}")
        return {}


# 导入 pandas 以支持数据处理
import pandas as pd