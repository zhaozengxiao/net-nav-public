// 内网服务自动发现：并发扫描网段常见端口，识别 HTTP 服务标题
const net = require("net");

// 常见内网服务端口 → 服务名
const PORT_NAMES = {
  22: "SSH",
  80: "HTTP Web",
  443: "HTTPS Web",
  445: "SMB 共享",
  3000: "Grafana/Web",
  3306: "MySQL",
  5000: "Web 服务",
  5432: "PostgreSQL",
  6379: "Redis",
  8000: "Web 服务",
  8080: "Web 服务",
  8443: "HTTPS 备用",
  9000: "Web 服务",
  9090: "Prometheus",
  9200: "Elasticsearch",
  27017: "MongoDB",
};

// 快速/完整端口组
const PORT_SETS = {
  fast: [22, 80, 443, 3000, 8080, 8443],
  full: [22, 80, 443, 445, 3000, 3306, 5000, 5432, 6379, 8000, 8080, 8443, 9000, 9090, 9200, 27017],
};

function checkPort(ip, port, timeout = 400) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(timeout);
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("timeout", () => {
      sock.destroy();
      resolve(false);
    });
    sock.once("error", () => resolve(false));
    sock.connect(port, ip);
  });
}

// 抓取 HTTP 页面标题（识别服务类型）
async function getTitle(ip, port) {
  const scheme = [443, 8443].includes(port) ? "https" : "http";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    const res = await fetch(`${scheme}://${ip}:${port}`, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 net-nav-scanner" },
    });
    clearTimeout(timer);
    const html = (await res.text()).slice(0, 20000);
    const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return m ? m[1].trim().slice(0, 40) : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// 解析网段（支持 /16 和 /24）
function expandCidr(cidr) {
  const [ipPart, prefixStr] = cidr.split("/");
  const prefix = parseInt(prefixStr || "24", 10);
  const parts = ipPart.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    throw new Error("网段格式错误，示例：192.168.1.0/24");
  }
  const ips = [];
  if (prefix >= 24) {
    for (let i = 1; i <= 254; i++) ips.push(`${parts[0]}.${parts[1]}.${parts[2]}.${i}`);
  } else if (prefix >= 16) {
    for (let b = 0; b <= 255; b++) {
      if (b === 0 || b === 255) continue;
      for (let i = 1; i <= 254; i++) ips.push(`${parts[0]}.${parts[1]}.${b}.${i}`);
    }
  } else {
    throw new Error("暂不支持 /16 以下的网段（范围太大）");
  }
  return ips;
}

async function scanNetwork(network, mode = "fast", onProgress) {
  const ports = PORT_SETS[mode] || PORT_SETS.fast;
  const ips = expandCidr(network);
  const found = [];
  let done = 0;

  const concurrency = 60;
  let idx = 0;

  async function worker() {
    while (idx < ips.length) {
      const ip = ips[idx++];
      for (const port of ports) {
        try {
          if (await checkPort(ip, port)) {
            let title = null;
            if ([22, 445, 3306, 5432, 6379, 9200, 27017].includes(port) === false) {
              title = await getTitle(ip, port); // 只对 HTTP 类端口抓标题
            }
            found.push({ ip, port, name: PORT_NAMES[port] || "Unknown", title });
          }
        } catch {
          /* 忽略单个探测错误 */
        }
      }
      done++;
      onProgress && onProgress(done, ips.length, found.length);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return found;
}

module.exports = { scanNetwork, PORT_SETS };
