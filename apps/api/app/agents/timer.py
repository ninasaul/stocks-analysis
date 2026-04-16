"""择时智能体：技术面 10 维度打分"""
from app.data.indicators import TimingScorer
from app.core.config import config
from app.core.stock_service import StockService
from app.core.logging import logger
from typing import List, Dict

stock_service = StockService()

class TimerAgent:
    """择时智能体"""

    def __init__(self):
        """初始化择时智能体"""
        pass

    def score(self, history: List[Dict], ticker: str = None) -> Dict:
        """
        计算择时分数
        
        Args:
            history: 历史日线数据
            ticker: 股票代码
        
        Returns:
            择时打分结果
        """
        logger.info(f"开始择时分析: {ticker}")
        # 确保数据量达到 60 天，这样所有指标都能正常计算
        if not history or len(history) < 60:
            logger.warning(f"数据不足: {ticker}, 仅 {len(history) if history else 0} 条数据")
            return {
                "error": "数据不足",
                "composite": 0.0,
                "signal": "HOLD"
            }
        
        logger.debug(f"数据量充足: {ticker}, {len(history)} 条数据")
        scorer = TimingScorer(history, ticker, stock_service.get_stock_market(ticker))
        result = scorer.score_all()
        logger.info(f"择时分析完成，信号: {result.get('signal')}, 综合得分: {result.get('composite')}")
        return result