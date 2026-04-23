import requests
import json
import sys
import os
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8011")

TEST_USER = {
    "username": "tester",
    "password": "Test123456"
}

def get_access_token():
    """获取访问令牌"""
    url = f"{BASE_URL}/api/auth/login"
    response = requests.post(url, data=TEST_USER)
    if response.status_code == 200:
        return response.json()["access_token"]
    else:
        raise Exception(f"登录失败: {response.text}")

# 测试股票代码列表
tickers = ["300308"] # "600519", "000002", "300750", "688256", 
# API 接口 URL
base_url = f"{BASE_URL}/api/analyze"

# 可选：指定LLM提供商
provider = "aliyun"  # 可以是 "aliyun" 或 "deepseek"

print(f"开始测试 /api/analyze 接口 (提供商: {provider})...\n")

access_token = get_access_token()
headers = {"Authorization": f"Bearer {access_token}"}

for ticker in tickers:
    # 构建请求参数
    params = {
        "ticker": ticker,
        "mode": "full"
    }

    print(f"测试股票: {ticker}")
    print("-" * 50)

    try:
        # 发送 GET 请求
        response = requests.get(base_url, params=params, headers=headers)

        # 检查响应状态码
        if response.status_code == 200:
            # 解析响应数据
            data = response.json()

            # 打印测试结果
            print(f"响应状态: 成功")
            print(f"响应内容: {json.dumps(data, ensure_ascii=False, indent=2)}")
            print(f"股票代码: {data.get('ticker')}")
            print(f"股票名称: {data.get('name')}")

            if "timing" in data:
                timing = data["timing"]
                print(f"综合得分: {timing.get('composite')}")
                print(f"交易信号: {timing.get('signal')}")

                # 打印各个指标得分
                print("\n指标得分:")
                for key, value in timing.items():
                    if key not in ["composite", "signal", "price_range", "error"]:
                        print(f"  {key}: {value}")

                # 打印价格区间（如果有）
                if "price_range" in timing:
                    price_range = timing["price_range"]
                    print("\n价格区间:")
                    print(f"  当前价格: {price_range.get('current_price')}")
                    if "buy_range" in price_range:
                        print(f"  买入区间: {price_range['buy_range']['low']} - {price_range['buy_range']['high']}")
                    if "sell_range" in price_range:
                        print(f"  卖出区间: {price_range['sell_range']['low']} - {price_range['sell_range']['high']}")
        else:
            print(f"响应状态: 失败 (状态码: {response.status_code})")
            print(f"响应内容: {response.text}")
    except Exception as e:
        print(f"测试失败: {str(e)}")

    print("-" * 50)
    print()

print("测试完成!")