<template>
  <!-- 天气卡片（时钟右侧，背景随天气变化，点击配置城市） -->
  <div v-if="weather" class="weather-card" :class="wBgClass" @click="configWeather" :title="weatherTip">
    <div class="w-head">
      <span class="w-city">{{ weather.city }}</span>
      <span class="w-update">{{ weather.lastUpdate?.slice(5) }}</span>
    </div>
    <div class="w-main">
      <WIcon :code="wTodayCode" :size="54" class="w-icon" />
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
    <!-- 7 天预报 -->
    <div v-if="weather.forecast?.length" class="w-forecast">
      <div v-for="(d, i) in weather.forecast" :key="d.date" class="w-day">
        <span class="w-day-date">{{ wDayName(i) }}</span>
        <span class="w-day-icon"><WIcon :code="d.dayCode" :size="16" /></span>
        <span class="w-day-temp">{{ Math.round(d.high) }}/{{ Math.round(d.low) }}°</span>
        <span class="w-day-wind">{{ d.dayWindScale }}</span>
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
import WIcon from "./WIcon.vue";

// 天气（中央气象台，时钟右侧）
const weather = ref<{ icon: string; temperature: number; city: string; humidity: number; windScale: string; windDirection: string; feelst: number; precipitation: number; lastUpdate?: string; forecast?: { date: string; high: number; low: number; dayText: string; dayCode: number; dayWindScale?: string }[] } | null>(null);
let weatherTimer: number | undefined;

function weatherIcon(w: any) {
  if (w.precipitation > 0) return "🌧️";
  if (w.humidity >= 88) return "☁️";
  if (w.temperature >= 35) return "☀️";
  if (w.temperature <= 3) return "❄️";
  const h = new Date().getHours();
  return h >= 6 && h < 19 ? "🌤️" : "🌙";
}
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
  top: 30px;
  width: 375px;
  padding: 12px 16px 10px;
  cursor: pointer;
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

@media (max-width: 1400px) {
  .weather-card {
    display: none; /* 窄屏隐藏天气，避免遮挡 */
  }
}

@media (max-width: 768px) {
  .weather-card {
    position: static; /* 窄屏回到文档流，居中堆叠 */
    width: auto;
    max-width: 340px;
    margin: 0 auto;
  }
  .w-forecast {
    overflow-x: auto; /* 窄屏预报横向滚动 */
  }
}
</style>
