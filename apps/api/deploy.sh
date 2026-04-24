#!/bin/bash

# ===================== 配置项（你不用改）=====================
IMAGE_NAME="stock-end-app"
CONTAINER_NAME="stock-end"
HOST_PORT="8011"
CONTAINER_PORT="8011"
DOCKERFILE="stock-end.dockerfile"
# 本地代码目录挂载到容器
LOCAL_CODE_DIR="$HOME/stocks-analysis"

# ===================== 开始部署 =====================
echo -e "\n===== 1. 停止旧容器 ====="
docker stop $CONTAINER_NAME 2>/dev/null

echo -e "\n===== 2. 删除旧容器 ====="
docker rm $CONTAINER_NAME 2>/dev/null

echo -e "\n===== 3. 删除旧镜像 ====="
docker rmi $IMAGE_NAME 2>/dev/null

echo -e "\n===== 4. 构建新镜像（包含 git + vim）====="
docker build -t $IMAGE_NAME \
  --build-arg PY_IMAGE=docker.m.daocloud.io/library/python:3.13-slim \
  -f $DOCKERFILE .

echo -e "\n===== 5. 启动新容器（后台运行 + 端口8011 + 目录挂载）====="
docker run -d \
  --name $CONTAINER_NAME \
  -p $HOST_PORT:$CONTAINER_PORT \
  --restart always \
  -v $LOCAL_CODE_DIR:/app \
  $IMAGE_NAME

echo -e "\n===== 部署完成！====="
echo -e "容器名称：$CONTAINER_NAME"
echo -e "访问端口：$HOST_PORT"
echo -e "本地代码：$LOCAL_CODE_DIR <-> 容器 /app"
echo -e "进入容器命令：docker exec -it $CONTAINER_NAME bash"

docker ps --filter "name=$CONTAINER_NAME"