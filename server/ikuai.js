// 爱快 v4.0 API 流量监控客户端
// 使用 Bearer token 认证，无需用户名密码登录
// API 基址: https://<host>:443/api/v4.0（HTTP 返回 403，强制 HTTPS）
// 接口: GET /monitoring/interfaces-status → 实时 WAN 口速率 (Byte/s)

const http = require("http");
const https = require("https");

const TIMEOUT = 5000;

// 爱快 v4.0 API 只能用 HTTPS（HTTP 返回 403）
function httpMod(cfg) {
  return cfg.https || Number(cfg.port) === 443 ? https : http;
}

// 请求包装：GET 带 Bearer token，返回原始响应体（调试用）
function apiGetRaw(cfg, path) {
  return new Promise((resolve, reject) => {
    const mod = httpMod(cfg);
    const port = Number(cfg.port) || (mod === https ? 443 : 80);
    const options = {
      hostname: cfg.host,
      port,
      path: `/api/v4.0${path}`,
      method: "GET",
      timeout: TIMEOUT,
      rejectUnauthorized: false, // 自签名证书
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: "application/json",
      },
    };
    const req = mod.get(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("请求超时"));
    });
    req.on("error", reject);
  });
}

// 抓取流量数据：返回 { up, down, checkedAt, interfaces }
// 接口: /monitoring/interfaces-status → { results: { iface_stream: [{ interface, upload, download, ... }] } }
// upload / download 为实时速率，单位 Byte/s
async function fetchTraffic(cfg) {
  if (!cfg || !cfg.host || !cfg.token) {
    return { up: -1, down: -1, error: "未配置" };
  }
  try {
    const raw = await apiGetRaw(cfg, "/monitoring/interfaces-status");
    if (raw.status !== 200) {
      return { up: -1, down: -1, error: `HTTP ${raw.status}：${raw.body.slice(0, 120)}`, checkedAt: Date.now() };
    }
    let body;
    try {
      body = JSON.parse(raw.body);
    } catch {
      return { up: -1, down: -1, error: `响应不是 JSON（前 120 字符：${raw.body.slice(0, 120)}）`, checkedAt: Date.now() };
    }
    // 提取 iface_stream 数组
    const list = body?.results?.iface_stream;
    if (!Array.isArray(list) || list.length === 0) {
      return { up: -1, down: -1, error: "未找到接口数据", checkedAt: Date.now() };
    }
    // 取 interface="wan1" 的实时速率，否则取第一条
    const entry = list.find((i) => i.interface === "wan1") || list[0];
    const up = Number(entry.upload) || 0;
    const down = Number(entry.download) || 0;
    return { up, down, interfaces: 1, checkedAt: Date.now() };
  } catch (e) {
    return { up: -1, down: -1, error: e.message, checkedAt: Date.now() };
  }
}

// 测试连接
async function testConnection(cfg) {
  const r = await fetchTraffic(cfg);
  return {
    ok: r.up >= 0 && r.down >= 0,
    error: r.error,
    interfaces: r.interfaces,
    up: r.up,
    down: r.down,
  };
}

module.exports = { fetchTraffic, testConnection };