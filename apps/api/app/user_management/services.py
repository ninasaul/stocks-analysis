"""业务逻辑层"""
from datetime import datetime, timedelta
from typing import Optional, List, Tuple
import hashlib
import logging
from .models import User, Membership, ApiCallLog, UserStatus, MembershipType, MembershipStatus, RefreshToken
from .schemas import UserCreate, UserUpdate, MembershipCreate, MembershipUpdate
from ..core.database import execute_query, execute_insert, execute_update, execute_delete
from ..core.auth import get_password_hash, verify_password

logger = logging.getLogger(__name__)


class UserService:
    """用户服务"""

    @staticmethod
    def hash_password(password: str) -> str:
        """
        密码哈希

        Args:
            password: 原始密码

        Returns:
            哈希后的密码
        """
        # 截断密码到72字节，因为bcrypt最多只能处理72字节
        if len(password) > 72:
            password = password[:72]
        return get_password_hash(password)

    @staticmethod
    def create_user(user_data: UserCreate) -> Optional[User]:
        """
        创建用户

        Args:
            user_data: 用户数据

        Returns:
            创建的用户对象
        """
        try:
            password_hash = UserService.hash_password(user_data.password)
            query = """
                INSERT INTO users (username, email, password_hash, phone)
                VALUES (%s, %s, %s, %s)
            """
            params = (
                user_data.username,
                user_data.email,
                password_hash,
                user_data.phone
            )
            user_id = execute_insert(query, params)
            if user_id:
                # 自动为新用户创建普通会员
                MembershipService.create_membership_for_user(user_id)
                return UserService.get_user_by_id(user_id)
            return None
        except Exception as e:
            logger.error(f"创建用户失败: {e}")
            raise

    @staticmethod
    def get_user_by_id(user_id: int) -> Optional[User]:
        """
        根据ID获取用户

        Args:
            user_id: 用户ID

        Returns:
            用户对象
        """
        query = "SELECT * FROM users WHERE id = %s"
        result = execute_query(query, (user_id,))
        if result:
            return User.from_db_row(result[0])
        return None

    @staticmethod
    def get_user_by_username(username: str) -> Optional[User]:
        """
        根据用户名获取用户

        Args:
            username: 用户名

        Returns:
            用户对象
        """
        query = "SELECT * FROM users WHERE username = %s"
        result = execute_query(query, (username,))
        if result:
            return User.from_db_row(result[0])
        return None

    @staticmethod
    def get_user_by_email(email: str) -> Optional[User]:
        """
        根据邮箱获取用户

        Args:
            email: 邮箱

        Returns:
            用户对象
        """
        query = "SELECT * FROM users WHERE email = %s"
        result = execute_query(query, (email,))
        if result:
            return User.from_db_row(result[0])
        return None

    @staticmethod
    def update_user(user_id: int, user_data: UserUpdate) -> Optional[User]:
        """
        更新用户信息

        Args:
            user_id: 用户ID
            user_data: 更新数据

        Returns:
            更新后的用户对象
        """
        try:
            updates = []
            params = []

            if user_data.email is not None:
                updates.append("email = %s")
                params.append(user_data.email)
            if user_data.phone is not None:
                updates.append("phone = %s")
                params.append(user_data.phone)
            if user_data.status is not None:
                updates.append("status = %s")
                params.append(user_data.status.value)

            if not updates:
                return UserService.get_user_by_id(user_id)

            updates.append("updated_at = %s")
            params.append(datetime.now())
            params.append(user_id)

            query = f"UPDATE users SET {', '.join(updates)} WHERE id = %s"
            execute_update(query, tuple(params))
            return UserService.get_user_by_id(user_id)
        except Exception as e:
            logger.error(f"更新用户失败: {e}")
            raise

    @staticmethod
    def delete_user(user_id: int) -> bool:
        """
        删除用户

        Args:
            user_id: 用户ID

        Returns:
            是否删除成功
        """
        try:
            query = "DELETE FROM users WHERE id = %s"
            affected = execute_delete(query, (user_id,))
            return affected > 0
        except Exception as e:
            logger.error(f"删除用户失败: {e}")
            raise

    @staticmethod
    def list_users(page: int = 1, page_size: int = 10, status: Optional[UserStatus] = None) -> Tuple[List[User], int]:
        """
        获取用户列表

        Args:
            page: 页码
            page_size: 每页数量
            status: 用户状态过滤

        Returns:
            用户列表和总数
        """
        try:
            conditions = []
            params = []

            if status:
                conditions.append("status = %s")
                params.append(status.value)

            where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

            count_query = f"SELECT COUNT(*) FROM users {where_clause}"
            total = execute_query(count_query, tuple(params))[0][0]

            offset = (page - 1) * page_size
            query = f"""
                SELECT * FROM users
                {where_clause}
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
            """
            params.extend([page_size, offset])
            result = execute_query(query, tuple(params))

            users = [User.from_db_row(row) for row in result]
            return users, total
        except Exception as e:
            logger.error(f"获取用户列表失败: {e}")
            raise

    @staticmethod
    def verify_password(username: str, password: str) -> Optional[User]:
        """
        验证用户密码

        Args:
            username: 用户名
            password: 密码

        Returns:
            验证成功返回用户对象，否则返回None
        """
        # 截断密码到72字节，因为bcrypt最多只能处理72字节
        if len(password) > 72:
            password = password[:72]
        user = UserService.get_user_by_username(username)
        if user and verify_password(password, user.password_hash):
            return user
        return None


class MembershipService:
    """会员服务"""

    @staticmethod
    def create_membership(membership_data: MembershipCreate) -> Optional[Membership]:
        """
        创建会员

        Args:
            membership_data: 会员数据

        Returns:
            创建的会员对象
        """
        try:
            user = UserService.get_user_by_id(membership_data.user_id)
            if not user:
                raise ValueError("用户不存在")

            start_date = datetime.now()
            end_date = None

            if membership_data.type != MembershipType.NORMAL and membership_data.duration_months:
                end_date = start_date + timedelta(days=membership_data.duration_months * 30)

            api_call_limit = Membership.API_CALL_LIMITS.get(membership_data.type, 100)

            query = """
                INSERT INTO memberships (user_id, type, start_date, end_date, api_call_limit)
                VALUES (%s, %s, %s, %s, %s)
            """
            params = (
                membership_data.user_id,
                membership_data.type.value,
                start_date,
                end_date,
                api_call_limit
            )
            membership_id = execute_insert(query, params)
            if membership_id:
                return MembershipService.get_membership_by_id(membership_id)
            return None
        except Exception as e:
            logger.error(f"创建会员失败: {e}")
            raise

    @staticmethod
    def get_membership_by_id(membership_id: int) -> Optional[Membership]:
        """
        根据ID获取会员

        Args:
            membership_id: 会员ID

        Returns:
            会员对象
        """
        query = "SELECT * FROM memberships WHERE id = %s"
        result = execute_query(query, (membership_id,))
        if result:
            return Membership.from_db_row(result[0])
        return None

    @staticmethod
    def create_membership_for_user(user_id: int) -> Optional[Membership]:
        """
        为新用户创建默认普通会员

        Args:
            user_id: 用户ID

        Returns:
            创建的会员对象
        """
        try:
            start_date = datetime.now()
            api_call_limit = Membership.API_CALL_LIMITS.get(MembershipType.NORMAL, 100)

            query = """
                INSERT INTO memberships (user_id, type, start_date, api_call_limit, status)
                VALUES (%s, %s, %s, %s, %s)
            """
            params = (
                user_id,
                MembershipType.NORMAL.value,
                start_date,
                api_call_limit,
                MembershipStatus.ACTIVE.value
            )
            membership_id = execute_insert(query, params)
            if membership_id:
                return MembershipService.get_membership_by_id(membership_id)
            return None
        except Exception as e:
            logger.error(f"为用户创建会员失败: {e}")
            raise

    @staticmethod
    def get_membership_by_user_id(user_id: int) -> Optional[Membership]:
        """
        根据用户ID获取会员

        Args:
            user_id: 用户ID

        Returns:
            会员对象
        """
        query = """
            SELECT * FROM memberships
            WHERE user_id = %s AND status = 'active'
            ORDER BY created_at DESC
            LIMIT 1
        """
        result = execute_query(query, (user_id,))
        if result:
            membership = Membership.from_db_row(result[0])
            if membership.is_expired():
                MembershipService.update_membership_status(membership.id, MembershipStatus.EXPIRED)
                membership.status = MembershipStatus.EXPIRED
            return membership
        return None

    @staticmethod
    def update_membership(membership_id: int, membership_data: MembershipUpdate) -> Optional[Membership]:
        """
        更新会员信息

        Args:
            membership_id: 会员ID
            membership_data: 更新数据

        Returns:
            更新后的会员对象
        """
        try:
            updates = []
            params = []

            if membership_data.type is not None:
                updates.append("type = %s")
                params.append(membership_data.type.value)
                new_limit = Membership.API_CALL_LIMITS.get(membership_data.type, 100)
                updates.append("api_call_limit = %s")
                params.append(new_limit)
            if membership_data.end_date is not None:
                updates.append("end_date = %s")
                params.append(membership_data.end_date)
            if membership_data.status is not None:
                updates.append("status = %s")
                params.append(membership_data.status.value)

            if not updates:
                return MembershipService.get_membership_by_id(membership_id)

            updates.append("updated_at = %s")
            params.append(datetime.now())
            params.append(membership_id)

            query = f"UPDATE memberships SET {', '.join(updates)} WHERE id = %s"
            execute_update(query, tuple(params))
            return MembershipService.get_membership_by_id(membership_id)
        except Exception as e:
            logger.error(f"更新会员失败: {e}")
            raise

    @staticmethod
    def update_membership_status(membership_id: int, status: MembershipStatus) -> bool:
        """
        更新会员状态

        Args:
            membership_id: 会员ID
            status: 新状态

        Returns:
            是否更新成功
        """
        try:
            query = """
                UPDATE memberships
                SET status = %s, updated_at = %s
                WHERE id = %s
            """
            params = (status.value, datetime.now(), membership_id)
            affected = execute_update(query, params)
            return affected > 0
        except Exception as e:
            logger.error(f"更新会员状态失败: {e}")
            raise

    @staticmethod
    def renew_membership(membership_id: int, duration_months: int) -> Optional[Membership]:
        """
        会员续费

        Args:
            membership_id: 会员ID
            duration_months: 续费时长（月）

        Returns:
            续费后的会员对象
        """
        try:
            membership = MembershipService.get_membership_by_id(membership_id)
            if not membership:
                raise ValueError("会员不存在")

            if membership.type == MembershipType.NORMAL:
                raise ValueError("普通会员不能续费")

            new_end_date = membership.end_date or datetime.now()
            new_end_date += timedelta(days=duration_months * 30)

            return MembershipService.update_membership(
                membership_id,
                MembershipUpdate(end_date=new_end_date)
            )
        except Exception as e:
            logger.error(f"会员续费失败: {e}")
            raise

    @staticmethod
    def upgrade_membership(membership_id: int, new_type: MembershipType, duration_months: Optional[int] = None) -> Optional[Membership]:
        """
        会员升级

        Args:
            membership_id: 会员ID
            new_type: 新会员类型
            duration_months: 会员时长（月）

        Returns:
            升级后的会员对象
        """
        try:
            membership = MembershipService.get_membership_by_id(membership_id)
            if not membership:
                raise ValueError("会员不存在")

            if new_type == MembershipType.NORMAL:
                end_date = None
            else:
                if membership.end_date and membership.end_date > datetime.now():
                    end_date = membership.end_date
                else:
                    end_date = datetime.now()

                if duration_months:
                    end_date += timedelta(days=duration_months * 30)

            new_api_call_limit = Membership.API_CALL_LIMITS.get(new_type, 100)

            query = """
                UPDATE memberships
                SET type = %s, end_date = %s, api_call_limit = %s, api_call_used = 0, updated_at = %s
                WHERE id = %s
            """
            params = (
                new_type.value,
                end_date,
                new_api_call_limit,
                datetime.now(),
                membership_id
            )
            execute_update(query, params)

            return MembershipService.get_membership_by_id(membership_id)
        except Exception as e:
            logger.error(f"会员升级失败: {e}")
            raise

    @staticmethod
    def list_memberships(page: int = 1, page_size: int = 10, status: Optional[MembershipStatus] = None) -> Tuple[List[Membership], int]:
        """
        获取会员列表

        Args:
            page: 页码
            page_size: 每页数量
            status: 会员状态过滤

        Returns:
            会员列表和总数
        """
        try:
            conditions = []
            params = []

            if status:
                conditions.append("status = %s")
                params.append(status.value)

            where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

            count_query = f"SELECT COUNT(*) FROM memberships {where_clause}"
            total = execute_query(count_query, tuple(params))[0][0]

            offset = (page - 1) * page_size
            query = f"""
                SELECT * FROM memberships
                {where_clause}
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
            """
            params.extend([page_size, offset])
            result = execute_query(query, tuple(params))

            memberships = [Membership.from_db_row(row) for row in result]
            return memberships, total
        except Exception as e:
            logger.error(f"获取会员列表失败: {e}")
            raise

    @staticmethod
    def reset_daily_api_calls():
        """重置所有会员的每日API调用次数"""
        try:
            query = """
                UPDATE memberships
                SET api_call_used = 0, updated_at = %s
                WHERE status = 'active'
            """
            execute_update(query, (datetime.now(),))
            logger.info("每日API调用次数已重置")
        except Exception as e:
            logger.error(f"重置API调用次数失败: {e}")
            raise

    @staticmethod
    def check_api_call_limit(user_id: int) -> tuple[bool, str]:
        """
        检查用户API调用次数是否足够

        Args:
            user_id: 用户ID

        Returns:
            (是否通过检查, 错误信息)
        """
        try:
            query = """
                SELECT api_call_limit, api_call_used
                FROM memberships
                WHERE user_id = %s AND status = 'active'
            """
            result = execute_query(query, (user_id,))
            if not result:
                return False, "用户没有有效的会员"

            api_call_limit = result[0][0]
            api_call_used = result[0][1]
            remaining = api_call_limit - api_call_used

            if remaining <= 0:
                return False, "API调用次数已用尽，请升级会员或等待下个周期重置"

            return True, ""
        except Exception as e:
            logger.error(f"检查API调用次数失败: {e}")
            return True, ""

    @staticmethod
    def record_api_call(user_id: int, endpoint: str, method: str, status: int) -> bool:
        """
        记录API调用并更新使用次数

        Args:
            user_id: 用户ID
            endpoint: API端点
            method: 请求方法
            status: 响应状态码

        Returns:
            是否成功
        """
        try:
            update_query = """
                UPDATE memberships
                SET api_call_used = api_call_used + 1
                WHERE user_id = %s AND status = 'active'
            """
            execute_update(update_query, (user_id,))

            log_query = """
                INSERT INTO api_call_logs (user_id, endpoint, method, response_status)
                VALUES (%s, %s, %s, %s)
            """
            execute_insert(log_query, (user_id, endpoint, method, status))

            logger.debug(f"API调用记录已更新: 用户 {user_id}, 端点 {endpoint}")
            return True
        except Exception as e:
            logger.error(f"记录API调用失败: {e}")
            return False


class ApiCallService:
    """API调用服务"""

    @staticmethod
    def log_api_call(user_id: int, endpoint: str, method: str, response_status: int) -> Optional[ApiCallLog]:
        """
        记录API调用

        Args:
            user_id: 用户ID
            endpoint: API端点
            method: HTTP方法
            response_status: 响应状态码

        Returns:
            API调用日志对象
        """
        try:
            query = """
                INSERT INTO api_call_logs (user_id, endpoint, method, response_status)
                VALUES (%s, %s, %s, %s)
            """
            params = (user_id, endpoint, method, response_status)
            log_id = execute_insert(query, params)
            if log_id:
                return ApiCallService.get_api_log_by_id(log_id)
            return None
        except Exception as e:
            logger.error(f"记录API调用失败: {e}")
            raise

    @staticmethod
    def get_api_log_by_id(log_id: int) -> Optional[ApiCallLog]:
        """
        根据ID获取API调用日志

        Args:
            log_id: 日志ID

        Returns:
            API调用日志对象
        """
        query = "SELECT * FROM api_call_logs WHERE id = %s"
        result = execute_query(query, (log_id,))
        if result:
            return ApiCallLog.from_db_row(result[0])
        return None

    @staticmethod
    def get_user_api_logs(user_id: int, page: int = 1, page_size: int = 10) -> Tuple[List[ApiCallLog], int]:
        """
        获取用户的API调用日志

        Args:
            user_id: 用户ID
            page: 页码
            page_size: 每页数量

        Returns:
            API调用日志列表和总数
        """
        try:
            count_query = "SELECT COUNT(*) FROM api_call_logs WHERE user_id = %s"
            total = execute_query(count_query, (user_id,))[0][0]

            offset = (page - 1) * page_size
            query = """
                SELECT * FROM api_call_logs
                WHERE user_id = %s
                ORDER BY call_time DESC
                LIMIT %s OFFSET %s
            """
            result = execute_query(query, (user_id, page_size, offset))

            logs = [ApiCallLog.from_db_row(row) for row in result]
            return logs, total
        except Exception as e:
            logger.error(f"获取API调用日志失败: {e}")
            raise

    @staticmethod
    def get_user_api_stats(user_id: int) -> dict:
        """
        获取用户的API调用统计

        Args:
            user_id: 用户ID

        Returns:
            统计信息字典
        """
        try:
            membership = MembershipService.get_membership_by_user_id(user_id)
            if not membership:
                raise ValueError("用户没有会员信息")

            total_calls_query = """
                SELECT COUNT(*) FROM api_call_logs WHERE user_id = %s
            """
            total_calls = execute_query(total_calls_query, (user_id,))[0][0]

            successful_calls_query = """
                SELECT COUNT(*) FROM api_call_logs
                WHERE user_id = %s AND response_status >= 200 AND response_status < 300
            """
            successful_calls = execute_query(successful_calls_query, (user_id,))[0][0]

            today = datetime.now().date()
            today_calls_query = """
                SELECT COUNT(*) FROM api_call_logs
                WHERE user_id = %s AND DATE(call_time) = %s
            """
            today_calls = execute_query(today_calls_query, (user_id, today))[0][0]

            return {
                "user_id": user_id,
                "total_calls": total_calls,
                "successful_calls": successful_calls,
                "failed_calls": total_calls - successful_calls,
                "today_calls": today_calls,
                "api_call_limit": membership.api_call_limit,
                "api_call_used": membership.api_call_used,
                "api_call_remaining": membership.api_call_limit - membership.api_call_used,
                "membership_type": membership.type.value,
                "membership_status": membership.status.value
            }
        except Exception as e:
            logger.error(f"获取API调用统计失败: {e}")
            raise

    @staticmethod
    def check_and_increment_api_call(user_id: int) -> bool:
        """
        检查并增加API调用次数

        Args:
            user_id: 用户ID

        Returns:
            是否允许调用
        """
        try:
            membership = MembershipService.get_membership_by_user_id(user_id)
            if not membership:
                return False

            if not membership.can_call_api():
                return False

            membership.increment_api_call()

            query = """
                UPDATE memberships
                SET api_call_used = %s, updated_at = %s
                WHERE id = %s
            """
            params = (membership.api_call_used, datetime.now(), membership.id)
            execute_update(query, params)

            return True
        except Exception as e:
            logger.error(f"检查API调用失败: {e}")
            raise


class RefreshTokenService:
    """刷新令牌服务"""

    @staticmethod
    def create_refresh_token(user_id: int, token: str, expires_at: datetime) -> Optional[RefreshToken]:
        """
        创建刷新令牌

        Args:
            user_id: 用户ID
            token: 刷新令牌字符串
            expires_at: 过期时间

        Returns:
            创建的刷新令牌对象
        """
        try:
            from .models import RefreshTokenStatus
            query = """
                INSERT INTO refresh_tokens (user_id, token, expires_at, status)
                VALUES (%s, %s, %s, %s)
            """
            params = (
                user_id,
                token,
                expires_at,
                RefreshTokenStatus.ACTIVE.value
            )
            token_id = execute_insert(query, params)
            if token_id:
                return RefreshTokenService.get_refresh_token_by_id(token_id)
            return None
        except Exception as e:
            logger.error(f"创建刷新令牌失败: {e}")
            raise

    @staticmethod
    def get_refresh_token_by_id(token_id: int) -> Optional[RefreshToken]:
        """
        根据ID获取刷新令牌

        Args:
            token_id: 令牌ID

        Returns:
            刷新令牌对象
        """
        query = "SELECT * FROM refresh_tokens WHERE id = %s"
        result = execute_query(query, (token_id,))
        if result:
            return RefreshToken.from_db_row(result[0])
        return None

    @staticmethod
    def get_refresh_token_by_token(token: str) -> Optional[RefreshToken]:
        """
        根据令牌字符串获取刷新令牌

        Args:
            token: 刷新令牌字符串

        Returns:
            刷新令牌对象
        """
        query = "SELECT * FROM refresh_tokens WHERE token = %s"
        result = execute_query(query, (token,))
        if result:
            refresh_token = RefreshToken.from_db_row(result[0])
            if refresh_token.is_expired():
                RefreshTokenService.mark_as_expired(refresh_token.id)
                return None
            return refresh_token
        return None

    @staticmethod
    def mark_as_expired(token_id: int) -> bool:
        """
        将刷新令牌标记为过期

        Args:
            token_id: 令牌ID

        Returns:
            是否标记成功
        """
        try:
            from .models import RefreshTokenStatus
            query = """
                UPDATE refresh_tokens
                SET status = %s, updated_at = %s
                WHERE id = %s
            """
            params = (RefreshTokenStatus.EXPIRED.value, datetime.now(), token_id)
            affected = execute_update(query, params)
            return affected > 0
        except Exception as e:
            logger.error(f"标记刷新令牌过期失败: {e}")
            raise

    @staticmethod
    def get_active_refresh_tokens(user_id: int) -> List[RefreshToken]:
        """
        获取用户的有效刷新令牌

        Args:
            user_id: 用户ID

        Returns:
            刷新令牌列表
        """
        query = """
            SELECT * FROM refresh_tokens
            WHERE user_id = %s AND status = 'active'
            ORDER BY created_at DESC
        """
        result = execute_query(query, (user_id,))
        return [RefreshToken.from_db_row(row) for row in result]

    @staticmethod
    def revoke_refresh_token(token_id: int) -> bool:
        """
        撤销刷新令牌

        Args:
            token_id: 令牌ID

        Returns:
            是否撤销成功
        """
        try:
            from .models import RefreshTokenStatus
            query = """
                UPDATE refresh_tokens
                SET status = %s, updated_at = %s
                WHERE id = %s
            """
            params = (RefreshTokenStatus.REVOKED.value, datetime.now(), token_id)
            affected = execute_update(query, params)
            return affected > 0
        except Exception as e:
            logger.error(f"撤销刷新令牌失败: {e}")
            raise

    @staticmethod
    def revoke_all_user_tokens(user_id: int) -> bool:
        """
        撤销用户的所有刷新令牌

        Args:
            user_id: 用户ID

        Returns:
            是否撤销成功
        """
        try:
            from .models import RefreshTokenStatus
            query = """
                UPDATE refresh_tokens
                SET status = %s, updated_at = %s
                WHERE user_id = %s AND status = %s
            """
            params = (
                RefreshTokenStatus.REVOKED.value, 
                datetime.now(), 
                user_id, 
                RefreshTokenStatus.ACTIVE.value
            )
            affected = execute_update(query, params)
            return affected > 0
        except Exception as e:
            logger.error(f"撤销用户刷新令牌失败: {e}")
            raise

    @staticmethod
    def cleanup_expired_tokens():
        """清理过期的刷新令牌"""
        try:
            from .models import RefreshTokenStatus
            query = """
                UPDATE refresh_tokens
                SET status = %s, updated_at = %s
                WHERE expires_at < %s AND status = %s
            """
            params = (
                RefreshTokenStatus.EXPIRED.value, 
                datetime.now(), 
                datetime.now(), 
                RefreshTokenStatus.ACTIVE.value
            )
            affected = execute_update(query, params)
            if affected > 0:
                logger.info(f"清理了 {affected} 个过期刷新令牌")
        except Exception as e:
            logger.error(f"清理过期刷新令牌失败: {e}")
            raise

    @staticmethod
    def rotate_refresh_token(old_token: str, new_token: str, new_expires_at: datetime) -> Optional[RefreshToken]:
        """
        刷新令牌轮换 - 撤销旧令牌，创建新令牌

        Args:
            old_token: 旧刷新令牌字符串
            new_token: 新刷新令牌字符串
            new_expires_at: 新过期时间

        Returns:
            新刷新令牌对象
        """
        try:
            old_refresh_token = RefreshTokenService.get_refresh_token_by_token(old_token)
            if old_refresh_token:
                RefreshTokenService.revoke_refresh_token(old_refresh_token.id)
            return RefreshTokenService.create_refresh_token(old_refresh_token.user_id, new_token, new_expires_at)
        except Exception as e:
            logger.error(f"刷新令牌轮换失败: {e}")
            raise


class WechatUserService:
    """微信用户服务"""

    @staticmethod
    def get_wechat_user_by_openid(openid: str) -> Optional['WechatUser']:
        """
        根据openid获取微信用户

        Args:
            openid: 微信openid

        Returns:
            微信用户对象
        """
        from .models import WechatUser
        query = "SELECT * FROM wechat_users WHERE openid = %s"
        result = execute_query(query, (openid,))
        if result:
            return WechatUser.from_db_row(result[0])
        return None

    @staticmethod
    def get_wechat_user_by_unionid(unionid: str) -> Optional['WechatUser']:
        """
        根据unionid获取微信用户

        Args:
            unionid: 微信unionid

        Returns:
            微信用户对象
        """
        from .models import WechatUser
        query = "SELECT * FROM wechat_users WHERE unionid = %s"
        result = execute_query(query, (unionid,))
        if result:
            return WechatUser.from_db_row(result[0])
        return None

    @staticmethod
    def get_wechat_user_by_user_id(user_id: int) -> Optional['WechatUser']:
        """
        根据用户ID获取微信用户

        Args:
            user_id: 用户ID

        Returns:
            微信用户对象
        """
        from .models import WechatUser
        query = "SELECT * FROM wechat_users WHERE user_id = %s"
        result = execute_query(query, (user_id,))
        if result:
            return WechatUser.from_db_row(result[0])
        return None

    @staticmethod
    def create_wechat_user(user_id: int, openid: str, unionid: str = None,
                          nickname: str = None, avatar_url: str = None) -> Optional['WechatUser']:
        """
        创建微信用户

        Args:
            user_id: 用户ID
            openid: 微信openid
            unionid: 微信unionid
            nickname: 昵称
            avatar_url: 头像URL

        Returns:
            创建的微信用户对象
        """
        from .models import WechatUser
        try:
            query = """
                INSERT INTO wechat_users (user_id, openid, unionid, nickname, avatar_url)
                VALUES (%s, %s, %s, %s, %s)
            """
            params = (user_id, openid, unionid, nickname, avatar_url)
            wechat_user_id = execute_insert(query, params)
            if wechat_user_id:
                return WechatUserService.get_wechat_user_by_id(wechat_user_id)
            return None
        except Exception as e:
            logger.error(f"创建微信用户失败: {e}")
            raise

    @staticmethod
    def get_wechat_user_by_id(wechat_user_id: int) -> Optional['WechatUser']:
        """
        根据ID获取微信用户

        Args:
            wechat_user_id: 微信用户ID

        Returns:
            微信用户对象
        """
        from .models import WechatUser
        query = "SELECT * FROM wechat_users WHERE id = %s"
        result = execute_query(query, (wechat_user_id,))
        if result:
            return WechatUser.from_db_row(result[0])
        return None

    @staticmethod
    def update_wechat_user(wechat_user_id: int, nickname: str = None,
                          avatar_url: str = None) -> Optional['WechatUser']:
        """
        更新微信用户信息

        Args:
            wechat_user_id: 微信用户ID
            nickname: 昵称
            avatar_url: 头像URL

        Returns:
            更新后的微信用户对象
        """
        from .models import WechatUser
        try:
            updates = []
            params = []

            if nickname is not None:
                updates.append("nickname = %s")
                params.append(nickname)
            if avatar_url is not None:
                updates.append("avatar_url = %s")
                params.append(avatar_url)

            if not updates:
                return WechatUserService.get_wechat_user_by_id(wechat_user_id)

            updates.append("updated_at = %s")
            params.append(datetime.now())
            params.append(wechat_user_id)

            query = f"UPDATE wechat_users SET {', '.join(updates)} WHERE id = %s"
            execute_update(query, tuple(params))
            return WechatUserService.get_wechat_user_by_id(wechat_user_id)
        except Exception as e:
            logger.error(f"更新微信用户失败: {e}")
            raise

    @staticmethod
    def delete_wechat_user(wechat_user_id: int) -> bool:
        """
        删除微信用户

        Args:
            wechat_user_id: 微信用户ID

        Returns:
            是否删除成功
        """
        try:
            query = "DELETE FROM wechat_users WHERE id = %s"
            affected = execute_delete(query, (wechat_user_id,))
            return affected > 0
        except Exception as e:
            logger.error(f"删除微信用户失败: {e}")
            raise

    @staticmethod
    def is_wechat_bound(user_id: int) -> bool:
        """
        检查用户是否已绑定微信

        Args:
            user_id: 用户ID

        Returns:
            是否已绑定
        """
        wechat_user = WechatUserService.get_wechat_user_by_user_id(user_id)
        return wechat_user is not None

    @staticmethod
    def bind_wechat_to_user(user_id: int, openid: str, unionid: str = None,
                           nickname: str = None, avatar_url: str = None) -> Optional['WechatUser']:
        """
        将微信绑定到用户

        Args:
            user_id: 用户ID
            openid: 微信openid
            unionid: 微信unionid
            nickname: 昵称
            avatar_url: 头像URL

        Returns:
            绑定成功返回微信用户对象，否则返回None
        """
        existing = WechatUserService.get_wechat_user_by_openid(openid)
        if existing:
            if existing.user_id == user_id:
                return existing
            logger.warning(f"openid {openid} 已被其他用户绑定")
            return None

        if WechatUserService.is_wechat_bound(user_id):
            logger.warning(f"用户 {user_id} 已绑定微信")
            return None

        return WechatUserService.create_wechat_user(
            user_id, openid, unionid, nickname, avatar_url
        )

    @staticmethod
    def unbind_wechat_from_user(user_id: int) -> bool:
        """
        解除用户的微信绑定

        Args:
            user_id: 用户ID

        Returns:
            是否解除成功
        """
        wechat_user = WechatUserService.get_wechat_user_by_user_id(user_id)
        if not wechat_user:
            return False
        return WechatUserService.delete_wechat_user(wechat_user.id)

    @staticmethod
    def get_wechat_login_url(state: str = None) -> str:
        """
        获取微信授权登录URL

        Args:
            state: 状态参数，用于防止CSRF攻击

        Returns:
            微信授权登录URL
        """
        import os
        appid = os.getenv("WECHAT_APP_ID", "")
        redirect_uri = os.getenv("WECHAT_REDIRECT_URI", "http://localhost:8000/api/auth/wechat/callback")
        
        if not state:
            import uuid
            state = str(uuid.uuid4())

        url = (
            f"https://open.weixin.qq.com/connect/qrconnect?"
            f"appid={appid}&redirect_uri={redirect_uri}"
            f"&response_type=code&scope=snsapi_login&state={state}#wechat_redirect"
        )
        return url

    @staticmethod
    def get_wechat_access_token(code: str) -> dict:
        """
        通过授权码获取微信访问令牌

        Args:
            code: 微信授权码

        Returns:
            包含access_token等信息的字典
        """
        import requests
        import os
        appid = os.getenv("WECHAT_APP_ID", "")
        appsecret = os.getenv("WECHAT_APP_SECRET", "")

        url = "https://api.weixin.qq.com/sns/oauth2/access_token"
        params = {
            "appid": appid,
            "secret": appsecret,
            "code": code,
            "grant_type": "authorization_code"
        }

        try:
            response = requests.get(url, params=params, timeout=10)
            return response.json()
        except Exception as e:
            logger.error(f"获取微信access_token失败: {e}")
            return {"errcode": -1, "errmsg": str(e)}

    @staticmethod
    def get_wechat_user_info(access_token: str, openid: str) -> dict:
        """
        获取微信用户信息

        Args:
            access_token: 访问令牌
            openid: 用户openid

        Returns:
            包含用户信息的字典
        """
        import requests
        url = "https://api.weixin.qq.com/sns/userinfo"
        params = {
            "access_token": access_token,
            "openid": openid
        }

        try:
            response = requests.get(url, params=params, timeout=10)
            return response.json()
        except Exception as e:
            logger.error(f"获取微信用户信息失败: {e}")
            return {"errcode": -1, "errmsg": str(e)}

    @staticmethod
    def process_wechat_login(code: str) -> Tuple[Optional[User], bool]:
        """
        处理微信登录

        Args:
            code: 微信授权码

        Returns:
            (用户对象, 是否为新用户)
        """
        token_info = WechatUserService.get_wechat_access_token(code)
        if token_info.get("errcode"):
            logger.error(f"微信登录失败: {token_info}")
            return None, False

        openid = token_info.get("openid")
        unionid = token_info.get("unionid")
        access_token = token_info.get("access_token")

        wechat_user = WechatUserService.get_wechat_user_by_openid(openid)
        if wechat_user:
            user = UserService.get_user_by_id(wechat_user.user_id)
            if user and user.status == UserStatus.ACTIVE:
                if access_token and unionid and unionid != wechat_user.unionid:
                    WechatUserService.update_wechat_user(
                        wechat_user.id, unionid=unionid
                    )
                return user, False
            return None, False

        user_info = WechatUserService.get_wechat_user_info(access_token, openid)
        nickname = user_info.get("nickname")
        avatar_url = user_info.get("headimgurl")

        username = f"wechat_{openid[:16]}"
        email = f"wechat_{openid[:16]}@placeholder.com"
        password = UserService.hash_password(openid)

        try:
            query = """
                INSERT INTO users (username, email, password_hash)
                VALUES (%s, %s, %s)
            """
            params = (username, email, password)
            user_id = execute_insert(query, params)
            if not user_id:
                return None, False

            MembershipService.create_membership_for_user(user_id)

            wechat_user = WechatUserService.create_wechat_user(
                user_id, openid, unionid, nickname, avatar_url
            )
            if not wechat_user:
                logger.error("创建微信用户关联失败")
                return None, False

            user = UserService.get_user_by_id(user_id)
            return user, True
        except Exception as e:
            logger.error(f"微信登录创建用户失败: {e}")
            return None, False
