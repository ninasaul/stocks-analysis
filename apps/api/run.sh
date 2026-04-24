#!/bin/bash

# 进入容器并自动执行命令
docker exec -it stock-end bash -c "
cd /app/apps/api &&

# 安装依赖
echo '===================' &&
echo '开始安装依赖...' &&
pip install -r requirements.txt &&
echo '依赖安装完成！' &&
echo '===================' &&

# 设置环境变量
echo "export PYTHONPATH=/app/apps/api" >> ~/.bashrc
echo "export HOST=0.0.0.0" >> ~/.bashrc
echo "export PORT=8011" >> ~/.bashrc
source ~/.bashrc

# 切换到app目录
cd /app/apps/api &&

# 启动后端服务
echo '===================' &&
echo '启动后端服务...' &&
echo '访问地址：http://localhost:8011' &&
echo 'API文档：http://localhost:8011/docs' &&
echo '===================' &&

# 启动FastAPI应用（与package.json保持一致）
python -m uvicorn app.main:app --host $HOST --port $PORT --reload
"