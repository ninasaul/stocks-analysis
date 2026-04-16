"""交易策略模块"""
from typing import Dict, Optional
from .manager import TradingManager


class TradingStrategy:
    """交易策略"""
    def __init__(self, trading_manager: TradingManager):
        """
        初始化交易策略
        
        Args:
            trading_manager: 交易管理器
        """
        self.trading_manager = trading_manager
    
    def execute_trade(self, ticker: str, signal: str, price: float, quantity: int = 100) -> Dict:
        """
        根据信号执行交易
        
        Args:
            ticker: 股票代码
            signal: 交易信号，BUY, SELL, HOLD
            price: 交易价格
            quantity: 交易数量
        
        Returns:
            交易结果
        """
        if signal == "BUY":
            return self.trading_manager.buy(ticker, price, quantity)
        elif signal == "SELL":
            return self.trading_manager.sell(ticker, price, quantity)
        else:  # HOLD
            return {
                "success": True,
                "message": "保持观望",
                "signal": signal
            }
    
    def get_strategy_report(self) -> Dict:
        """
        获取策略报告
        
        Returns:
            策略报告
        """
        portfolio = self.trading_manager.get_portfolio()
        transactions = self.trading_manager.get_transactions()
        
        # 计算总收益
        initial_value = 100000.0  # 初始资金
        current_value = portfolio["total_value"]
        total_return = ((current_value - initial_value) / initial_value) * 100
        
        # 计算交易次数
        buy_count = sum(1 for tx in transactions if tx["action"] == "buy")
        sell_count = sum(1 for tx in transactions if tx["action"] == "sell")
        
        return {
            "portfolio": portfolio,
            "total_return": total_return,
            "buy_count": buy_count,
            "sell_count": sell_count,
            "transactions": transactions
        }
