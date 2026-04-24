import requests
import json
import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8011")

# 从test_user_membership.py导入测试用户信息
try:
    from test_user_membership import TEST_USER
except ImportError:
    # 如果导入失败，使用默认值
    TEST_USER = {
        "username": "tester",
        "email": "test@example.com",
        "password": "Test123456",
        "phone": "13800138000"
    }

# 股票列表
STOCK_LIST = [
    # "000858",  # 五粮液
    # "603773",  # 沃格光电
    "600118",  # 中国卫星
    "300308",  # 中际旭创
    "600396",  # 华电辽能
    "688089"   # 嘉必优
]

# 结果输出文件
OUTPUT_FILE = "analyze_results.json"

def test_analyze_api():
    """测试分析接口"""
    # 先登录获取token
    login_url = f"{BASE_URL}/api/auth/login"
    login_data = {
        "username": TEST_USER["username"],
        "password": TEST_USER["password"]
    }
    
    print("登录获取token...")
    # 使用表单数据发送登录请求
    login_response = requests.post(login_url, data=login_data)
    if login_response.status_code != 200:
        print(f"登录失败: {login_response.status_code} {login_response.text}")
        return
    
    token = login_response.json().get("access_token")
    if not token:
        print("获取token失败")
        return
    
    print(f"获取token成功: {token[:20]}...")
    
    # 测试分析接口
    analyze_url = f"{BASE_URL}/api/analyze"
    headers = {
        "Authorization": f"Bearer {token}"
    }
    
    # 清空输出文件
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("[")
    
    # 收集所有分析结果
    all_results = []
    
    # 遍历股票列表进行分析
    for ticker in STOCK_LIST:
        print(f"\n测试分析接口 - 股票: {ticker}...")
        params = {
            "ticker": ticker,
            "mode": "full"
        }
        
        analyze_response = requests.get(analyze_url, headers=headers, params=params)
        
        print(f"分析接口响应状态: {analyze_response.status_code}")
        if analyze_response.status_code == 200:
            result = analyze_response.json()
            print(f"分析结果已获取: {ticker}")
            all_results.append(result)
        else:
            print(f"分析接口失败: {analyze_response.text}")
            # 添加失败信息到结果列表
            all_results.append({
                "ticker": ticker,
                "error": f"分析失败: {analyze_response.status_code}",
                "error_detail": analyze_response.text
            })
    
    # 将所有结果写入文件
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    
    print(f"\n所有分析结果已保存到 {OUTPUT_FILE}")
    print(f"共分析 {len(STOCK_LIST)} 只股票，成功 {sum(1 for r in all_results if 'error' not in r)} 只")

if __name__ == "__main__":
    test_analyze_api()
