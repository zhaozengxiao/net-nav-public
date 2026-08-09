// 服务状态检测器：并行探测 + 变化感知（只返回有变化的状态）
const db = require("./db");

const cache = new Map(); // id -> { online, ms, code, checkedAt }
const TIMEOUT = 3000;

let onChange = null; // 状态变化回调（由 index.js 注入，用于 SSE 广播）

function setOnChange(fn) {
  onChange = fn;
}

async function probe(url) {
  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { method: "GET", signal: ctrl.signal, redirect: "follow" });
    clearTimeout(timer);
    return { online: true, ms: Date.now() - start, code: res.status };
  } catch {
    clearTimeout(timer);
    return { online: false, ms: -1, code: null };
  }
}

async function runProbe() {
  const services = db.prepare("SELECT id, url FROM services").all();
  if (services.length === 0) return [];

  // 并行探测所有服务
  const results = await Promise.allSettled(services.map((s) => probe(s.url)));

  const changed = [];
  services.forEach((s, i) => {
    const r = results[i].status === "fulfilled" ? results[i].value : { online: false, ms: -1, code: null };
    const prev = cache.get(s.id);
    const cur = { ...r, checkedAt: Date.now() };
    cache.set(s.id, cur);

    // 只在"在线状态翻转"或"延迟显著变化"时标记为变化
    const msDiff = prev ? Math.abs(prev.ms - cur.ms) : Infinity;
    if (!prev || prev.online !== cur.online || (cur.online && msDiff > 200)) {
      changed.push({ id: s.id, status: cur });
    }
  });

  if (onChange && changed.length) onChange(changed);
  console.log(`[monitor] 探测 ${services.length} 个服务，${changed.length} 个状态变化`);
  return changed;
}

// 立即探测 + 每 60 秒循环
runProbe();
setInterval(runProbe, 60 * 1000);

module.exports = { cache, probe, setOnChange };
