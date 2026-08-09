// 入口：公开 API + 管理 API
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const db = require("./db");
const monitor = require("./monitor");
const { scanNetwork } = require("./scan");
const dockerCheck = require("./dockercheck");

const app = express();
const PORT = 6666;

app.use(cors());
app.use(express.json());

// ---------- SSE 连接管理 ----------
const clients = new Set();

function broadcast(event, payload) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) res.write(msg);
}

function statusSnapshot() {
  return [...monitor.cache.entries()].map(([id, status]) => ({ id, status }));
}

// 服务状态变化时推送给所有在线客户端
monitor.setOnChange((changed) => broadcast("status", changed));

// SSE 端点：浏览器长连接，状态变化实时推送
app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  clients.add(res);
  // 新连接立即同步当前全量快照（断线重连也不丢状态）
  res.write(`event: snapshot\ndata: ${JSON.stringify(statusSnapshot())}\n\n`);

  req.on("close", () => clients.delete(res));
});

// ---------- 管理认证（支持多会话，token 存列表互不踢） ----------
function getTokens() {
  try {
    return JSON.parse(db.prepare("SELECT value FROM settings WHERE key='admin_tokens'").get()?.value || "[]");
  } catch {
    return [];
  }
}

function adminAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token || !getTokens().includes(token)) {
    return res.status(401).json({ error: "未授权或登录已过期" });
  }
  next();
}

// 免密登录：内网自用，直接发放会话 token（token 机制保留，方便日后恢复密码）
app.post("/api/admin/login", (req, res) => {
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const tokens = getTokens();
  tokens.push(token);
  if (tokens.length > 10) tokens.splice(0, tokens.length - 10); // 保留最近 10 个会话
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_tokens', ?)").run(JSON.stringify(tokens));
  res.json({ token });
});

// ---------- 公开：导航数据（平铺服务列表，不再按分组返回） ----------
function defaultGroupId() {
  // 服务仍须归属某分组（DB 约束），统一归入第一个分组；无分组时兜底创建一个
  let g = db.prepare("SELECT id FROM groups ORDER BY sort, id LIMIT 1").get();
  if (!g) {
    const info = db.prepare("INSERT INTO groups (name, icon, sort) VALUES (?, ?, ?)").run("全部服务", "📌", 0);
    g = { id: info.lastInsertRowid };
  }
  return g.id;
}

app.get("/api/services", (req, res) => {
  const services = db.prepare("SELECT * FROM services ORDER BY sort, id").all();
  res.json(services.map((s) => ({ ...s, status: monitor.cache.get(s.id) || null, docker: dockerCache.get(s.id) || null })));
});

// 点击计数
app.post("/api/click/:id", (req, res) => {
  db.prepare("UPDATE services SET clicks = clicks + 1 WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ---------- 自动发现：扫描网段 ----------
app.post("/api/admin/scan", adminAuth, async (req, res) => {
  const { network, mode } = req.body || {};
  if (!network) return res.status(400).json({ error: "请输入网段，如 192.168.1.0/24" });
  try {
    const t0 = Date.now();
    const found = await scanNetwork(network, mode || "fast");
    res.json({ found, elapsed: Date.now() - t0 });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- 管理：分组 CRUD ----------
app.get("/api/admin/groups", adminAuth, (req, res) => {
  res.json(db.prepare("SELECT * FROM groups ORDER BY sort, id").all());
});

app.post("/api/admin/groups", adminAuth, (req, res) => {
  const { name, icon, sort, collapsed } = req.body || {};
  if (!name) return res.status(400).json({ error: "名称必填" });
  const info = db
    .prepare("INSERT INTO groups (name, icon, sort, collapsed) VALUES (?, ?, ?, ?)")
    .run(name, icon || "📁", sort || 0, collapsed ? 1 : 0);
  res.json({ id: info.lastInsertRowid });
});

app.put("/api/admin/groups/:id", adminAuth, (req, res) => {
  const g = db.prepare("SELECT * FROM groups WHERE id = ?").get(req.params.id);
  if (!g) return res.status(404).json({ error: "分组不存在" });
  const { name, icon, sort, collapsed } = req.body || {};
  db.prepare("UPDATE groups SET name=?, icon=?, sort=?, collapsed=? WHERE id=?").run(
    name ?? g.name,
    icon ?? g.icon,
    sort ?? g.sort,
    collapsed !== undefined ? (collapsed ? 1 : 0) : g.collapsed,
    g.id
  );
  res.json({ ok: true });
});

app.delete("/api/admin/groups/:id", adminAuth, (req, res) => {
  db.prepare("DELETE FROM services WHERE group_id = ?").run(req.params.id);
  db.prepare("DELETE FROM groups WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ---------- 管理：服务 CRUD ----------
app.post("/api/admin/services", adminAuth, (req, res) => {
  const { name, url, description, icon, color, sort, docker_container, docker_image } = req.body || {};
  if (!name || !url) return res.status(400).json({ error: "名称和地址必填" });
  const info = db
    .prepare(
      "INSERT INTO services (group_id, name, url, description, icon, color, sort, docker_container, docker_image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      defaultGroupId(),
      name,
      url,
      description || "",
      icon || "🔗",
      color || "#38bdf8",
      sort || 0,
      docker_container || "",
      docker_image || ""
    );
  monitor.probe(url).then((r) => monitor.cache.set(info.lastInsertRowid, r));
  if (docker_container && docker_image) queueDockerCheck(info.lastInsertRowid);
  res.json({ id: info.lastInsertRowid });
});

// 拖拽排序：按 ids 数组顺序重设 sort（必须放在 /:id 之前注册）
app.put("/api/admin/services/reorder", adminAuth, (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids 必填" });
  const tx = db.transaction(() => {
    ids.forEach((id, i) => db.prepare("UPDATE services SET sort = ? WHERE id = ?").run(i, id));
  });
  tx();
  res.json({ ok: true });
});

// 单个服务详情（AI 编辑前查询用）
app.get("/api/admin/services/:id", adminAuth, (req, res) => {
  const s = db.prepare("SELECT * FROM services WHERE id = ?").get(req.params.id);
  if (!s) return res.status(404).json({ error: "服务不存在" });
  res.json({ ...s, status: monitor.cache.get(s.id) || null });
});

app.put("/api/admin/services/:id", adminAuth, (req, res) => {
  const s = db.prepare("SELECT * FROM services WHERE id = ?").get(req.params.id);
  if (!s) return res.status(404).json({ error: "服务不存在" });
  const { name, url, description, icon, color, sort, docker_container, docker_image } = req.body || {};
  db.prepare(
    "UPDATE services SET group_id=?, name=?, url=?, description=?, icon=?, color=?, sort=?, docker_container=?, docker_image=? WHERE id=?"
  ).run(
    s.group_id,
    name ?? s.name,
    url ?? s.url,
    description ?? s.description,
    icon ?? s.icon,
    color ?? s.color,
    sort ?? s.sort,
    docker_container ?? s.docker_container,
    docker_image ?? s.docker_image,
    s.id
  );
  if (url && url !== s.url) monitor.probe(url).then((r) => monitor.cache.set(s.id, r));
  if (docker_container || docker_image) queueDockerCheck(s.id);
  res.json({ ok: true });
});

app.delete("/api/admin/services/:id", adminAuth, (req, res) => {
  db.prepare("DELETE FROM services WHERE id = ?").run(req.params.id);
  monitor.cache.delete(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- Docker 镜像更新检测 ----------
const dockerCache = new Map();
let dockerChecking = false;

function dockerCfg() {
  try {
    return JSON.parse(db.prepare("SELECT value FROM settings WHERE key='docker_ssh'").get()?.value || "null");
  } catch {
    return null;
  }
}

// 并发限 3，避免一次检测所有容器把 SSH 打满
const queue = [];
let running = 0;
function queueDockerCheck(id) {
  queue.push(id);
  drainQueue();
}
function drainQueue() {
  const cfg = dockerCfg();
  if (!cfg || !cfg.host || !cfg.user || running >= 3) return;
  const id = queue.shift();
  if (id === undefined) return;
  running++;
  const svc = db.prepare("SELECT * FROM services WHERE id = ?").get(id);
  if (!svc || !svc.docker_container || !svc.docker_image) {
    running--;
    drainQueue();
    return;
  }
  dockerCache.set(id, { status: "checking", checkedAt: Date.now() });
  dockerCheck
    .checkService(svc, cfg)
    .then((r) => dockerCache.set(id, r))
    .catch((e) => dockerCache.set(id, { status: "error", error: e.message, checkedAt: Date.now() }))
    .finally(() => {
      running--;
      drainQueue();
    });
}

// 定时：每 6 小时自动检测全部配了 Docker 的服务
function scheduleDockerChecks() {
  const cfg = dockerCfg();
  if (!cfg || !cfg.host || !cfg.user) return;
  const ids = db
    .prepare("SELECT id FROM services WHERE docker_container != '' AND docker_image != ''")
    .all()
    .map((r) => r.id);
  ids.forEach((id) => queue.push(id));
  drainQueue();
}

// 读/写 SSH 配置（内网自用，明文存 settings）
app.get("/api/admin/docker-config", adminAuth, (req, res) => {
  res.json(dockerCfg() || { host: "", port: 22, user: "", pass: "" });
});
app.put("/api/admin/docker-config", adminAuth, (req, res) => {
  const { host, port, user, pass } = req.body || {};
  const cfg = { host: host || "", port: Number(port) || 22, user: user || "", pass: pass || "" };
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('docker_ssh', ?)").run(JSON.stringify(cfg));
  res.json({ ok: true });
  setTimeout(scheduleDockerChecks, 300); // 配置后立即检测一轮
});

// 手动触发全量检测
app.post("/api/admin/docker/check", adminAuth, (req, res) => {
  scheduleDockerChecks();
  res.json({ ok: true });
});

// 启动时自动检测一轮（若有配置）
setTimeout(scheduleDockerChecks, 2000);
setInterval(scheduleDockerChecks, 6 * 60 * 60 * 1000);

// ---------- 版本更新检测 ----------
function localCommit() {
  // Docker 构建时注入 GIT_COMMIT；本地开发直接读 .git
  if (process.env.GIT_COMMIT && process.env.GIT_COMMIT !== "unknown") return process.env.GIT_COMMIT;
  try {
    return execSync("git rev-parse HEAD", { cwd: __dirname, timeout: 3000 }).toString().trim();
  } catch {
    return "";
  }
}

app.get("/api/update", (req, res) => {
  try {
    const local = localCommit();
    const out = execSync("git ls-remote https://github.com/zhaozengxiao/net-nav.git HEAD", {
      timeout: 8000,
    })
      .toString()
      .trim();
    const remote = out.split(/\s+/)[0];
    res.json({ local, remote, hasUpdate: !!(local && remote && local !== remote) });
  } catch {
    res.json({ local: localCommit(), remote: "", hasUpdate: false, error: "检测失败：无法访问 GitHub" });
  }
});

// ---------- 生产：serve 前端构建产物（单容器/单端口部署） ----------
const distDir = [path.join(__dirname, "..", "web", "dist"), path.join(__dirname, "public")].find((d) =>
  fs.existsSync(d)
);
if (distDir) {
  app.use(express.static(distDir));
  // SPA history 路由回退（/admin 等直接访问也能打开），API 除外
  app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(distDir, "index.html")));
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] 导航 API 已启动: http://localhost:${PORT}`);
});
