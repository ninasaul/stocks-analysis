# SchedulerManager 使用文档

## 概述

`SchedulerManager` 是一个基于 APScheduler 的定时任务管理器，采用单例模式设计，用于管理应用中的各种定时任务。当前主要用于自动重置会员的每日 API 调用次数，同时也支持添加其他类型的定时任务。

## 目录结构

```
apps/api/app/core/
├── scheduler.py     # 定时任务管理器
└── database.py      # 数据库管理
```

## 核心功能

### 1. 自动重置 API 调用次数
- 每天 0 时 0 分 0 秒自动重置所有会员的 API 调用次数
- 无需手动干预，系统自动执行

### 2. 任务管理
- 支持添加多个不同时间的定时任务
- 支持暂停、恢复、移除任务
- 支持查询所有任务的状态

## 使用方法

### 1. 基本使用

#### 导入
```python
from app.core.scheduler import scheduler_manager
```

#### 启动定时任务
```python
# 在应用启动时调用
scheduler_manager.start()
```

#### 关闭定时任务
```python
# 在应用关闭时调用
scheduler_manager.shutdown()
```

### 2. 添加新任务

#### 添加每天执行的任务
```python
from apscheduler.triggers.cron import CronTrigger

def daily_task():
    """每天执行的任务"""
    print("执行每日任务")

# 每天 8:30 执行
scheduler_manager.scheduler.add_job(
    daily_task,
    trigger=CronTrigger(hour=8, minute=30, second=0),
    id='daily_task',
    name='每日任务',
    replace_existing=True
)
```

#### 添加每周执行的任务
```python
from apscheduler.triggers.cron import CronTrigger

def weekly_task():
    """每周执行的任务"""
    print("执行每周任务")

# 每周一 9:00 执行
scheduler_manager.scheduler.add_job(
    weekly_task,
    trigger=CronTrigger(day_of_week=0, hour=9, minute=0, second=0),
    id='weekly_task',
    name='每周任务',
    replace_existing=True
)
```

#### 添加固定间隔执行的任务
```python
from apscheduler.triggers.interval import IntervalTrigger

def interval_task():
    """每小时执行的任务"""
    print("执行每小时任务")

# 每小时执行一次
scheduler_manager.scheduler.add_job(
    interval_task,
    trigger=IntervalTrigger(hours=1),
    id='interval_task',
    name='每小时任务',
    replace_existing=True
)
```

### 3. 管理任务

#### 获取所有任务
```python
jobs = scheduler_manager.get_jobs()
print("当前任务列表:")
for job in jobs:
    print(f"ID: {job['id']}, 名称: {job['name']}, 下次执行: {job['next_run_time']}")
```

#### 移除任务
```python
# 根据任务ID移除任务
scheduler_manager.scheduler.remove_job('task_id')
```

#### 暂停任务
```python
# 暂停指定任务
scheduler_manager.scheduler.pause_job('task_id')
```

#### 恢复任务
```python
# 恢复指定任务
scheduler_manager.scheduler.resume_job('task_id')
```

## 触发器类型

### 1. CronTrigger

基于 cron 表达式的触发器，支持复杂的时间规则。

**参数说明：**
- `year` - 年份
- `month` - 月份 (1-12)
- `day` - 日 (1-31)
- `week` - 周 (1-53)
- `day_of_week` - 星期几 (0-6, 0=周日)
- `hour` - 小时 (0-23)
- `minute` - 分钟 (0-59)
- `second` - 秒 (0-59)

**示例：**
- `CronTrigger(hour=0, minute=0, second=0)` - 每天 0 点
- `CronTrigger(day_of_week=0, hour=9, minute=0)` - 每周日 9 点
- `CronTrigger(month=1, day=1, hour=0, minute=0)` - 每年元旦

### 2. IntervalTrigger

按固定时间间隔执行的触发器。

**参数说明：**
- `weeks` - 周数
- `days` - 天数
- `hours` - 小时数
- `minutes` - 分钟数
- `seconds` - 秒数
- `start_date` - 开始日期
- `end_date` - 结束日期

**示例：**
- `IntervalTrigger(hours=1)` - 每小时执行
- `IntervalTrigger(minutes=30)` - 每 30 分钟执行
- `IntervalTrigger(days=1)` - 每天执行

### 3. DateTrigger

在特定日期时间执行一次的触发器。

**参数说明：**
- `run_date` - 执行日期时间

**示例：**
- `DateTrigger(run_date='2026-12-31 23:59:59')` - 在指定时间执行一次

## 任务管理最佳实践

1. **任务 ID 唯一性**：每个任务的 `id` 应该唯一，便于管理
2. **任务命名**：为任务设置有意义的 `name`，便于识别
3. **错误处理**：在任务函数中添加异常处理，避免任务执行失败影响其他任务
4. **日志记录**：在任务中添加适当的日志，便于调试和监控
5. **资源清理**：任务执行完成后，确保清理占用的资源

## 示例：添加数据库备份任务

```python
import os
import datetime
from app.core.scheduler import scheduler_manager
from apscheduler.triggers.cron import CronTrigger

def backup_database():
    """数据库备份任务"""
    try:
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_file = f"backup_{timestamp}.sql"
        
        # 执行数据库备份命令
        os.system(f"pg_dump -U postgres -d stocks_analysis > {backup_file}")
        
        print(f"数据库备份完成: {backup_file}")
    except Exception as e:
        print(f"数据库备份失败: {e}")

# 每天凌晨 2 点执行数据库备份
scheduler_manager.scheduler.add_job(
    backup_database,
    trigger=CronTrigger(hour=2, minute=0, second=0),
    id='backup_database',
    name='数据库备份',
    replace_existing=True
)
```

## 示例：添加会员过期检查任务

```python
from app.core.scheduler import scheduler_manager
from app.user_management.services import MembershipService
from apscheduler.triggers.interval import IntervalTrigger

def check_membership_expiry():
    """检查会员过期任务"""
    try:
        # 检查并更新过期会员状态
        # 这里需要在 MembershipService 中实现相应的方法
        print("会员过期检查完成")
    except Exception as e:
        print(f"会员过期检查失败: {e}")

# 每小时检查一次会员过期情况
scheduler_manager.scheduler.add_job(
    check_membership_expiry,
    trigger=IntervalTrigger(hours=1),
    id='check_membership_expiry',
    name='会员过期检查',
    replace_existing=True
)
```

## 故障排除

### 1. 任务不执行
- 检查定时任务是否已启动：`scheduler_manager.scheduler.running`
- 检查任务是否存在：`scheduler_manager.get_jobs()`
- 检查任务的下次执行时间：`job.next_run_time`
- 检查日志中是否有错误信息

### 2. 任务执行失败
- 在任务函数中添加异常处理
- 检查任务函数的参数是否正确
- 检查任务依赖的资源是否可用

### 3. 应用重启后任务丢失
- 任务会在应用重启时重新添加，因为 `start()` 方法会重新注册任务
- 确保任务注册代码在应用启动时执行

## 总结

`SchedulerManager` 提供了一个简单而强大的定时任务管理机制，通过以下特性满足应用的定时任务需求：

- **单例模式**：确保全局只有一个调度器实例
- **后台运行**：不阻塞主应用
- **灵活配置**：支持多种类型的触发器
- **易于管理**：提供任务的添加、删除、暂停、恢复等操作
- **可扩展性**：可以根据需要添加各种定时任务

通过合理使用 `SchedulerManager`，可以使应用的定时任务管理更加规范和高效。