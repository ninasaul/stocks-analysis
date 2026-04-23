# 在仓库根目录构建：
#   docker build -f apps/web/Dockerfile -t stocks-web:latest .
#
# NEXT_PUBLIC_* 在构建期写入；通过 --build-arg 传入。
# 若拉取 Docker Hub 超时（如国内 VPS），可覆盖基础镜像，例如：
#   --build-arg NODE_IMAGE=docker.m.daocloud.io/library/node:20-bookworm-slim

ARG NODE_IMAGE=node:20-bookworm-slim
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json turbo.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY apps/mp-weixin/package.json apps/mp-weixin/
RUN npm ci --workspace=web

ARG NODE_IMAGE=node:20-bookworm-slim
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json turbo.json ./
COPY apps/web ./apps/web
COPY apps/api/package.json apps/api/
COPY apps/mp-weixin/package.json apps/mp-weixin/

ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_USE_MOCK_FLOW
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_PUBLIC_USE_MOCK_FLOW=${NEXT_PUBLIC_USE_MOCK_FLOW}

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=web

ARG NODE_IMAGE=node:20-bookworm-slim
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
