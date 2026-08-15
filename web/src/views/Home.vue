<template>
  <div class="page">
    <div class="blob blob-1"></div>
    <div class="blob blob-2"></div>
    <div class="blob blob-3"></div>
    <VueParticles id="bg-particles" class="particle-bg" :options="particleOptions" />

    <!-- 顶栏 -->
    <header class="topbar">
      <div class="brand-wrap">
        <button class="menu-btn" :class="{ active: favOpen }" title="书签" @click="favOpen = !favOpen">☰</button>
        <div class="brand">🛰️ 内网导航</div>
      </div>
      <div class="top-actions">
        <button class="icon-btn" :class="{ active: groupMode }" title="分组显示" @click="groupMode = !groupMode">🗂️</button>
        <button class="icon-btn" title="检查更新" @click="checkUpdate">🔄</button>
        <button class="icon-btn" title="管理后台" @click="$router.push('/admin')">⚙️</button>
      </div>
    </header>

    <!-- 书签面板（圆角毛玻璃浮层，☰ 展开） -->
    <aside class="fav-panel" :class="{ open: favOpen }">
      <div class="fav-panel-head">
        <span class="fav-panel-title">📑 书签</span>
        <button class="fav-import" title="导入浏览器书签" @click="importInput?.click()">📥 导入</button>
        <input ref="importInput" type="file" accept=".html" hidden @change="importBookmarks" />
      </div>
      <div class="fav-list">
        <BmTree :nodes="bmTree" :status="bmStatus" @open="openUrl" @expand="checkBookmarks" @ctx="showCtx" />
        <div v-if="!bookmarks.length" class="fav-empty">
          暂无书签<br />点 📥 导入浏览器书签<br />（浏览器导出为 HTML）
        </div>
      </div>
    </aside>

    <!-- 书签/文件夹/服务 右键快速编辑菜单 -->
    <div v-if="ctxMenu" class="fav-ctx" :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }" @click.stop @contextmenu.prevent.stop>
      <template v-if="ctxMenu.target.type === 'folder'">
        <button class="ctx-item" @click="ctxRename">✏️ 重命名文件夹</button>
        <button class="ctx-item danger" @click="ctxDelete">🗑️ 删除文件夹</button>
      </template>
      <template v-else-if="ctxMenu.target.type === 'service'">
        <button class="ctx-item" @click="ctxOpen">🔗 打开</button>
        <button class="ctx-item" @click="ctxRename">✏️ 重命名</button>
        <button class="ctx-item" @click="ctxEditDesc">📝 编辑描述</button>
        <button class="ctx-item" @click="ctxEditUrl">🌐 修改网址</button>
        <button class="ctx-item danger" @click="ctxDelete">🗑️ 删除</button>
      </template>
      <template v-else>
        <button class="ctx-item" @click="ctxOpen">🔗 打开</button>
        <button class="ctx-item" @click="ctxRename">✏️ 重命名</button>
        <button class="ctx-item" @click="ctxEditUrl">🌐 修改网址</button>
        <button class="ctx-item danger" @click="ctxDelete">🗑️ 删除</button>
      </template>
    </div>

    <!-- 时钟区 -->
    <section ref="heroRef" class="hero">
      <div class="hero-center">
        <div class="greeting">{{ greeting }}，{{ nowDate }}</div>
        <Vue3FlipClock />
        <div class="sub">
          <span v-if="trafficData.up >= 0" class="traffic">
            <span class="t-up" :class="{ active: trafficFilter === 'up', off: trafficFilter === 'down' }" title="点击筛选上行曲线" @click="toggleFilter('up')">↑ {{ fmtSpeed(trafficData.up) }}</span>
            <span class="t-down" :class="{ active: trafficFilter === 'down', off: trafficFilter === 'up' }" title="点击筛选下行曲线" @click="toggleFilter('down')">↓ {{ fmtSpeed(trafficData.down) }}</span>
            ·
          </span>
          共 {{ totalServices }} 个服务 · {{ onlineCount }} 个在线 ·
          <span class="sse-dot" :class="sseState"></span>{{ sseText }}
        </div>
      </div>
      <TrafficCard />
      <WeatherCard />

    </section>
      <div ref="searchBoxRef" class="search-box" @click="focusSearch">

        <span class="search-icon">🔍</span>
        <input ref="searchInputRef" v-model="keyword" placeholder="搜索服务名称、描述…" />
        <span v-if="keyword" class="search-clear" @click.stop="clearSearch">✕</span>
      </div>
    <main class="content">
      <!-- 分组模式：按分组渲染 -->
      <template v-if="groupMode">
        <section v-for="g in groupedServices" :key="g.id" class="group-sec" :data-gid="g.id">
          <div class="group-title" @click="toggleGroup(g.id)">
            <span class="group-caret">{{ groupCollapsed.has(g.id) ? "▸" : "▾" }}</span>
            <span class="group-name">{{ g.name }}</span>
            <span class="group-count">{{ g.list.length }} 个</span>
          </div>
          <div v-if="!groupCollapsed.has(g.id)" class="cards">
            <ServiceCard v-for="s in g.list" :key="s.id" :s="s" @ctx="showSvcCtx" />
          </div>
        </section>
      </template>

      <!-- 扁平模式：全部平铺 -->
      <div v-else ref="cardsWrap" class="cards">
        <ServiceCard v-for="s in filteredServices" :key="s.id" :s="s" @ctx="showSvcCtx" />
      </div>

      <div v-if="filteredServices.length === 0" class="no-result">
        <template v-if="keyword">😕 没有找到匹配「{{ keyword }}」的服务</template>
        <template v-else-if="sseState === 'closed'">📡 后端未连接，服务列表加载失败</template>
        <template v-else>📭 暂无服务，点右上角 ⚙️ 进入后台添加</template>
      </div>
    </main>

    <footer class="footer">内网服务导航 · 自托管 · 零外网依赖</footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Solar } from "lunar-javascript";
import Sortable from "sortablejs";
import WeatherCard from "../components/WeatherCard.vue";
import TrafficCard from "../components/TrafficCard.vue";
import ServiceCard from "../components/ServiceCard.vue";
import BmTree from "../components/BmTree.vue";
import type { BmNode } from "../components/BmTree.vue";
import { useBookmarks } from "../composables/useBookmarks";
import { trafficFilter } from "../composables/trafficFilter";
import api from "../api";
import { statusText, dockerText, fmtSpeed } from "../utils";
import type { Service } from "../utils";

const services = ref<Service[]>([]);
const keyword = ref("");
const nowDate = ref("");
const searchInputRef = ref<HTMLInputElement>();
const heroRef = ref<HTMLElement | null>(null);
const searchBoxRef = ref<HTMLElement | null>(null);
let posObserver: ResizeObserver | undefined;

// 根据 search-box 宽度动态计算两侧卡片位置
function updateCardPos() {
  const hero = heroRef.value;
  const sb = searchBoxRef.value;
  if (!hero || !sb) return;
  const rect = sb.getBoundingClientRect();
  hero.style.setProperty("--search-left", `${rect.left}px`);
  hero.style.setProperty("--search-right", `${rect.right}px`);
}

// 书签数据层（加载/导入/删除/连通性检测/树构建）
const { bookmarks, bmStatus, importInput, bmTree, openUrl, importBookmarks, loadBookmarks, checkBookmarks } = useBookmarks();

// 书签面板开合状态（不记忆，每次打开页面默认收起）
const favOpen = ref(false);
watch(favOpen, (v) => {
  if (!v) return;
  const closeAll = (nodes: BmNode[]) =>
    nodes.forEach((n) => {
      if (n.type === "folder") {
        n.open = false;
        closeAll(n.children);
      }
    });
  closeAll(bmTree.value);
  checkBookmarks();
});

// 检查更新：对比本地版本与 GitHub 公开仓库
async function checkUpdate() {
  try {
    const r: any = await api.get("/update-check", { silent: true });
    if (!r.ok) return ElMessage.error(r.error || "检查失败");
    if (r.hasUpdate) {
      try {
        await ElMessageBox.confirm(`发现新版本：${r.current} → ${r.latest}\n点击确定跳转仓库查看更新说明`, "🔄 有新版本", {
          confirmButtonText: "去更新",
          cancelButtonText: "取消",
        });
        window.open(r.url, "_blank");
      } catch {
        /* 取消 */
      }
    } else {
      ElMessage.success(`已是最新版本（${r.latest}）`);
    }
  } catch {
    ElMessage.error("检查更新失败（请确认可访问 GitHub）");
  }
}

// ---- 右键快速编辑（书签/文件夹/服务卡片） ----
const ctxMenu = ref<{ x: number; y: number; target: any } | null>(null);

function showCtx(e: MouseEvent, target: any) {
  e.preventDefault();
  e.stopPropagation();
  // 钳制最小坐标：超窄窗口下不会算出负值溢出屏幕
  ctxMenu.value = {
    x: Math.max(4, Math.min(e.clientX, window.innerWidth - 150)),
    y: Math.max(4, Math.min(e.clientY, window.innerHeight - 180)),
    target,
  };
}
function showSvcCtx(e: MouseEvent, s: Service) {
  showCtx(e, { type: "service", id: s.id, name: s.name, url: s.url, svc: s });
}
function closeCtx() {
  ctxMenu.value = null;
}
// 统一输入弹窗（右键菜单/配置多处复用）
function promptInput(message: string, title: string, inputValue: string, validator?: (v: string) => boolean | string) {
  return ElMessageBox.prompt(message, title, {
    inputValue,
    confirmButtonText: "保存",
    cancelButtonText: "取消",
    inputValidator: validator as any,
  });
}
// 右键非目标区域（空白/其它元素）时关闭菜单；可右键目标自行 stopPropagation 处理
function onDocCtx(e: MouseEvent) {
  const t = e.target as HTMLElement | null;
  if (!t || t.closest(".fav-ctx")) return;
  closeCtx();
}
function ctxOpen() {
  const t = ctxMenu.value?.target;
  closeCtx();
  if (t?.url) window.open(t.url, "_blank");
}
async function ctxRename() {
  const t = ctxMenu.value?.target;
  closeCtx(); // 先关右键菜单，再弹输入框
  if (!t) return;
  if (t.type === "folder") {
    // 文件夹重命名（含子树路径迁移）
    try {
      const { value } = await promptInput("新的文件夹名", "重命名文件夹", t.name, (v: string) => (v.trim() ? true : "名称不能为空"));
      await api.post("/bookmarks/rename-folder", { oldPath: t.path, newName: value.trim() });
      ElMessage.success("文件夹已重命名");
      await loadBookmarks();
    } catch {
      /* 取消 */
    }
    return;
  }
  try {
    const { value } = await promptInput("新的名称", t.type === "service" ? "重命名服务" : "重命名", t.name, (v: string) => (v.trim() ? true : "名称不能为空"));
    if (t.type === "service") {
      await api.put(`/admin/services/${t.id}`, { name: value.trim() });
      t.svc.name = value.trim();
    } else {
      await api.put(`/bookmarks/${t.id}`, { name: value.trim(), url: t.url });
      const src = bookmarks.value.find((x) => x.id === t.id);
      if (src) src.name = value.trim();
    }
    ElMessage.success("已重命名");
  } catch {
    /* 取消 */
  }
}
async function ctxEditDesc() {
  const t = ctxMenu.value?.target;
  closeCtx(); // 先关右键菜单，再弹输入框
  if (!t || t.type !== "service") return;
  try {
    const { value } = await promptInput("服务描述（显示在卡片上）", "编辑描述", t.svc.description || "");
    await api.put(`/admin/services/${t.id}`, { description: value.trim() });
    t.svc.description = value.trim();
    ElMessage.success("已保存描述");
  } catch {
    /* 取消 */
  }
}
async function ctxEditUrl() {
  const t = ctxMenu.value?.target;
  closeCtx(); // 先关右键菜单，再弹输入框
  if (!t || t.type === "folder") return;  try {
    const { value } = await promptInput("新的网址（含 http(s)://）", "修改网址", t.url, (v: string) => (/^https?:\/\//i.test(v.trim()) ? true : "网址需以 http(s):// 开头"));
    if (t.type === "service") {
      await api.put(`/admin/services/${t.id}`, { url: value.trim() });
      t.svc.url = value.trim();
    } else {
      await api.put(`/bookmarks/${t.id}`, { name: t.name, url: value.trim() });
      const src = bookmarks.value.find((x) => x.id === t.id);
      if (src) src.url = value.trim();
    }
    ElMessage.success("已修改网址");
  } catch {
    /* 取消 */
  }
}
async function ctxDelete() {
  const t = ctxMenu.value?.target;
  closeCtx(); // 先关右键菜单，再弹确认框
  if (!t) return;
  if (t.type === "folder") {
    // 文件夹删除（含子内容）
    try {
      const count = t.children?.filter((c) => c.type === "bookmark").length || 0;
      await ElMessageBox.confirm(
        `删除文件夹「${t.name}」？${count ? `（内含 ${count} 个书签，将一并删除）` : ""}`,
        "删除文件夹",
        { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" }
      );
    } catch {
      closeCtx();
      return;
    }
    try {
      const r: any = await api.post("/bookmarks/delete-folder", { path: t.path });
      ElMessage.success(`已删除文件夹（移除 ${r.removed} 条）`);
      await loadBookmarks();
    } catch {
      /* 失败 */
    }
    closeCtx();
    return;
  }
  const confirmText = t.type === "service" ? `删除服务「${t.name}」？` : `删除书签「${t.name}」？`;
  try {
    await ElMessageBox.confirm(confirmText, "删除", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
    });
  } catch {
    closeCtx();
    return;
  }
  if (t.type === "service") {
    try {
      await api.delete(`/admin/services/${t.id}`);
      services.value = services.value.filter((x) => x.id !== t.id);
      ElMessage.success("已删除服务");
    } catch {
      ElMessage.error("删除服务失败");
    }
  } else {
    try {
      await api.delete(`/bookmarks/${t.id}`);
      bookmarks.value = bookmarks.value.filter((x) => x.id !== t.id);
      ElMessage.success("已删除");
    } catch {
      ElMessage.error("删除书签失败");
    }
  }
  closeCtx();
}

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

// 爱快网速（SSE traffic 事件更新，sub 行显示）
const trafficData = ref<{ up: number; down: number; error?: string }>({ up: -1, down: -1 });

// 点击 ↑ / ↓ 切换图表筛选（再点一次恢复全部）
function toggleFilter(which: "up" | "down") {
  trafficFilter.value = trafficFilter.value === which ? "all" : which;
}

// 动态粒子背景（tsParticles 现成库，零 CDN）
// 移动端降量（电池/性能）；页面隐藏时暂停动画
const isMobileParticles = typeof window !== "undefined" && window.innerWidth < 768;
const particleOptions = {
  fullScreen: { enable: false },
  fpsLimit: 60,
  pauseOnBlur: true,
  pauseOnOutsideViewport: true,
  particles: {
    number: { value: isMobileParticles ? 45 : 120, density: { enable: true, width: 1400, height: 800 } },
    color: { value: ["#ffffff", "#bfdbfe", "#7dd3fc"] },
    shape: { type: "circle" },
    opacity: { value: { min: 0.3, max: 0.9 } },
    size: { value: { min: 1.5, max: 3.2 } },
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
      opacity: 0.35,
      width: 1.2,
    },
  },
  detectRetina: true,
};

const filteredServices = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return services.value;
  // 支持搜索：名称/描述/网址/分组名/在线状态/镜像更新状态
  return services.value.filter(
    (s) =>
      s.name.toLowerCase().includes(kw) ||
      (s.description || "").toLowerCase().includes(kw) ||
      s.url.toLowerCase().includes(kw) ||
      (s.groupName || "").toLowerCase().includes(kw) ||
      statusText(s).toLowerCase().includes(kw) ||
      dockerText(s).toLowerCase().includes(kw)
  );
});

// ---- 分组模式：按分组渲染，开关记忆到 localStorage，分组可折叠 ----
const groupMode = ref(localStorage.getItem("nav_group_mode") === "1");
watch(groupMode, (v) => localStorage.setItem("nav_group_mode", v ? "1" : "0"));

const groupsData = ref<{ id: number; name: string; icon: string }[]>([]);

const groupedServices = computed(() => {
  const map = new Map<number, { id: number; name: string; list: Service[] }>();
  for (const s of filteredServices.value) {
    if (!map.has(s.group_id)) map.set(s.group_id, { id: s.group_id, name: s.groupName || "未分组", list: [] });
    map.get(s.group_id)!.list.push(s);
  }
  // 按分组管理设置的顺序渲染（GET /api/groups），未匹配的组排后面
  const result: { id: number; name: string; list: Service[] }[] = [];
  for (const g of groupsData.value) {
    const item = map.get(g.id);
    if (item) {
      result.push(item);
      map.delete(g.id);
    }
  }
  for (const item of map.values()) result.push(item);
  return result;
});

const groupCollapsed = ref<Set<number>>(new Set());
function toggleGroup(id: number) {
  const next = new Set(groupCollapsed.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  groupCollapsed.value = next;
}

// ---- 服务卡片拖拽排序（首页直接调整顺序，写回 sort） ----
const cardsWrap = ref<HTMLElement>();
let cardSortables: Sortable[] = [];
let groupSortable: Sortable | null = null;

function initGroupSortable() {
  if (groupSortable) {
    groupSortable.destroy();
    groupSortable = null;
  }
  if (!groupMode.value) return;
  const el = document.querySelector(".content");
  if (!el) return;
  groupSortable = Sortable.create(el as HTMLElement, {
    animation: 150,
    draggable: ".group-sec",
    handle: ".group-title",
    ghostClass: "sortable-ghost",
    disabled: !!keyword.value.trim(),
    // 触屏：长按才可拖（防点标题折叠时误拖）；桌面鼠标无延迟
    delay: 350,
    delayOnTouchOnly: true,
    touchStartThreshold: 5,
    onStart: () => {
      if (navigator.vibrate) navigator.vibrate(10);
    },
    onEnd: async () => {
      const ids = Array.from(document.querySelectorAll(".group-sec"))
        .map((c) => Number((c as HTMLElement).dataset.gid))
        .filter((n) => Number.isInteger(n));
      if (ids.length < 2) return;
      try {
        await api.put("/admin/groups/reorder", { ids });
        ElMessage.success("分组顺序已保存");
        await load();
      } catch {
        ElMessage.error("保存分组顺序失败（请先在后台登录）");
      }
    },
  });
}

function initCardSortable() {
  cardSortables.forEach((s) => s.destroy());
  cardSortables = [];
  const containers: HTMLElement[] = [];
  if (groupMode.value) {
    containers.push(...(Array.from(document.querySelectorAll(".group-sec .cards")) as HTMLElement[]));
  } else if (cardsWrap.value) {
    containers.push(cardsWrap.value);
  }
  for (const el of containers) {
    cardSortables.push(
      Sortable.create(el, {
        animation: 150,
        ghostClass: "sortable-ghost",
        disabled: !!keyword.value.trim(), // 搜索过滤时不拖拽
        // 触屏：长按 350ms 才启动拖拽（防滚动/点击误触）；桌面鼠标无延迟
        delay: 350,
        delayOnTouchOnly: true,
        touchStartThreshold: 5,
        onStart: () => {
          if (navigator.vibrate) navigator.vibrate(10);
        },
        onEnd: async () => {
          const domIds = Array.from(document.querySelectorAll(".cards .card"))
            .map((c) => Number((c as HTMLElement).dataset.id))
            .filter((n) => Number.isInteger(n));
          if (domIds.length < 2) return;
          try {
            await api.put("/admin/services/reorder", { ids: domIds });
            if (!groupMode.value) {
              // 扁平模式：所有卡片都在 DOM，本地同步顺序避免全量刷新闪烁
              const byId = new Map(services.value.map((s) => [s.id, s]));
              // 防御：DOM 里出现本地没有的服务（拖拽期间被删）时放弃本地重排，回拉服务端
              if (domIds.some((id) => !byId.has(id))) {
                await load();
              } else {
                services.value = domIds.map((id) => byId.get(id)) as Service[];
              }
            } else {
              // 分组模式：折叠分组不在 DOM，本地重排会截断数据，回拉服务端顺序
              await load();
            }
            ElMessage.success("排序已保存");
          } catch {
            await load(); // 保存失败则回拉服务端顺序
            ElMessage.error("保存排序失败（请先在后台登录）");
          }
        },
      })
    );
  }
}

// 服务/分组加载、搜索、分组模式、折叠状态变化时统一重建拖拽（合并原两个 watcher，避免每按键重建两轮）
watch([services, groupsData, keyword, groupMode, groupCollapsed], async () => {
  await nextTick();
  initGroupSortable();
  initCardSortable();
});

const totalServices = computed(() => services.value.length);
const onlineCount = computed(() => services.value.filter((s) => s.status?.online).length);

// 问候语按小时更新：nowHour 由 tick() 每秒刷新，跨时段自动切换（修复之前 computed 无响应式依赖导致冻结）
const nowHour = ref(new Date().getHours());
const greeting = computed(() => {
  const h = nowHour.value;
  if (h < 6) return "夜深了，注意休息";
  if (h < 9) return "早上好";
  if (h < 12) return "上午好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
});

// 日期文本按天缓存：每秒 tick 只更新小时（问候语），日期/农历等按天计算的结果跨天前不重复算（lunar-javascript 较耗 CPU）
let lastDateKey = "";
function tick() {
  const now = new Date();
  nowHour.value = now.getHours();
  // 用本地日期做缓存键（toISOString 是 UTC，东八区凌晨 0-8 点会误判未跨天）
  const dateKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  if (dateKey === lastDateKey) return;
  lastDateKey = dateKey;
  const parts: string[] = [
    now.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    }),
  ];
  try {
    // 农历 + 节气 + 节日（lunar-javascript）
    const solar = Solar.fromDate(now);
    const lunar = solar.getLunar();
    parts.push(`农历${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`);
    const fest: string[] = [];
    const jq = lunar.getJieQi();
    if (jq) fest.push(jq); // 当天是节气（如秋分）
    fest.push(...(lunar.getFestivals() || [])); // 农历节日（除夕/春节/七夕…）
    fest.push(...(solar.getFestivals() || [])); // 公历节日（元旦/劳动节/国庆…）
    if (fest.length) parts.push(`· ${fest[0]}`);
  } catch {
    /* 农历计算失败不影响日期显示 */
  }
  nowDate.value = parts.join(" ");
}

async function load() {
  try {
    // silent：断网/后端未启动时不弹错误 toast，页面保持上次数据降级展示
    services.value = await api.get("/services", { silent: true });
  } catch {
    /* 后端未启动时静默 */
  }
  try {
    groupsData.value = await api.get("/groups", { silent: true });
  } catch {
    /* 分组加载失败静默 */
  }
}

function updateStatus(id: number, status: any) {
  const s = services.value.find((x) => x.id === id);
  if (s) s.status = status;
}

// SSE 消息解析保护：坏消息/非数组直接忽略，不影响后续推送（防快照丢失）
function applyStatusList(raw: string) {
  let list: { id: number; status: any }[];
  try {
    list = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(list)) return;
  for (const { id, status } of list) {
    if (Number.isInteger(id)) updateStatus(id, status);
  }
}

// SSE 实时推送：状态一变，后端主动推过来，零轮询
function connectSSE() {
  sse = new EventSource("/api/events");

  sse.addEventListener("snapshot", (e) => applyStatusList((e as MessageEvent).data));
  sse.addEventListener("status", (e) => applyStatusList((e as MessageEvent).data));
  // 爱快网速：后端每 3 秒推一次
  sse.addEventListener("traffic", (e) => {
    try {
      trafficData.value = JSON.parse((e as MessageEvent).data);
    } catch { /* 忽略 */ }
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
  loadBookmarks();
  connectSSE(); // 状态实时推送，无需轮询
  document.addEventListener("click", onClickOutside);
  document.addEventListener("contextmenu", onDocCtx);
  // 卡片位置随 search-box 宽度动态调整
  updateCardPos();
  posObserver = new ResizeObserver(updateCardPos);
  if (searchBoxRef.value) posObserver.observe(searchBoxRef.value);
  window.addEventListener("resize", updateCardPos);
});

onBeforeUnmount(() => {
  clearInterval(timer);
  sse?.close();
  document.removeEventListener("click", onClickOutside);
  document.removeEventListener("contextmenu", onDocCtx);
  // 销毁拖拽实例，防路由切换后残留 DOM 引用与监听
  cardSortables.forEach((s) => s.destroy());
  cardSortables = [];
  groupSortable?.destroy();
  groupSortable = null;
  posObserver?.disconnect();
  window.removeEventListener("resize", updateCardPos);
});

// 点击书签面板外部任意位置 → 关闭面板
function onClickOutside(e: MouseEvent) {
  const t = e.target as HTMLElement | null;
  if (t) closeCtx(); // 点击任意处先关右键菜单
  if (!t || !favOpen.value) return;
  if (t.closest(".fav-panel") || t.closest(".menu-btn") || t.closest(".fav-ctx") || t.closest(".el-overlay") || t.closest(".el-message")) return; // 面板/☰/右键菜单/Element 弹层不关
  favOpen.value = false;
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  min-height: 100dvh;
  position: relative;
}

/* 顶栏 */
/* 顶栏菜单按钮 + 品牌 */
.brand-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}
.menu-btn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--card-border);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-dim);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s ease;
}
.menu-btn:hover,
.menu-btn.active {
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.5);
  background: rgba(56, 189, 248, 0.12);
}
.topbar {
  position: relative;
  z-index: 1;
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
.icon-btn.active {
  background: rgba(56, 132, 255, 0.28);
  box-shadow: 0 0 0 1px rgba(56, 132, 255, 0.5);
}

/* 分组模式：每组常驻玻璃拟态背景区块 */
.group-sec {
  margin-bottom: 22px;
  padding: 14px 16px 18px;
  background: linear-gradient(160deg, rgba(30, 41, 66, 0.5), rgba(15, 23, 42, 0.35));
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 14px;
  backdrop-filter: blur(10px);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
}

/* 卡片容器（卡片本身样式在 ServiceCard.vue） */
.cards {
  cursor: default;
}
.group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  padding: 8px 4px;
  margin-bottom: 4px;
  cursor: pointer;
  user-select: none;
  border-radius: 8px;
  transition: background 0.15s;
}
.group-title:hover {
  background: rgba(148, 163, 184, 0.08);
}
.group-caret {
  font-size: 11px;
  color: var(--text-dim);
  width: 14px;
}
.group-count {
  font-size: 12px;
  color: var(--text-dim);
  font-weight: 400;
}
.group-sec .cards {
  margin-top: 2px;
}

/* 时钟区 */
.hero {
  position: relative;
  z-index: 1;
  text-align: center;
  padding: 40px 20px 30px;
}
.hero-center {
  text-align: center;
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
.traffic {
  font-weight: 500;
}
.traffic .t-up {
  color: #4ade80;
  cursor: pointer;
  padding: 1px 3px;
  border-radius: 4px;
  transition: opacity 0.15s, box-shadow 0.15s;
}
.traffic .t-down {
  color: #38bdf8;
  cursor: pointer;
  padding: 1px 3px;
  border-radius: 4px;
  transition: opacity 0.15s, box-shadow 0.15s;
}
/* 被筛选隐藏的曲线变暗 */
.traffic .t-up.off,
.traffic .t-down.off {
  opacity: 0.3;
}
/* 当前筛选的曲线高亮 */
.traffic .t-up.active,
.traffic .t-down.active {
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.25);
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
  margin: 0 auto 0;
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

/* 大屏：两侧卡片各 375px+24px 偏移，search-box 居中填充剩余空间 */
@media (min-width: 1400px) {
  .search-box {
    max-width: min(660px, calc(100vw - 860px));
  }
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

/* 内容区（宽度自适应屏幕，不再固定 1200px；卡片列数随视口 auto-fill） */
.content {
  position: relative;
  z-index: 1;
  width: 100%;
  margin: 0 auto;
  padding: 10px 24px 60px;
}

/* 书签面板（圆角毛玻璃浮层） */
.fav-panel {
  position: fixed;
  left: 12px;
  top: 60px;
  width: 250px;
  height: auto; /* 内容自适应高度 */
  max-height: calc(100vh - 92px); /* 内容多时不超过视口 */
  z-index: 40;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.025);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  opacity: 0;
  transform: translateY(-12px) scale(0.94);
  transform-origin: top left;
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fav-panel.open {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}
.fav-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--card-border);
}
.fav-panel-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-main);
}
.fav-import {
  border: 1px solid var(--card-border);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-dim);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.fav-import:hover {
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.5);
}
.fav-list {
  flex: 1;
  padding: 6px 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  min-height: 0;
  max-height: calc(100vh - 160px); /* 内容超限时列表内部滚动 */
}
.fav-empty {
  font-size: 13px;
  color: var(--text-dim);
  text-align: center;
  padding: 26px 8px;
  line-height: 2;
  border: 1px dashed rgba(148, 163, 184, 0.35);
  border-radius: 12px;
  margin: 10px;
}

/* 书签右键快速编辑菜单 */
.fav-ctx {
  position: fixed;
  z-index: 3000;
  min-width: 138px;
  padding: 6px;
  background: rgba(15, 20, 35, 0.94);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 10px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.fav-ctx .ctx-item {
  text-align: left;
  padding: 8px 12px;
  font-size: 13px;
  color: #d7e1f0;
  background: none;
  border: none;
  border-radius: 7px;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}
.fav-ctx .ctx-item:hover {
  background: rgba(56, 132, 255, 0.2);
  color: #fff;
}
.fav-ctx .ctx-item.danger {
  color: #f56c6c;
}
.fav-ctx .ctx-item.danger:hover {
  background: rgba(245, 108, 108, 0.18);
  color: #ff8a8a;
}

/* 卡片网格容器（卡片自身样式在 ServiceCard.vue） */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 18px;
  margin-top: 14px;
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
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
  .hero-spacer {
    display: none;
  }
  .content {
    padding: 0 14px 40px;
  }
  .fav-panel {
    top: 50px;
    left: 10px;
    width: 78vw;
    max-width: 260px;
  }
  .cards {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }
}
</style>
