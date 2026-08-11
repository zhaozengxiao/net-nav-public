<template>
  <svg :width="size" :height="size" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <!-- 晴天 -->
    <g v-if="type === 'sun'">
      <circle cx="32" cy="32" r="13" fill="#FFD34D" />
      <g stroke="#FFD34D" stroke-width="3.5" stroke-linecap="round">
        <line x1="32" y1="4" x2="32" y2="12" />
        <line x1="32" y1="52" x2="32" y2="60" />
        <line x1="4" y1="32" x2="12" y2="32" />
        <line x1="52" y1="32" x2="60" y2="32" />
        <line x1="12.5" y1="12.5" x2="18" y2="18" />
        <line x1="46" y1="46" x2="51.5" y2="51.5" />
        <line x1="51.5" y1="12.5" x2="46" y2="18" />
        <line x1="18" y1="46" x2="12.5" y2="51.5" />
      </g>
    </g>

    <!-- 晴间多云 -->
    <g v-else-if="type === 'partly'">
      <circle cx="24" cy="22" r="9" fill="#FFD34D" />
      <g stroke="#FFD34D" stroke-width="3" stroke-linecap="round">
        <line x1="24" y1="6" x2="24" y2="11" />
        <line x1="24" y1="33" x2="24" y2="38" />
        <line x1="8" y1="22" x2="13" y2="22" />
        <line x1="12" y1="10" x2="15.5" y2="13.5" />
        <line x1="36" y1="10" x2="32.5" y2="13.5" />
      </g>
      <path d="M46 38c0-4.4 3.6-8 8-8-1-6-6.2-10.5-12.5-10.5-5 0-9.3 3-11.3 7.4A9 9 0 0 0 30 36h16z" fill="#E8EDF4" />
      <path d="M26 44c0-3.9 3.1-7 7-7h19c3.9 0 7 3.1 7 7s-3.1 7-7 7H33c-3.9 0-7-3.1-7-7z" fill="#D5DDE8" />
    </g>

    <!-- 阴天（纯灰云，无太阳） -->
    <g v-else-if="type === 'overcast'">
      <path d="M44 24c0-4.4 3.6-8 8-8-1-6-6.2-10.5-12.5-10.5-5 0-9.3 3-11.3 7.4A9.4 9.4 0 0 0 30 16c-5.5 0-10 4.5-10 10h26z" fill="#A9BAD2" />
      <path d="M20 34c0-3.6 2.9-6.5 6.5-6.5h30c3.6 0 6.5 2.9 6.5 6.5s-2.9 6.5-6.5 6.5h-30c-3.6 0-6.5-2.9-6.5-6.5z" fill="#8DA3C2" />
      <path d="M22 46c0-3 2.4-5.4 5.4-5.4h28.2c3 0 5.4 2.4 5.4 5.4s-2.4 5.4-5.4 5.4H27.4c-3 0-5.4-2.4-5.4-5.4z" fill="#7C92B0" />
    </g>

    <!-- 多云（兜底云） -->
    <g v-else-if="type === 'cloud'">
      <path d="M46 32c0-4.4 3.6-8 8-8-1-6-6.2-10.5-12.5-10.5-5 0-9.3 3-11.3 7.4A9.4 9.4 0 0 0 30 24c-5.5 0-10 4.5-10 10h26z" fill="#B7C8E4" />
      <path d="M24 42c0-4.4 3.6-8 8-8h22c4.4 0 8 3.6 8 8s-3.6 8-8 8H32c-4.4 0-8-3.6-8-8z" fill="#96ACCE" />
    </g>

    <!-- 雨 -->
    <g v-else-if="type === 'rain'">
      <path d="M44 26c0-4.4 3.6-8 8-8-1-6-6.2-10.5-12.5-10.5-5 0-9.3 3-11.3 7.4A9.4 9.4 0 0 0 28 18c-5.5 0-10 4.5-10 10h26z" fill="#C9D3E1" />
      <path d="M22 38c0-3.6 2.9-6.5 6.5-6.5H50c3.6 0 6.5 2.9 6.5 6.5s-2.9 6.5-6.5 6.5H28.5c-3.6 0-6.5-2.9-6.5-6.5z" fill="#B4C1D4" />
      <g stroke="#4FA3FF" stroke-width="3.2" stroke-linecap="round">
        <line x1="18" y1="48" x2="13" y2="56" />
        <line x1="30" y1="48" x2="25" y2="56" />
        <line x1="42" y1="48" x2="37" y2="56" />
      </g>
    </g>

    <!-- 雷阵雨：暗云 + 明显闪电 + 雨滴 -->
    <g v-else-if="type === 'storm'">
      <path d="M44 24c0-4.4 3.6-8 8-8-1-6-6.2-10.5-12.5-10.5-5 0-9.3 3-11.3 7.4A9.4 9.4 0 0 0 28 16c-5.5 0-10 4.5-10 10h26z" fill="#6E7D99" />
      <path d="M20 36c0-3.6 2.9-6.5 6.5-6.5H50c3.6 0 6.5 2.9 6.5 6.5s-2.9 6.5-6.5 6.5H26.5c-3.6 0-6.5-2.9-6.5-6.5z" fill="#55647F" />
      <!-- 主闪电（大而亮） -->
      <path d="M28 44l-9 15h8l-4 11 16-17h-9l6-9h-8z" fill="#FFE24D" stroke="#FFB800" stroke-width="1.2" />
      <!-- 闪电光晕 -->
      <path d="M28 44l-9 15h8l-4 11 16-17h-9l6-9h-8z" fill="rgba(255, 226, 77, 0.35)" transform="scale(1.18) translate(-5 -5)" />
      <!-- 雨滴 -->
      <g stroke="#4FA3FF" stroke-width="2.6" stroke-linecap="round">
        <line x1="14" y1="54" x2="11" y2="60" />
        <line x1="50" y1="52" x2="47" y2="58" />
      </g>
    </g>

    <!-- 雪 -->
    <g v-else-if="type === 'snow'">
      <path d="M44 26c0-4.4 3.6-8 8-8-1-6-6.2-10.5-12.5-10.5-5 0-9.3 3-11.3 7.4A9.4 9.4 0 0 0 28 18c-5.5 0-10 4.5-10 10h26z" fill="#C3D4EA" />
      <path d="M22 38c0-3.6 2.9-6.5 6.5-6.5H50c3.6 0 6.5 2.9 6.5 6.5s-2.9 6.5-6.5 6.5H28.5c-3.6 0-6.5-2.9-6.5-6.5z" fill="#B0C5DE" />
      <g fill="#8FC7FF">
        <circle cx="16" cy="52" r="3" />
        <circle cx="30" cy="54" r="3" />
        <circle cx="44" cy="52" r="3" />
      </g>
    </g>

    <!-- 雾 / 霾 -->
    <g v-else-if="type === 'fog'">
      <path d="M46 24c0-4.4 3.6-8 8-8-1-6-6.2-10.5-12.5-10.5-5 0-9.3 3-11.3 7.4A9.4 9.4 0 0 0 30 16c-5.5 0-10 4.5-10 10h26z" fill="#B7C8E4" />
      <path d="M22 34c0-3.3 2.7-6 6-6H52c3.3 0 6 2.7 6 6s-2.7 6-6 6H28c-3.3 0-6-2.7-6-6z" fill="#96ACCE" />
      <g stroke="#8FA6C9" stroke-width="3" stroke-linecap="round">
        <line x1="16" y1="44" x2="46" y2="44" />
        <line x1="22" y1="51" x2="52" y2="51" />
        <line x1="14" y1="58" x2="40" y2="58" />
      </g>
    </g>

    <!-- 未知：兜底晴天 -->
    <g v-else>
      <circle cx="32" cy="32" r="13" fill="#FFD34D" />
      <g stroke="#FFD34D" stroke-width="3.5" stroke-linecap="round">
        <line x1="32" y1="4" x2="32" y2="12" />
        <line x1="32" y1="52" x2="32" y2="60" />
        <line x1="4" y1="32" x2="12" y2="32" />
        <line x1="52" y1="32" x2="60" y2="32" />
      </g>
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ code: number; size?: number }>();

// 中央气象台 dayCode → 图标类型（0晴 1多云 2阴 3阵雨 4雷阵雨 5雷阵雨冰雹
// 6雨夹雪 7小雨 8中雨 9大雨 10暴雨 11大暴雨 12特大暴雨 13阵雪 14小雪 15中雪
// 16大雪 17暴雪 18雾 19冻雨 21-25各级雨 26-28各级雪 29-39霾/沙尘 40雨 41雪）
const type = computed(() => {
  const c = props.code;
  if (c === 0) return "sun";
  if (c === 1) return "partly"; // 多云
  if (c === 2) return "overcast"; // 阴天
  if (c === 4 || c === 5) return "storm"; // 雷阵雨 / 雷阵雨冰雹
  if ([3, 7, 8, 9, 10, 11, 12, 19, 21, 22, 23, 24, 25, 40].includes(c)) return "rain";
  if ([6, 13, 14, 15, 16, 17, 26, 27, 28, 41].includes(c)) return "snow";
  if ([18, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39].includes(c)) return "fog";
  return "cloud"; // 其余按多云
});
</script>
