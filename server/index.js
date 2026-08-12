// 入口：公开 API + 管理 API
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const db = require("./db");
const monitor = require("./monitor");
const { scanNetwork } = require("./scan");
const dockerCheck = require("./dockercheck");

const app = express();
const PORT = Number(process.env.PORT) || 6666;

// 本地版本号：Docker 构建注入 GIT_COMMIT；本地开发读 git HEAD
const GIT_COMMIT = (() => {
  if (process.env.GIT_COMMIT && process.env.GIT_COMMIT !== "unknown") return process.env.GIT_COMMIT;
  try {
    return require("child_process").execSync("git rev-parse HEAD", { cwd: __dirname, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
})();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// 天气：代理中央气象台（免 key）。10 分钟缓存 + 失败兜底（stale） + 失败防抖 60s
let weatherCache = { key: "", data: null, at: 0, failAt: 0 };
app.get("/api/weather", async (req, res) => {
  const city = String(req.query.city || "").trim() || "54823"; // 默认济南
  // 命中缓存直接返回
  if (weatherCache.key === city && weatherCache.data && Date.now() - weatherCache.at < 600000) {
    return res.json({ ok: true, cached: true, ...weatherCache.data });
  }
  // 失败防抖：上次失败 60s 内不重试外网，直接返回缓存/错误
  if (Date.now() - weatherCache.failAt < 60000) {
    if (weatherCache.key === city && weatherCache.data) {
      return res.json({ ok: true, cached: true, stale: true, ...weatherCache.data });
    }
    return res.status(502).json({ ok: false, error: "天气源暂时不可用，请稍后再试" });
  }
  try {
    const headers = { "User-Agent": "Mozilla/5.0" };
    // 实时（now 接口）+ 预报（weather 接口）并行
    const [nowR, wR] = await Promise.all([
      fetch(`https://weather.cma.cn/api/now/${city}`, { headers }),
      fetch(`https://weather.cma.cn/api/weather/${city}`, { headers }),
    ]);
    if (!nowR.ok || !wR.ok) throw new Error(`HTTP ${nowR.status}/${wR.status}`);
    const nowD = await nowR.json();
    const wD = await wR.json();
    if (nowD.code !== 0 || wD.code !== 0) throw new Error("城市站号无效");
    const now = nowD.data.now;
    // 校验数据合理性：温度/湿度异常（如 999 占位）视为无效，避免缓存脏数据
    const temp = Number(now.temperature);
    const feelst = Number(now.feelst);
    const humidity = Number(now.humidity);
    if (!Number.isFinite(temp) || temp < -60 || temp > 60) throw new Error("温度数据异常");
    if (!Number.isFinite(feelst) || feelst < -70 || feelst > 70) throw new Error("体感温度异常");
    if (!Number.isFinite(humidity) || humidity < 0 || humidity > 100) throw new Error("湿度数据异常");
    const daily = (wD.data.daily || []).slice(0, 7); // 取 7 天预报
    const data = {
      city: nowD.data.location.name,
      path: nowD.data.location.path,
      // 实时
      temperature: temp,
      feelst: feelst,
      humidity: humidity,
      windScale: now.windScale,
      windDirection: now.windDirection,
      precipitation: now.precipitation,
      lastUpdate: nowD.data.lastUpdate,
      // 7 天预报
      forecast: daily.map(day => ({
        date: day.date.slice(5), // MM/DD
        high: day.high,
        low: day.low,
        dayText: day.dayText,
        dayCode: day.dayCode,
        dayWindScale: day.dayWindScale || "",
      })),
    };
    weatherCache = { key: city, data, at: Date.now(), failAt: 0 };
    res.json({ ok: true, cached: false, ...data });
  } catch (e) {
    // 失败：记 failAt，若有上次成功数据则兜底返回
    weatherCache = { ...weatherCache, key: city, failAt: Date.now() };
    if (weatherCache.data && weatherCache.key === city) {
      return res.json({ ok: true, cached: true, stale: true, ...weatherCache.data });
    }
    res.status(502).json({ ok: false, error: "天气获取失败（网络不通）" });
  }
});

// 检查更新：对比本地版本与公开仓库 main 分支最新提交（用 atom feed，避免 API 限流）
app.get("/api/update-check", async (req, res) => {
  const repo = "zhaozengxiao/net-nav-public";
  try {
    const r = await fetch(`https://github.com/${repo}/commits/main.atom`, { headers: { "User-Agent": "net-nav" } });
    if (!r.ok) return res.json({ ok: false, error: `检查失败（HTTP ${r.status}）` });
    const xml = await r.text();
    const m = xml.match(/Grit::Commit\/([0-9a-f]{40})/);
    const latest = (m?.[1] || "").slice(0, 7);
    const current = (GIT_COMMIT || "unknown").slice(0, 7);
    res.json({
      ok: true,
      current,
      latest,
      hasUpdate: current !== "unknown" && !!latest && latest !== current,
      url: `https://github.com/${repo}`,
    });
  } catch (e) {
    res.json({ ok: false, error: "检查失败（网络不通或无法访问 GitHub）" });
  }
});

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
// token 内存缓存（5s TTL），避免每请求查库；登录时失效
let tokenCache = { list: [], at: 0 };
function getTokens() {
  if (tokenCache.at && Date.now() - tokenCache.at < 5000) return tokenCache.list;
  try {
    const list = JSON.parse(db.prepare("SELECT value FROM settings WHERE key='admin_tokens'").get()?.value || "[]");
    tokenCache = { list, at: Date.now() };
    return list;
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
  tokenCache = { list: tokens, at: 0 }; // 立即失效缓存
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
  const gmap = new Map(db.prepare("SELECT id, name FROM groups").all().map((g) => [g.id, g.name]));
  res.json(services.map((s) => ({ ...s, groupName: gmap.get(s.group_id) || "未分组", status: monitor.cache.get(s.id) || null, docker: dockerCache.get(s.id) || null })));
});

// 点击计数
app.post("/api/click/:id", (req, res) => {
  db.prepare("UPDATE services SET clicks = clicks + 1 WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// 收藏切换（公开，内网自用）
app.post("/api/favorite/:id", (req, res) => {
  const s = db.prepare("SELECT favorite FROM services WHERE id = ?").get(req.params.id);
  if (!s) return res.status(404).json({ error: "服务不存在" });
  const next = s.favorite ? 0 : 1;
  db.prepare("UPDATE services SET favorite = ? WHERE id = ?").run(next, req.params.id);
  res.json({ ok: true, favorite: !!next });
});

// ---------- 书签（浏览器书签导入，支持文件夹） ----------
// 安全解析书签 path 字段（JSON 数组，失败/非数组返回空数组）
function parsePath(p) {
  try {
    const v = JSON.parse(p || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, "").trim();
}

// 解析浏览器导出的书签 HTML（Netscape 格式），保留文件夹层级
function parseBookmarksHtml(html) {
  const items = [];
  const folders = []; // 出现的文件夹完整路径（含空文件夹）
  const pathStack = [];
  const re =
    /<DT>\s*(<H3[^>]*>([\s\S]*?)<\/H3>)|(<DL>|\s*<\/DL>)|<DT>\s*<A[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/A>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) {
      pathStack.push(stripTags(m[2])); // 文件夹入栈
      if (pathStack.length) folders.push([...pathStack]);
    } else if (m[3] === "<DL>") {
      /* 进入文件夹内容区 */
    } else if (m[3]) {
      pathStack.pop(); // </DL> 文件夹出栈
    } else if (m[4]) {
      const url = m[4].trim();
      const name = stripTags(m[5]);
      if (/^https?:\/\//i.test(url)) {
        items.push({ name: name || url, url, path: [...pathStack] });
      }
    }
  }
  return { items, folders };
}

app.get("/api/bookmarks", (req, res) => {
  res.json(
    db
      .prepare("SELECT * FROM bookmarks ORDER BY sort, id")
      .all()
      .map((r) => ({ ...r, path: parsePath(r.path) }))
  );
});

// 导出浏览器标准书签 HTML（Netscape 格式），保持当前树结构与排序
function exportBookmarksHtml() {
  const records = db
    .prepare("SELECT name, url, path, sort FROM bookmarks ORDER BY sort, id")
    .all()
    .map((r) => ({ ...r, path: parsePath(r.path) }));
  // 文件夹集合：占位行(url='') + 从书签 path 推导的前缀文件夹
  const folderSet = new Set();
  const folderSort = new Map();
  records.forEach((r) => {
    const key = JSON.stringify(r.path);
    if (!r.url) {
      folderSet.add(key);
      if (!folderSort.has(key)) folderSort.set(key, r.sort);
    }
    for (let i = 1; i <= r.path.length; i++) {
      const pre = JSON.stringify(r.path.slice(0, i));
      folderSet.add(pre);
      if (!folderSort.has(pre)) folderSort.set(pre, r.sort);
    }
  });
  // 构建 children：书签（按所在文件夹 path）+ 文件夹节点（按父路径）
  const children = new Map();
  const addChild = (pk, node) => {
    if (!children.has(pk)) children.set(pk, []);
    children.get(pk).push(node);
  };
  records.filter((r) => r.url).forEach((r) => addChild(JSON.stringify(r.path), r));
  folderSet.forEach((k) => {
    const p = JSON.parse(k);
    addChild(JSON.stringify(p.slice(0, -1)), { isFolder: true, path: p, name: p[p.length - 1], sort: folderSort.get(k) ?? 0 });
  });
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const now = Math.floor(Date.now() / 1000);
  let out = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>书签导出</TITLE>\n<H1>书签</H1>\n<DL><p>\n`;
  const render = (pk, indent) => {
    const list = (children.get(pk) || []).slice().sort((a, b) => a.sort - b.sort);
    for (const it of list) {
      if (!it.isFolder) {
        out += `${indent}<DT><A HREF="${esc(it.url)}" ADD_DATE="${now}">${esc(it.name)}</A>\n`;
      } else {
        out += `${indent}<DT><H3 ADD_DATE="${now}">${esc(it.name)}</H3>\n${indent}<DL><p>\n`;
        render(JSON.stringify(it.path), indent + "    ");
        out += `${indent}</DL><p>\n`;
      }
    }
  };
  render("[]", "    ");
  out += "</DL><p>\n";
  return out;
}

app.get("/api/bookmarks/export", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="bookmarks.html"');
  res.send(exportBookmarksHtml());
});

// 书签连通性检测（复用 monitor.probe，分批并发）
// 流式检测：并发探测，每完成一条立即以 NDJSON 推送，前端边收边更新状态点
app.post("/api/bookmarks/check-stream", (req, res) => {
  const urls = (req.body?.urls || []).filter((u) => typeof u === "string");
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  if (!urls.length) return res.end();
  const CONCURRENCY = 12;
  let i = 0;
  const work = async () => {
    while (i < urls.length) {
      const u = urls[i++];
      let r;
      try {
        r = await monitor.probe(u);
      } catch {
        r = { online: false, ms: -1, code: null };
      }
      res.write(JSON.stringify({ url: u, ...r }) + "\n");
    }
  };
  Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, work)).then(() => res.end());
});

app.post("/api/bookmarks/import", (req, res) => {
  const { html } = req.body || {};
  if (!html || typeof html !== "string") return res.status(400).json({ error: "请上传浏览器导出的书签 HTML" });
  const { items, folders } = parseBookmarksHtml(html);
  if (!items.length && !folders.length) return res.json({ added: 0, skipped: 0, total: 0 });
  const existing = new Set(db.prepare("SELECT url, path FROM bookmarks").all().map((r) => `${r.url}|${r.path}`));
  const ins = db.prepare("INSERT INTO bookmarks (name, url, sort, path) VALUES (?, ?, ?, ?)");
  let sort = db.prepare("SELECT COALESCE(MAX(sort),0) AS s FROM bookmarks").get().s;
  let added = 0,
    skipped = 0;
  // 重建空文件夹占位行：HTML 中出现过、但没有任何书签的文件夹
  const hasBookmark = new Set(items.map((it) => JSON.stringify(it.path)));
  const seenFolder = new Set();
  for (const f of folders) {
    const key = JSON.stringify(f);
    if (seenFolder.has(key) || hasBookmark.has(key)) continue; // 去重 / 有书签的文件夹不建占位
    seenFolder.add(key);
    const k2 = `|${key}`;
    if (existing.has(k2)) {
      skipped++;
      continue;
    }
    ins.run(f[f.length - 1], "", ++sort, key);
    existing.add(k2);
    added++;
  }
  for (const it of items) {
    const key = `${it.url}|${JSON.stringify(it.path)}`;
    if (existing.has(key)) {
      skipped++;
      continue;
    }
    ins.run(it.name, it.url, ++sort, JSON.stringify(it.path));
    existing.add(key);
    added++;
  }
  res.json({ added, skipped, total: items.length + folders.length });
});

app.delete("/api/bookmarks/:id", (req, res) => {
  const info = db.prepare("DELETE FROM bookmarks WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "书签不存在" });
  res.json({ ok: true });
});

// 拖动排序：接收树先序 id 列表重写 sort；paths 可携带 { id: [新path] } 迁移书签所属文件夹
app.post("/api/bookmarks/reorder", (req, res) => {
  const ids = (req.body?.ids || []).filter((n) => Number.isInteger(n));
  const paths = (req.body?.paths || {});
  if (!ids.length) return res.json({ ok: true, changed: 0 });
  const upd = db.prepare("UPDATE bookmarks SET sort = ? WHERE id = ?");
  const updPath = db.prepare("UPDATE bookmarks SET path = ? WHERE id = ?");
  let changed = 0;
  ids.forEach((id, i) => {
    changed += upd.run(i + 1, id).changes;
    const p = paths[id];
    // 校验：路径必须是字符串数组（防脏数据）
    if (Array.isArray(p) && p.every((seg) => typeof seg === "string")) {
      updPath.run(JSON.stringify(p), id);
    }
  });
  res.json({ ok: true, changed });
});

// 新建文件夹：插入占位行（url 为空，path=[父, 名]），供树形展示空文件夹
app.post("/api/bookmarks/new-folder", (req, res) => {
  const { parent, name } = req.body || {};
  const n = String(name || "").trim();
  if (!n) return res.status(400).json({ error: "文件夹名称不能为空" });
  const p = Array.isArray(parent) ? parent.filter((x) => typeof x === "string") : [];
  const path = [...p, n];
  const key = JSON.stringify(path);
  const exists = db.prepare("SELECT 1 FROM bookmarks WHERE path = ? AND url = ?").get(key, "");
  if (exists) return res.status(400).json({ error: "文件夹已存在" });
  let sort = db.prepare("SELECT COALESCE(MAX(sort),0) AS s FROM bookmarks").get().s;
  db.prepare("INSERT INTO bookmarks (name, url, sort, path) VALUES (?, ?, ?, ?)").run(n, "", sort + 1, key);
  res.json({ ok: true });
});

// 编辑书签（名称/网址）
app.put("/api/bookmarks/:id", (req, res) => {
  const { name, url } = req.body || {};
  const row = db.prepare("SELECT * FROM bookmarks WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "书签不存在" });
  const newName = name === undefined ? row.name : String(name).trim();
  const newUrl = url === undefined ? row.url : String(url).trim();
  if (!newName) return res.status(400).json({ error: "名称不能为空" });
  if (!/^https?:\/\//.test(newUrl)) return res.status(400).json({ error: "网址需以 http(s):// 开头" });
  db.prepare("UPDATE bookmarks SET name = ?, url = ? WHERE id = ?").run(newName, newUrl, row.id);
  res.json({ ok: true });
});

// 重命名文件夹：把该文件夹下（含子文件夹）所有书签的 path 前缀替换
app.post("/api/bookmarks/rename-folder", (req, res) => {
  const { oldPath, newName } = req.body || {};
  if (!Array.isArray(oldPath) || oldPath.length === 0) return res.status(400).json({ error: "文件夹路径无效" });
  const name = String(newName || "").trim();
  if (!name) return res.status(400).json({ error: "文件夹名称不能为空" });
  const oldJson = JSON.stringify(oldPath);
  const rows = db.prepare("SELECT id, path FROM bookmarks").all();
  const upd = db.prepare("UPDATE bookmarks SET path = ? WHERE id = ?");
  let changed = 0;
  for (const r of rows) {
    const p = parsePath(r.path);
    if (!p.length) continue;
    const isSelf = JSON.stringify(p) === oldJson;
    const isChild = !isSelf && p.length > oldPath.length && oldPath.every((seg, i) => p[i] === seg);
    if (isSelf) {
      const parent = p.slice(0, -1);
      parent.push(name);
      upd.run(JSON.stringify(parent), r.id);
      changed++;
    } else if (isChild) {
      p.splice(oldPath.length - 1, 1, name);
      upd.run(JSON.stringify(p), r.id);
      changed++;
    }
  }
  res.json({ ok: true, changed });
});

// 删除文件夹：删除该文件夹下（含子文件夹）所有书签
app.post("/api/bookmarks/delete-folder", (req, res) => {
  const { path } = req.body || {};
  if (!Array.isArray(path) || path.length === 0) return res.status(400).json({ error: "文件夹路径无效" });
  const rows = db.prepare("SELECT id, path FROM bookmarks").all();
  const del = db.prepare("DELETE FROM bookmarks WHERE id = ?");
  let removed = 0;
  for (const r of rows) {
    const p = parsePath(r.path);
    if (!p.length || p.length < path.length) continue;
    if (path.every((seg, i) => p[i] === seg)) {
      del.run(r.id);
      removed++;
    }
  }
  res.json({ ok: true, removed });
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
// 分组列表（公开：首页分组模式按此顺序渲染分组）
app.get("/api/groups", (req, res) => {
  res.json(db.prepare("SELECT * FROM groups ORDER BY sort, id").all());
});

app.get("/api/admin/groups", adminAuth, (req, res) => {
  res.json(db.prepare("SELECT * FROM groups ORDER BY sort, id").all());
});

// 分组拖拽排序（后台分组管理 + 首页拖标题共用）
app.put("/api/admin/groups/reorder", adminAuth, (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids 必填" });
  const tx = db.transaction(() => {
    ids.forEach((id, i) => db.prepare("UPDATE groups SET sort = ? WHERE id = ?").run(i, id));
  });
  tx();
  res.json({ ok: true });
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
// 服务导入导出（JSON，含分组结构）
app.get("/api/admin/services/export", adminAuth, (req, res) => {
  const groups = db.prepare("SELECT * FROM groups ORDER BY sort, id").all();
  const services = db.prepare("SELECT * FROM services ORDER BY sort, id").all();
  const pick = (s) => ({
    name: s.name,
    url: s.url,
    description: s.description,
    icon: s.icon,
    color: s.color,
    sort: s.sort,
    docker_container: s.docker_container,
    docker_image: s.docker_image,
    favorite: s.favorite,
  });
  const gids = new Set(groups.map((g) => g.id));
  res.setHeader("Content-Disposition", 'attachment; filename="net-nav-services.json"');
  res.json({
    type: "net-nav-services",
    version: 1,
    exportedAt: new Date().toISOString(),
    groups: groups.map((g) => ({
      name: g.name,
      icon: g.icon,
      sort: g.sort,
      collapsed: g.collapsed,
      services: services.filter((s) => s.group_id === g.id).map(pick),
    })),
    ungrouped: services.filter((s) => !gids.has(s.group_id)).map(pick),
  });
});

app.post("/api/admin/services/import", adminAuth, (req, res) => {
  const data = req.body;
  if (!data || data.type !== "net-nav-services" || !Array.isArray(data.groups)) {
    return res.status(400).json({ error: "文件格式不正确（请使用本系统导出的 JSON）" });
  }
  const insG = db.prepare("INSERT INTO groups (name, icon, sort, collapsed) VALUES (?, ?, ?, ?)");
  const insS = db.prepare(
    "INSERT INTO services (group_id, name, url, description, icon, color, sort, docker_container, docker_image, favorite) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const existingG = new Map(db.prepare("SELECT name, id FROM groups").all().map((r) => [r.name, r.id]));
  const existingS = new Set(db.prepare("SELECT name, url FROM services").all().map((r) => `${r.name}|${r.url}`));
  let addedGroups = 0,
    addedServices = 0,
    skippedServices = 0;
  const newIds = [];
  const tx = db.transaction(() => {
    const addSvc = (gid, s) => {
      if (!s || !s.name || !s.url) return;
      const key = `${s.name}|${s.url}`;
      if (existingS.has(key)) {
        skippedServices++;
        return;
      }
      const info = insS.run(
        gid,
        s.name,
        s.url,
        s.description || "",
        s.icon || "🔗",
        s.color || "#38bdf8",
        s.sort || 0,
        s.docker_container || "",
        s.docker_image || "",
        s.favorite ? 1 : 0
      );
      existingS.add(key);
      addedServices++;
      newIds.push(info.lastInsertRowid);
    };
    for (const g of data.groups || []) {
      let gid = existingG.get(g.name);
      if (!gid) {
        const info = insG.run(g.name || "未命名", g.icon || "📁", g.sort || 0, g.collapsed ? 1 : 0);
        gid = info.lastInsertRowid;
        existingG.set(g.name, gid);
        addedGroups++;
      }
      for (const s of g.services || []) addSvc(gid, s);
    }
    const gid = defaultGroupId();
    for (const s of data.ungrouped || []) addSvc(gid, s);
  });
  tx();
  // 导入后异步探测新服务状态（不阻塞响应）
  for (const id of newIds) {
    const row = db.prepare("SELECT url FROM services WHERE id = ?").get(id);
    if (row) monitor.probe(row.url).then((r) => monitor.cache.set(id, r));
  }
  res.json({ ok: true, addedGroups, addedServices, skippedServices });
});

app.post("/api/admin/services", adminAuth, (req, res) => {
  const { group_id, name, url, description, icon, color, sort, docker_container, docker_image } = req.body || {};
  if (!name || !url) return res.status(400).json({ error: "名称和地址必填" });
  const gid = Number.isInteger(group_id) ? group_id : defaultGroupId();
  const info = db
    .prepare(
      "INSERT INTO services (group_id, name, url, description, icon, color, sort, docker_container, docker_image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      gid,
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
  const { group_id, name, url, description, icon, color, sort, docker_container, docker_image } = req.body || {};
  db.prepare(
    "UPDATE services SET group_id=?, name=?, url=?, description=?, icon=?, color=?, sort=?, docker_container=?, docker_image=? WHERE id=?"
  ).run(
    Number.isInteger(group_id) ? group_id : s.group_id,
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

let dockerCfgCache = null; // 缓存 SSH 配置，更新时失效
function dockerCfg() {
  if (dockerCfgCache) return dockerCfgCache;
  try {
    dockerCfgCache = JSON.parse(db.prepare("SELECT value FROM settings WHERE key='docker_ssh'").get()?.value || "null");
    return dockerCfgCache;
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
  dockerCfgCache = null; // 失效缓存
  res.json({ ok: true });
  setTimeout(scheduleDockerChecks, 300); // 配置后立即检测一轮
});

// 手动触发全量检测
app.post("/api/admin/docker/check", adminAuth, (req, res) => {
  scheduleDockerChecks();
  res.json({ ok: true });
});

// ---------- 检测设置（ping 间隔 / Docker 检测间隔） ----------
let dockerTimer = null;
function getDockerIntervalMs() {
  const row = db.prepare("SELECT value FROM settings WHERE key='docker_interval'").get();
  const n = Number(row?.value);
  return (Number.isFinite(n) && n >= 1 ? n : 6) * 60 * 60 * 1000;
}
function restartDockerTimer() {
  if (dockerTimer) clearInterval(dockerTimer);
  dockerTimer = setInterval(scheduleDockerChecks, getDockerIntervalMs());
}

app.get("/api/admin/monitor-config", adminAuth, (req, res) => {
  res.json({
    pingInterval: Number(db.prepare("SELECT value FROM settings WHERE key='ping_interval'").get()?.value) || 60,
    dockerInterval: Number(db.prepare("SELECT value FROM settings WHERE key='docker_interval'").get()?.value) || 6,
  });
});
app.put("/api/admin/monitor-config", adminAuth, (req, res) => {
  const { pingInterval, dockerInterval } = req.body || {};
  const p = Math.min(Math.max(Number(pingInterval) || 60, 5), 3600); // 秒，5s ~ 1h
  const d = Math.min(Math.max(Number(dockerInterval) || 6, 1), 168); // 小时，1h ~ 7d
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ping_interval', ?)").run(String(p));
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('docker_interval', ?)").run(String(d));
  monitor.restartTimer();
  restartDockerTimer();
  res.json({ ok: true, pingInterval: p, dockerInterval: d });
});

// 启动时自动检测一轮（若有配置）
setTimeout(scheduleDockerChecks, 2000);
restartDockerTimer();

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
