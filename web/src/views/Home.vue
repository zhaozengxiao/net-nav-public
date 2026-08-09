<template>
  <div class="page">
    <div class="blob blob-1"></div>
    <div class="blob blob-2"></div>
    <div class="blob blob-3"></div>
    <VueParticles id="bg-particles" class="particle-bg" :options="particleOptions" />

    <!-- 顶栏 -->
    <header class="topbar">
      <div class="brand">🛰️ 内网导航</div>
      <div class="top-actions">
        <button class="icon-btn" title="管理后台" @click="$router.push('/admin')">⚙️</button>
      </div>
    </header>

    <!-- 时钟区 -->
    <section class="hero">
      <div class="greeting">{{ greeting }}，{{ nowDate }}</div>
      <Vue3FlipClock />
      <div class="sub">
        共 {{ totalServices }} 个服务 · {{ onlineCount }} 个在线 ·
        <span class="sse-dot" :class="sseState"></span>{{ sseText }}
      </div>

      <div class="search-box" @click="focusSearch">
        <span class="search-icon">🔍</span>
        <input ref="searchInputRef" v-model="keyword" placeholder="搜索服务名称、描述…" />
        <span v-if="keyword" class="search-clear" @click.stop="clearSearch">✕</span>
      </div>
    </section>

    <!-- 服务区（平铺） -->
    <main class="content">
      <div class="cards">
        <a
          v-for="s in filteredServices"
          :key="s.id"
          class="card"
          :style="{ '--c': s.color }"
          :href="s.url"
          target="_blank"
          rel="noopener"
          @click="track(s)"
        >
          <span class="status-dot" :class="statusClass(s)" :title="statusText(s)"></span>
          <span
            class="card-icon"
            :style="{
              background: `radial-gradient(circle at 30% 25%, ${hexToRgba(s.color, 0.45)}, ${hexToRgba(s.color, 0.1)})`,
              borderColor: hexToRgba(s.color, 0.35),
              boxShadow: `0 4px 20px ${hexToRgba(s.color, 0.22)}`,
            }"
          >
            {{ s.icon }}
          </span>
          <div class="card-body">
            <div class="card-name">{{ s.name }}</div>
            <div class="card-desc">{{ s.description || s.url }}</div>
          </div>
          <div class="card-foot">
            <span class="card-status">{{ statusText(s) }}</span>
            <span class="card-foot-right">
              <span v-if="s.docker_container" class="docker-badge" :class="dockerClass(s)">{{ dockerText(s) }}</span>
              <span class="card-clicks">🔥 {{ s.clicks }}</span>
            </span>
          </div>
        </a>
      </div>

      <div v-if="filteredServices.length === 0" class="no-result">
        😕 没有找到匹配「{{ keyword }}」的服务
      </div>
    </main>

    <footer class="footer">内网服务导航 · 自托管 · 零外网依赖</footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import api from "../api";

interface Service {
  id: number;
  name: string;
  url: string;
  description: string;
  icon: string;
  color: string;
  clicks: number;
  status: { online: boolean; ms: number; code: number | null } | null;
}

const services = ref<Service[]>([]);
const keyword = ref("");
const nowDate = ref("");
const searchInputRef = ref<HTMLInputElement>();

// 点击搜索框任意位置（含图标/留白）都聚焦输入框
function focusSearch() {
  searchInputRef.value?.focus();
}

// 清除关键词后焦点留在输入框
function clearSearch() {
  keyword.value = "";
  searchInputRef.value?.focus();
}
const sseState = ref<"connecting" | "open" | "closed">("connecting");
let timer: number | undefined;
let sse: EventSource | null = null;

// 动态粒子背景（tsParticles 现成库，零 CDN）
const particleOptions = {
  fullScreen: { enable: false },
  fpsLimit: 60,
  particles: {
    number: { value: 80, density: { enable: true, width: 1600, height: 900 } },
    color: { value: ["#ffffff", "#a5c8ff", "#7dd3fc"] },
    shape: { type: "circle" },
    opacity: { value: { min: 0.12, max: 0.7 } },
    size: { value: { min: 1, max: 2.6 } },
    move: {
      enable: true,
      speed: 0.6,
      direction: "none",
      random: true,
      straight: false,
      outModes: { default: "out" },
    },
    links: {
      enable: true,
      distance: 150,
      color: "#60a5fa",
      opacity: 0.2,
      width: 1,
    },
  },
  detectRetina: true,
};

const filteredServices = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return services.value;
  return services.value.filter(
    (s) =>
      s.name.toLowerCase().includes(kw) ||
      (s.description || "").toLowerCase().includes(kw)
  );
});

const totalServices = computed(() => services.value.length);
const onlineCount = computed(() => services.value.filter((s) => s.status?.online).length);

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 6) return "夜深了，注意休息";
  if (h < 9) return "早上好";
  if (h < 12) return "上午好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
});

function tick() {
  const now = new Date();
  nowDate.value = now.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function statusClass(s: Service) {
  if (!s.status) return "unknown";
  return s.status.online ? "online" : "offline";
}
function statusText(s: Service) {
  if (!s.status) return "检测中…";
  return s.status.online ? `${s.status.ms}ms` : "离线";
}

// ---- Docker 镜像更新 ----
function dockerClass(s: Service) {
  const st = s.docker?.status;
  if (st === "latest") return "d-latest";
  if (st === "update") return "d-update";
  if (st === "checking") return "d-checking";
  return "d-unknown";
}
function dockerText(s: Service) {
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

function hexToRgba(hex: string, a: number) {
  const m = hex.replace("#", "");
  const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function track(s: Service) {
  api.post(`/click/${s.id}`).catch(() => {});
  s.clicks++;
}

async function load() {
  try {
    services.value = await api.get("/services");
  } catch {
    /* 后端未启动时静默 */
  }
}

function updateStatus(id: number, status: any) {
  const s = services.value.find((x) => x.id === id);
  if (s) s.status = status;
}

// SSE 实时推送：状态一变，后端主动推过来，零轮询
function connectSSE() {
  sse = new EventSource("/api/events");

  sse.addEventListener("snapshot", (e) => {
    const list = JSON.parse((e as MessageEvent).data);
    for (const { id, status } of list) updateStatus(id, status);
  });
  sse.addEventListener("status", (e) => {
    const list = JSON.parse((e as MessageEvent).data);
    for (const { id, status } of list) updateStatus(id, status);
  });
  sse.onopen = () => (sseState.value = "open");
  // EventSource 断线会自动重连，重连后收到 snapshot 全量同步
  sse.onerror = () => (sseState.value = "closed");
}

const sseText = computed(() => {
  if (sseState.value === "open") return "实时连接";
  if (sseState.value === "connecting") return "连接中…";
  return "重连中…";
});

onMounted(() => {
  // 仅暗色主题（已去掉亮色切换）
  document.documentElement.setAttribute("data-theme", "dark");

  tick();
  timer = window.setInterval(tick, 1000);
  load();
  connectSSE(); // 状态实时推送，无需轮询
});

onBeforeUnmount(() => {
  clearInterval(timer);
  sse?.close();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  min-height: 100dvh;
  position: relative;
}

/* 顶栏 */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px;
}
.brand {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.top-actions {
  display: flex;
  gap: 10px;
}
.icon-btn {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  border: 1px solid var(--card-border);
  background: var(--card-bg);
  backdrop-filter: blur(12px);
  font-size: 17px;
  cursor: pointer;
  transition: all 0.2s;
}
.icon-btn:hover {
  background: var(--card-hover);
  transform: translateY(-2px);
}

/* 时钟区 */
.hero {
  text-align: center;
  padding: 40px 20px 30px;
}
.greeting {
  font-size: 20px;
  color: var(--text-dim);
  margin-bottom: 10px;
}
.clock {
  display: none;
}
/* 翻页时钟：CSS 控制真实尺寸（替代 transform 缩放，避免布局留白导致搜索框偏移） */
.hero :deep(.clock-container) {
  justify-content: center;
  margin-top: 8px;
}
.hero :deep(.clock-container .flip) {
  width: clamp(38px, 6.8vw, 60px);
  height: clamp(56px, 10vw, 90px);
  font-size: clamp(44px, 7.8vw, 80px);
  line-height: clamp(46px, 8vw, 87px);
  margin: clamp(2px, 0.4vw, 5px);
}
/* 中缝装饰线随卡片高度自适应 */
.hero :deep(.flip .item .up:after) {
  top: calc(100% - 1.5px);
}
/* 冒号随卡片高度缩放 */
.hero :deep(.clock-container .colon) {
  height: clamp(56px, 10vw, 90px);
  padding: 0 clamp(5px, 1vw, 10px);
}
.hero :deep(.clock-container .colon:before),
.hero :deep(.clock-container .colon:after) {
  width: clamp(6px, 1.2vw, 10px);
  height: clamp(6px, 1.2vw, 10px);
}
.sub {
  margin-top: 10px;
  color: var(--text-dim);
  font-size: 14px;
}
.sse-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin: 0 5px 0 2px;
  vertical-align: middle;
}
.sse-dot.open {
  background: #22c55e;
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.8);
}
.sse-dot.connecting,
.sse-dot.closed {
  background: #eab308;
  box-shadow: 0 0 6px rgba(234, 179, 8, 0.8);
  animation: blink 1.2s infinite;
}
@keyframes blink {
  50% {
    opacity: 0.3;
  }
}

/* 搜索框 */
.search-box {
  max-width: 560px;
  margin: 30px auto 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  background: var(--input-bg);
  border: 1px solid var(--card-border);
  border-radius: 16px;
  backdrop-filter: blur(16px);
  transition: all 0.25s;
  cursor: text;
  min-width: 0;
}
.search-box:focus-within {
  border-color: rgba(56, 189, 248, 0.5);
  box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.12), 0 8px 32px rgba(0, 0, 0, 0.25);
}
.search-icon {
  font-size: 18px;
  opacity: 0.7;
}
.search-box input {
  flex: 1;
  min-width: 0;
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
  caret-color: var(--text);
  font-size: 16px;
}
.search-box input::placeholder {
  color: var(--text-dim);
}
.search-clear {
  cursor: pointer;
  opacity: 0.6;
  padding: 2px 6px;
}
.search-clear:hover {
  opacity: 1;
}

/* 内容区 */
.content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 10px 24px 60px;
}

/* 卡片 */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 18px;
  margin-top: 14px;
}
.card {
  --c: #38bdf8;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 18px 16px;
  background: linear-gradient(150deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.025));
  border: 1px solid var(--card-border);
  border-radius: 18px;
  backdrop-filter: blur(16px);
  text-decoration: none;
  color: var(--text);
  transition: all 0.28s ease;
  animation: cardIn 0.4s ease;
  overflow: hidden;
}
/* 顶部品牌色渐变光条 */
.card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, transparent, var(--c), transparent);
  opacity: 0.75;
  pointer-events: none;
}
@keyframes cardIn {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.card:hover {
  transform: translateY(-5px);
  border-color: rgba(255, 255, 255, 0.18);
  background: linear-gradient(150deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.045));
  box-shadow: 0 16px 44px rgba(0, 0, 0, 0.42);
}
.card:hover .card-icon {
  transform: scale(1.08) rotate(-3deg);
}

/* 状态点 */
.status-dot {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
}
.status-dot.online {
  background: #22c55e;
  box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.6);
  animation: pulse 2s infinite;
}
.status-dot.offline {
  background: #ef4444;
}
.status-dot.unknown {
  background: #94a3b8;
}
@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5);
  }
  70% {
    box-shadow: 0 0 0 7px rgba(34, 197, 94, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
  }
}

/* 图标 */
.card-icon {
  width: 54px;
  height: 54px;
  border-radius: 16px;
  border: 1px solid rgba(56, 189, 248, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  color: var(--text);
  transition: transform 0.28s ease;
}
.card-body {
  min-width: 0;
}
.card-name {
  font-size: 15.5px;
  font-weight: 650;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-desc {
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-dim);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--text-dim);
  border-top: 1px solid var(--card-border);
  padding-top: 10px;
  margin-top: 2px;
}
.card-foot-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.card-clicks {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--card-border);
  border-radius: 20px;
  padding: 2px 9px;
  font-size: 11.5px;
}
.docker-badge {
  border-radius: 20px;
  padding: 2px 9px;
  font-size: 11px;
  border: 1px solid;
  white-space: nowrap;
}
.docker-badge.d-latest {
  color: #22c55e;
  background: rgba(34, 197, 94, 0.1);
  border-color: rgba(34, 197, 94, 0.35);
}
.docker-badge.d-update {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.4);
  animation: pulse-amber 2s ease-in-out infinite;
}
.docker-badge.d-checking {
  color: var(--text-dim);
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--card-border);
}
.docker-badge.d-unknown {
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.08);
  border-color: rgba(148, 163, 184, 0.25);
}
@keyframes pulse-amber {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.35);
  }
  50% {
    box-shadow: 0 0 0 5px rgba(245, 158, 11, 0);
  }
}
.card-status {
  color: #22c55e;
}
.status-dot.offline ~ .card-foot .card-status,
.card:has(.status-dot.offline) .card-status {
  color: #ef4444;
}
.card:has(.status-dot.unknown) .card-status {
  color: var(--text-dim);
}

.empty,
.no-result {
  grid-column: 1 / -1;
  text-align: center;
  padding: 40px;
  color: var(--text-dim);
  background: var(--card-bg);
  border: 1px dashed var(--card-border);
  border-radius: 16px;
}
.no-result {
  margin-top: 10px;
}

.footer {
  text-align: center;
  padding: 24px;
  color: var(--text-dim);
  font-size: 13px;
  opacity: 0.7;
}

/* 移动端 */
@media (max-width: 768px) {
  .topbar {
    padding: 14px 16px;
  }
  .hero {
    padding: 24px 12px 20px;
  }
  .content {
    padding: 0 14px 40px;
  }
  .cards {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }
  .card {
    padding: 14px;
  }
  .card-icon {
    width: 42px;
    height: 42px;
    font-size: 21px;
  }
}
</style>
