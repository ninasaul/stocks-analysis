#!/bin/bash

# 进入容器并启动后端服务
# 环境变量已在 Dockerfile 中设置好，此脚本只需安装依赖并启动服务

docker exec stock-end bash -c "
cd /app/apps/api &&

echo '==================='
echo '检查并安装依赖...'
pip install -r requirements.txt -q
echo '依赖安装完成'
echo '==================='

echo '==================='
echo '启动后端服务...'
echo '访问地址：http://localhost:8011'
echo 'API文档：http://localhost:8011/docs'
echo '==================='

nohup python -m uvicorn app.main:app --host \$HOST --port \$PORT > app.log 2>&1 &

sleep 2
if ps aux | grep -v grep | grep uvicorn > /dev/null; then
    echo '后端服务启动成功！'
else
    echo '后端服务启动失败，请检查日志'
    cat app.log
fi
echo '==================='
"