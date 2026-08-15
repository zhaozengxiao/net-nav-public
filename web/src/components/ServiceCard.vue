<template>
  <a
    class="card"
    :data-id="s.id"
    :style="{ '--c': s.color }"
    :href="safeUrl(s.url)"
    target="_blank"
    rel="noopener"
    @click="track"
    @contextmenu="emit('ctx', $event, s)"
  >
    <span class="status-dot" :class="statusClass(s)" :title="statusText(s)"></span>
    <span class="card-icon" :style="iconStyle">{{ s.icon }}</span>
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
</template>

<script setup lang="ts">
import { computed } from "vue";
import api from "../api";
import { Service, hexToRgba, isSafeUrl, statusClass, statusText, dockerClass, dockerText } from "../utils";

const props = defineProps<{ s: Service }>();
const emit = defineEmits<{ (e: "ctx", ev: MouseEvent, s: Service): void }>();

function safeUrl(u: unknown) {
  return isSafeUrl(u) ? u : undefined;
}

// 点击计数（后端 + 本地即时反馈）
function track() {
  api.post(`/click/${props.s.id}`).catch(() => {});
  props.s.clicks++;
}

const iconStyle = computed(() => {
  const c = props.s.color || "#38bdf8";
  return {
    background: `radial-gradient(circle at 30% 25%, ${hexToRgba(c, 0.45)}, ${hexToRgba(c, 0.1)})`,
    borderColor: hexToRgba(c, 0.35),
    boxShadow: `0 4px 20px ${hexToRgba(c, 0.22)}`,
  };
});
</script>

<style scoped>
/* 卡片 */
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
  cursor: grab;
}
.card:active {
  cursor: grabbing;
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

/* 拖拽占位样式（Sortable ghost 加在卡片根元素上） */
.sortable-ghost {
  opacity: 0.45;
  outline: 2px dashed rgba(100, 160, 255, 0.7);
  outline-offset: 2px;
  background: rgba(56, 132, 255, 0.08);
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

/* 移动端 */
@media (max-width: 768px) {
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
