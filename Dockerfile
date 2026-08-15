# ===== 阶段一：构建前端 =====
FROM node:22-alpine AS web-build
WORKDIR /build
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ===== 阶段二：后端运行 =====
FROM node:22-alpine
WORKDIR /app

# better-sqlite3 v13 自带 linuxmusl 预编译二进制（prebuilds/ 随包分发，运行时按平台加载）。
# 注意：包里带 binding.gyp，npm 检测到会自动跑 node-gyp rebuild（Alpine 无 Python 会失败），
# 所以必须 --ignore-scripts 跳过编译，直接用预编译产物；ssh2 的 cpu-features 为可选依赖，
# 未编译时 ssh2 自动降级，不影响功能。
# 时区：容器日志/导出时间与本地（东八区）一致
RUN apk add --no-cache tzdata \
  && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
  && echo "Asia/Shanghai" > /etc/timezone

COPY server/package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY server/ ./
COPY --from=web-build /build/dist ./public

# 构建时注入当前 commit，用于"检查更新"
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT

ENV PORT=6666
ENV NODE_ENV=production
ENV TZ=Asia/Shanghai
EXPOSE 6666

# 数据目录：不声明 VOLUME（避免匿名卷"数据丢失"陷阱），挂载要求见 compose/README
# 非 root 运行（安全基线）。注意：bind mount 的 ./data 需宿主机 chown 1000:1000 ./data，
# 否则 node 用户无写权限、SQLite WAL 无法建库
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV DB_PATH=/app/data/nav.db

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:6666/api/services >/dev/null 2>&1 || exit 1

CMD ["node", "index.js"]
