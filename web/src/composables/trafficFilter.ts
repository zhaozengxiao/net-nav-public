// 网速图表筛选状态：点击 sub 行的 ↑ / ↓ 切换图表只显示上行/下行/全部
import { ref } from "vue";

export type TrafficFilter = "all" | "up" | "down";

export const trafficFilter = ref<TrafficFilter>("all");
