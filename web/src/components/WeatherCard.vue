<template>
  <!-- 天气卡片（时钟右侧，背景随天气变化；只有点城市名才切换城市，其他区域无操作） -->
  <div v-if="weather" class="weather-card" :class="wBgClass" :title="weatherTip">
    <div class="w-head">
      <span class="w-city" @click="configWeather" title="点击切换城市">
        <span class="w-city-switch">✎</span>{{ weather.city }}
      </span>
      <span class="w-head-right">
        <button class="w-refresh" :class="{ spinning: refreshing }" title="刷新天气" @click="refreshWeather">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
        <span class="w-update" :class="{ flash: updateFlash }">{{ weather.lastUpdate?.slice(5) }}</span>
      </span>
    </div>
    <div class="w-main">
      <WIcon :code="wTodayCode" :size="54" class="w-icon" />
      <div class="w-now">
        <div class="w-temp">{{ wTempText }}</div>
        <div class="w-text">{{ wTodayText }}</div>
      </div>
    </div>
    <div class="w-meta">
      <span class="w-meta-item">💧 {{ fmtHumidity(weather.humidity) }}</span>
      <span class="w-meta-item">🌬️ {{ weather.windDirection }}{{ weather.windScale }}</span>
      <span class="w-meta-item">🌡️ 体感 {{ fmtTemp(weather.feelst) }}</span>
    </div>
    <!-- 7 天预报 -->
    <div v-if="weather.forecast?.length" class="w-forecast">
      <div v-for="(d, i) in weather.forecast" :key="d.date" class="w-day">
        <span class="w-day-date">{{ wDayName(i) }}</span>
        <span class="w-day-icon"><WIcon :code="d.dayCode" :size="16" /></span>
        <span class="w-day-temp">{{ fmtNum(d.high) }}/{{ fmtNum(d.low) }}°</span>
        <span class="w-day-wind">{{ d.dayWindScale }}</span>
      </div>
    </div>
  </div>
  <div v-else class="weather-card weather-loading" @click="weatherFailed ? retryWeather() : configWeather()">
    <span class="w-icon">{{ weatherFailed ? "⚠️" : "🌡️" }}</span>
    {{ weatherFailed ? "天气加载失败，点此重试" : "天气加载中…" }}
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import api from "../api";
import WIcon from "./WIcon.vue";

// 天气（中央气象台，时钟右侧）
const weather = ref<{ icon: string; temperature: number; city: string; humidity: number; windScale: string; windDirection: string; feelst: number; precipitation: number; lastUpdate?: string; forecast?: { date: string; high: number; low: number; dayText: string; dayCode: number; dayWindScale?: string }[] } | null>(null);
let weatherTimer: number | undefined;
const weatherFailed = ref(false);

function weatherIcon(w: any) {
  if (w.precipitation > 0) return "🌧️";
  if (w.humidity >= 88) return "☁️";
  if (w.temperature >= 35) return "☀️";
  if (w.temperature <= 3) return "❄️";
  const h = new Date().getHours();
  return h >= 6 && h < 19 ? "🌤️" : "🌙";
}
// 数值防御：中央气象台异常值（如 999 占位）显示 --
function fmtNum(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) && n >= -70 && n <= 70 ? String(Math.round(n)) : "--";
}
// 温度（带 °）
function fmtTemp(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) && n >= -70 && n <= 70 ? `${Math.round(n)}°` : "--°";
}
// 湿度（带 %）
function fmtHumidity(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? `${Math.round(n)}%` : "--";
}
// 温度显示（异常值防御，如 999 占位）
const wTempText = computed(() => {
  const t = Number(weather.value?.temperature);
  return Number.isFinite(t) && t >= -60 && t <= 60 ? `${Math.round(t)}°` : "--°";
});
// 今日天气 code（用预报首日）
const wTodayCode = computed(() => weather.value?.forecast?.[0]?.dayCode ?? -1);
const wTodayText = computed(() => weather.value?.forecast?.[0]?.dayText || "");
const wBgClass = computed(() => {
  const code = weather.value?.forecast?.[0]?.dayCode ?? -1;
  if ([0, 1, 2].includes(code)) return "w-sun";
  if ([4, 5, 8, 9, 11, 12].includes(code)) return "w-rain";
  if ([6, 10].includes(code)) return "w-snow";
  return "w-cloud";
});
function wDayName(i: number) {
  if (i === 0) return "今天";
  if (i === 1) return "明天";
  if (i === 2) return "后天";
  const d = new Date(Date.now() + i * 86400000);
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
}
const weatherTip = computed(() => {
  if (!weather.value) return "天气加载中";
  const w = weather.value;
  const d = w.forecast?.[0];
  return d
    ? `${w.city}：${fmtNum(w.temperature)}°C（体感 ${fmtNum(w.feelst)}°）\n今日 ${d.dayText} ${fmtNum(d.high)}/${fmtNum(d.low)}°\n点击城市名切换城市（站号）`
    : `${w.city}：${fmtNum(w.temperature)}°C（体感 ${fmtNum(w.feelst)}°）\n点击城市名切换城市（站号）`;
});

const refreshing = ref(false);
const updateFlash = ref(false); // 刷新成功后更新时间高亮闪烁反馈
let flashTimer: number | undefined;

function flashUpdateTime() {
  updateFlash.value = true;
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => (updateFlash.value = false), 1100);
}

// force=true：绕过服务端 10 分钟缓存，真正重新拉取；返回是否成功
async function loadWeather(force = false) {
  const city = localStorage.getItem("nav_weather_city") || "54823";
  try {
    // silent：失败由本组件兜底展示（防拦截器重复弹 toast）
    const r: any = await api.get(`/weather?city=${city}${force ? "&refresh=1" : ""}`, { silent: true });
    if (r.ok) {
      weather.value = { ...r, icon: weatherIcon(r) };
      weatherFailed.value = false;
      return true;
    } else {
      weatherFailed.value = true;
      if (!weather.value) weather.value = null;
      return false;
    }
  } catch {
    weatherFailed.value = true;
    return false;
  }
}
async function refreshWeather() {
  if (refreshing.value) return; // 防连点
  refreshing.value = true;
  try {
    const ok = await loadWeather(true);
    if (ok) flashUpdateTime(); // 拉取成功 → 更新时间高亮闪一下
  } finally {
    refreshing.value = false;
  }
}
function retryWeather() {
  weatherFailed.value = false;
  loadWeather();
}
async function configWeather() {
  try {
    const { value } = await ElMessageBox.prompt(
      "城市站号（weather.cma.cn 城市页 URL 末尾数字，如 54823=济南）",
      "配置天气城市",
      {
        inputValue: localStorage.getItem("nav_weather_city") || "54823",
        confirmButtonText: "保存",
        cancelButtonText: "取消",
        inputValidator: (v: string) => (/^\d+$/.test(v.trim()) ? true : "请输入纯数字站号"),
      }
    );
    localStorage.setItem("nav_weather_city", value.trim());
    await loadWeather();
    ElMessage.success("已更新城市");
  } catch {
    /* 取消 */
  }
}

onMounted(() => {
  loadWeather();
  weatherTimer = window.setInterval(loadWeather, 900000); // 15 分钟刷新
});
onBeforeUnmount(() => {
  clearInterval(weatherTimer);
  if (flashTimer) clearTimeout(flashTimer);
});
</script>

<style scoped>
/* ===== 天气卡片（hero 右侧悬浮卡片，玻璃拟态 + 装饰光效） ===== */
.weather-card {
  position: absolute; /* 在 search-box 与右边缘之间的空间居中 */
  right: calc((100vw - var(--search-right, 50vw) - 370px) / 2);
  width: 370px;
  top: 30px;
  padding: 12px 16px 10px;
  user-select: none;
  text-align: left;
}

/* 头部：城市 + 更新时间 */
.w-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
/* 城市名：唯一可点击切换的区域（其他区域无操作） */
.w-city {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.5px;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 6px;
  transition: background 0.15s;
}
.w-city:hover {
  background: rgba(255, 255, 255, 0.14);
}
.w-city-switch {
  font-size: 12px;
  opacity: 0.7;
  transition: opacity 0.15s;
}
.w-city:hover .w-city-switch {
  opacity: 1;
}
.w-update {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.65);
}
/* 刷新成功：更新时间高亮闪烁一下（蓝白发光渐隐） */
.w-update.flash {
  color: #7dd3fc;
  animation: w-flash 1.1s ease-out;
}
@keyframes w-flash {
  0% {
    color: #bfdbfe;
    text-shadow: 0 0 12px rgba(56, 189, 248, 0.95);
  }
  100% {
    color: rgba(255, 255, 255, 0.65);
    text-shadow: 0 0 0 rgba(56, 189, 248, 0);
  }
}
/* 右侧组：刷新按钮 + 更新时间 */
.w-head-right {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.w-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  padding: 0;
  color: rgba(255, 255, 255, 0.65); /* 纯白图标，与更新时间一致 */
  cursor: pointer;
  transition: transform 0.3s ease, color 0.15s;
}
.w-refresh:hover {
  color: #fff;
  transform: rotate(90deg);
}
.w-refresh.spinning {
  animation: w-spin 0.8s linear infinite;
}
@keyframes w-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 主区：大图标 + 温度 */
.w-main {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;
}
.w-icon {
  font-size: 50px;
  animation: w-float 3s ease-in-out infinite;
}
/* 图标按天气色调发光 */
.w-sun .w-icon { filter: drop-shadow(0 0 16px rgba(255, 200, 90, 0.55)); }
.w-rain .w-icon { filter: drop-shadow(0 0 16px rgba(90, 170, 255, 0.5)); }
.w-cloud .w-icon { filter: drop-shadow(0 0 16px rgba(170, 190, 225, 0.4)); }
.w-snow .w-icon { filter: drop-shadow(0 0 16px rgba(205, 235, 255, 0.5)); }
@keyframes w-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
.w-now {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.w-temp {
  font-size: 46px;
  font-weight: 800;
  line-height: 1;
  background: linear-gradient(180deg, #ffffff, rgba(255, 255, 255, 0.72));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 0 2px 20px rgba(0, 0, 0, 0.2);
}
.w-text {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.92);
  font-weight: 500;
}

/* 信息行：胶囊 chip */
.w-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.w-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-dim);
}

/* 7 天预报（窄卡片横向滚动） */
.w-forecast {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: thin;
  padding-bottom: 4px;
}
.w-forecast::-webkit-scrollbar {
  height: 4px;
}
.w-forecast::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.25);
  border-radius: 4px;
}
.w-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  flex: 1;
  padding: 6px 3px;
  border-radius: 10px;
  transition: background 0.15s;
}
.w-day:hover {
  background: rgba(148, 163, 184, 0.08);
}
.w-day-date {
  font-size: 12px;
  font-weight: 600;
  color: #fff;
}
.w-day-icon {
  font-size: 24px;
}
.w-day-temp {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.85);
  font-weight: 600;
}
.w-day-wind {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.55);
  white-space: nowrap;
}

/* 加载态 */
.weather-card.weather-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-dim);
  width: auto;
}
.weather-card.weather-loading .w-icon {
  font-size: 24px;
  filter: none;
}

/* 天气卡片仅在大屏（>1400px）显示；≤1400px（含手机端）一律隐藏，避免遮挡搜索区/堆叠 */
@media (max-width: 1400px) {
  .weather-card {
    display: none;
  }
}
</style>
