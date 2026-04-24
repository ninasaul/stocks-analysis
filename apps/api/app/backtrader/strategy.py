"""
BackTrader 策略模块
存放所有回测策略类
"""

import backtrader as bt


class Strategy1(bt.Strategy):
    """策略1：均线交叉策略 - 20日SMA"""
    params = (
        ("maperiod", 20),
        ("result_container", None),
        ("benchmark_dfs", None),
    )

    def __init__(self):
        self.data_close = self.datas[0].close
        self.order = None
        self.sma = bt.indicators.SimpleMovingAverage(
            self.datas[0], period=self.params.maperiod
        )

    def next(self):
        self._record_daily_value()
        if self.order:
            return
        if not self.position:
            if self.data_close[0] > self.sma[0]:
                size = int(self.broker.getcash() / self.data_close[0])
                if size > 0:
                    self.order = self.buy(size=size)
        else:
            if self.data_close[0] < self.sma[0]:
                self.order = self.sell(size=self.position.size)

    def _record_daily_value(self):
        if self.params.result_container and self.params.benchmark_dfs is not None:
            current_date = self.datas[0].datetime.date(0)
            portfolio_value = self.broker.getvalue()
            benchmark_values = {}
            for name, df in self.params.benchmark_dfs.items():
                date_str = str(current_date)
                if date_str in df.index:
                    benchmark_values[name] = df.loc[date_str, 'close']
                else:
                    benchmark_values[name] = 0
            self.params.result_container.add_day(
                current_date, portfolio_value, benchmark_values
            )

    def notify_order(self, order):
        self.order = None


class Strategy2(bt.Strategy):
    """策略2：突破布林上轨开仓，回到上轨内平仓"""
    params = (
        ("period", 20),
        ("devfactor", 2.0),
        ("result_container", None),
        ("benchmark_dfs", None),
    )

    def __init__(self):
        self.data_close = self.datas[0].close
        self.order = None
        self.boll = bt.indicators.BollingerBands(
            self.datas[0], period=self.params.period, devfactor=self.params.devfactor
        )
        self.upper = self.boll.lines.top
        self.lower = self.boll.lines.bot
        self.mid = self.boll.lines.mid

    def next(self):
        self._record_daily_value()
        if self.order:
            return
        if not self.position:
            if self.data_close[0] > self.upper[0]:
                size = int(self.broker.getcash() / self.data_close[0])
                if size > 0:
                    self.order = self.buy(size=size)
        else:
            if self.data_close[0] <= self.upper[0]:
                self.order = self.sell(size=self.position.size)

    def _record_daily_value(self):
        if self.params.result_container and self.params.benchmark_dfs is not None:
            current_date = self.datas[0].datetime.date(0)
            portfolio_value = self.broker.getvalue()
            benchmark_values = {}
            for name, df in self.params.benchmark_dfs.items():
                date_str = str(current_date)
                if date_str in df.index:
                    benchmark_values[name] = df.loc[date_str, 'close']
                else:
                    benchmark_values[name] = 0
            self.params.result_container.add_day(
                current_date, portfolio_value, benchmark_values
            )

    def notify_order(self, order):
        self.order = None


class Strategy3(bt.Strategy):
    """策略3：MACD金叉开仓，回归平仓"""
    params = (
        ("fast", 12),
        ("slow", 26),
        ("signal", 9),
        ("result_container", None),
        ("benchmark_dfs", None),
    )

    def __init__(self):
        self.data_close = self.datas[0].close
        self.order = None
        self.macd = bt.indicators.MACD(
            self.datas[0],
            period_me1=self.params.fast,
            period_me2=self.params.slow,
            period_signal=self.params.signal
        )
        self.macd_line = self.macd.lines.macd
        self.signal_line = self.macd.lines.signal

    def next(self):
        self._record_daily_value()
        if self.order:
            return
        if not self.position:
            if self.macd_line[0] > self.signal_line[0] and self.macd_line[-1] <= self.signal_line[-1]:
                size = int(self.broker.getcash() / self.data_close[0])
                if size > 0:
                    self.order = self.buy(size=size)
        else:
            if self.macd_line[0] < self.signal_line[0] and self.macd_line[-1] >= self.signal_line[-1]:
                self.order = self.sell(size=self.position.size)

    def _record_daily_value(self):
        if self.params.result_container and self.params.benchmark_dfs is not None:
            current_date = self.datas[0].datetime.date(0)
            portfolio_value = self.broker.getvalue()
            benchmark_values = {}
            for name, df in self.params.benchmark_dfs.items():
                date_str = str(current_date)
                if date_str in df.index:
                    benchmark_values[name] = df.loc[date_str, 'close']
                else:
                    benchmark_values[name] = 0
            self.params.result_container.add_day(
                current_date, portfolio_value, benchmark_values
            )

    def notify_order(self, order):
        self.order = None


class Strategy4(bt.Strategy):
    """策略4：RSI超买开仓，回归平仓"""
    params = (
        ("period", 14),
        ("overbought", 70),
        ("oversold", 30),
        ("result_container", None),
        ("benchmark_dfs", None),
    )

    def __init__(self):
        self.data_close = self.datas[0].close
        self.order = None
        self.rsi = bt.indicators.RSI(
            self.datas[0], period=self.params.period
        )

    def next(self):
        self._record_daily_value()
        if self.order:
            return
        if not self.position:
            if self.rsi[0] > self.params.overbought:
                size = int(self.broker.getcash() / self.data_close[0])
                if size > 0:
                    self.order = self.buy(size=size)
        else:
            if self.rsi[0] <= self.params.overbought:
                self.order = self.sell(size=self.position.size)

    def _record_daily_value(self):
        if self.params.result_container and self.params.benchmark_dfs is not None:
            current_date = self.datas[0].datetime.date(0)
            portfolio_value = self.broker.getvalue()
            benchmark_values = {}
            for name, df in self.params.benchmark_dfs.items():
                date_str = str(current_date)
                if date_str in df.index:
                    benchmark_values[name] = df.loc[date_str, 'close']
                else:
                    benchmark_values[name] = 0
            self.params.result_container.add_day(
                current_date, portfolio_value, benchmark_values
            )

    def notify_order(self, order):
        self.order = None
