"""业务逻辑层"""
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Tuple
import hashlib
import logging
import re
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
    def get_user_by_phone(phone: str) -> Optional[User]:
        """根据手机号获取用户（不含空串）"""
        if not phone or not str(phone).strip():
            return None
        query = "SELECT * FROM users WHERE phone = %s"
        result = execute_query(query, (str(phone).strip(),))
        if result:
            return User.from_db_row(result[0])
        return None

    @staticmethod
    def _sanitize_username(raw: str) -> str:
        """
        将昵称/输入清洗成系统用户名：
        - 仅保留 [a-zA-Z0-9_-]
        - 长度 3~50
        """
        if not raw:
            return "wechat_user"
        v = re.sub(r"[^a-zA-Z0-9_-]+", "_", str(raw)).strip("_")
        if not v:
            v = "wechat_user"
        if len(v) < 3:
            v = f"{v}_{'x' * (3 - len(v))}"
        return v[:50]

    @staticmethod
    def generate_unique_username(preferred: str, seed: str = "") -> str:
        """
        生成唯一用户名（基于 preferred 清洗后去重）。
        """
        base = UserService._sanitize_username(preferred)
        if not UserService.get_user_by_username(base):
            return base

        digest = hashlib.md5((seed or base).encode("utf-8")).hexdigest()[:6]
        candidate = f"{base[:43]}_{digest}"
        if not UserService.get_user_by_username(candidate):
            return candidate

        for i in range(2, 1000):
            suffix = f"_{i}"
            c = f"{base[:50 - len(suffix)]}{suffix}"
            if not UserService.get_user_by_username(c):
                return c
        # 极端情况下兜底
        return f"wechat_{hashlib.md5((base + seed).encode('utf-8')).hexdigest()[:12]}"

    @staticmethod
    def update_profile_fields(
        user_id: int,
        display_name: Optional[str] = None,
        avatar_url: Optional[str] = None,
    ) -> Optional[User]:
        """
        更新用户展示资料字段（display_name/avatar_url）。
        仅更新非空参数，避免覆盖已有信息。
        """
        updates = []
        params = []
        if display_name and str(display_name).strip():
            updates.append("display_name = %s")
            params.append(str(display_name).strip()[:100])
        if avatar_url and str(avatar_url).strip():
            updates.append("avatar_url = %s")
            params.append(str(avatar_url).strip()[:255])
        if not updates:
            return UserService.get_user_by_id(user_id)
        updates.append("updated_at = %s")
        params.append(datetime.now().astimezone())
        params.append(user_id)
        query = f"UPDATE users SET {', '.join(updates)} WHERE id = %s"
        execute_update(query, tuple(params))
        return UserService.get_user_by_id(user_id)

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
            if user_data.display_name is not None:
                updates.append("display_name = %s")
                value = user_data.display_name.strip()
                params.append(value[:100] if value else None)
            if user_data.avatar_url is not None:
                updates.append("avatar_url = %s")
                value = user_data.avatar_url.strip()
                params.append(value[:255] if value else None)
            if user_data.status is not None:
                updates.append("status = %s")
                params.append(user_data.status.value)

            if not updates:
                return UserService.get_user_by_id(user_id)

            updates.append("updated_at = %s")
            params.append(datetime.now().astimezone())
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

            start_date = datetime.now().astimezone()
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
            start_date = datetime.now().astimezone()
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
            params.append(datetime.now().astimezone())
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
            params = (status.value, datetime.now().astimezone(), membership_id)
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

            new_end_date = membership.end_date or datetime.now().astimezone()
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
                if membership.end_date and membership.end_date > datetime.now().astimezone():
                    end_date = membership.end_date
                else:
                    end_date = datetime.now().astimezone()

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
                datetime.now().astimezone(),
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
    def reset_monthly_api_calls():
        """重置所有会员的每月 API 调用次数"""
        try:
            query = """
                UPDATE memberships
                SET api_call_used = 0, updated_at = %s
                WHERE status = 'active'
            """
            execute_update(query, (datetime.now().astimezone(),))
            logger.info("每月 API 调用次数已重置")
        except Exception as e:
            logger.error(f"重置每月 API 调用次数失败: {e}")
            raise

    @staticmethod
    def reset_daily_api_calls():
        """兼容旧入口：调用每月重置逻辑。"""
        MembershipService.reset_monthly_api_calls()

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
                INSERT INTO api_call_logs (user_id, endpoint, method, response_status, call_time)
                VALUES (%s, %s, %s, %s, %s)
            """
            params = (user_id, endpoint, method, response_status, datetime.now().astimezone())
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

            today = datetime.now().astimezone().date()
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
            params = (membership.api_call_used, datetime.now().astimezone(), membership.id)
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
            params = (RefreshTokenStatus.EXPIRED.value, datetime.now().astimezone(), token_id)
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
            params = (RefreshTokenStatus.REVOKED.value, datetime.now().astimezone(), token_id)
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
                datetime.now().astimezone(), 
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
                datetime.now().astimezone(), 
                datetime.now().astimezone(), 
                RefreshTokenStatus.ACTIVE.value
            )
            affected = execute_update(query, params)
            if affected > 0:
                logger.info(f"清理了 {affected} 个过期刷新令牌")
        except Exception as e:
            logger.error(f"清理过期刷新令牌失败: {e}")
            raise

    @staticmethod
    def is_refresh_token_valid(user_id: int, token: str) -> bool:
        """
        检查刷新令牌是否有效

        Args:
            user_id: 用户ID
            token: 刷新令牌字符串

        Returns:
            是否有效
        """
        try:
            from .models import RefreshTokenStatus
            query = """
                SELECT id, status, expires_at
                FROM refresh_tokens
                WHERE user_id = %s AND token = %s
            """
            result = execute_query(query, (user_id, token))
            if not result:
                return False
            
            token_id, status, expires_at = result[0]
            
            # 检查状态是否为active
            if status != RefreshTokenStatus.ACTIVE.value:
                return False
            
            # 检查是否过期
            if expires_at < datetime.now().astimezone():
                # 标记为过期
                RefreshTokenService.mark_as_expired(token_id)
                return False
            
            return True
        except Exception as e:
            logger.error(f"检查刷新令牌有效性失败: {e}")
            return False

    @staticmethod
    def rotate_refresh_token(
        old_token: str,
        new_token: str,
        new_expires_at: datetime,
        user_id: Optional[int] = None,
    ) -> Optional[RefreshToken]:
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
            uid = old_refresh_token.user_id if old_refresh_token else user_id
            if uid is None:
                logger.error("刷新令牌轮换失败: 无法解析用户 ID")
                return None
            if old_refresh_token:
                RefreshTokenService.revoke_refresh_token(old_refresh_token.id)
            return RefreshTokenService.create_refresh_token(uid, new_token, new_expires_at)
        except Exception as e:
            logger.error(f"刷新令牌轮换失败: {e}")
            raise


class WechatUserService:
    """微信用户服务"""

    # 小程序服务端 access_token（cgi-bin/token），用于 getuserphonenumber 等
    _mp_access_token: Optional[str] = None
    _mp_access_token_expires_at: float = 0.0

    @staticmethod
    def _miniprogram_app_credentials() -> Tuple[str, str]:
        import os
        appid = os.getenv("WECHAT_MINIPROGRAM_APP_ID", "") or os.getenv("WECHAT_APP_ID", "")
        secret = os.getenv("WECHAT_MINIPROGRAM_APP_SECRET", "") or os.getenv("WECHAT_APP_SECRET", "")
        if not appid or not secret:
            raise ValueError("缺少小程序 AppID/AppSecret，无法换取服务端 access_token")
        return appid, secret

    @staticmethod
    def get_miniprogram_access_token() -> str:
        """
        获取小程序服务端 access_token（client_credential），带简单内存缓存。
        用于 wxa/business/getuserphonenumber 等接口。
        """
        import time
        import requests

        now = time.time()
        if (
            WechatUserService._mp_access_token
            and now < WechatUserService._mp_access_token_expires_at - 120
        ):
            return WechatUserService._mp_access_token

        appid, secret = WechatUserService._miniprogram_app_credentials()
        url = "https://api.weixin.qq.com/cgi-bin/token"
        resp = requests.get(
            url,
            params={"grant_type": "client_credential", "appid": appid, "secret": secret},
            timeout=10,
        )
        data = resp.json()
        if data.get("errcode"):
            raise RuntimeError(f"获取小程序 access_token 失败: {data}")
        token = data.get("access_token")
        if not token:
            raise RuntimeError(f"获取小程序 access_token 失败（无 access_token）: {data}")
        expires_in = int(data.get("expires_in", 7200))
        WechatUserService._mp_access_token = token
        WechatUserService._mp_access_token_expires_at = now + expires_in
        return token

    @staticmethod
    def get_phone_number_from_wxa_code(phone_code: str) -> Tuple[Optional[str], Optional[str]]:
        """
        使用「手机号获取 code」换取用户手机号（新版，无需 session_key 解密 encryptedData）。

        Args:
            phone_code: 小程序 button open-type=getPhoneNumber 回调里 e.detail.code

        Returns:
            (手机号, 错误信息) 成功时错误信息 None
        """
        import requests

        if not phone_code or not str(phone_code).strip():
            return None, "缺少手机号动态令牌 code"
        try:
            access_token = WechatUserService.get_miniprogram_access_token()
        except Exception as e:
            logger.error(f"小程序 access_token 失败: {e}")
            return None, str(e)

        url = f"https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token={access_token}"
        try:
            resp = requests.post(url, json={"code": phone_code.strip()}, timeout=10)
            data = resp.json()
        except Exception as e:
            logger.error(f"getuserphonenumber 请求失败: {e}")
            return None, str(e)

        if data.get("errcode") != 0:
            return None, data.get("errmsg", "getuserphonenumber 失败")

        info = data.get("phone_info") or {}
        phone = info.get("phoneNumber") or info.get("purePhoneNumber")
        if not phone:
            return None, "微信未返回手机号"
        return str(phone).strip(), None

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
                          avatar_url: str = None, unionid: str = None) -> Optional['WechatUser']:
        """
        更新微信用户信息

        Args:
            wechat_user_id: 微信用户ID
            nickname: 昵称
            avatar_url: 头像URL
            unionid: 微信 unionid（开放平台下可与多端账号关联）

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
            if unionid is not None:
                updates.append("unionid = %s")
                params.append(unionid)

            if not updates:
                return WechatUserService.get_wechat_user_by_id(wechat_user_id)

            updates.append("updated_at = %s")
            params.append(datetime.now().astimezone())
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
        获取微信开放平台「网站应用」PC 扫码登录 URL（qrconnect + scope=snsapi_login）。

        WECHAT_APP_ID 须为 open.weixin.qq.com 网站应用的 AppID；若误用公众号/小程序 AppID，
        用户扫码会报「Scope 参数错误或没有 Scope 权限」。

        Args:
            state: 状态参数，用于防止CSRF攻击

        Returns:
            微信授权登录URL
        """
        import os
        from urllib.parse import quote

        appid = os.getenv("WECHAT_APP_ID", "")
        redirect_uri = os.getenv("WECHAT_REDIRECT_URI", "http://localhost:3000/login/wechat")

        if not state:
            import uuid
            state = str(uuid.uuid4())

        redirect_q = quote(redirect_uri, safe="")
        state_q = quote(state, safe="")
        url = (
            "https://open.weixin.qq.com/connect/qrconnect?"
            f"appid={appid}&redirect_uri={redirect_q}"
            f"&response_type=code&scope=snsapi_login&state={state_q}#wechat_redirect"
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
    def get_wechat_jscode2session(code: str) -> dict:
        """
        小程序 wx.login 临时登录凭证校验（jscode2session）

        Args:
            code: wx.login 返回的 code

        Returns:
            含 openid、session_key，或 errcode/errmsg
        """
        import requests
        import os
        # 小程序登录允许独立于网页扫码的凭证；未配置时回退到 WECHAT_APP_* 以兼容旧配置
        appid = os.getenv("WECHAT_MINIPROGRAM_APP_ID", "") or os.getenv("WECHAT_APP_ID", "")
        appsecret = os.getenv("WECHAT_MINIPROGRAM_APP_SECRET", "") or os.getenv("WECHAT_APP_SECRET", "")
        if not appid or not appsecret:
            return {
                "errcode": -2,
                "errmsg": "缺少小程序微信配置（WECHAT_MINIPROGRAM_APP_ID/WECHAT_MINIPROGRAM_APP_SECRET）"
            }
        url = "https://api.weixin.qq.com/sns/jscode2session"
        params = {
            "appid": appid,
            "secret": appsecret,
            "js_code": code,
            "grant_type": "authorization_code",
        }
        try:
            response = requests.get(url, params=params, timeout=10)
            return response.json()
        except Exception as e:
            logger.error(f"jscode2session 请求失败: {e}")
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
                if wechat_user.nickname or wechat_user.avatar_url:
                    enriched = UserService.update_profile_fields(
                        user.id,
                        display_name=wechat_user.nickname,
                        avatar_url=wechat_user.avatar_url,
                    )
                    if enriched:
                        user = enriched
                return user, False
            return None, False

        user_info = WechatUserService.get_wechat_user_info(access_token, openid)
        nickname = user_info.get("nickname")
        avatar_url = user_info.get("headimgurl")

        username = UserService.generate_unique_username(
            nickname or f"wechat_{openid[:16]}",
            seed=openid,
        )
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

            UserService.update_profile_fields(
                user_id,
                display_name=nickname,
                avatar_url=avatar_url,
            )
            user = UserService.get_user_by_id(user_id)
            return user, True
        except Exception as e:
            logger.error(f"微信登录创建用户失败: {e}")
            return None, False

    @staticmethod
    def process_wechat_miniprogram_login(
        code: str,
        nickname: Optional[str] = None,
        avatar_url: Optional[str] = None,
    ) -> Tuple[Optional[User], bool, Optional[str]]:
        """
        处理微信小程序登录（jscode2session）

        小程序 openid 与网页扫码 openid 不同；若微信返回 unionid 且已绑定开放平台，
        可通过 unionid 与已有 wechat_users 记录关联到同一账号。

        Args:
            code: wx.login 返回的 code
            nickname: 小程序端已授权昵称（可选）
            avatar_url: 小程序端已授权头像（可选）

        Returns:
            (用户对象, 是否为新用户, 错误信息)
        """
        session = WechatUserService.get_wechat_jscode2session(code)
        if session.get("errcode"):
            logger.error(f"微信小程序登录失败: {session}")
            errcode = session.get("errcode")
            errmsg = session.get("errmsg", "未知错误")
            extra = ""
            # 40029 invalid code；40163 code been used。多为 AppID/Secret 与小程序不一致，或 code 已用过/过期。
            if errcode in (40029, 40163):
                extra = (
                    "。请核对：后端 WECHAT_MINIPROGRAM_APP_ID/WECHAT_MINIPROGRAM_APP_SECRET（未配置时回退的 "
                    "WECHAT_APP_ID/WECHAT_APP_SECRET）须与当前微信开发者工具里的「小程序 AppID」为同一应用；"
                    "且每个 wx.login 的 code 只能换 session 一次，勿重复请求或并发使用同一 code（约 5 分钟内有效）。"
                )
            return None, False, f"jscode2session 失败（errcode={errcode}）：{errmsg}{extra}"

        openid = session.get("openid")
        unionid = session.get("unionid")
        if not openid:
            return None, False, "jscode2session 未返回 openid"

        wechat_user = WechatUserService.get_wechat_user_by_openid(openid)
        if wechat_user:
            user = UserService.get_user_by_id(wechat_user.user_id)
            if user and user.status == UserStatus.ACTIVE:
                needs_update = (
                    (unionid and unionid != wechat_user.unionid)
                    or (nickname and nickname != wechat_user.nickname)
                    or (avatar_url and avatar_url != wechat_user.avatar_url)
                )
                if needs_update:
                    WechatUserService.update_wechat_user(
                        wechat_user.id,
                        unionid=unionid if unionid and unionid != wechat_user.unionid else None,
                        nickname=nickname if nickname and nickname != wechat_user.nickname else None,
                        avatar_url=avatar_url if avatar_url and avatar_url != wechat_user.avatar_url else None,
                    )
                if nickname or avatar_url or wechat_user.nickname or wechat_user.avatar_url:
                    enriched = UserService.update_profile_fields(
                        user.id,
                        display_name=nickname or wechat_user.nickname,
                        avatar_url=avatar_url or wechat_user.avatar_url,
                    )
                    if enriched:
                        user = enriched
                return user, False, None
            return None, False, "该微信关联账号不可用（不存在或已禁用）"

        if unionid:
            linked = WechatUserService.get_wechat_user_by_unionid(unionid)
            if linked:
                user = UserService.get_user_by_id(linked.user_id)
                if user and user.status == UserStatus.ACTIVE:
                    if nickname or avatar_url:
                        WechatUserService.update_wechat_user(
                            linked.id,
                            nickname=nickname,
                            avatar_url=avatar_url,
                        )
                        UserService.update_profile_fields(
                            user.id,
                            display_name=nickname,
                            avatar_url=avatar_url,
                        )
                    return user, False, None
                return None, False, "unionid 关联账号不可用（不存在或已禁用）"

        username = f"wechat_mp_{openid[:16]}"
        if nickname:
            username = UserService.generate_unique_username(nickname, seed=openid)
        email = f"wechat_mp_{openid[:16]}@placeholder.com"
        password = UserService.hash_password(openid)

        try:
            query = """
                INSERT INTO users (username, email, password_hash)
                VALUES (%s, %s, %s)
            """
            params = (username, email, password)
            user_id = execute_insert(query, params)
            if not user_id:
                return None, False, "创建用户失败（未返回 user_id）"

            MembershipService.create_membership_for_user(user_id)

            wechat_user = WechatUserService.create_wechat_user(
                user_id, openid, unionid, nickname, avatar_url
            )
            if not wechat_user:
                logger.error("创建微信用户关联失败")
                return None, False, "创建微信用户关联失败"

            UserService.update_profile_fields(
                user_id,
                display_name=nickname,
                avatar_url=avatar_url,
            )
            user = UserService.get_user_by_id(user_id)
            return user, True, None
        except Exception as e:
            logger.error(f"微信小程序登录创建用户失败: {e}")
            return None, False, f"微信小程序登录创建用户失败: {e}"


class TokenBlacklistService:
    """令牌黑名单服务"""

    @staticmethod
    def blacklist_token(token: str, user_id: int = 0, token_type: str = 'access', expires_at: datetime = None) -> bool:
        """
        将令牌加入黑名单

        Args:
            token: 要加入黑名单的令牌
            user_id: 用户ID
            token_type: 令牌类型 (access 或 refresh)
            expires_at: 令牌过期时间

        Returns:
            是否成功加入黑名单
        """
        try:
            if expires_at is None:
                # 默认过期时间为7天
                expires_at = datetime.now().astimezone() + timedelta(days=7)
            
            query = """
                INSERT INTO token_blacklist (token, token_type, user_id, expires_at, added_at)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (token) DO NOTHING
            """
            params = (token, token_type, user_id, expires_at, datetime.now().astimezone())
            execute_insert(query, params)
            logger.info(f"令牌已加入黑名单: {token[:20]}...")
            return True
        except Exception as e:
            logger.error(f"将令牌加入黑名单失败: {e}")
            return False

    @staticmethod
    def is_token_blacklisted(token: str) -> bool:
        """
        检查令牌是否在黑名单中

        Args:
            token: 要检查的令牌

        Returns:
            是否在黑名单中
        """
        try:
            query = """
                SELECT COUNT(*) FROM token_blacklist
                WHERE token = %s
            """
            result = execute_query(query, (token,))
            count = result[0][0]
            return count > 0
        except Exception as e:
            logger.error(f"检查令牌黑名单失败: {e}")
            return False

