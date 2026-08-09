# 🤖 AI 编辑服务接口文档

本文档供 **AI 助手 / 脚本 / 程序** 通过 HTTP 接口管理内网服务导航（net-nav）的服务列表。
所有接口返回 JSON。默认端口 `6666`（按实际部署地址替换 `HOST`）。

---

## 1. 认证（免密，两步）

内网自用，登录接口直接发放会话 token（无需密码）。**所有 `/api/admin/*` 写接口需带 `Authorization: Bearer <token>`**。

```bash
HOST=http://192.168.50.203:6666
TOKEN=$(curl -s -X POST $HOST/api/admin/login -H 'Content-Type: application/json' -d '{}' | sed 's/.*"token":"\([^"]*\)".*/\1/')
AUTH="Authorization: Bearer $TOKEN"
```

> token 有效期：保留最近 10 个会话，过期返回 `401`，重新登录即可。

---

## 2. 服务字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 服务名称 |
| `url` | string | ✅ | 访问地址（http/https） |
| `description` | string | - | 描述，默认空 |
| `icon` | string | - | emoji 图标，默认 🔗 |
| `color` | string | - | 品牌色，默认 `#38bdf8` |
| `sort` | number | - | 排序值，默认 0 |
| `docker_container` | string | - | Docker 容器名，如 `new-api`（留空不检测镜像更新） |
| `docker_image` | string | - | Docker 镜像名:tag，如 `calciumion/new-api:latest`（配合容器名检测更新） |
| `clicks` | number | 只读 | 点击次数（勿提交） |
| `status` | object | 只读 | 在线状态 `{online, ms, code, checkedAt}` |
| `docker` | object | 只读 | 镜像更新检测结果 `{status, checkedAt}`，status: latest / update / checking / notfound / error |

---

## 3. 接口一览

### 3.1 查询服务列表（公开，无需认证）
```bash
GET /api/services
```
响应：服务数组，含 `status` 在线状态。**AI 第一步先查这个了解现状。**

### 3.2 查询单个服务
```bash
GET /api/admin/services/:id          # 需认证
```

### 3.3 新增服务
```bash
POST /api/admin/services
Content-Type: application/json
Authorization: Bearer <token>

{ "name": "GitLab", "url": "http://192.168.50.10", "icon": "🦊", "color": "#f97316", "description": "代码仓库" }

如需 Docker 镜像更新检测，加上两个字段：
```json
{ "name": "New API", "url": "http://192.168.50.242:3333", "docker_container": "new-api", "docker_image": "calciumion/new-api:latest" }
```
```
响应：`{ "id": 21 }`

### 3.4 编辑服务
```bash
PUT /api/admin/services/:id          # 需认证，字段可部分提交
{ "name": "GitLab CE", "color": "#e24329" }
```
响应：`{ "ok": true }`

### 3.5 删除服务
```bash
DELETE /api/admin/services/:id       # 需认证
```
响应：`{ "ok": true }`

### 3.6 拖拽排序（按顺序重排）
```bash
PUT /api/admin/services/reorder      # 需认证
{ "ids": [21, 15, 17, 18] }         # 按数组顺序设置 sort
```
响应：`{ "ok": true }`

### 3.7 自动发现网段
```bash
POST /api/admin/scan                 # 需认证
{ "network": "192.168.1.0/24", "mode": "fast" }
```
响应：`{ "found": [{ "ip", "port", "title", "url" }], "elapsed": 1234 }`
> `mode`: `fast`(常用端口) / `full`(全端口，慢)。扫描结果需前端手动导入，AI 可直接用返回的 `url`+`title` 调 3.3 新增。

---

## 4. 典型工作流（AI 用）

```bash
HOST=http://192.168.50.203:6666

# ① 登录
TOKEN=$(curl -s -X POST $HOST/api/admin/login -H 'Content-Type: application/json' -d '{}' | sed 's/.*"token":"\([^"]*\)".*/\1/')

# ② 查现状
curl -s $HOST/api/services | python3 -m json.tool

# ③ 新增一个服务
curl -s -X POST $HOST/api/admin/services \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Router","url":"http://192.168.50.1","icon":"📶","color":"#22c55e"}'

# ④ 编辑（按 id）
curl -s -X PUT $HOST/api/admin/services/21 \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"description":"路由器后台"}'

# ⑤ 删除
curl -s -X DELETE $HOST/api/admin/services/21 -H "Authorization: Bearer $TOKEN"
```

---

## 5. 错误格式

| 状态码 | 含义 |
|--------|------|
| 400 | 参数缺失/非法（如新增时 name、url 为空） |
| 401 | 未登录或 token 过期 |
| 404 | 服务不存在 |

错误响应统一：`{ "error": "中文说明" }`

---

## 6. 实时状态（可选）

`GET /api/events` 为 SSE 长连接，推送服务状态变化；普通 AI 管理服务无需订阅。
