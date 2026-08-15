<template>
  <!-- 网速卡片（时钟左侧，镜像天气卡片布局；显示实时速率 + 历史曲线） -->
  <div class="traffic-card">
    <div class="t-head">
      <span class="t-title">📶 实时网速</span>
    </div>
    <div class="t-main">
      <div class="t-chart-wrap">
        <canvas ref="canvasRef" class="t-chart" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import api from "../api";
import { fmtSpeed } from "../utils";
import { trafficFilter } from "../composables/trafficFilter";

const MAX_POINTS = 60;        // 最多保留 60 个点
const POLL_INTERVAL = 1000;   // 1 秒轮询一次
const CHART_WINDOW = 60000;   // 图表显示 60 秒窗口

// 图表内边距
const padL = 50;
const padR = 8;
const padT = 12;
const padB = 14;

interface SpeedPoint { up: number; down: number; t: number }

const STORAGE_KEY = "nav_traffic_history";

const canvasRef = ref<HTMLCanvasElement | null>(null);
const history: SpeedPoint[] = [];
let animId = 0;
let pollTimer: number | undefined;

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: SpeedPoint[] = JSON.parse(raw);
    const now = Date.now();
    const cutoff = now - CHART_WINDOW;
    const filtered = parsed.filter((p) => p.t >= cutoff);
    history.push(...filtered);
  } catch {
    // ignore
  }
}
function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // ignore
  }
}

function getMaxRate(): number {
  // 只统计最近 1 分钟（CHART_WINDOW）内的数据，上升下降即时跟随
  const cutoff = Date.now() - CHART_WINDOW;
  let m = 1;
  for (const p of history) {
    if (p.t < cutoff) continue;
    if (trafficFilter.value !== "down" && p.up > m) m = p.up;
    if (trafficFilter.value !== "up" && p.down > m) m = p.down;
  }
  return m;
}

function drawChart() {
  try {
    const canvas = canvasRef.value;
    if (!canvas) { animId = requestAnimationFrame(drawChart); return; }
    const ctx = canvas.getContext("2d");
    if (!ctx) { animId = requestAnimationFrame(drawChart); return; }

  // 适配设备像素比
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  // 清除
  ctx.clearRect(0, 0, w, h);

  const pts = history;
  if (pts.length < 2) {
    animId = requestAnimationFrame(drawChart);
    return;
  }

  const m = getMaxRate();
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const now = Date.now(); // 每帧更新，点持续左移

  // 计算每个点的 X 坐标（基于时间连续滚动）
  // 最新点始终在右边缘，旧点随时间向左移动
  const rightEdge = now;
  const leftEdge = rightEdge - CHART_WINDOW;

  function toX(ts: number): number {
    return padL + ((ts - leftEdge) / CHART_WINDOW) * innerW;
  }
  function toY(val: number): number {
    return padT + innerH - (val / m) * innerH;
  }

  // 过滤出可见范围内的点
  const visible = pts.filter((p) => p.t >= leftEdge);
  if (visible.length < 2) {
    animId = requestAnimationFrame(drawChart);
    return;
  }

  // ---- 绘制网格 ----
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (const y of [padT, padT + innerH / 2, padT + innerH]) {
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
  }

  // ---- Y 轴标签 ----
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "8px sans-serif";
  ctx.textAlign = "end";
  ctx.textBaseline = "middle";
  ctx.fillText(fmtSpeed(m), padL - 4, padT);
  ctx.fillText(fmtSpeed(m / 2), padL - 4, padT + innerH / 2);
  ctx.fillText("0", padL - 4, padT + innerH);

  // ---- X 轴时间标签 ----
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "7px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  const fmt = (ts: number) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  };
  const first = visible[0].t;
  const last = visible[visible.length - 1].t;
  const mid = first + (last - first) / 2;
  ctx.fillText(fmt(first), padL, h - 2);
  ctx.fillText(fmt(mid), padL + innerW / 2, h - 2);
  ctx.fillText(fmt(last), w - padR, h - 2);

  // ---- 绘制曲线 ----
  function drawPolyline(data: { x: number; y: number }[], color: string) {
    if (data.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(data[0].x, data[0].y);
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(data[i].x, data[i].y);
    }
    ctx.stroke();
  }

  const downPts = visible.map((p) => ({ x: toX(p.t), y: toY(p.down) }));
  const upPts = visible.map((p) => ({ x: toX(p.t), y: toY(p.up) }));

  // 按筛选状态绘制：全部 / 仅上行 / 仅下行
  if (trafficFilter.value !== "down") drawPolyline(upPts, "#4ade80");
  if (trafficFilter.value !== "up") drawPolyline(downPts, "#38bdf8");

  animId = requestAnimationFrame(drawChart);
  } catch {
    // 绘制异常不中断动画循环
    animId = requestAnimationFrame(drawChart);
  }
}

async function pollTraffic() {
  try {
    const r: any = await api.get("/traffic", { silent: true });
    if (r && typeof r.up === "number" && r.down >= 0) {
      history.push({ up: r.up, down: r.down, t: Date.now() });
      // 每次轮询都清理 60 秒前的旧数据
      const cutoff = Date.now() - CHART_WINDOW;
      while (history.length > 0 && history[0].t < cutoff) {
        history.shift();
      }
      saveHistory();
    }
  } catch {
    // ignore
  }
}

onMounted(() => {
  loadHistory();
  pollTraffic();
  pollTimer = window.setInterval(pollTraffic, POLL_INTERVAL);
  animId = requestAnimationFrame(drawChart);
});

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
  if (animId) cancelAnimationFrame(animId);
});
</script>

<style scoped>
/* ===== 网速卡片（hero 左侧悬浮卡片，玻璃拟态 + 与天气卡片对称） ===== */
.traffic-card {
  position: absolute; /* 左侧填充至 search-box，自适应宽度 */
  left: 12px;
  width: calc(var(--search-left, 50vw) - 24px);
  top: 30px;
  height: 250px;
  padding: 12px 14px 10px;
  display: flex;
  flex-direction: column;
  user-select: none;
  text-align: left;
}

/* 头部：标题 */
.t-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.t-title {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.5px;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.25);
}

/* 主区：图表占满剩余高度 */
.t-main {
  flex: 1;
  display: flex;
  align-items: stretch;
}

/* 图表区 */
.t-chart-wrap {
  position: relative;
  flex: 1;
}
.t-chart {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.85;
}

/* 小于 1400px 隐藏 */
@media (max-width: 1400px) {
  .traffic-card {
    display: none;
  }
}
</style>