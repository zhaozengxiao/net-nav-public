# 🛰️ 内网服务导航 (net-nav)

自托管的内网服务导航页：服务卡片 + 在线状态实时推送 + 自动发现 + 拖拽排序。

## 功能
- 🏠 **导航首页**：翻页时钟、搜索、服务卡片（在线状态圆点、品牌色图标、SSE 实时状态）
- ⚙️ **免密后台**：服务增删改、拖拽排序、自动发现网段扫描（TCP 探测 + HTTP 标题识别）
- 🌐 **动态背景**：tsParticles 粒子 + 彩色光斑（纯本地资源，零 CDN）
- 📱 **移动端适配**：桌面表格 / 移动卡片双布局

## 技术栈
- 后端：Node.js + Express + SQLite (better-sqlite3)
- 前端：Vue 3 + Vite + Element Plus
- 实时：SSE（服务端推送，零轮询）

## 启动
```bash
# 后端（端口 6666）
cd server && npm install && node index.js

# 前端开发（端口 8888，代理 /api 到后端）
cd web && npm install && npm run dev

# 前端构建
cd web && npm run build
```

## Docker 部署（单端口 6666，含前端构建产物）
```bash
# 构建并启动
docker compose up -d --build

# 更新到最新版（仓库有新提交时）
docker compose build --build-arg GIT_COMMIT=$(git rev-parse HEAD) && docker compose up -d
```
- 数据库挂载在 `./data/nav.db`，升级不丢数据
- 后台顶部"🔄 检查更新"可对比 GitHub 最新提交

## 配置
- 服务数据存于 `server/nav.db`（首次运行自动建库）
- 默认端口 6666 / 8888，可在 `server/index.js` 与 `web/vite.config.ts` 修改
- 后台地址 `/admin`（免密，内网自用）
