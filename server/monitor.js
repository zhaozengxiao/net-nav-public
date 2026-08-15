// 服务状态检测器：并行探测 + 变化感知（只返回有变化的状态）
const db = require("./db");
const http = require("http");
const https = require("https");

const cache = new Map(); // id -> { online, ms, code, checkedAt }
const TIMEOUT = 3000;

// 探测只关心连通性，不校验证书可信度（内网大量自签名/过期证书 https 服务）
// 支持 http/https，跟随重定向（最多 3 跳），超时 3s
function probe(url) {
  const start = Date.now();
  const requestOnce = (u, redirects) =>
    new Promise((resolve) => {
      const mod = u.startsWith("https") ? https : http;
      const req = mod.get(u, { rejectUnauthorized: false, timeout: TIMEOUT }, (res) => {
        res.resume();
        const loc = res.headers.location;
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && loc && redirects > 0) {
          resolve(requestOnce(new URL(loc, u).toString(), redirects - 1));
          return;
        }
        resolve({ online: true, ms: Date.now() - start, code: res.statusCode });
      });
      req.on("timeout", () => req.destroy());
      req.on("error", () => resolve({ online: false, ms: -1, code: null }));
    });
  return requestOnce(url, 3);
}

let onChange = null; // 状态变化回调（由 index.js 注入，用于 SSE 广播）

function setOnChange(fn) {
  onChange = fn;
}



// 探测并发上限：避免服务多时一次全量探测打爆目标机/本机（socket 数）
const CONCURRENCY = 20;

let probing = false; // 重叠锁：上一轮未结束则跳过本轮（服务极多时探测耗时可能超过间隔）

async function runProbe() {
  if (probing) return [];
  probing = true;
  try {
    return await doProbe();
  } finally {
    probing = false;
  }
}

async function doProbe() {
  const services = db.prepare("SELECT id, url FROM services").all();
  if (services.length === 0) return [];

  // 并发受限的探测（保持服务顺序与结果一一对应）
  const results = new Array(services.length);
  let idx = 0;
  const worker = async () => {
    while (idx < services.length) {
      const i = idx++;
      results[i] = await probe(services[i].url).then(
        (v) => ({ status: "fulfilled", value: v }),
        (e) => ({ status: "rejected", reason: e })
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, services.length) }, worker));

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

// 立即探测 + 定时循环（间隔可在后台设置，默认 60 秒）
let timer = null;

function getIntervalMs() {
  const row = db.prepare("SELECT value FROM settings WHERE key='ping_interval'").get();
  const n = Number(row?.value);
  return Number.isFinite(n) && n >= 5 ? n * 1000 : 60 * 1000;
}

function restartTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(runProbe, getIntervalMs());
  console.log(`[monitor] ping 间隔：${getIntervalMs() / 1000}s`);
}

runProbe();
restartTimer();

module.exports = { cache, probe, setOnChange, restartTimer };
