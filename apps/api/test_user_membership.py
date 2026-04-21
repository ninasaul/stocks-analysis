"""
用户管理和会员管理模块测试脚本

此脚本用于测试用户管理和会员管理的核心功能，包括：
- 用户注册、登录
- 会员开通、续费、升级
- API调用限制

使用固定的测试账户，方便后期在项目中继续使用
"""
import requests
import json
import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# API 基础 URL
BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")

# 固定的测试账户信息
TEST_USER = {
    "username": "tester",
    "email": "test@example.com",
    "password": "Test123456",
    "phone": "13800138000"
}

# 测试用的会员信息
TEST_MEMBERSHIP = {
    "user_id": 1,  # 会在测试过程中更新
    "type": "premium_monthly",
    "start_date": "2026-04-20T00:00:00",
    "end_date": "2026-05-20T00:00:00",
    "api_call_limit": 1000,
    "api_call_used": 0,
    "status": "active"
}

class UserManagementTest:
    """用户管理测试类"""
    
    def __init__(self):
        self.base_url = BASE_URL
        self.access_token = None
        self.refresh_token = None
        self.user_id = None
    
    def test_register(self):
        """测试用户注册"""
        print("\n=== 测试用户注册 ===")
        url = f"{self.base_url}/api/auth/register"
        data = TEST_USER
        
        response = requests.post(url, json=data)
        print(f"状态码: {response.status_code}")
        
        if response.status_code == 201:
            user_data = response.json()
            self.user_id = user_data["id"]
            TEST_MEMBERSHIP["user_id"] = self.user_id
            print(f"注册成功！用户ID: {self.user_id}")
            print(f"用户信息: {json.dumps(user_data, ensure_ascii=False, indent=2)}")
        else:
            print(f"注册失败: {response.text}")
    
    def test_login(self):
        """测试用户登录"""
        print("\n=== 测试用户登录 ===")
        url = f"{self.base_url}/api/auth/login"
        data = {
            "username": TEST_USER["username"],
            "password": TEST_USER["password"]
        }
        
        # 使用表单数据发送登录请求
        response = requests.post(url, data=data)
        print(f"状态码: {response.status_code}")
        
        if response.status_code == 200:
            login_data = response.json()
            self.access_token = login_data["access_token"]
            self.refresh_token = login_data["refresh_token"]
            # 登录成功后设置用户ID
            self.user_id = login_data["user"]["id"]
            TEST_MEMBERSHIP["user_id"] = self.user_id
            print("登录成功！")
            print(f"访问令牌: {self.access_token}")
            print(f"刷新令牌: {self.refresh_token}")
            print(f"用户ID: {self.user_id}")
            print(f"用户信息: {json.dumps(login_data['user'], ensure_ascii=False, indent=2)}")
        else:
            print(f"登录失败: {response.text}")
    
    def test_get_current_user(self):
        """测试获取当前用户信息"""
        print("\n=== 测试获取当前用户信息 ===")
        if not self.access_token:
            print("请先登录获取访问令牌")
            return
        
        url = f"{self.base_url}/api/auth/me"
        headers = {
            "Authorization": f"Bearer {self.access_token}"
        }
        
        response = requests.get(url, headers=headers)
        print(f"状态码: {response.status_code}")
        
        if response.status_code == 200:
            user_data = response.json()
            print("获取成功！")
            print(f"用户信息: {json.dumps(user_data, ensure_ascii=False, indent=2)}")
        else:
            print(f"获取失败: {response.text}")
    
    def test_refresh_token(self):
        """测试刷新令牌功能"""
        print("\n=== 测试刷新令牌 ===")
        if not hasattr(self, 'refresh_token') or not self.refresh_token:
            print("请先登录获取刷新令牌")
            return
        
        url = f"{self.base_url}/api/auth/refresh"
        headers = {
            "Content-Type": "application/json"
        }
        data = {
            "refresh_token": self.refresh_token
        }
        
        response = requests.post(url, json=data, headers=headers)
        print(f"状态码: {response.status_code}")
        
        if response.status_code == 200:
            refresh_data = response.json()
            self.access_token = refresh_data["access_token"]
            self.refresh_token = refresh_data["refresh_token"]
            print("刷新令牌成功！")
            print(f"新的访问令牌: {self.access_token}")
            print(f"新的刷新令牌: {self.refresh_token}")
        else:
            print(f"刷新令牌失败: {response.text}")
    
    def test_logout(self):
        """测试登出功能"""
        print("\n=== 测试登出 ===")
        if not self.access_token:
            print("请先登录获取访问令牌")
            return
        
        url = f"{self.base_url}/api/auth/logout"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        data = {
            "refresh_token": self.refresh_token
        }
        
        response = requests.post(url, json=data, headers=headers)
        print(f"状态码: {response.status_code}")
        
        if response.status_code == 200:
            logout_data = response.json()
            print("登出成功！")
            print(f"登出信息: {json.dumps(logout_data, ensure_ascii=False, indent=2)}")
        else:
            print(f"登出失败: {response.text}")
    
    def test_token_blacklist(self):
        """测试令牌黑名单功能"""
        print("\n=== 测试令牌黑名单 ===")
        if not self.access_token:
            print("请先登录获取访问令牌")
            return
        
        # 保存当前令牌以便测试
        old_access_token = self.access_token
        old_refresh_token = self.refresh_token
        
        # 1. 验证当前令牌可以正常使用
        print("1. 验证当前令牌可以正常使用")
        url = f"{self.base_url}/api/auth/me"
        headers = {
            "Authorization": f"Bearer {old_access_token}"
        }
        response = requests.get(url, headers=headers)
        print(f"状态码: {response.status_code}")
        
        if response.status_code == 200:
            print("测试成功：当前令牌可以正常使用")
        else:
            print("测试失败：当前令牌无法使用")
            return

        # 2. 登出，将令牌加入黑名单
        print("2. 登出，将令牌加入黑名单")
        logout_url = f"{self.base_url}/api/auth/logout"
        logout_headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        logout_data = {
            "refresh_token": self.refresh_token
        }
        logout_response = requests.post(logout_url, json=logout_data, headers=logout_headers)
        print(f"登出状态码: {logout_response.status_code}")

        if logout_response.status_code != 200:
            print("测试失败：登出失败")
            return

        # 3. 验证登出后的访问令牌不能再使用
        print("3. 验证登出后的访问令牌不能再使用")
        response = requests.get(url, headers=headers)
        print(f"状态码: {response.status_code}")

        if response.status_code == 401:
            print("测试成功：登出后的访问令牌被正确拒绝")
        else:
            print("测试失败：登出后的访问令牌仍然有效")

        # 4. 验证登出后的刷新令牌不能再使用
        print("4. 验证登出后的刷新令牌不能再使用")
        refresh_url = f"{self.base_url}/api/auth/refresh"
        refresh_data = {
            "refresh_token": self.refresh_token
        }
        refresh_response = requests.post(refresh_url, json=refresh_data, headers={"Content-Type": "application/json"})
        print(f"状态码: {refresh_response.status_code}")

        if refresh_response.status_code == 401:
            print("测试成功：登出后的刷新令牌被正确拒绝")
        else:
            print("测试失败：登出后的刷新令牌仍然有效")
        
        # 5. 重新登录获取新令牌
        print("5. 重新登录获取新令牌")
        login_url = f"{self.base_url}/api/auth/login"
        login_data = {
            "username": TEST_USER["username"],
            "password": TEST_USER["password"]
        }
        login_response = requests.post(login_url, data=login_data)
        print(f"登录状态码: {login_response.status_code}")
        
        if login_response.status_code == 200:
            login_data = login_response.json()
            self.access_token = login_data["access_token"]
            self.refresh_token = login_data["refresh_token"]
            print("重新登录成功！")
        else:
            print(f"重新登录失败: {login_response.text}")

class MembershipManagementTest:
    """会员管理测试类"""
    
    def __init__(self, access_token, user_id):
        self.base_url = BASE_URL
        self.access_token = access_token
        self.user_id = user_id
    
    def test_create_membership(self):
        """测试开通会员"""
        print("\n=== 测试开通会员 ===")
        if not self.access_token:
            print("请先登录获取访问令牌")
            return
        
        url = f"{self.base_url}/api/memberships"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        data = TEST_MEMBERSHIP
        
        response = requests.post(url, json=data, headers=headers)
        print(f"状态码: {response.status_code}")
        
        if response.status_code == 201:
            membership_data = response.json()
            print("开通会员成功！")
            print(f"会员信息: {json.dumps(membership_data, ensure_ascii=False, indent=2)}")
        else:
            print(f"开通会员失败: {response.text}")
    
    def test_get_membership(self):
        """测试获取会员信息"""
        print("\n=== 测试获取会员信息 ===")
        if not self.access_token:
            print("请先登录获取访问令牌")
            return
        
        url = f"{self.base_url}/api/memberships/{self.user_id}"
        headers = {
            "Authorization": f"Bearer {self.access_token}"
        }
        
        response = requests.get(url, headers=headers)
        print(f"状态码: {response.status_code}")
        
        if response.status_code == 200:
            membership_data = response.json()
            print("获取会员信息成功！")
            print(f"会员信息: {json.dumps(membership_data, ensure_ascii=False, indent=2)}")
        else:
            print(f"获取会员信息失败: {response.text}")
    
    def test_renew_membership(self):
        """测试会员续费"""
        print("\n=== 测试会员续费 ===")
        if not self.access_token:
            print("请先登录获取访问令牌")
            return
        
        url = f"{self.base_url}/api/memberships/renew"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        params = {
            "user_id": self.user_id
        }
        data = {
            "duration_months": 3  # 续费3个月
        }
        
        response = requests.post(url, json=data, headers=headers, params=params)
        print(f"状态码: {response.status_code}")
        
        if response.status_code == 200:
            membership_data = response.json()
            print("续费成功！")
            print(f"会员信息: {json.dumps(membership_data, ensure_ascii=False, indent=2)}")
        else:
            print(f"续费失败: {response.text}")
    
    def test_upgrade_membership(self):
        """测试会员升级"""
        print("\n=== 测试会员升级 ===")
        if not self.access_token:
            print("请先登录获取访问令牌")
            return
        
        url = f"{self.base_url}/api/memberships/upgrade"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        params = {
            "user_id": self.user_id
        }
        data = {
            "new_type": "premium_yearly",  # 升级为年度会员
            "duration_months": 12
        }
        
        response = requests.post(url, json=data, headers=headers, params=params)
        print(f"状态码: {response.status_code}")
        
        if response.status_code == 200:
            membership_data = response.json()
            print("升级成功！")
            print(f"会员信息: {json.dumps(membership_data, ensure_ascii=False, indent=2)}")
        else:
            print(f"升级失败: {response.text}")
    
    def test_get_api_call_stats(self):
        """测试获取API调用统计"""
        print("\n=== 测试获取API调用统计 ===")
        if not self.access_token:
            print("请先登录获取访问令牌")
            return
        
        url = f"{self.base_url}/api/memberships/{self.user_id}/api-calls"
        headers = {
            "Authorization": f"Bearer {self.access_token}"
        }
        
        response = requests.get(url, headers=headers)
        print(f"状态码: {response.status_code}")
        
        if response.status_code == 200:
            stats_data = response.json()
            print("获取API调用统计成功！")
            print(f"统计信息: {json.dumps(stats_data, ensure_ascii=False, indent=2)}")
        else:
            print(f"获取API调用统计失败: {response.text}")

class ApiCallTest:
    """API调用测试类"""
    
    def __init__(self, access_token):
        self.base_url = BASE_URL
        self.access_token = access_token
    
    def test_protected_endpoint(self):
        """测试访问受保护的接口"""
        print("\n=== 测试访问受保护的接口 ===")
        if not self.access_token:
            print("请先登录获取访问令牌")
            return
        
        url = f"{self.base_url}/api/users"
        headers = {
            "Authorization": f"Bearer {self.access_token}"
        }
        
        response = requests.get(url, headers=headers)
        print(f"状态码: {response.status_code}")
        
        if response.status_code == 200:
            users_data = response.json()
            print("访问成功！")
            print(f"用户列表: {json.dumps(users_data, ensure_ascii=False, indent=2)}")
        else:
            print(f"访问失败: {response.text}")

def main():
    """主测试函数"""
    print("=" * 60)
    print("用户管理和会员管理模块测试")
    print("=" * 60)
    print(f"测试环境: {BASE_URL}")
    print(f"测试账户: {TEST_USER['username']}")
    print(f"测试密码: {TEST_USER['password']}")
    print("=" * 60)
    
    # 初始化测试类
    user_test = UserManagementTest()
    
    # 执行用户管理测试
    user_test.test_register()
    user_test.test_login()
    user_test.test_get_current_user()
    # 测试刷新令牌功能
    user_test.test_refresh_token()
    
    # 执行会员管理测试
    if user_test.access_token and user_test.user_id:
        membership_test = MembershipManagementTest(user_test.access_token, user_test.user_id)
        membership_test.test_create_membership()
        membership_test.test_get_membership()
        membership_test.test_renew_membership()
        membership_test.test_upgrade_membership()
        membership_test.test_get_api_call_stats()
        
        # 执行API调用测试
        api_test = ApiCallTest(user_test.access_token)
        api_test.test_protected_endpoint()
    
    # 测试令牌黑名单和登出功能
    user_test.test_token_blacklist()
    user_test.test_logout()
    
    print("\n" + "=" * 60)
    print("测试完成！")
    print("=" * 60)

if __name__ == "__main__":
    main()