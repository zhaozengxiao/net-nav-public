# ===== 阶段一：构建前端 =====
FROM node:20-alpine AS web-build
WORKDIR /build
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ===== 阶段二：后端运行 =====
FROM node:20-alpine
WORKDIR /app

# better-sqlite3 需 node-gyp 编译：装 Python + 编译工具
RUN apk add --no-cache python3 make g++

COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=web-build /build/dist ./public

# 构建时注入当前 commit，用于"检查更新"
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT

ENV PORT=6666
EXPOSE 6666

# 数据目录挂载卷（数据库持久化）
VOLUME ["/app/data"]
ENV DB_PATH=/app/data/nav.db

CMD ["node", "index.js"]
