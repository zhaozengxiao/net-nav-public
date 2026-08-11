// 数据库：分组 + 服务 + 设置
const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(process.env.DB_PATH || path.join(__dirname, "nav.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📁',
  sort INTEGER DEFAULT 0,
  collapsed INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT DEFAULT '',
  icon TEXT DEFAULT '🔗',
  color TEXT DEFAULT '#38bdf8',
  sort INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  docker_container TEXT DEFAULT '',
  docker_image TEXT DEFAULT '',
  favorite INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  sort INTEGER DEFAULT 0,
  path TEXT DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visited_at TEXT DEFAULT (datetime('now','localtime')),
  ua TEXT DEFAULT '',
  device TEXT DEFAULT '',
  os TEXT DEFAULT '',
  browser TEXT DEFAULT '',
  ip TEXT DEFAULT ''
);
`);

// 迁移：旧库补列（docker_container 用于 Docker 镜像更新检测）
// 迁移：旧库补列（逐个执行，避免一个已存在导致后面全部跳过）
["docker_container", "docker_image"].forEach((col) => {
  try {
    db.prepare(`ALTER TABLE services ADD COLUMN ${col} TEXT DEFAULT ''`).run();
  } catch {
    /* 列已存在 */
  }
});
try {
  db.prepare("ALTER TABLE services ADD COLUMN favorite INTEGER DEFAULT 0").run();
} catch {
  /* 列已存在 */
}
try {
  db.prepare("ALTER TABLE bookmarks ADD COLUMN path TEXT DEFAULT '[]'").run();
} catch {
  /* 列已存在 */
}

// 种子数据
const count = db.prepare("SELECT COUNT(*) AS c FROM groups").get().c;
if (count === 0) {
  const insG = db.prepare("INSERT INTO groups (name, icon, sort) VALUES (?, ?, ?)");
  const g1 = insG.run("网络设备", "🌐", 1).lastInsertRowid;
  const g2 = insG.run("开发服务", "💻", 2).lastInsertRowid;
  const g3 = insG.run("NAS 存储", "🗄️", 3).lastInsertRowid;

  const insS = db.prepare(
    "INSERT INTO services (group_id, name, url, description, icon, color, sort) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  insS.run(g1, "路由器", "http://192.168.1.1", "主路由器管理后台", "📡", "#38bdf8", 1);
  insS.run(g1, "交换机", "http://192.168.1.2", "核心交换机", "🔀", "#a78bfa", 2);
  insS.run(g2, "GitLab", "http://192.168.1.10", "代码托管平台", "🦊", "#f97316", 1);
  insS.run(g2, "Jenkins", "http://192.168.1.11:8080", "持续集成", "🤖", "#eab308", 2);
  insS.run(g2, "监控面板", "http://192.168.1.12:3000", "Grafana 监控", "📊", "#22c55e", 3);
  insS.run(g3, "NAS", "http://192.168.1.20", "群晖 NAS 管理", "🗄️", "#06b6d4", 1);
  insS.run(g3, "备份服务器", "http://192.168.1.21", "数据备份", "💾", "#f43f5e", 2);

  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("admin_password", "nav123");
  console.log("[db] 种子数据已创建（管理密码: nav123）");
}

module.exports = db;
