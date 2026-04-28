import requests
import json
import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8011")

# 测试用户信息
TEST_USER = {
    "username": "tester",
    "password": "Test123456"
}

def get_auth_token():
    """获取认证令牌"""
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
        return None
    
    token = login_response.json().get("access_token")
    if not token:
        print("获取token失败")
        return None
    
    print(f"获取token成功: {token[:20]}...")
    return token

def test_dialogue_sessions():
    """测试对话会话管理"""
    token = get_auth_token()
    if not token:
        return
    
    headers = {
        "Authorization": f"Bearer {token}"
    }
    
    # 测试会话1
    session_id_1 = "test_session_1"
    print(f"\n=== 测试会话1: {session_id_1} ===")
    
    # 发送第一条消息
    sync_url = f"{BASE_URL}/api/dialogue/sync"
    message_1 = "推荐几只科技股"
    params = {
        "message": message_1,
        "session_id": session_id_1
    }
    
    print(f"发送消息: {message_1}")
    response = requests.post(sync_url, headers=headers, params=params)
    print(f"响应状态: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print(f"响应成功: {result.get('response', '')[:100]}...")
    
    # 发送第二条消息
    message_2 = "这些股票的近期表现如何"
    params = {
        "message": message_2,
        "session_id": session_id_1
    }
    
    print(f"\n发送消息: {message_2}")
    response = requests.post(sync_url, headers=headers, params=params)
    print(f"响应状态: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print(f"响应成功: {result.get('response', '')[:100]}...")
    
    # 发送第三条消息
    message_3 = "其中哪只股票最值得投资"
    params = {
        "message": message_3,
        "session_id": session_id_1
    }
    
    print(f"\n发送消息: {message_3}")
    response = requests.post(sync_url, headers=headers, params=params)
    print(f"响应状态: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print(f"响应成功: {result.get('response', '')[:100]}...")
    
    # 发送第四条消息
    message_4 = "这只股票的目标价是多少"
    params = {
        "message": message_4,
        "session_id": session_id_1
    }
    
    print(f"\n发送消息: {message_4}")
    response = requests.post(sync_url, headers=headers, params=params)
    print(f"响应状态: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print(f"响应成功: {result.get('response', '')[:100]}...")
    
    # 测试会话2
    session_id_2 = "test_session_2"
    print(f"\n=== 测试会话2: {session_id_2} ===")
    
    # 发送第一条消息
    message_3 = "推荐几只新能源股票"
    params = {
        "message": message_3,
        "session_id": session_id_2
    }
    
    print(f"发送消息: {message_3}")
    response = requests.post(sync_url, headers=headers, params=params)
    print(f"响应状态: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print(f"响应成功: {result.get('response', '')[:100]}...")
    
    # 获取会话1的历史
    print(f"\n=== 获取会话1的历史 ===")
    history_url = f"{BASE_URL}/api/dialogue/history"
    params = {
        "session_id": session_id_1
    }
    response = requests.get(history_url, headers=headers, params=params)
    print(f"响应状态: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print(f"会话1历史记录: {result}")
        print(f"会话1历史记录数: {len(result.get('history', []))}")
        print(f"会话ID: {result.get('session_id')}")
        
        # 打印历史记录
        for i, msg in enumerate(result.get('history', [])):
            role = "用户" if msg.get('role') == 'user' else "助手"
            content = msg.get('content', '')[:50] + "..." if len(msg.get('content', '')) > 50 else msg.get('content', '')
            print(f"  {i+1}. {role}: {content}")
    
    # 获取会话2的历史
    print(f"\n=== 获取会话2的历史 ===")
    params = {
        "session_id": session_id_2
    }
    response = requests.get(history_url, headers=headers, params=params)
    print(f"响应状态: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print(f"会话2历史记录数: {len(result.get('history', []))}")
        print(f"会话ID: {result.get('session_id')}")
        
        # 打印历史记录
        for i, msg in enumerate(result.get('history', [])):
            role = "用户" if msg.get('role') == 'user' else "助手"
            content = msg.get('content', '')[:50] + "..." if len(msg.get('content', '')) > 50 else msg.get('content', '')
            print(f"  {i+1}. {role}: {content}")
    
    # 清除会话1的历史
    print(f"\n=== 清除会话1的历史 ===")
    delete_url = f"{BASE_URL}/api/dialogue/history"
    params = {
        "session_id": session_id_1
    }
    response = requests.delete(delete_url, headers=headers, params=params)
    print(f"响应状态: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print(f"清除结果: {result.get('message')}")
    
    # 验证会话1的历史是否被清除
    print(f"\n=== 验证会话1的历史是否被清除 ===")
    params = {
        "session_id": session_id_1
    }
    response = requests.get(history_url, headers=headers, params=params)
    print(f"响应状态: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print(f"会话1历史记录数: {len(result.get('history', []))}")
    
    # 验证会话2的历史是否仍然存在
    print(f"\n=== 验证会话2的历史是否仍然存在 ===")
    params = {
        "session_id": session_id_2
    }
    response = requests.get(history_url, headers=headers, params=params)
    print(f"响应状态: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print(f"会话2历史记录数: {len(result.get('history', []))}")

    # 测试删除消息功能
    print(f"\n=== 测试删除消息功能 ===")
    # 重新创建会话3用于测试删除功能
    session_id_3 = "test_session_3"
    print(f"创建新会话: {session_id_3}")
    
    # 发送第一条消息
    message_1 = "测试删除消息功能"
    params = {
        "message": message_1,
        "session_id": session_id_3
    }
    response = requests.post(sync_url, headers=headers, params=params)
    if response.status_code == 200:
        result = response.json()
        print(f"发送第一条消息成功")
    
    # 发送第二条消息
    message_2 = "这是第二条消息"
    params = {
        "message": message_2,
        "session_id": session_id_3
    }
    response = requests.post(sync_url, headers=headers, params=params)
    if response.status_code == 200:
        result = response.json()
        print(f"发送第二条消息成功")
    
    # 发送第三条消息
    message_3 = "这是第三条消息"
    params = {
        "message": message_3,
        "session_id": session_id_3
    }
    response = requests.post(sync_url, headers=headers, params=params)
    if response.status_code == 200:
        result = response.json()
        print(f"发送第三条消息成功")
    
    # 获取会话3的历史，获取消息ID
    print(f"\n=== 获取会话3的历史 ===")
    params = {
        "session_id": session_id_3
    }
    response = requests.get(history_url, headers=headers, params=params)
    if response.status_code == 200:
        result = response.json()
        history = result.get('history', [])
        print(f"会话3历史记录数: {len(history)}")
        
        # 打印历史记录，包含消息ID
        for i, msg in enumerate(history):
            role = "用户" if msg.get('role') == 'user' else "助手"
            content = msg.get('content', '')[:50] + "..." if len(msg.get('content', '')) > 50 else msg.get('content', '')
            msg_id = msg.get('id')
            print(f"  {i+1}. {role}: {content} (ID: {msg_id})")
        
        # 测试删除消息
        if len(history) >= 2:
            # 找到用户的第一条消息（通常是索引0）
            user_message = None
            for msg in history:
                if msg.get('role') == 'user':
                    user_message = msg
                    break
            
            if user_message:
                message_id = user_message.get('id')
                if message_id:
                    print(f"\n=== 删除消息（ID: {message_id}） ===")
                    delete_url = f"{BASE_URL}/api/dialogue/sessions/{session_id_3}/messages/{message_id}"
                    response = requests.delete(delete_url, headers=headers)
                    print(f"响应状态: {response.status_code}")
                    if response.status_code == 200:
                        result = response.json()
                        print(f"删除结果: {result.get('message')}")
                    
                    # 验证消息是否被删除
                    print(f"\n=== 验证消息是否被删除 ===")
                    response = requests.get(history_url, headers=headers, params={"session_id": session_id_3})
                    if response.status_code == 200:
                        result = response.json()
                        new_history = result.get('history', [])
                        print(f"删除后历史记录数: {len(new_history)}")
                        
                        # 打印删除后的历史记录
                        for i, msg in enumerate(new_history):
                            role = "用户" if msg.get('role') == 'user' else "助手"
                            content = msg.get('content', '')[:50] + "..." if len(msg.get('content', '')) > 50 else msg.get('content', '')
                            msg_id = msg.get('id')
                            print(f"  {i+1}. {role}: {content} (ID: {msg_id})")

if __name__ == "__main__":
    test_dialogue_sessions()