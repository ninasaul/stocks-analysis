#!/usr/bin/env bash
set -euo pipefail

# 将 apps/web 用 rsync 同步到 VPS，再在 VPS 上 docker build / compose（本机无需安装 Docker）。
# 腾讯云 CVM：常用登录用户为 ubuntu；建议在实例上配置 Docker 镜像加速，见
# https://cloud.tencent.com/document/product/1207/45596 （例如 https://mirror.ccs.tencentyun.com）。
#
# 必填环境变量：
#   VPS_HOST   SSH 目标，例如 ubuntu@203.0.113.10
#
# 配置方式：普通环境变量（export、CI、direnv 等）。
# 可选本地文件（每行 KEY=value，勿提交 git）：
#   scripts/deploy-web-vps.env   若存在则自动加载
#   DEPLOY_ENV_FILE=/某路径/x.env  指定文件时必须存在
#
# 可选环境变量（远端代码目录默认 ~/stocks-analysis-simple）：
#   REMOTE_REPO_SUBDIR   登录用户在 VPS 家目录下的子目录名（默认 stocks-analysis-simple）
#   REMOTE_REPO_ABSPATH  若设置则改用该绝对路径（须以 / 开头）
#   WEB_IMAGE            镜像名:标签（默认 stocks-web:latest）
#   WEB_PORT             宿主机映射到容器 3000 的端口（默认 3000）
#   NEXT_PUBLIC_*        传入 docker build 的构建参数（见 apps/web）
#   DOCKER_NODE_IMAGE    可选；拉不动 Docker Hub 时作为 NODE_IMAGE 传入（如 DaoCloud 等镜像全名）
#   SSH_IDENTITY_FILE / SSH_CERTIFICATE_FILE  同 ssh -i 与 CertificateFile
#   SKIP_RSYNC           为 1 时不同步，仅在 VPS 已有目录上执行 build + compose
#   RSYNC_DELETE         为 1 时 rsync 带 --delete（与本地完全一致，慎用）
#   DEPLOY_SSH_KEYGEN_R   为 1 时先 ssh-keygen -R 主机，并本回合使用 StrictHostKeyChecking=accept-new
#   DEPLOY_SSH_ACCEPT_NEW 为 1 时使用 StrictHostKeyChecking=accept-new（首次非交互信任新主机）
#
# 示例：
#   export VPS_HOST=ubuntu@你的公网IP
#   export SSH_IDENTITY_FILE="$HOME/.ssh/keys/server.pem"
#   export NEXT_PUBLIC_API_BASE_URL=https://api.example.com
#   export NEXT_PUBLIC_SITE_URL=https://www.example.com
#   export NEXT_PUBLIC_USE_MOCK_FLOW=false
#   ./scripts/deploy-web-vps.sh
#
# 仅测 SSH（共用 deploy-web-vps.env 与上述 SSH 相关变量）：
#   ./scripts/deploy-web-vps.sh --ssh-test
#   ./scripts/test-vps-ssh.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -n "${DEPLOY_ENV_FILE:-}" ]]; then
  if [[ -f "${DEPLOY_ENV_FILE}" ]]; then
    echo "==> 加载 ${DEPLOY_ENV_FILE}"
    set -a
    # shellcheck source=/dev/null
    source "${DEPLOY_ENV_FILE}"
    set +a
  else
    echo "error: 已设置 DEPLOY_ENV_FILE 但不是有效文件: ${DEPLOY_ENV_FILE}" >&2
    exit 1
  fi
elif [[ -f "${ROOT_DIR}/scripts/deploy-web-vps.env" ]]; then
  echo "==> 加载 scripts/deploy-web-vps.env"
  set -a
  # shellcheck source=/dev/null
  source "${ROOT_DIR}/scripts/deploy-web-vps.env"
  set +a
fi

REMOTE_REPO_SUBDIR="${REMOTE_REPO_SUBDIR:-}"
REMOTE_REPO_ABSPATH="${REMOTE_REPO_ABSPATH:-}"

if [[ -n "${REMOTE_REPO_ABSPATH}" ]]; then
  if [[ "${REMOTE_REPO_ABSPATH}" != /* ]]; then
    echo "error: REMOTE_REPO_ABSPATH 须为 VPS 上的绝对路径（以 / 开头）" >&2
    exit 1
  fi
elif [[ -z "${REMOTE_REPO_SUBDIR}" ]]; then
  REMOTE_REPO_SUBDIR="stocks-analysis-simple"
fi

WEB_IMAGE="${WEB_IMAGE:-stocks-web:latest}"
WEB_PORT="${WEB_PORT:-3000}"
REMOTE_COMPOSE_REL="apps/web/docker-compose.vps.yml"

if [[ -z "${VPS_HOST:-}" ]]; then
  echo "error: 请设置 VPS_HOST（例如 ubuntu@203.0.113.10）" >&2
  exit 1
fi

if [[ "${DEPLOY_SSH_KEYGEN_R:-}" == "1" ]]; then
  _ssh_host="${VPS_HOST##*@}"
  echo "==> DEPLOY_SSH_KEYGEN_R=1: 从本机 known_hosts 移除 ${_ssh_host} 的旧主机密钥"
  ssh-keygen -R "${_ssh_host}" 2>/dev/null || true
fi

# 私钥路径里常见全角波浪号，归一成半角 ~
if [[ -n "${SSH_IDENTITY_FILE:-}" ]]; then
  SSH_IDENTITY_FILE="${SSH_IDENTITY_FILE//～/~}"
  if [[ "${SSH_IDENTITY_FILE}" == ~* ]]; then
    SSH_IDENTITY_FILE="${SSH_IDENTITY_FILE/#\~/${HOME}}"
  fi
fi

SSH_ARGS=()
if [[ -n "${SSH_IDENTITY_FILE:-}" ]]; then
  SSH_ARGS+=(-i "$SSH_IDENTITY_FILE")
fi
if [[ -n "${SSH_CERTIFICATE_FILE:-}" ]]; then
  SSH_CERTIFICATE_FILE="${SSH_CERTIFICATE_FILE//～/~}"
  if [[ "${SSH_CERTIFICATE_FILE}" == ~* ]]; then
    SSH_CERTIFICATE_FILE="${SSH_CERTIFICATE_FILE/#\~/${HOME}}"
  fi
  SSH_ARGS+=(-o "CertificateFile=${SSH_CERTIFICATE_FILE}")
fi
if [[ "${DEPLOY_SSH_ACCEPT_NEW:-}" == "1" || "${DEPLOY_SSH_KEYGEN_R:-}" == "1" ]]; then
  SSH_ARGS+=(-o "StrictHostKeyChecking=accept-new")
fi

if [[ "${1:-}" == "--ssh-test" ]] || [[ "${DEPLOY_SSH_TEST:-}" == "1" ]]; then
  echo "==> SSH 连通性测试 -> ${VPS_HOST}"
  ssh "${SSH_ARGS[@]}" "$VPS_HOST" 'echo "OK: 已在远端执行 shell"; hostname; whoami; uname -srm; command -v docker >/dev/null 2>&1 && docker --version || echo "docker: 未安装"'
  echo "==> SSH 测试通过。"
  exit 0
fi

RSYNC_EXCLUDES=(
  --exclude=.git
  --exclude=.github
  --exclude=node_modules
  --exclude=apps/web/node_modules
  --exclude=apps/api/node_modules
  --exclude=apps/mp-weixin/node_modules
  --exclude=apps/web/.next
  --exclude=apps/web/.wrangler
  --exclude=apps/api/.venv
  --exclude=.turbo
  --exclude=__pycache__
  --exclude='*.pyc'
  --exclude=apps/api/data
  --exclude='*.db'
  --exclude='*.sqlite'
  --exclude='*.sqlite-shm'
  --exclude='*.sqlite-wal'
)

RSYNC_FLAGS=(-az)
if [[ "${RSYNC_DELETE:-}" == "1" ]]; then
  RSYNC_FLAGS+=(--delete)
fi

# rsync 通过 -e 调用 ssh
RSYNC_SSH="ssh"
for a in "${SSH_ARGS[@]}"; do
  RSYNC_SSH+=" $(printf '%q' "$a")"
done

if [[ -n "${REMOTE_REPO_ABSPATH}" ]]; then
  RSYNC_REMOTE="${VPS_HOST}:${REMOTE_REPO_ABSPATH}/"
else
  RSYNC_REMOTE="${VPS_HOST}:~/${REMOTE_REPO_SUBDIR}/"
fi

if [[ "${SKIP_RSYNC:-}" != "1" ]]; then
  echo "==> rsync 同步项目 -> ${RSYNC_REMOTE}"
  rsync "${RSYNC_FLAGS[@]}" -e "$RSYNC_SSH" \
    "${RSYNC_EXCLUDES[@]}" \
    "${ROOT_DIR}/" "${RSYNC_REMOTE}"
else
  echo "==> SKIP_RSYNC=1: 使用 VPS 上已有目录（${RSYNC_REMOTE}）"
fi

BUILD_ARGS=()
if [[ -n "${NEXT_PUBLIC_API_BASE_URL:-}" ]]; then
  BUILD_ARGS+=(--build-arg "NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}")
fi
if [[ -n "${NEXT_PUBLIC_SITE_URL:-}" ]]; then
  BUILD_ARGS+=(--build-arg "NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}")
fi
if [[ -n "${NEXT_PUBLIC_USE_MOCK_FLOW:-}" ]]; then
  BUILD_ARGS+=(--build-arg "NEXT_PUBLIC_USE_MOCK_FLOW=${NEXT_PUBLIC_USE_MOCK_FLOW}")
fi
if [[ -n "${DOCKER_NODE_IMAGE:-}" ]]; then
  BUILD_ARGS+=(--build-arg "NODE_IMAGE=${DOCKER_NODE_IMAGE}")
fi

quoted_build_args=()
for a in "${BUILD_ARGS[@]}"; do
  quoted_build_args+=("$(printf '%q' "$a")")
done
build_arg_shell="${quoted_build_args[*]}"

echo "==> 远端: docker build + compose（${REMOTE_COMPOSE_REL}）"
if [[ -n "${REMOTE_REPO_ABSPATH}" ]]; then
  ssh "${SSH_ARGS[@]}" "$VPS_HOST" bash <<EOF
set -euo pipefail
$(printf 'cd %q' "${REMOTE_REPO_ABSPATH}")
docker build -f apps/web/Dockerfile -t $(printf '%q' "${WEB_IMAGE}") ${build_arg_shell} .
export WEB_IMAGE=$(printf '%q' "${WEB_IMAGE}")
export WEB_PORT=$(printf '%q' "${WEB_PORT}")
docker compose -f "${REMOTE_COMPOSE_REL}" up -d
docker compose -f "${REMOTE_COMPOSE_REL}" ps
EOF
else
  ssh "${SSH_ARGS[@]}" "$VPS_HOST" bash <<EOF
set -euo pipefail
cd "\$HOME/${REMOTE_REPO_SUBDIR}"
docker build -f apps/web/Dockerfile -t $(printf '%q' "${WEB_IMAGE}") ${build_arg_shell} .
export WEB_IMAGE=$(printf '%q' "${WEB_IMAGE}")
export WEB_PORT=$(printf '%q' "${WEB_PORT}")
docker compose -f "${REMOTE_COMPOSE_REL}" up -d
docker compose -f "${REMOTE_COMPOSE_REL}" ps
EOF
fi

echo "==> 完成。浏览器访问示例: http://${VPS_HOST#*@}:${WEB_PORT}（或经 nginx/Caddy 反代与 HTTPS）。"
