#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试 /api/test/llm-sse 接口的脚本

使用方法:
    python test_llm_sse.py
"""

import sys
import requests
import time
import json


def test_llm_sse(message, provider="aliyun"):
    """
    测试LLM SSE接口
    
    Args:
        message: 测试消息
        provider: 提供商名称（aliyun或deepseek）
    """
    url = "http://localhost:8000/api/test/llm-sse"
    params = {
        "message": message,
        "provider": provider
    }
    
    print(f"\n测试LLM SSE接口...")
    print(f"请求URL: {url}")
    print(f"消息: {message}")
    print(f"提供商: {provider}")
    print("=" * 80)
    
    try:
        # 发送请求并处理流式响应
        with requests.post(url, params=params, stream=True) as response:
            if response.status_code == 200:
                print("连接成功，开始接收流式响应...")
                print("-" * 80)
                
                # 处理SSE流
                full_response = ""
                chunk_count = 0
                start_time = time.time()
                first_chunk_time = None
                
                for line in response.iter_lines():
                    if line:
                        # 解码响应行
                        line = line.decode('utf-8')
                        # 只处理data:开头的行
                        if line.startswith('data: '):
                            # 记录第一个chunk的时间
                            if first_chunk_time is None:
                                first_chunk_time = time.time()
                                print(f"第一个chunk到达时间: {(first_chunk_time - start_time):.2f}秒")
                            
                            # 提取JSON数据
                            json_data = line[6:]
                            data = json.loads(json_data)
                            chunk = data.get('chunk', '')
                            if chunk:
                                full_response += chunk
                                chunk_count += 1
                                print(f"[{chunk_count}] {chunk}")
                
                end_time = time.time()
                total_time = end_time - start_time
                print("-" * 80)
                print(f"\n统计信息:")
                print(f"总chunk数量: {chunk_count}")
                print(f"总响应时间: {total_time:.2f}秒")
                if first_chunk_time:
                    print(f"首chunk延迟: {(first_chunk_time - start_time):.2f}秒")
                if chunk_count > 0:
                    print(f"平均chunk间隔: {(total_time / chunk_count):.2f}秒")
                
                print("\n完整响应:")
                print(full_response)
                print("=" * 80)
            else:
                print(f"请求失败，状态码: {response.status_code}")
                print(f"响应内容: {response.text}")
    
    except Exception as e:
        print(f"测试过程中出现错误: {e}")


if __name__ == "__main__":
    print("开始测试LLM SSE接口")
    print("=" * 80)
    
    # 测试阿里云
    print("\n=== 测试1: 阿里云 ===")
    message1 = "帮我选一只股票，要求股价大于100且处于均线多头排列"
    test_llm_sse(message1, "aliyun")
    
    # 等待10秒
    print("\n等待10秒...")
    time.sleep(10)
    
    # 测试阿里云第二次
    print("\n=== 测试2: 阿里云 ===")
    message2 = "如果股票是创新药呢？"
    test_llm_sse(message2, "aliyun")
    
    # 等待10秒
    print("\n等待10秒...")
    time.sleep(10)
    
    # 测试DeepSeek（如果配置了API密钥）
    print("\n=== 测试3: DeepSeek ===")
    message3 = "你好，请介绍一下你自己"
    test_llm_sse(message3, "deepseek")
    
    print("\n测试完成！")