# 🤖 AI 编辑服务接口文档

本文档供 **AI 助手 / 脚本 / 程序** 通过 HTTP 接口管理内网服务导航（net-nav）的服务列表。
所有接口返回 JSON。默认端口 `6666`（按实际部署地址替换 `HOST`）。

---

## 1. 认证（两步）

内网自用，默认免密登录直接发放会话 token（无需密码）。**所有 `/api/admin/*` 写接口需带 `Authorization: Bearer <token>`**。

> 可选加固：服务器设置环境变量 `ADMIN_PASSWORD` 后，登录需在 body 携带 `{ "password": "..." }`。

```bash
HOST=http://192.168.50.203:6666
TOKEN=$(curl -s -X POST $HOST/api/admin/login -H 'Content-Type: application/json' -d '{}' | sed 's/.*"token":"\([^"]*\)".*/\1/')
AUTH="Authorization: Bearer $TOKEN"
```

> token 有效期：保留最近 10 个会话，过期返回 `401`，重新登录即可。登录接口同一 IP 每分钟限 10 次。
> 注意：docker compose 部署时对外端口为 `8080`（6666 是 Chrome 不安全端口），HOST 按实际端口替换。

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
响应为 **NDJSON 流**（`application/x-ndjson`），每行一条消息，扫描过程中实时推送进度：
```
{"type":"progress","done":1234,"total":65280,"found":5}
{"type":"done","found":[{"ip":"192.168.1.1","port":80,"name":"HTTP Web","title":"路由器管理"}],"elapsed":12345}
```
- `mode`: `fast`(常用端口) / `full`(全端口，慢)；网段仅支持 `/24` 与 `/16`（其他前缀返回 `{"type":"error",...}`）
- 出错时最后一行：`{"type":"error","error":"..."}`
- 发现项字段为 `{ ip, port, name, title }`，无 `url` 字段；调用方可自行拼接 `http(s)://ip:port`（端口 443/8443 用 https）后调 3.3 新增服务。

### 3.8 导出服务（JSON，含分组结构）
```bash
GET /api/admin/services/export       # 需认证
```
响应：`net-nav-services.json`（`{ type: "net-nav-services", groups: [{ name, icon, sort, collapsed, services: [...] }], ungrouped: [...] }`），可在界面或脚本中持久化/迁移。

### 3.9 导入服务（JSON，去重合并）
```bash
POST /api/admin/services/import      # 需认证
Content-Type: application/json
Authorization: Bearer <token>

{ "type": "net-nav-services", "groups": [{ "name": "Home", "services": [{ "name": "GitLab", "url": "http://..." }] }] }
```
响应：`{ "ok": true, "addedGroups": 1, "addedServices": 6, "skippedServices": 0 }`
> 分组按名称复用/新建；服务按 `name+url` 去重；导入后自动异步探测新服务状态。

### 3.10 查询分组列表（公开）
```bash
GET /api/groups
```
响应：分组数组 `[{ "id": 1, "name": "Home", "icon": "📁", "sort": 0, "collapsed": 0 }]`（按 sort 排序）。首页分组模式按此顺序渲染，AI 可先查此了解分组结构。

### 3.11 新建分组
```bash
POST /api/admin/groups            # 需认证
{ "name": "开发", "icon": "📁" }
```
响应：`{ "id": 3 }`

### 3.12 重命名分组（或改图标/折叠状态）
```bash
PUT /api/admin/groups/:id         # 需认证，字段可部分提交
{ "name": "研发", "icon": "🛠️", "collapsed": false }
```
响应：`{ "ok": true }`

### 3.13 删除分组（含组内服务）
```bash
DELETE /api/admin/groups/:id      # 需认证
```
响应：`{ "ok": true }`
> ⚠️ 会连同该分组下全部服务一并删除。

### 3.14 分组排序
```bash
PUT /api/admin/groups/reorder     # 需认证
{ "ids": [3, 1, 2] }            # 按数组顺序设置 sort（后台拖拽 / 首页拖标题共用）
```
响应：`{ "ok": true }`
> 服务接口 3.3/3.4 支持 `group_id` 字段，可直接把服务分配到指定分组。

---

## 4. 书签管理接口（公开，无需认证）

书签数据模型：`{ id, name, url, sort, path }`
- `path`: 文件夹路径数组，如 `["工作","运维"]`；根目录为 `[]`
- `url` 为空的行 = 文件夹占位行（表示空文件夹，导入/导出时保留）

### 4.1 查询书签列表
```bash
GET /api/bookmarks
```
响应：书签数组，按 `sort` 排序（树先序）。AI 先查这个了解现有结构再操作。

### 4.2 新增文件夹
```bash
POST /api/bookmarks/new-folder
{ "parent": ["工作"], "name": "运维" }
```
响应：`{ "id": 21 }`（文件夹 = 占位行，`url` 为空）

### 4.3 重命名文件夹（含子树路径迁移）
```bash
POST /api/bookmarks/rename-folder
{ "oldPath": ["工作","运维"], "newName": "监控" }
```
响应：`{ "ok": true, "changed": 5 }`（所有以 oldPath 为前缀的书签路径一并迁移）

### 4.4 删除文件夹（含子内容）
```bash
POST /api/bookmarks/delete-folder
{ "path": ["工作","运维"] }
```
响应：`{ "ok": true, "removed": 5 }`（该文件夹及全部子书签被删除）

### 4.5 编辑/删除书签
```bash
PUT    /api/bookmarks/:id          # 编辑：{ "name"?, "url"? }
DELETE /api/bookmarks/:id          # 删除
```
> 新增单个书签暂未开放独立接口：批量新增用 4.8 导入（HTML 可直接构造）；移动书签用 4.6。

### 4.6 拖拽排序 + 跨文件夹移动
```bash
POST /api/bookmarks/reorder
{ "ids": [3, 1, 2], "paths": { "3": ["工作"] } }
```
响应：`{ "ok": true, "changed": 3 }`
> `ids` 按树先序重设 sort；`paths` 可选，`{ 书签id: 新路径 }` 用于跨文件夹迁移（与 ids 同请求一次持久化）。

### 4.7 连通性检测（流式）
```bash
POST /api/bookmarks/check-stream
{ "urls": ["http://192.168.50.10", "https://example.com"] }
```
响应：`application/x-ndjson` 流式输出，每完成一条立即推送一行，无需等全部：
```
{"url":"http://192.168.50.10","online":true,"ms":12,"code":200}
{"url":"https://example.com","online":false,"ms":-1,"code":null}
```
> 并发 12；探测不校验 TLS 证书（自签名 https 视为在线）；支持跟随重定向。

### 4.8 导入书签（浏览器 HTML）
```bash
POST /api/bookmarks/import
{ "html": "<!DOCTYPE NETSCAPE-Bookmark-file-1>..." }
```
响应：`{ "added": 10, "skipped": 3, "total": 13 }`（按 `url+path` 去重；空文件夹会重建占位行）

### 4.9 导出书签（浏览器 HTML）
```bash
GET /api/bookmarks/export
```
响应：`bookmarks.html`（Netscape 格式，保留树结构与排序，Chrome/Edge/火狐可直接导入；空文件夹保留）

---

## 5. 典型工作流（AI 用）

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

## 6. 错误格式

| 状态码 | 含义 |
|--------|------|
| 400 | 参数缺失/非法（如新增时 name、url 为空） |
| 401 | 未登录或 token 过期 |
| 404 | 服务不存在 |

错误响应统一：`{ "error": "中文说明" }`

---

## 7. 实时状态（可选）

`GET /api/events` 为 SSE 长连接，推送服务状态变化；普通 AI 管理服务无需订阅。
