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
/* ===== 天气卡片（hero 右侧悬浮卡片，玻璃拟态 + 装饰光效） ===== */
.weather-card {
  position: absolute; /* 固定在 hero 右侧，不参与布局 */
  right: 24px;
  top: 40px;
  width: 320px;
  padding: 18px 22px 20px;
  border-radius: 22px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(18px);
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  cursor: pointer;
  transition: all 0.25s;
  user-select: none;
  overflow: hidden;
}
.weather-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 18px 46px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.12);
}
/* 装饰光斑（右上 + 左下） */
.weather-card::before,
.weather-card::after {
  content: "";
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}
.weather-card::before {
  width: 150px;
  height: 150px;
  top: -50px;
  right: -40px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.2), transparent 70%);
}
.weather-card::after {
  width: 110px;
  height: 110px;
  bottom: -40px;
  left: -30px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.1), transparent 70%);
}

/* 天气背景渐变：晴 / 云 / 雨 / 雪 */
.weather-card.w-sun {
  background: linear-gradient(160deg, rgba(56, 140, 255, 0.42), rgba(30, 60, 120, 0.3));
}
.weather-card.w-cloud {
  background: linear-gradient(160deg, rgba(80, 95, 130, 0.48), rgba(40, 50, 75, 0.3));
}
.weather-card.w-rain {
  background: linear-gradient(160deg, rgba(50, 70, 110, 0.58), rgba(25, 35, 60, 0.35));
}
.weather-card.w-snow {
  background: linear-gradient(160deg, rgba(110, 140, 170, 0.48), rgba(60, 80, 105, 0.3));
}

/* 头部：城市 + 更新时间 */
.w-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.w-city {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.5px;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.25);
}
.w-update {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.65);
}

/* 主区：大图标 + 温度 */
.w-main {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}
/* emoji 彩色渲染 */
.w-icon,
.w-day-icon {
  font-family: "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", sans-serif;
}
.w-icon {
  font-size: 54px;
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
  font-size: 48px;
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
  margin-bottom: 12px;
}
.w-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.88);
  background: rgba(255, 255, 255, 0.09);
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 4px 10px;
  border-radius: 999px;
  backdrop-filter: blur(4px);
}

/* 3 天预报 */
.w-forecast {
  display: flex;
  gap: 8px;
}
.w-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  flex: 1;
  padding: 10px 4px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: all 0.2s;
}
.w-day:hover {
  background: rgba(255, 255, 255, 0.13);
  transform: translateY(-3px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
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
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}

/* 加载态 */
.weather-card.weather-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
  width: auto;
  background: linear-gradient(160deg, rgba(30, 41, 66, 0.55), rgba(15, 23, 42, 0.35));
}
.weather-card.weather-loading .w-icon {
  font-size: 24px;
  filter: none;
}

@media (max-width: 768px) {
  .weather-card {
    position: static; /* 窄屏回到文档流，居中堆叠 */
    width: auto;
    max-width: 320px;
    margin: 0 auto;
  }
}
</style>
