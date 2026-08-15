// 通用前端工具与共享类型（Home / Admin / ServiceCard 共用，避免重复实现漂移）

/** URL 协议白名单：只允许 http/https */
export function isSafeUrl(u: unknown): u is string {
  return typeof u === "string" && /^https?:\/\//i.test(u.trim());
}

/** 十六进制颜色转 rgba（非法输入兜底默认色，防止渲染崩溃） */
export function hexToRgba(hex: string, a: number): string {
  hex = hex || "#38bdf8";
  const m = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(m)) hex = "#38bdf8";
  const clean = hex.replace("#", "");
  const n = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  if (Number.isNaN(n)) return `rgba(56, 189, 248, ${a})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// ---- 服务状态 / Docker 更新展示（Home 搜索、ServiceCard、Admin 后台共用） ----

export interface StatusInfo {
  online: boolean;
  ms: number;
  code: number | null;
}

export interface DockerInfo {
  status: string;
  checkedAt?: number;
  localDigest?: string;
  remoteDigest?: string;
  error?: string;
}

export interface Service {
  id: number;
  name: string;
  url: string;
  description: string;
  icon: string;
  color: string;
  clicks: number;
  group_id: number;
  groupName: string;
  docker_container: string;
  docker_image: string;
  status: StatusInfo | null;
  docker: DockerInfo | null;
}

export function statusClass(s: { status?: StatusInfo | null }): string {
  if (!s.status) return "unknown";
  return s.status.online ? "online" : "offline";
}

export function statusText(s: { status?: StatusInfo | null }): string {
  if (!s.status) return "检测中…";
  return s.status.online ? `${s.status.ms}ms` : "离线";
}

export function dockerClass(s: { docker?: DockerInfo | null }): string {
  const st = s.docker?.status;
  if (st === "latest") return "d-latest";
  if (st === "update") return "d-update";
  if (st === "checking") return "d-checking";
  return "d-unknown";
}

export function dockerText(s: { docker?: DockerInfo | null }): string {
  const st = s.docker?.status;
  if (!st || st === "checking") return "🐳 检测中";
  switch (st) {
    case "latest":
      return "🐳 已最新";
    case "update":
      return "🔄 可更新";
    case "notfound":
      return "🐳 容器未找到";
    case "nodigest":
      return "🐳 无镜像信息";
    default:
      return "🐳 检测失败";
  }
}

/** 格式化网速：Byte/s → 自适应 KB/s / MB/s / GB/s，保留一位小数 */
export function fmtSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 0) return "";
  if (bytesPerSec === 0) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let i = 0;
  let v = bytesPerSec;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(1) : v.toFixed(1)} ${units[i]}`;
}
