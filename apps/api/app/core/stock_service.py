import re
import cv2
import numpy as np
import pytesseract
import os
import csv
from io import BytesIO
from typing import List, Dict, Optional
from fastapi import UploadFile, HTTPException
from datetime import datetime, timedelta
import akshare as ak
import baostock as bs
import pandas as pd

from .logging import logger

class StockService:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not hasattr(self, 'initialized'):
            # 定义数据文件路径
            data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'data')
            os.makedirs(data_dir, exist_ok=True)
            csv_file = os.path.join(data_dir, 'stock_info.csv')
            industry_file = os.path.join(data_dir, 'industry_info.csv')
            concept_file = os.path.join(data_dir, 'concept_info.csv')
            
            # 检查文件是否存在且是今天的日期
            today = datetime.now().date()
            file_exists = os.path.exists(csv_file)
            file_is_today = False
            
            if file_exists:
                file_mtime = datetime.fromtimestamp(os.path.getmtime(csv_file)).date()
                file_is_today = (file_mtime == today)
                logger.info(f"文件存在: {file_exists}, 文件日期: {file_mtime}, 当前日期: {today}")
            else:
                logger.info(f"文件不存在: {file_exists}")
            
            if file_exists and file_is_today:
                # 从文件中读取数据
                try:
                    stock_info_a_code_name_df = pd.read_csv(csv_file, dtype={'code': str})
                    # 确保股票代码保持6位格式，补前导零
                    stock_info_a_code_name_df['code'] = stock_info_a_code_name_df['code'].str.zfill(6)
                    self.stock_code_name_map = dict(zip(stock_info_a_code_name_df["code"], stock_info_a_code_name_df["name"]))
                    logger.info(f"加载股票数据，共 {len(self.stock_code_name_map)} 条")
                except Exception as e:
                    logger.error(f"从文件读取股票数据失败: {e}")
                    # 如果文件读取失败，尝试从网络获取
                    self._fetch_and_save_stock_data(csv_file)
            else:
                # 从网络获取数据并保存到文件
                self._fetch_and_save_stock_data(csv_file)

            # 处理行业信息
            industry_file_exists = os.path.exists(industry_file)
            industry_file_is_today = False
            
            if industry_file_exists:
                industry_file_mtime = datetime.fromtimestamp(os.path.getmtime(industry_file)).date()
                industry_file_is_today = (industry_file_mtime == today)
                logger.info(f"行业文件存在: {industry_file_exists}, 文件日期: {industry_file_mtime}, 当前日期: {today}")
            
            if industry_file_exists and industry_file_is_today:
                try:
                    industry_df = pd.read_csv(industry_file)
                    self.industry_list = industry_df['industry'].tolist()
                    logger.debug(f"从文件读取行业数据，共 {len(self.industry_list)} 条")
                except Exception as e:
                    logger.error(f"从文件读取行业数据失败: {e}")
                    self._fetch_and_save_industry_data(industry_file)
            else:
                self._fetch_and_save_industry_data(industry_file)

            # 处理题材信息
            concept_file_exists = os.path.exists(concept_file)
            concept_file_is_today = False
            
            if concept_file_exists:
                concept_file_mtime = datetime.fromtimestamp(os.path.getmtime(concept_file)).date()
                concept_file_is_today = (concept_file_mtime == today)
                logger.info(f"题材文件存在: {concept_file_exists}, 文件日期: {concept_file_mtime}, 当前日期: {today}")
            
            if concept_file_exists and concept_file_is_today:
                try:
                    concept_df = pd.read_csv(concept_file)
                    self.concept_list = concept_df['concept'].tolist()
                    logger.debug(f"从文件读取题材数据，共 {len(self.concept_list)} 条")
                except Exception as e:
                    logger.error(f"从文件读取题材数据失败: {e}")
                    self._fetch_and_save_concept_data(concept_file)
            else:
                self._fetch_and_save_concept_data(concept_file)

            self.initialized = True
    
    def _fetch_and_save_stock_data(self, csv_file):
        """从网络获取股票数据并保存到文件"""
        try:
            stock_info_a_code_name_df = ak.stock_info_a_code_name()
            # 确保股票代码保持6位格式，补前导零
            stock_info_a_code_name_df['code'] = stock_info_a_code_name_df['code'].astype(str).str.zfill(6)
            self.stock_code_name_map = dict(zip(stock_info_a_code_name_df["code"], stock_info_a_code_name_df["name"]))
            # 保存到文件
            stock_info_a_code_name_df.to_csv(csv_file, index=False)
            if '000858' in self.stock_code_name_map:
                logger.debug(f"网络获取数据后，self.stock_code_name_map['000858'] = {self.stock_code_name_map['000858']}")
            logger.info(f"从网络获取股票数据并保存到文件，共 {len(self.stock_code_name_map)} 条")
        except Exception as e:
            logger.error(f"从网络获取股票数据失败: {e}")
            # 如果网络获取失败，尝试从文件读取（如果文件存在）
            if os.path.exists(csv_file):
                try:
                    stock_info_a_code_name_df = pd.read_csv(csv_file, dtype={'code': str})
                    # 确保股票代码保持6位格式，补前导零
                    stock_info_a_code_name_df['code'] = stock_info_a_code_name_df['code'].str.zfill(6)
                    self.stock_code_name_map = dict(zip(stock_info_a_code_name_df["code"], stock_info_a_code_name_df["name"]))
                    if '000858' in self.stock_code_name_map:
                        logger.debug(f"文件读取后，self.stock_code_name_map['000858'] = {self.stock_code_name_map['000858']}")
                    logger.info(f"从文件读取股票数据（网络获取失败），共 {len(self.stock_code_name_map)} 条")
                except Exception as e:
                    logger.error(f"从文件读取股票数据失败: {e}")
                    self.stock_code_name_map = {}
                    logger.info("股票数据映射为空")
            else:
                self.stock_code_name_map = {}
                logger.info("股票数据映射为空")

    def _fetch_and_save_industry_data(self, industry_file):
        """从网络获取行业数据并保存到文件"""
        try:
            stock_board_industry_summary_ths_df = ak.stock_board_industry_summary_ths()
            if not stock_board_industry_summary_ths_df.empty:
                # 提取行业名称
                industry_df = pd.DataFrame({'industry': stock_board_industry_summary_ths_df['板块'].tolist()})
                # 保存到文件
                industry_df.to_csv(industry_file, index=False)
                self.industry_list = industry_df['industry'].tolist()
                logger.debug(f"从网络获取行业数据并保存到文件，共 {len(self.industry_list)} 条")
            else:
                self.industry_list = []
                logger.warning("获取行业数据为空")
        except Exception as e:
            logger.error(f"从网络获取行业数据失败: {e}")
            # 如果网络获取失败，尝试从文件读取（如果文件存在）
            if os.path.exists(industry_file):
                try:
                    industry_df = pd.read_csv(industry_file)
                    self.industry_list = industry_df['industry'].tolist()
                    logger.debug(f"从文件读取行业数据（网络获取失败），共 {len(self.industry_list)} 条")
                except Exception as e:
                    logger.error(f"从文件读取行业数据失败: {e}")
                    self.industry_list = []
            else:
                self.industry_list = []

    def _fetch_and_save_concept_data(self, concept_file):
        """从网络获取题材数据并保存到文件"""
        try:
            stock_board_concept_info_ths_df = ak.stock_board_concept_name_ths()
            if not stock_board_concept_info_ths_df.empty:
                # 提取题材名称
                concept_df = pd.DataFrame({'concept': stock_board_concept_info_ths_df['name'].tolist()})
                # 保存到文件
                concept_df.to_csv(concept_file, index=False)
                self.concept_list = concept_df['concept'].tolist()
                logger.debug(f"从网络获取题材数据并保存到文件，共 {len(self.concept_list)} 条")
            else:
                self.concept_list = []
                logger.warning("获取题材数据为空")
        except Exception as e:
            logger.error(f"从网络获取题材数据失败: {e}")
            # 如果网络获取失败，尝试从文件读取（如果文件存在）
            if os.path.exists(concept_file):
                try:
                    concept_df = pd.read_csv(concept_file)
                    self.concept_list = concept_df['concept'].tolist()
                    logger.debug(f"从文件读取题材数据（网络获取失败），共 {len(self.concept_list)} 条")
                except Exception as e:
                    logger.error(f"从文件读取题材数据失败: {e}")
                    self.concept_list = []
            else:
                self.concept_list = []

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

    def get_stock_market_type(self, code: str) -> str:
        """
        根据股票代码推断市场类型

        Returns:
            市场类型：A股 / 美股 / 港股 / 其他
        """
        exchange = self.get_stock_market(code)
        if exchange:
            return "A股"

        normalized_code = (code or "").strip().upper()

        if normalized_code.startswith(("HK.", "HKEX:")):
            return "港股"

        if normalized_code.startswith(("US.", "NASDAQ:", "NYSE:", "AMEX:")):
            return "美股"

        if normalized_code.isdigit() and len(normalized_code) == 5:
            return "港股"

        if normalized_code.isalpha():
            return "美股"

        return "其他"
    
    def get_industry_list(self) -> List[str]:
        """获取行业列表"""
        return self.industry_list
    
    def get_concept_list(self) -> List[str]:
        """获取题材列表"""
        return self.concept_list

    def search_stocks_from_csv(self, keyword: str, limit: int = 6) -> List[Dict[str, str]]:
        """从 data/stock_info.csv 中模糊搜索股票代码和名称"""
        keyword = (keyword or "").strip()
        if not keyword:
            return []

        normalized_keyword = keyword.lower()
        data_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "data"
        )
        csv_file = os.path.join(data_dir, "stock_info.csv")

        if not os.path.exists(csv_file):
            logger.warning(f"股票信息文件不存在: {csv_file}")
            return []

        results: List[Dict[str, str]] = []
        try:
            with open(csv_file, "r", encoding="utf-8-sig", newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    code = str(row.get("code", "")).strip()
                    name = str(row.get("name", "")).strip()
                    if not code or not name:
                        continue

                    if normalized_keyword in code.lower() or normalized_keyword in name.lower():
                        results.append({
                            "code": code,
                            "name": name,
                            "exchange": self.get_stock_market(code).upper(),
                            "market": self.get_stock_market_type(code)
                        })
                        if len(results) >= limit:
                            break
        except Exception as exc:
            logger.error(f"读取股票信息 CSV 失败: {exc}")
            return []

        return results