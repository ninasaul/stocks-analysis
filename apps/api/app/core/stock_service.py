import re
import cv2
import numpy as np
import pytesseract
from io import BytesIO
from typing import List, Dict, Optional
from fastapi import UploadFile, HTTPException
from datetime import datetime, timedelta
import akshare as ak
import baostock as bs
import pandas as pd

class StockService:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not hasattr(self, 'initialized'):
            stock_info_a_code_name_df = ak.stock_info_a_code_name()
            self.stock_code_name_map = dict(zip(stock_info_a_code_name_df["code"], stock_info_a_code_name_df["name"]))
            self.initialized = True

    def get_stock_quote(self, stock_code: str) -> Dict:
        stock_individual_spot_em_df = ak.stock_individual_spot_xq(symbol=self.get_full_uppercase_stock_code(stock_code))
        if stock_individual_spot_em_df.empty:
            raise HTTPException(status_code=404, detail=f"Stock {stock_code} not found")
        
        return {
            "stock_code": stock_code,
            "stock_name": stock_individual_spot_em_df[stock_individual_spot_em_df["item"] == "名称"]["value"].values[0],
            "current_price": stock_individual_spot_em_df[stock_individual_spot_em_df["item"] == "现价"]["value"].values[0],
            "change": stock_individual_spot_em_df[stock_individual_spot_em_df["item"] == "涨跌"]["value"].values[0],
            "change_percent": stock_individual_spot_em_df[stock_individual_spot_em_df["item"] == "涨幅"]["value"].values[0],
            "open": stock_individual_spot_em_df[stock_individual_spot_em_df["item"] == "今开"]["value"].values[0],
            "high": stock_individual_spot_em_df[stock_individual_spot_em_df["item"] == "最高"]["value"].values[0],
            "low": stock_individual_spot_em_df[stock_individual_spot_em_df["item"] == "最低"]["value"].values[0],
            "prev_close": stock_individual_spot_em_df[stock_individual_spot_em_df["item"] == "昨收"]["value"].values[0],
            "volume": stock_individual_spot_em_df[stock_individual_spot_em_df["item"] == "成交量"]["value"].values[0],
            "amount": stock_individual_spot_em_df[stock_individual_spot_em_df["item"] == "成交额"]["value"].values[0],
            "update_time": datetime.now().isoformat(),
            "source": "akshare",
            "fallback_chain": ["xueqiu", "akshare"]
        }
    
    def get_stock_history(self, stock_code: str, period: str, days: int) -> Dict:
        period_map = {
            "daily": "d",
            "weekly": "w",
            "monthly": "m"
        }

        start_date = (datetime.now() - timedelta(days=days-1)).strftime("%Y-%m-%d")
        end_date = datetime.now().strftime("%Y-%m-%d")
        frequency = period_map.get(period, "d")  # 默认返回"d"

        # 登录（必须）
        bs.login()

        # 获取数据（真正稳定的接口）
        rs = bs.query_history_k_data_plus(
            code=self.get_full_lowercase_stock_code(stock_code),
            fields="date,open,high,low,close,volume,amount,pctChg",
            start_date=start_date,
            end_date=end_date,
            frequency=frequency,
            adjustflag="2"  # 2=前复权
        )

        # 转DataFrame
        data_list = []
        while rs.next():
            data_list.append(rs.get_row_data())
        df = pd.DataFrame(data_list, columns=rs.fields)

        bs.logout()

        if df.empty:
            raise HTTPException(status_code=404, detail=f"Stock {stock_code} not found")
        
        data = []
        stock_name = self._get_stock_name(stock_code)
        
        for row in df.itertuples():
            data.append({
                "date": row.date,
                "open": row.open,
                "high": row.high,
                "low": row.low,
                "close": row.close,
                "volume": row.volume,
                "amount": row.amount,
                "change_percent": row.pctChg
            })
        
        return {
            "stock_code": stock_code,
            "stock_name": stock_name,
            "period": period,
            "source": "baostock",
            "fallback_chain": ["baostock"],
            "data": data
        }
    
    def get_full_uppercase_stock_code(self, code: str) -> str:
        # 上海交易所
        if code.startswith(("60", "68", "69")):
            return f"SH{code}"
        
        # 深圳交易所
        elif code.startswith(("00", "30", "39")):
            return f"SZ{code}"
        
        # 北京交易所（8开头 / 920开头 都属于 BJ）
        elif code.startswith(("8", "920")):
            return f"BJ{code}"
        
        # 无法识别则返回原代码
        else:
            return code

    def get_full_lowercase_stock_code(self, code: str) -> str:
        # 上海交易所
        if code.startswith(("60", "68", "69")):
            return f"sh.{code}"
        
        # 深圳交易所
        elif code.startswith(("00", "30", "39")):
            return f"sz.{code}"
        
        # 北京交易所（8开头 / 920开头 都属于 BJ）
        elif code.startswith(("8", "920")):
            return f"bj.{code}"
        
        # 无法识别则返回原代码
        else:
            return code

    def get_full_lowercase_stock_code_no_dot(self, code: str) -> str:
        # 上海交易所
        if code.startswith(("60", "68", "69")):
            return f"sh{code}"
        
        # 深圳交易所
        elif code.startswith(("00", "30", "39")):
            return f"sz{code}"
        
        # 北京交易所（8开头 / 920开头 都属于 BJ）
        elif code.startswith(("8", "920")):
            return f"bj{code}"
        
        # 无法识别则返回原代码
        else:
            return code

    def get_stock_name(self, code: str) -> str:
        stock_name = self.stock_code_name_map.get(code)
        if stock_name:
            return stock_name
        return "Unknown"
    
    def get_stock_market(self, code: str) -> str:
        """
        根据股票代码获取对应的市场
        
        Args:
            code: 股票代码
        
        Returns:
            市场代码：sh（上海）、sz（深圳）、bj（北京）
        """
        # 上海交易所
        if code.startswith(("60", "68", "69")):
            return "sh"
        
        # 深圳交易所
        elif code.startswith(("00", "30", "39")):
            return "sz"
        
        # 北京交易所（8开头 / 920开头 都属于 BJ）
        elif code.startswith(("8", "920")):
            return "bj"
        
        # 无法识别则返回空
        else:
            return ""