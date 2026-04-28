import requests
import json
import os
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8011")

try:
    from test_user_membership import TEST_USER
except ImportError:
    TEST_USER = {
        "username": "tester",
        "email": "test@example.com",
        "password": "Test123456",
        "phone": "13800138001"
    }

STOCK_LIST = [
    "600118",
]

DEPTHS = [2] # 1, 2, 3

ANALYSTS = {
    "market_analyst": True,
    "fundamental_analyst": True,
    "news_analyst": True,
    "social_analyst": False
}

OUTPUT_FILE = "analyze_results.json"

def test_analyze_api():
    login_url = f"{BASE_URL}/api/auth/login"
    login_data = {
        "username": TEST_USER["username"],
        "password": TEST_USER["password"]
    }

    print("登录获取token...")
    login_response = requests.post(login_url, data=login_data)
    if login_response.status_code != 200:
        print(f"登录失败: {login_response.status_code} {login_response.text}")
        return

    token = login_response.json().get("access_token")
    if not token:
        print("获取token失败")
        return

    print(f"获取token成功: {token[:20]}...")

    analyze_url = f"{BASE_URL}/api/analyze"
    headers = {
        "Authorization": f"Bearer {token}"
    }

    all_results = []

    for ticker in STOCK_LIST:
        print(f"\n测试股票: {ticker}")

        for depth in DEPTHS:
            print(f"\n  测试深度: {depth} ({'快速' if depth == 1 else '深度' if depth == 2 else '全面'})")
            params = {
                "ticker": ticker,
                "depth": depth,
                "market_analyst": ANALYSTS["market_analyst"],
                "fundamental_analyst": ANALYSTS["fundamental_analyst"],
                "news_analyst": ANALYSTS["news_analyst"],
                "social_analyst": ANALYSTS["social_analyst"]
            }

            analyze_response = requests.get(analyze_url, headers=headers, params=params)

            print(f"  响应状态: {analyze_response.status_code}")
            if analyze_response.status_code == 200:
                result = analyze_response.json()
                result["test_info"] = {
                    "depth": depth,
                    "depth_name": "快速" if depth == 1 else "深度" if depth == 2 else "全面",
                    "analysts": ANALYSTS
                }
                print(f"  分析完成: 信号={result.get('final_signal', 'N/A')}, 得分={result.get('ratings', {}).get('overall', 'N/A')}")

                token_usage = result.get("token_usage", {})
                if token_usage:
                    print(f"  Token消耗:")
                    print(f"    - 市场分析师: {token_usage.get('market_analyst', 0)}")
                    print(f"    - 基本面分析师: {token_usage.get('fundamental_analyst', 0)}")
                    print(f"    - 新闻分析师: {token_usage.get('news_analyst', 0)}")
                    print(f"    - 多空辩论: {token_usage.get('debate', 0)}")
                    print(f"    - 反思分析: {token_usage.get('reflection', 0)}")
                    print(f"    - 目标价格: {token_usage.get('target_price', 0)}")
                    print(f"    - 总计: {token_usage.get('total', 0)}")

                    if result.get('errors'):
                        print(f"  错误信息: {result.get('errors')}")
                else:
                    print(f"  Token消耗: 无数据")

                all_results.append(result)
            else:
                print(f"  分析失败: {analyze_response.text}")
                all_results.append({
                    "ticker": ticker,
                    "test_info": {
                        "depth": depth,
                        "depth_name": "快速" if depth == 1 else "深度" if depth == 2 else "全面",
                        "analysts": ANALYSTS
                    },
                    "error": f"分析失败: {analyze_response.status_code}",
                    "error_detail": analyze_response.text
                })

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)

    print(f"\n所有分析结果已保存到 {OUTPUT_FILE}")
    print(f"成功: {sum(1 for r in all_results if 'error' not in r)} 次")
    print(f"失败: {sum(1 for r in all_results if 'error' in r)} 次")

    # 测试其他接口
    # print(f"\n************************************")
    # test_get_analyzed_stocks(token)
    # print(f"\n************************************")
    # test_delete_analyzed_stock(token, STOCK_LIST[0])

def test_get_analyzed_stocks(token):
    """测试获取用户分析过的股票列表"""
    print(f"\n=== 测试获取分析过的股票列表 ===")
    analyzed_url = f"{BASE_URL}/api/stocks/analyzed"
    headers = {
        "Authorization": f"Bearer {token}"
    }

    response = requests.get(analyzed_url, headers=headers)
    print(f"响应状态: {response.status_code}")

    if response.status_code == 200:
        result = response.json()
        count = result.get("count", 0)
        stocks = result.get("stocks", [])

        print(f"分析过的股票数量: {count}")

        if stocks:
            print(f"\n分析过的股票:")
            for i, stock in enumerate(stocks, 1):
                print(f"  {i}. {stock.get('code')} - {stock.get('name')}")
                print(f"     最后分析时间: {stock.get('last_analyzed_at')}")
        else:
            print("没有分析过的股票")
    else:
        print(f"获取分析过的股票失败: {response.text}")

def test_delete_analyzed_stock(token, ticker):
    """测试删除分析过的股票记录"""
    print(f"\n=== 测试删除分析记录 ===")
    delete_url = f"{BASE_URL}/api/stocks/analyzed/{ticker}"
    headers = {
        "Authorization": f"Bearer {token}"
    }

    print(f"删除股票 {ticker} 的分析记录")
    response = requests.delete(delete_url, headers=headers)
    print(f"响应状态: {response.status_code}")

    if response.status_code == 200:
        result = response.json()
        print(f"成功: {result.get('success')}")
        print(f"消息: {result.get('message')}")
    else:
        print(f"删除失败: {response.text}")

    # 验证删除结果
    print(f"\n验证删除结果:")
    analyzed_url = f"{BASE_URL}/api/stocks/analyzed"
    verify_response = requests.get(analyzed_url, headers=headers)
    if verify_response.status_code == 200:
        result = verify_response.json()
        stocks = result.get("stocks", [])
        deleted = not any(stock.get('code') == ticker for stock in stocks)
        print(f"  股票 {ticker} 是否已删除: {deleted}")
    else:
        print(f"  验证失败: {verify_response.text}")

if __name__ == "__main__":
    test_analyze_api()