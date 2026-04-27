#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试 /api/dialogue/stream 接口的脚本

使用方法:
    python test_stream_api.py

功能:
    自动进行两次对话测试，使用同一个session_id保持会话连续性
"""

import requests
import time
import json
import os
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8011")

TEST_USER = {
    "username": "tester",
    "password": "Test123456"
}

def register_user():
    """注册测试用户"""
    url = f"{BASE_URL}/api/auth/register"
    user_data = {
        "username": TEST_USER["username"],
        "password": TEST_USER["password"],
        "email": f"{TEST_USER['username']}@example.com"
    }
    response = requests.post(url, json=user_data)
    if response.status_code in [200, 201] or "已存在" in response.text:
        return True
    else:
        print(f"注册失败: {response.text}")
        return False

def get_access_token():
    """获取访问令牌"""
    # 先尝试注册用户
    register_user()
    
    url = f"{BASE_URL}/api/auth/login"
    response = requests.post(url, data=TEST_USER)
    if response.status_code == 200:
        return response.json()["access_token"]
    else:
        raise Exception(f"登录失败: {response.text}")


def test_stream_api(message, session_id, mode="prompt"):
    """
    测试流式对话接口

    Args:
        message: 用户消息
        session_id: 会话ID
        mode: 对话模式: prompt(有提示词) 或 direct(无提示词)
    """
    access_token = get_access_token()
    headers = {"Authorization": f"Bearer {access_token}"}

    url = f"{BASE_URL}/api/dialogue/stream"
    params = {
        "message": message,
        "session_id": session_id,
        "mode": mode
    }

    print(f"\n测试流式对话接口...")
    print(f"请求URL: {url}")
    print(f"消息: {message}")
    print(f"会话ID: {session_id}")
    print(f"模式: {mode}")
    print("=" * 80)

    try:
        # 发送请求并处理流式响应
        with requests.post(url, params=params, headers=headers, stream=True) as response:
            if response.status_code == 200:
                print("连接成功，开始接收流式响应...")
                print("-" * 80)

                # 处理SSE流
                full_response = ""
                extension_questions = []
                for line in response.iter_lines():
                    if line:
                        # 解码响应行
                        line = line.decode('utf-8')
                        # 只处理data:开头的行
                        if line.startswith('data: '):
                            # 提取JSON数据
                            json_data = line[6:]
                            data = json.loads(json_data)
                            chunk = data.get('chunk', '')
                            full_response += chunk
                            
                            # 检查是否有延伸问题
                            if 'extension_questions' in data and data['extension_questions']:
                                extension_questions = data['extension_questions']
                                print("\n延伸问题:")
                                for i, question in enumerate(extension_questions, 1):
                                    print(f"{i}. {question}")
                                print("-" * 80)
                            elif chunk:
                                print(f"收到数据: {chunk}")
                                print("-" * 80)

                print("\n完整响应:")
                print(full_response)
                if extension_questions:
                    print("\n延伸问题:")
                    for i, question in enumerate(extension_questions, 1):
                        print(f"{i}. {question}")
                print("=" * 80)
            else:
                print(f"请求失败，状态码: {response.status_code}")
                print(f"响应内容: {response.text}")

    except Exception as e:
        print(f"测试过程中出现错误: {e}")


if __name__ == "__main__":
    # 生成唯一的会话ID
    session_id = f"test_{int(time.time())}"
    
    print("开始测试流式对话接口")
    print("=" * 80)
    
    # 测试 prompt 模式（有提示词）
    print("\n=== 测试 prompt 模式（有提示词）===")
    message1 = "帮我选一只股票，要求股价大于100且处于均线多头排列"
    test_stream_api(message1, session_id, mode="prompt")
    
    # 等待5秒，确保服务器有时间处理请求
    print("\n等待5秒，准备测试 direct 模式...")
    time.sleep(5)
    
    # 测试 direct 模式（无提示词）
    print("\n=== 测试 direct 模式（无提示词）===")
    message2 = "你好，今天天气怎么样？"
    test_stream_api(message2, session_id, mode="direct")
    
    print("\n测试完成！")