<template>
  <!-- 天气卡片（时钟右侧，背景随天气变化，点击配置城市） -->
  <div v-if="weather" class="weather-card" :class="wBgClass" @click="configWeather" :title="weatherTip">
    <div class="w-head">
      <span class="w-city">{{ weather.city }}</span>
      <span class="w-update">{{ weather.lastUpdate?.slice(5) }}</span>
    </div>
    <div class="w-main">
      <span class="w-icon">{{ wTodayIcon }}</span>
      <div class="w-now">
        <div class="w-temp">{{ Math.round(weather.temperature) }}°</div>
        <div class="w-text">{{ wTodayText }}</div>
      </div>
    </div>
    <div class="w-meta">
      <span class="w-meta-item">💧 {{ weather.humidity }}%</span>
      <span class="w-meta-item">🌬️ {{ weather.windDirection }}{{ weather.windScale }}</span>
      <span class="w-meta-item">🌡️ 体感 {{ Math.round(weather.feelst) }}°</span>
    </div>
    <!-- 3 天预报 -->
    <div v-if="weather.forecast?.length" class="w-forecast">
      <div v-for="(d, i) in weather.forecast" :key="d.date" class="w-day">
        <span class="w-day-date">{{ wDayName(i) }}</span>
        <span class="w-day-icon">{{ weatherDayIcon(d.dayCode) }}</span>
        <span class="w-day-temp">{{ Math.round(d.high) }}/{{ Math.round(d.low) }}°</span>
      </div>
    </div>
  </div>
  <div v-else class="weather-card weather-loading" @click="configWeather">
    <span class="w-icon">🌡️</span> 天气加载中…（点此配置城市）
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import api from "../api";

// 天气（中央气象台，时钟右侧）
const weather = ref<{ icon: string; temperature: number; city: string; humidity: number; windScale: string; windDirection: string; feelst: number; precipitation: number; lastUpdate?: string; forecast?: { date: string; high: number; low: number; dayText: string; dayCode: number }[] } | null>(null);
let weatherTimer: number | undefined;

function weatherIcon(w: any) {
  if (w.precipitation > 0) return "🌧️";
  if (w.humidity >= 88) return "☁️";
  if (w.temperature >= 35) return "☀️";
  if (w.temperature <= 3) return "❄️";
  const h = new Date().getHours();
  return h >= 6 && h < 19 ? "🌤️" : "🌙";
}
function weatherDayIcon(code: number) {
  const map: Record<number, string> = { 0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️", 4: "🌧️", 5: "⛈️", 6: "🌨️", 7: "🌫️", 8: "🌧️", 9: "⛈️", 10: "❄️", 11: "🌧️", 12: "⛈️" };
  return map[code] || "🌤️";
}
// 今日天气（用预报首日，比规则更准）
const wTodayIcon = computed(() => (weather.value?.forecast?.[0] ? weatherDayIcon(weather.value.forecast[0].dayCode) : weather.value?.icon || "🌤️"));
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
  return "";
}
const weatherTip = computed(() => {
  if (!weather.value) return "天气加载中";
  const w = weather.value;
  const d = w.forecast?.[0];
  return d
    ? `${w.city}：${w.temperature}°C（体感 ${w.feelst}°）\n今日 ${d.dayText} ${Math.round(d.high)}/${Math.round(d.low)}°\n点击配置城市（站号）`
    : `${w.city}：${w.temperature}°C（体感 ${w.feelst}°）\n点击配置城市（站号）`;
});

async function loadWeather() {
  const city = localStorage.getItem("nav_weather_city") || "54823";
  try {
    const r: any = await api.get(`/weather?city=${city}`);
    if (r.ok) {
      weather.value = { ...r, icon: weatherIcon(r) };
    } else if (r.error) {
      weather.value = null;
    }
  } catch {
    /* 天气不可达时静默 */
  }
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
onBeforeUnmount(() => clearInterval(weatherTimer));
</script>

<style scoped>
/* 天气大卡片（时钟右侧，背景随天气变化） */
.weather-card {
  position: absolute; /* 固定在 hero 右侧，不参与布局（不挤压搜索区） */
  right: 24px;
  top: 40px;
  width: 240px;
  padding: 14px 18px 16px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  backdrop-filter: blur(16px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  transition: all 0.25s;
  user-select: none;
  overflow: hidden;
}
.weather-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.32);
}
/* 天气背景渐变：晴 / 云 / 雨 / 雪 */
.weather-card.w-sun {
  background: linear-gradient(160deg, rgba(56, 140, 255, 0.35), rgba(30, 60, 120, 0.25));
}
.weather-card.w-cloud {
  background: linear-gradient(160deg, rgba(80, 95, 130, 0.4), rgba(40, 50, 75, 0.25));
}
.weather-card.w-rain {
  background: linear-gradient(160deg, rgba(50, 70, 110, 0.5), rgba(25, 35, 60, 0.3));
}
.weather-card.w-snow {
  background: linear-gradient(160deg, rgba(110, 140, 170, 0.4), rgba(60, 80, 105, 0.25));
}

.w-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.w-city {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 0.5px;
}
.w-update {
  font-size: 11px;
  color: var(--text-dim);
}
.w-main {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 10px;
}
.w-icon {
  font-size: 48px;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.25));
  animation: w-float 3s ease-in-out infinite;
}
@keyframes w-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}
.w-now {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.w-temp {
  font-size: 42px;
  font-weight: 800;
  color: var(--text);
  line-height: 1;
}
.w-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
}
.w-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding: 8px 0;
  border-top: 1px solid rgba(148, 163, 184, 0.16);
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  margin-bottom: 10px;
}
.w-meta-item {
  font-size: 12px;
  color: var(--text-dim);
}

/* 预报行 */
.w-forecast {
  display: flex;
  gap: 8px;
}
.w-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
  padding: 8px 4px;
  border-radius: 10px;
  transition: background 0.15s;
}
.w-day:hover {
  background: rgba(148, 163, 184, 0.1);
}
.w-day-date {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}
.w-day-icon {
  font-size: 22px;
}
.w-day-temp {
  font-size: 12px;
  color: var(--text-dim);
}

.weather-card.weather-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-dim);
  width: auto;
  background: linear-gradient(160deg, rgba(30, 41, 66, 0.55), rgba(15, 23, 42, 0.35));
}
.weather-card.weather-loading .w-icon {
  font-size: 24px;
}

@media (max-width: 768px) {
  .weather-card {
    position: static; /* 窄屏回到文档流，居中堆叠 */
    width: auto;
    max-width: 300px;
    margin: 0 auto;
  }
}
</style>
