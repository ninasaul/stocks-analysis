"""新闻分析师模块 - 负责新闻事件分析和市场情绪评估"""
from typing import Dict, Any, Optional, List
from .base_analyst import BaseAnalyst
from .depth_config import (
    get_max_news_count_for_depth,
    AnalystDepth
)
from .prompts import get_analyst_prompt
from ..core.logging import logger


class NewsAnalyst(BaseAnalyst):
    """新闻分析师 - 负责新闻事件分析和市场情绪评估，继承自BaseAnalyst支持深度控制"""

    def __init__(self):
        """初始化新闻分析师"""
        super().__init__("NewsAnalyst")
        self.max_tool_calls = 3

    async def analyze(
        self,
        ticker: str,
        stock_name: str,
        depth: int = 1,
        llm=None,
        market: str = "A股",
        **kwargs
    ) -> Dict[str, Any]:
        """
        执行新闻分析

        Args:
            ticker: 股票代码
            stock_name: 股票名称
            depth: 分析深度 (1-3)
            llm: LLM客户端（可选）
            market: 市场类型（A股、港股、美股）
            **kwargs: 其他参数

        Returns:
            新闻分析结果，包含新闻事件分析和市场情绪评估
        """
        self.tool_call_count = 0
        logger.info(f"📰 [{self.name}] 开始分析 {stock_name}({ticker})，深度={depth} ({self._get_depth_chinese_name(depth)})")

        try:
            max_news = self.get_max_news_count(depth)
            logger.debug(f"[{self.name}] 深度{depth}允许的最大新闻数量: {max_news}")

            result = await self._perform_news_analysis(ticker, stock_name, depth, llm, market, max_news)
            logger.info(f"✅ [{self.name}] {stock_name}({ticker}) 分析完成，情绪={result.get('sentiment', 'N/A')}")
            return result
        except Exception as e:
            logger.error(f"❌ [{self.name}] {stock_name}({ticker}) 分析失败: {e}")
            return self._create_error_result(f"新闻分析失败: {str(e)}")

    async def _perform_news_analysis(
        self,
        ticker: str,
        stock_name: str,
        depth: int,
        llm=None,
        market: str = "A股",
        max_news: int = 10
    ) -> Dict[str, Any]:
        """
        执行新闻分析

        Args:
            ticker: 股票代码
            stock_name: 股票名称
            depth: 分析深度
            llm: LLM客户端
            market: 市场类型
            max_news: 最大新闻数量

        Returns:
            新闻分析结果
        """
        news_data = self._fetch_news(ticker, stock_name, max_news)

        if not news_data or len(news_data) == 0:
            return {
                "error": "暂无新闻数据",
                "news_report": "暂无相关新闻数据",
                "sentiment": "中性",
                "sentiment_score": 0,
                "news_list": [],
                "key_events": [],
                "market_impact": "无法评估",
                "analysis_depth": depth,
                "depth_name": self._get_depth_chinese_name(depth)
            }

        sentiment, sentiment_score = self._analyze_sentiment(news_data)
        key_events = self._extract_key_events(news_data)
        market_impact = self._evaluate_market_impact(news_data, sentiment)

        news_report = self._generate_news_report(
            ticker, stock_name, news_data, sentiment, sentiment_score,
            key_events, market_impact, depth
        )

        result = {
            "news_report": news_report,
            "sentiment": sentiment,
            "sentiment_score": sentiment_score,
            "news_list": news_data,
            "key_events": key_events,
            "market_impact": market_impact,
            "analysis_depth": depth,
            "depth_name": self._get_depth_chinese_name(depth),
            "max_news_count": max_news
        }

        if self.should_enable_sentiment_analysis(depth):
            result["sentiment_analysis"] = self._detailed_sentiment_analysis(news_data)

        if self.should_enable_risk_assessment(depth):
            result["risk_assessment"] = self._assess_news_risk(news_data, sentiment, market_impact)

        if self.should_use_llm(depth) and llm:
            try:
                llm_analysis = await self._generate_llm_news_analysis(
                    ticker, stock_name, news_data, sentiment, sentiment_score, depth, llm
                )
                result["llm_analysis"] = llm_analysis
            except Exception as e:
                logger.warning(f"[{self.name}] LLM分析失败: {e}")

        return result

    def _detailed_sentiment_analysis(self, news_data: List[Dict]) -> Dict[str, Any]:
        """
        执行详细情绪分析

        Args:
            news_data: 新闻数据列表

        Returns:
            详细情绪分析结果
        """
        positive_count = sum(1 for n in news_data if "正" in n.get("sentiment", ""))
        negative_count = sum(1 for n in news_data if "负" in n.get("sentiment", ""))
        neutral_count = len(news_data) - positive_count - negative_count

        high_impact_positive = sum(1 for n in news_data if n.get("impact") == "高" and "正" in n.get("sentiment", ""))
        high_impact_negative = sum(1 for n in news_data if n.get("impact") == "高" and "负" in n.get("sentiment", ""))

        return {
            "positive_count": positive_count,
            "negative_count": negative_count,
            "neutral_count": neutral_count,
            "high_impact_positive": high_impact_positive,
            "high_impact_negative": high_impact_negative,
            "positive_ratio": positive_count / len(news_data) if news_data else 0,
            "negative_ratio": negative_count / len(news_data) if news_data else 0
        }

    def _assess_news_risk(self, news_data: List[Dict], sentiment: str, market_impact: str) -> Dict[str, Any]:
        """
        评估新闻风险

        Args:
            news_data: 新闻数据列表
            sentiment: 市场情绪
            market_impact: 市场影响

        Returns:
            风险评估结果
        """
        risk_level = "低"
        risk_factors = []

        if market_impact in ["重大利空", "短期利空"]:
            risk_level = "高"
            risk_factors.append("负面市场影响")
        elif market_impact == "偏利空":
            risk_level = "中"
            risk_factors.append("偏负面市场影响")

        if sentiment == "悲观":
            risk_level = "高" if risk_level == "高" else "中"
            risk_factors.append("悲观情绪")

        negative_news_with_high_impact = [
            n for n in news_data
            if n.get("impact") == "高" and "负" in n.get("sentiment", "")
        ]
        if negative_news_with_high_impact:
            risk_level = "高"
            risk_factors.append(f"存在{len(negative_news_with_high_impact)}条高影响力负面新闻")

        return {
            "risk_level": risk_level,
            "risk_factors": risk_factors
        }

    def _fetch_news(self, ticker: str, stock_name: str, max_news: int = 10) -> List[Dict]:
        """
        获取新闻数据

        Args:
            ticker: 股票代码
            stock_name: 股票名称
            max_news: 最大新闻数量

        Returns:
            新闻列表
        """
        logger.info(f"[{self.name}] 获取新闻数据: {ticker}, 最大数量: {max_news}")

        mock_news = [
            {
                "title": f"{stock_name} 发布年度财报",
                "date": "2024-01-15",
                "source": "财经网",
                "summary": f"{stock_name}发布了年度财务报告，营收和利润均实现同比增长",
                "sentiment": "正面",
                "impact": "高"
            },
            {
                "title": f"{stock_name} 宣布战略合作",
                "date": "2024-01-10",
                "source": "证券时报",
                "summary": f"{stock_name}与某知名企业签署战略合作协议，共同开拓新市场",
                "sentiment": "正面",
                "impact": "中"
            },
            {
                "title": f"监管政策对{stock_name}所在行业影响分析",
                "date": "2024-01-08",
                "source": "中国证券报",
                "summary": "行业分析师认为新政策将有利于行业龙头企业",
                "sentiment": "正面",
                "impact": "中"
            },
            {
                "title": f"{stock_name} 召开投资者交流会",
                "date": "2024-01-05",
                "source": "投资者关系网",
                "summary": f"{stock_name}管理层与投资者进行交流，透露未来发展战略",
                "sentiment": "正面",
                "impact": "低"
            },
            {
                "title": f"券商上调{stock_name}目标价",
                "date": "2024-01-03",
                "source": "券商研究报告",
                "summary": "某券商发布研报，上调目标价并维持买入评级",
                "sentiment": "正面",
                "impact": "中"
            }
        ]

        return mock_news[:max_news]

    def _analyze_sentiment(self, news_data: List[Dict]) -> tuple:
        """
        分析市场情绪

        Args:
            news_data: 新闻数据列表

        Returns:
            (情绪描述, 情绪分数) 元组
        """
        if not news_data:
            return "中性", 0

        positive_count = 0
        negative_count = 0
        neutral_count = 0

        for news in news_data:
            sentiment = news.get("sentiment", "中性")
            if "正" in sentiment:
                positive_count += 1
            elif "负" in sentiment:
                negative_count += 1
            else:
                neutral_count += 1

        total = len(news_data)
        sentiment_score = ((positive_count - negative_count) / total) * 50 + 50

        if sentiment_score >= 70:
            return "乐观", sentiment_score
        elif sentiment_score >= 55:
            return "偏乐观", sentiment_score
        elif sentiment_score >= 45:
            return "中性", sentiment_score
        elif sentiment_score >= 30:
            return "偏悲观", sentiment_score
        else:
            return "悲观", sentiment_score

    def _extract_key_events(self, news_data: List[Dict]) -> List[Dict]:
        """
        提取关键事件

        Args:
            news_data: 新闻数据列表

        Returns:
            关键事件列表
        """
        key_events = []
        for news in news_data:
            impact = news.get("impact", "低")
            if impact == "高":
                key_events.append({
                    "title": news.get("title", ""),
                    "date": news.get("date", ""),
                    "summary": news.get("summary", ""),
                    "sentiment": news.get("sentiment", "中性"),
                    "impact": impact
                })

        return key_events

    def _evaluate_market_impact(self, news_data: List[Dict], sentiment: str) -> str:
        """
        评估市场影响

        Args:
            news_data: 新闻数据列表
            sentiment: 市场情绪

        Returns:
            市场影响评估
        """
        high_impact_positive = 0
        high_impact_negative = 0

        for news in news_data:
            impact = news.get("impact", "低")
            sentiment_val = news.get("sentiment", "中性")

            if impact == "高":
                if "正" in sentiment_val:
                    high_impact_positive += 1
                elif "负" in sentiment_val:
                    high_impact_negative += 1

        if high_impact_positive >= 2:
            return "重大利好"
        elif high_impact_negative >= 2:
            return "重大利空"
        elif high_impact_positive == 1 and high_impact_negative == 0:
            return "短期利好"
        elif high_impact_negative == 1 and high_impact_positive == 0:
            return "短期利空"
        elif sentiment == "乐观":
            return "偏利好"
        elif sentiment == "悲观":
            return "偏利空"
        else:
            return "中性"

    async def _generate_llm_news_analysis(
        self,
        ticker: str,
        stock_name: str,
        news_data: List[Dict],
        sentiment: str,
        sentiment_score: float,
        depth: int,
        llm
    ) -> str:
        """
        使用LLM生成新闻分析

        Args:
            ticker: 股票代码
            stock_name: 股票名称
            news_data: 新闻数据列表
            sentiment: 市场情绪
            sentiment_score: 情绪分数
            depth: 分析深度
            llm: LLM客户端

        Returns:
            LLM生成的新闻分析文本
        """
        if not llm:
            return ""

        # 获取基于深度的提示词
        prompt_template = get_analyst_prompt("news", depth)
        prompt = prompt_template.format(
            ticker=ticker,
            stock_name=stock_name
        )

        # 添加新闻数据
        news_summary = "\n".join([
            f"- [{news.get('date', '')}] {news.get('title', '')} ({news.get('sentiment', '')})"
            for news in news_data[:self.get_max_news_count(depth)]
        ])

        prompt += f"\n\n市场情绪：{sentiment}（分数：{sentiment_score:.2f}）\n"
        prompt += f"\n近期新闻：\n{news_summary}\n"
        prompt += "\n请基于以上新闻数据提供专业的新闻分析。\n"
        try:
            response = await llm.chat(prompt)
            return response
        except Exception as e:
            logger.error(f"[{self.name}] LLM分析调用失败: {e}")
            return ""

    def _generate_news_report(
        self,
        ticker: str,
        stock_name: str,
        news_data: List[Dict],
        sentiment: str,
        sentiment_score: float,
        key_events: List[Dict],
        market_impact: str,
        depth: int
    ) -> str:
        """
        生成新闻分析报告

        Args:
            ticker: 股票代码
            stock_name: 股票名称
            news_data: 新闻数据列表
            sentiment: 市场情绪
            sentiment_score: 情绪分数
            key_events: 关键事件列表
            market_impact: 市场影响
            depth: 分析深度

        Returns:
            新闻分析报告文本
        """
        depth_desc = self._get_depth_description(depth)

        report = f"""# {stock_name}（{ticker}）新闻分析报告
**分析深度：{depth_desc}**
**新闻数量：{len(news_data)}条**

---

## 一、市场情绪概述

| 指标 | 数值 |
|------|------|
| 情绪方向 | {sentiment} |
| 情绪分数 | {sentiment_score:.2f}/100 |
| 新闻数量 | {len(news_data)}条 |
| 市场影响 | {market_impact} |

---

## 二、关键事件分析

"""

        if key_events:
            for i, event in enumerate(key_events, 1):
                report += f"""### {i}. {event['title']}
- **日期**：{event['date']}
- **摘要**：{event['summary']}
- **情绪**：{event['sentiment']}
- **影响程度**：{event['impact']}

"""
        else:
            report += "暂无高影响力事件\n\n"

        report += """## 三、新闻列表

| 日期 | 标题 | 来源 | 情绪 | 影响 |
|------|------|------|------|------|
"""

        display_count = min(depth * 3, len(news_data))
        for news in news_data[:display_count]:
            report += f"| {news.get('date', '')} | {news.get('title', '')} | {news.get('source', '')} | {news.get('sentiment', '')} | {news.get('impact', '')} |\n"

        if depth >= 4:
            report += """

---

## 四、深度新闻分析（高级）

"""
            if self.should_enable_risk_assessment(depth):
                risk = self._assess_news_risk(news_data, sentiment, market_impact)
                report += f"""### 风险评估
- 风险等级：{risk['risk_level']}
- 风险因素：{', '.join(risk['risk_factors']) if risk['risk_factors'] else '无明显风险'}

"""

            report += """### 行业政策影响
"""
            policy_news = [n for n in news_data if "政策" in n.get("title", "") or "监管" in n.get("title", "")]
            if policy_news:
                report += "近期政策相关新闻分析：\n"
                for news in policy_news:
                    report += f"- {news.get('title')}: {news.get('summary')}\n"
            else:
                report += "暂无明显的政策相关新闻\n"

            report += """

### 竞争对手动态
"""
            competitor_news = [n for n in news_data if "竞争" in n.get("title", "") or "对手" in n.get("title", "")]
            if competitor_news:
                report += "竞争对手相关新闻分析：\n"
                for news in competitor_news:
                    report += f"- {news.get('title')}: {news.get('summary')}\n"
            else:
                report += "暂无明显的竞争对手相关新闻\n"

        if depth >= 3:
            report += f"""

---

## 五、新闻情绪评估

**整体情绪**：{sentiment}
**情绪分数**：{sentiment_score:.2f}/100
**市场影响**：{market_impact}

"""
            if sentiment in ["乐观", "偏乐观"]:
                report += "近期新闻整体偏正面，建议关注积极信号的持续性。\n"
            elif sentiment in ["悲观", "偏悲观"]:
                report += "近期新闻整体偏负面，建议关注负面因素的边际变化。\n"
            else:
                report += "近期新闻整体中性，建议观望等待更多信息。\n"

        if depth == 5:
            report += """

---

## 六、投资建议

### 短期操作建议
"""
            if market_impact in ["重大利好", "短期利好"]:
                report += "- 情绪面偏多，可适当关注\n"
            elif market_impact in ["重大利空", "短期利空"]:
                report += "- 情绪面偏空，建议谨慎\n"
            else:
                report += "- 情绪面中性，建议观望\n"

            report += """
### 风险提示
- 新闻分析仅供参考，不构成投资建议
- 市场有风险，投资需谨慎
- 建议结合技术面和基本面做出投资决策
"""

        return report
