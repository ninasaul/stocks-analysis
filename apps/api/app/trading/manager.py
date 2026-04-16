"""交易管理器模块"""
from typing import Dict, List, Optional, Tuple
from datetime import datetime
import json


class Transaction:
    """交易记录"""
    def __init__(self, ticker: str, action: str, price: float, quantity: int, timestamp: datetime):
        """
        初始化交易记录
        
        Args:
            ticker: 股票代码
            action: 交易动作，buy 或 sell
            price: 交易价格
            quantity: 交易数量
            timestamp: 交易时间
        """
        self.ticker = ticker
        self.action = action
        self.price = price
        self.quantity = quantity
        self.timestamp = timestamp
        self.total = price * quantity
    
    def to_dict(self) -> Dict:
        """转换为字典"""
        return {
            "ticker": self.ticker,
            "action": self.action,
            "price": self.price,
            "quantity": self.quantity,
            "total": self.total,
            "timestamp": self.timestamp.isoformat()
        }


class Position:
    """持仓"""
    def __init__(self, ticker: str, quantity: int, avg_price: float):
        """
        初始化持仓
        
        Args:
            ticker: 股票代码
            quantity: 持有数量
            avg_price: 平均买入价格
        """
        self.ticker = ticker
        self.quantity = quantity
        self.avg_price = avg_price
    
    def update(self, action: str, price: float, quantity: int) -> None:
        """
        更新持仓
        
        Args:
            action: 交易动作，buy 或 sell
            price: 交易价格
            quantity: 交易数量
        """
        if action == "buy":
            total_cost = self.avg_price * self.quantity + price * quantity
            self.quantity += quantity
            self.avg_price = total_cost / self.quantity
        elif action == "sell":
            self.quantity -= quantity
    
    def to_dict(self) -> Dict:
        """转换为字典"""
        return {
            "ticker": self.ticker,
            "quantity": self.quantity,
            "avg_price": self.avg_price
        }


class TradingManager:
    """交易管理器"""
    def __init__(self, initial_cash: float = 100000.0):
        """
        初始化交易管理器
        
        Args:
            initial_cash: 初始资金
        """
        self.cash = initial_cash
        self.positions: Dict[str, Position] = {}
        self.transactions: List[Transaction] = []
    
    def get_position(self, ticker: str) -> Optional[Position]:
        """
        获取持仓
        
        Args:
            ticker: 股票代码
        
        Returns:
            持仓对象，如果不存在则返回 None
        """
        return self.positions.get(ticker)
    
    def buy(self, ticker: str, price: float, quantity: int) -> Dict:
        """
        买入股票
        
        Args:
            ticker: 股票代码
            price: 买入价格
            quantity: 买入数量
        
        Returns:
            交易结果
        """
        total_cost = price * quantity
        
        if total_cost > self.cash:
            return {
                "success": False,
                "message": "资金不足",
                "needed": total_cost,
                "available": self.cash
            }
        
        # 更新资金
        self.cash -= total_cost
        
        # 更新持仓
        if ticker in self.positions:
            self.positions[ticker].update("buy", price, quantity)
        else:
            self.positions[ticker] = Position(ticker, quantity, price)
        
        # 记录交易
        transaction = Transaction(ticker, "buy", price, quantity, datetime.now())
        self.transactions.append(transaction)
        
        return {
            "success": True,
            "message": "买入成功",
            "transaction": transaction.to_dict()
        }
    
    def sell(self, ticker: str, price: float, quantity: int) -> Dict:
        """
        卖出股票
        
        Args:
            ticker: 股票代码
            price: 卖出价格
            quantity: 卖出数量
        
        Returns:
            交易结果
        """
        if ticker not in self.positions:
            return {
                "success": False,
                "message": "未持有该股票"
            }
        
        position = self.positions[ticker]
        if position.quantity < quantity:
            return {
                "success": False,
                "message": "持仓不足",
                "available": position.quantity,
                "requested": quantity
            }
        
        # 计算收益
        total_proceeds = price * quantity
        cost = position.avg_price * quantity
        profit = total_proceeds - cost
        
        # 更新资金
        self.cash += total_proceeds
        
        # 更新持仓
        position.update("sell", price, quantity)
        
        # 如果持仓为 0，删除该持仓
        if position.quantity == 0:
            del self.positions[ticker]
        
        # 记录交易
        transaction = Transaction(ticker, "sell", price, quantity, datetime.now())
        self.transactions.append(transaction)
        
        return {
            "success": True,
            "message": "卖出成功",
            "transaction": transaction.to_dict(),
            "profit": profit
        }
    
    def get_portfolio(self) -> Dict:
        """
        获取投资组合
        
        Returns:
            投资组合信息
        """
        positions = {ticker: pos.to_dict() for ticker, pos in self.positions.items()}
        total_value = self.cash + sum(pos.quantity * pos.avg_price for pos in self.positions.values())
        
        return {
            "cash": self.cash,
            "positions": positions,
            "total_value": total_value
        }
    
    def get_transactions(self) -> List[Dict]:
        """
        获取交易记录
        
        Returns:
            交易记录列表
        """
        return [tx.to_dict() for tx in self.transactions]
