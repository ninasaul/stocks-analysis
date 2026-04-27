import requests
import json
import os
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8011")

# 测试用户信息
TEST_USER = {
    "username": "tester",
    "email": "test@example.com",
    "password": "Test123456",
    "phone": "13800138001"
}

# 测试股票数据
TEST_STOCKS = [
    {
        "stock_code": "600118",
        "stock_name": "中国卫星",
        "exchange": "上证",
        "market": "A股",
        "ended_date": "2026-12-31"
    },
    {
        "stock_code": "000001",
        "stock_name": "平安银行",
        "exchange": "深证",
        "market": "A股",
        "ended_date": "2026-12-31"
    }
]


def get_token():
    """获取登录token"""
    login_url = f"{BASE_URL}/api/auth/login"
    login_data = {
        "username": TEST_USER["username"],
        "password": TEST_USER["password"]
    }

    print("登录获取token...")
    login_response = requests.post(login_url, data=login_data)
    if login_response.status_code != 200:
        print(f"登录失败: {login_response.status_code} {login_response.text}")
        return None

    token = login_response.json().get("access_token")
    if not token:
        print("获取token失败")
        return None

    print(f"获取token成功: {token[:20]}...")
    return token


def get_headers(token):
    """获取请求头"""
    return {"Authorization": f"Bearer {token}"}


def test_add_to_watchlist(headers):
    """测试添加股票到跟踪池"""
    print(f"\n=== 测试添加股票到跟踪池 ===")
    watchlist_url = f"{BASE_URL}/api/stocks/watchlist"

    for stock in TEST_STOCKS:
        print(f"\n添加股票: {stock['stock_code']} - {stock['stock_name']}")

        # 添加股票
        response = requests.post(watchlist_url, headers=headers, json=stock)
        print(f"  响应状态: {response.status_code}")

        if response.status_code == 200:
            result = response.json()
            print(f"  成功: {result.get('success')}")
            print(f"  消息: {result.get('message')}")
            if result.get('data'):
                data = result['data']
                print(f"  股票代码: {data.get('stock_code')}")
                print(f"  添加日期: {data.get('added_date')}")
                print(f"  结束日期: {data.get('ended_date')}")
        elif response.status_code == 400:
            result = response.json()
            print(f"  该股票已在跟踪池中: {result.get('detail')}")
        else:
            print(f"  添加失败: {response.text}")


def test_get_watchlist(headers):
    """测试获取跟踪池列表"""
    print(f"\n=== 测试获取跟踪池列表 ===")
    watchlist_url = f"{BASE_URL}/api/stocks/watchlist"

    response = requests.get(watchlist_url, headers=headers)
    print(f"响应状态: {response.status_code}")

    if response.status_code == 200:
        result = response.json()
        count = result.get("count", 0)
        stocks = result.get("stocks", [])

        print(f"跟踪池股票数量: {count}")

        if stocks:
            print(f"\n跟踪池中的股票:")
            for i, stock in enumerate(stocks, 1):
                print(f"  {i}. {stock.get('stock_code')} - {stock.get('stock_name')}")
                print(f"     交易所: {stock.get('exchange')}, 市场: {stock.get('market')}")
                print(f"     添加日期: {stock.get('added_date')}")
                print(f"     结束日期: {stock.get('ended_date')}")
        else:
            print("跟踪池为空")
    else:
        print(f"获取跟踪池失败: {response.text}")


def test_check_stock_exists(headers):
    """测试检查股票是否在跟踪池中"""
    print(f"\n=== 测试检查股票是否存在 ===")

    for stock in TEST_STOCKS:
        stock_code = stock['stock_code']
        check_url = f"{BASE_URL}/api/stocks/watchlist/{stock_code}/exists"

        response = requests.get(check_url, headers=headers)
        print(f"\n检查股票: {stock_code}")

        if response.status_code == 200:
            result = response.json()
            exists = result.get("exists", False)
            print(f"  是否存在: {exists}")

            if exists and result.get("stock"):
                stock_info = result["stock"]
                print(f"  股票信息:")
                print(f"    代码: {stock_info.get('stock_code')}")
                print(f"    名称: {stock_info.get('stock_name')}")
                print(f"    添加日期: {stock_info.get('added_date')}")
                print(f"    结束日期: {stock_info.get('ended_date')}")
        else:
            print(f"  检查失败: {response.text}")


def test_delete_from_watchlist(headers):
    """测试从跟踪池删除股票"""
    print(f"\n=== 测试从跟踪池删除股票 ===")

    # 删除第二只股票
    stock_to_delete = TEST_STOCKS[1]
    delete_url = f"{BASE_URL}/api/stocks/watchlist/{stock_to_delete['stock_code']}"

    print(f"删除股票: {stock_to_delete['stock_code']} - {stock_to_delete['stock_name']}")

    response = requests.delete(delete_url, headers=headers)
    print(f"响应状态: {response.status_code}")

    if response.status_code == 200:
        result = response.json()
        print(f"成功: {result.get('success')}")
        print(f"消息: {result.get('message')}")
    else:
        print(f"删除失败: {response.text}")

    # 验证删除是否成功
    print(f"\n验证删除结果:")
    check_url = f"{BASE_URL}/api/stocks/watchlist/{stock_to_delete['stock_code']}/exists"
    check_response = requests.get(check_url, headers=headers)
    if check_response.status_code == 200:
        check_result = check_response.json()
        print(f"  股票是否存在: {check_result.get('exists')}")


def test_add_with_ended_date(headers):
    """测试带结束日期添加股票"""
    print(f"\n=== 测试带结束日期添加股票 ===")
    watchlist_url = f"{BASE_URL}/api/stocks/watchlist"

    stock_with_ended = {
        "stock_code": "600519",
        "stock_name": "贵州茅台",
        "exchange": "上证",
        "market": "A股",
        "ended_date": "2026-12-31"
    }

    print(f"添加股票: {stock_with_ended['stock_code']} - {stock_with_ended['stock_name']}")
    print(f"结束日期: {stock_with_ended['ended_date']}")

    response = requests.post(watchlist_url, headers=headers, json=stock_with_ended)

    if response.status_code == 200:
        result = response.json()
        print(f"成功: {result.get('success')}")
        if result.get('data'):
            data = result['data']
            print(f"结束日期: {data.get('ended_date')}")
    elif response.status_code == 400:
        print(f"该股票已在跟踪池中")
    else:
        print(f"添加失败: {response.text}")


def main():
    """主函数"""
    print("=" * 60)
    print("股票跟踪池接口测试")
    print("=" * 60)

    # 获取登录token
    token = get_token()
    if not token:
        print("无法获取token，测试终止")
        return

    headers = get_headers(token)

    # 执行测试
    try:
        # 1. 测试获取跟踪池列表（初始状态）
        test_get_watchlist(headers)

        # 2. 测试添加股票到跟踪池
        test_add_to_watchlist(headers)

        # 3. 测试带结束日期添加股票
        test_add_with_ended_date(headers)

        # 4. 测试检查股票是否存在
        test_check_stock_exists(headers)

        # 5. 测试获取跟踪池列表（添加后）
        test_get_watchlist(headers)

        # 6. 测试删除股票
        test_delete_from_watchlist(headers)

        # 7. 最终获取跟踪池列表
        test_get_watchlist(headers)

        print("\n" + "=" * 60)
        print("测试完成！")
        print("=" * 60)

    except Exception as e:
        print(f"\n测试过程中出现错误: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()