import requests
import json
import os
import time
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8011")

try:
    from test_user_membership import TEST_USER
except ImportException:
    TEST_USER = {
        "username": "tester",
        "email": "test@example.com",
        "password": "Test123456",
        "phone": "13800138001"
    }

STOCK_LIST = [
    "600118",
]

DEPTHS = [1, 2, 3]

ANALYSTS = {
    "market_analyst": True,
    "fundamental_analyst": True,
    "news_analyst": True,
    "social_analyst": False
}

OUTPUT_FILE = "analyze_results.json"

MAX_POLL_ATTEMPTS = 120
POLL_INTERVAL_SECONDS = 2


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
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    all_results = []
    performance_stats = []

    for ticker in STOCK_LIST:
        print(f"\n测试股票: {ticker}")

        for depth in DEPTHS:
            print(f"\n  测试深度: {depth} ({'快速' if depth == 1 else '深度' if depth == 2 else '全面'})")
            
            request_body = {
                "ticker": ticker,
                "depth": depth,
                "market_analyst": ANALYSTS["market_analyst"],
                "fundamental_analyst": ANALYSTS["fundamental_analyst"],
                "news_analyst": ANALYSTS["news_analyst"],
                "social_analyst": ANALYSTS["social_analyst"],
                "sentiment_analysis": True,
                "risk_assessment": True
            }

            task_start_time = time.time()
            result = None
            error_msg = None

            try:
                print(f"  创建分析任务...")
                create_response = requests.post(analyze_url, headers=headers, json=request_body)
                
                if create_response.status_code != 200:
                    print(f"  创建任务失败: {create_response.status_code} {create_response.text}")
                    error_msg = f"创建任务失败: {create_response.status_code}"
                    elapsed_time = time.time() - task_start_time
                else:
                    task_data = create_response.json()
                    task_id = task_data.get("task_id")
                    print(f"  任务已创建: task_id={task_id}")
                    
                    print(f"  开始轮询任务状态...")
                    result, elapsed_time = poll_task_result(analyze_url, task_id, headers, task_start_time)
                    
            except Exception as e:
                error_msg = f"请求异常: {str(e)}"
                elapsed_time = time.time() - task_start_time
                print(f"  {error_msg}")

            depth_name = "快速" if depth == 1 else "深度" if depth == 2 else "全面"
            
            performance_stats.append({
                "ticker": ticker,
                "depth": depth,
                "depth_name": depth_name,
                "elapsed_time": elapsed_time,
                "status": "success" if result else "failed"
            })

            if result:
                result["test_info"] = {
                    "depth": depth,
                    "depth_name": depth_name,
                    "analysts": ANALYSTS,
                    "elapsed_time": elapsed_time
                }
                print(f"  分析完成: 信号={result.get('final_signal', 'N/A')}, 得分={result.get('ratings', {}).get('overall', 'N/A')}")
                print(f"  总耗时: {elapsed_time:.2f}秒")

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
                print(f"  分析失败: {error_msg}")
                all_results.append({
                    "ticker": ticker,
                    "test_info": {
                        "depth": depth,
                        "depth_name": depth_name,
                        "analysts": ANALYSTS
                    },
                    "error": error_msg,
                    "error_detail": None
                })

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)

    print(f"\n所有分析结果已保存到 {OUTPUT_FILE}")
    print(f"成功: {sum(1 for r in all_results if 'error' not in r)} 次")
    print(f"失败: {sum(1 for r in all_results if 'error' in r)} 次")

    print_performance_stats(performance_stats)


def poll_task_result(base_url: str, task_id: str, headers: dict, start_time: float):
    """轮询任务状态直到完成或失败"""
    poll_url = f"{base_url}/{task_id}"
    
    for attempt in range(MAX_POLL_ATTEMPTS):
        try:
            status_response = requests.get(poll_url, headers=headers)
            
            if status_response.status_code == 404:
                print(f"  任务不存在或无权访问")
                return None, time.time() - start_time
            
            if status_response.status_code != 200:
                print(f"  查询任务状态失败: {status_response.status_code}")
                return None, time.time() - start_time
            
            status_data = status_response.json()
            status = status_data.get("status")
            progress = status_data.get("progress", 0)
            progress_message = status_data.get("progress_message", "")
            
            elapsed = time.time() - start_time
            
            if status == "completed":
                print(f"  任务完成! (进度: {progress}%, 耗时: {elapsed:.2f}秒)")
                return status_data.get("result"), elapsed
            
            elif status == "failed":
                error = status_data.get("error", "未知错误")
                print(f"  任务失败: {error} (耗时: {elapsed:.2f}秒)")
                return None, elapsed
            
            elif status == "pending" or status == "processing":
                if attempt % 5 == 0 or progress >= 100:
                    print(f"  进度: {progress}% - {progress_message} ({elapsed:.1f}秒)")
                time.sleep(POLL_INTERVAL_SECONDS)
            
            else:
                print(f"  未知状态: {status}")
                return None, time.time() - start_time
                
        except requests.exceptions.RequestException as e:
            print(f"  轮询请求异常: {str(e)}")
            time.sleep(POLL_INTERVAL_SECONDS)
    
    print(f"  轮询超时 (超过{MAX_POLL_ATTEMPTS * POLL_INTERVAL_SECONDS}秒)")
    return None, time.time() - start_time


def print_performance_stats(performance_stats: list):
    """打印性能统计"""
    print(f"\n=== 性能统计 ===")
    if not performance_stats:
        print("没有性能数据")
        return
    
    success_stats = [s for s in performance_stats if s["status"] == "success"]
    
    print(f"总请求数: {len(performance_stats)}")
    print(f"成功: {len(success_stats)}")
    print(f"失败: {len(performance_stats) - len(success_stats)}")
    
    if success_stats:
        times = [s["elapsed_time"] for s in success_stats]
        avg_time = sum(times) / len(times)
        min_time = min(times)
        max_time = max(times)
        
        print(f"\n成功请求耗时:")
        print(f"  平均: {avg_time:.2f}秒")
        print(f"  最小: {min_time:.2f}秒")
        print(f"  最大: {max_time:.2f}秒")
        
        print(f"\n按分析深度统计:")
        for depth in [1, 2, 3]:
            depth_stats = [s for s in success_stats if s["depth"] == depth]
            if depth_stats:
                depth_name = "快速" if depth == 1 else "深度" if depth == 2 else "全面"
                depth_times = [s["elapsed_time"] for s in depth_stats]
                print(f"  深度{depth} ({depth_name}):")
                print(f"    次数: {len(depth_stats)}")
                print(f"    平均耗时: {sum(depth_times) / len(depth_times):.2f}秒")
                print(f"    最大耗时: {max(depth_times):.2f}秒")


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