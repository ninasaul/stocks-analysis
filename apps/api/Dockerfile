# 支持国内镜像替换
ARG PY_IMAGE=docker.m.daocloud.io/library/python:3.13-slim

FROM ${PY_IMAGE}

# 阿里云 apt 源
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources

# 安装 locales + git + vim（必须装 locales 才有 locale-gen！）
RUN apt update && apt install -y locales git vim procps net-tools iputils-ping curl wget

# 直接用系统自带 C.UTF-8，最稳、不报错、不折腾
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV PYTHONIOENCODING=utf-8

# ======================
# 关键：pip 阿里云加速
# ======================
RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/

EXPOSE 8011
WORKDIR /app

# 永久运行不退出
CMD ["sleep", "infinity"]