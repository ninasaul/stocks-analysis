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

# 测试股票列表
TEST_STOCKS = ["600118"]

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

def test_history_api(headers):
    """测试分析历史接口"""
    print(f"\n=== 测试分析历史接口 ===")
    history_url = f"{BASE_URL}/api/history"

    response = requests.get(history_url, headers=headers)
    print(f"响应状态: {response.status_code}")

    if response.status_code == 200:
        result = response.json()
        user_id = result.get("user_id")
        analysis_results = result.get("analysis_result", [])

        print(f"用户ID: {user_id}")
        print(f"历史分析记录数: {len(analysis_results)}")

        if analysis_results:
            print(f"\n最近的分析记录:")
            for i, record in enumerate(analysis_results[:3]):
                stock_info = record.get("stock_info", {})
                stock_code = stock_info.get("code", "N/A")
                stock_name = stock_info.get("name", "N/A")
                final_signal = record.get("final_signal", "N/A")
                final_score = record.get("final_score", "N/A")
                created_at = record.get("created_at", "N/A")

                token_usage = record.get("token_usage", {})
                print(f"  {i+1}. {stock_code} - {stock_name}")
                print(f"     信号: {final_signal}, 得分: {final_score}")
                print(f"     分析时间: {created_at}")
                if token_usage:
                    print(f"     Token总计: {token_usage.get('total', 0)}")
                else:
                    print(f"     Token总计: 无数据")
        else:
            print("没有历史分析记录")
    else:
        print(f"获取历史记录失败: {response.text}")

def test_report_api(headers):
    """测试分析报告接口"""
    print(f"\n=== 测试分析报告接口 ===")
    report_url = f"{BASE_URL}/api/report"

    formats = ["markdown", "pdf"]
    languages = ["中文", "English"]  # 测试不同语言

    # 确保报告保存目录存在
    report_dir = "reports"
    if not os.path.exists(report_dir):
        os.makedirs(report_dir)

    for ticker in TEST_STOCKS:
        print(f"\n测试股票: {ticker}")

        for format in formats:
            for language in languages:
                print(f"  测试格式: {format}, 语言: {language}")
                params = {
                    "ticker": ticker,
                    "format": format,
                    "report_language": language
                }

                response = requests.get(report_url, headers=headers, params=params)
                print(f"  响应状态: {response.status_code}")

                if response.status_code == 200:
                    # 检查是否是文件响应
                    content_type = response.headers.get("Content-Type", "")
                    if "text/markdown" in content_type:
                        # 直接保存Markdown文件
                        file_name = f"{report_dir}/{ticker}_{language}_{format}.md"
                        with open(file_name, "w", encoding="utf-8") as f:
                            f.write(response.text)
                        print(f"  报告保存成功: {file_name}")
                        print(f"  报告长度: {len(response.text)} 字符")
                    elif "application/pdf" in content_type:
                        # 保存PDF文件
                        file_name = f"{report_dir}/{ticker}_{language}_{format}.pdf"
                        with open(file_name, "wb") as f:
                            f.write(response.content)
                        print(f"  报告保存成功: {file_name}")
                        print(f"  PDF文件大小: {len(response.content)} 字节")
                    else:
                        # 尝试处理JSON响应（旧格式或错误响应）
                        try:
                            result = response.json()
                            if "error" in result:
                                print(f"  报告生成失败: {result['error']}")
                            else:
                                report_content = result.get("report", "")
                                # 保存为文件
                                file_name = f"{report_dir}/{ticker}_{language}_{format}.md"
                                with open(file_name, "w", encoding="utf-8") as f:
                                    f.write(report_content)
                                print(f"  报告保存成功: {file_name}")
                                print(f"  报告长度: {len(report_content)} 字符")
                        except json.JSONDecodeError:
                            # 不是JSON响应，可能是其他类型的文件
                            print(f"  未知响应格式，保存为原始文件")
                            file_name = f"{report_dir}/{ticker}_{language}_{format}.bin"
                            with open(file_name, "wb") as f:
                                f.write(response.content)
                            print(f"  报告保存成功: {file_name}")
                            print(f"  文件大小: {len(response.content)} 字节")
                else:
                    print(f"  报告生成失败: {response.text}")

    print(f"\n所有报告已保存到 {report_dir} 目录")

def main():
    """主测试函数"""
    print("=== 开始测试报告和历史接口 ===")
    
    # 获取token
    token = get_token()
    if not token:
        return
    
    # 构建请求头
    headers = {
        "Authorization": f"Bearer {token}"
    }
    
    # 测试历史接口
    test_history_api(headers)
    
    # 测试报告接口
    test_report_api(headers)
    
    print("\n=== 测试完成 ===")

if __name__ == "__main__":
    main()
