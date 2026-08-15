<template>
  <!-- 管理界面（免密，直接进入） -->
  <div class="admin-panel">
    <div class="admin-header">
      <h1>⚙️ 管理后台</h1>
      <div class="header-btns">
        <el-button @click="$router.push('/')">查看导航页</el-button>
      </div>
    </div>

    <el-tabs v-model="tab">
      <!-- ===== 分组管理（一级，排在服务管理前，UI 仿服务管理） ===== -->
      <el-tab-pane label="分组管理" name="groups">
        <div class="toolbar">
          <el-input v-model="newGroupName" placeholder="新分组名称，如：开发" @keyup.enter="saveGroup" style="max-width: 300px" />
          <el-button type="primary" @click="saveGroup">➕ 新建分组</el-button>
        </div>

        <!-- 桌面端：表格 -->
        <div v-if="!isMobile" class="g-table-wrap table-wrap">
          <el-table :data="groups" :row-key="(r: any) => r.id">
            <el-table-column label="" width="44">
              <template #default><span class="drag-handle" title="拖动排序">⠿</span></template>
            </el-table-column>
            <el-table-column label="图标" width="72">
              <template #default="{ row }"><span class="t-icon">{{ row.icon }}</span></template>
            </el-table-column>
            <el-table-column label="名称" min-width="160">
              <template #default="{ row }"><span class="t-name" :data-gid="row.id">{{ row.name }}</span></template>
            </el-table-column>
            <el-table-column label="服务数" width="100">
              <template #default="{ row }"><span class="t-group">{{ svcCountOf(row.id) }} 个</span></template>
            </el-table-column>
            <el-table-column label="操作" width="170">
              <template #default="{ row }">
                <el-button size="small" @click="renameGroup(row)">重命名</el-button>
                <el-button size="small" type="danger" plain @click="deleteGroup(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- 移动端：卡片列表 -->
        <div v-else class="g-card-list card-list">
          <div v-for="g in groups" :key="g.id" class="m-card">
            <span class="drag-handle m-handle" title="拖动排序">⠿</span>
            <span class="m-icon">{{ g.icon }}</span>
            <div class="m-body">
              <div class="m-title" :data-gid="g.id">{{ g.name }}</div>
              <div class="m-sub">{{ svcCountOf(g.id) }} 个服务</div>
            </div>
            <div class="m-actions">
              <el-button size="small" circle @click="renameGroup(g)"><el-icon><Edit /></el-icon></el-button>
              <el-button size="small" circle type="danger" @click="deleteGroup(g)"><el-icon><Delete /></el-icon></el-button>
            </div>
          </div>
          <div v-if="!groups.length" class="m-empty">暂无分组，先新建一个</div>
        </div>
      </el-tab-pane>

      <!-- ===== 服务管理 ===== -->
      <el-tab-pane label="服务管理" name="services">
        <div class="toolbar">
          <el-button type="primary" @click="openSvcForm()">➕ 新增服务</el-button>
          <el-button type="success" plain @click="scanDlg = true">🔍 自动发现</el-button>
          <el-button plain @click="dockerCfgDlg = true">🐳 Docker 设置</el-button>
          <el-button plain @click="monCfgDlg = true">⏱️ 检测设置</el-button>
          <el-button plain @click="ikuaiCfgDlg = true">📶 爱快网速</el-button>
          <el-button plain :loading="dockerChecking" @click="refreshDocker">🔄 刷新 Docker 检测</el-button>
          <el-button plain @click="exportServices">📤 导出</el-button>
          <el-button plain @click="svcImportInput?.click()">📥 导入</el-button>
          <input ref="svcImportInput" type="file" accept=".json,application/json" style="display: none" @change="onImportSvcFile" />
        </div>

        <!-- 桌面端：表格（主题化） -->
        <div v-if="!isMobile" class="svc-table-wrap table-wrap">
          <el-table :data="services" :row-key="(r: any) => r.id">
            <el-table-column label="" width="44">
              <template #default>
                <span class="drag-handle" title="拖动排序">⠿</span>
              </template>
            </el-table-column>
            <el-table-column label="图标" width="72">
              <template #default="{ row }">
                <span
                  class="t-icon"
                  :style="{
                    background: `radial-gradient(circle at 30% 25%, ${hexToRgba(row.color, 0.45)}, ${hexToRgba(row.color, 0.1)})`,
                    borderColor: hexToRgba(row.color, 0.35),
                  }"
                  >{{ row.icon }}</span
                >
              </template>
            </el-table-column>
            <el-table-column label="名称" min-width="130">
              <template #default="{ row }"><span class="t-name">{{ row.name }}</span></template>
            </el-table-column>
            <el-table-column label="分组" width="110">
              <template #default="{ row }"><span class="t-group">{{ row.groupName || "未分组" }}</span></template>
            </el-table-column>
            <el-table-column label="地址" min-width="190" show-overflow-tooltip>
              <template #default="{ row }"><span class="t-url">{{ row.url }}</span></template>
            </el-table-column>
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <span class="t-status" :class="row.status?.online ? 'on' : row.status ? 'off' : 'unk'">
                  <span class="t-dot"></span>{{ row.status ? (row.status.online ? "在线" : "离线") : "检测中" }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="镜像更新" width="118">
              <template #default="{ row }">
                <span v-if="row.docker_container" class="docker-badge" :class="dockerClass(row)">{{ dockerText(row) }}</span>
                <span v-else class="t-dash">—</span>
              </template>
            </el-table-column>
            <el-table-column label="点击" width="86">
              <template #default="{ row }"><span class="t-clicks">🔥 {{ row.clicks }}</span></template>
            </el-table-column>
            <el-table-column label="操作" width="160">
              <template #default="{ row }">
                <el-button size="small" @click="openSvcForm(row)">编辑</el-button>
                <el-button size="small" type="danger" plain @click="removeService(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- 移动端：卡片列表 -->
        <div v-else class="svc-card-list card-list">
          <div v-for="s in services" :key="s.id" class="m-card">
            <span class="drag-handle m-handle" title="拖动排序">⠿</span>
            <span
              class="m-icon"
              :style="{
                background: `radial-gradient(circle at 30% 25%, ${hexToRgba(s.color, 0.45)}, ${hexToRgba(s.color, 0.1)})`,
                borderColor: hexToRgba(s.color, 0.35),
                color: s.color || '#38bdf8',
              }"
              >{{ s.icon }}</span
            >
            <div class="m-body">
              <div class="m-title">
                {{ s.name }}
                <span class="m-status" :class="s.status?.online ? 'on' : s.status ? 'off' : 'unk'">
                  <span class="m-dot"></span>{{ s.status ? (s.status.online ? "在线" : "离线") : "检测中" }}
                </span>
              </div>
              <div class="m-sub">{{ s.url }}</div>
              <div class="m-tags">🔥 {{ s.clicks }} 次点击</div>
            </div>
            <div class="m-actions">
              <el-button size="small" circle @click="openSvcForm(s)"><el-icon><Edit /></el-icon></el-button>
              <el-button size="small" circle type="danger" @click="removeService(s)"><el-icon><Delete /></el-icon></el-button>
            </div>
          </div>
          <div v-if="services.length === 0" class="m-empty">暂无服务，点上方按钮新增</div>
        </div>
      </el-tab-pane>

      <!-- ===== 书签管理 ===== -->
      <el-tab-pane label="书签管理" name="bookmarks">
        <BookmarkManager @auth-error="handleErr" />
      </el-tab-pane>
    </el-tabs>

    <!-- 弹窗子组件：服务表单 / 自动发现 / Docker 设置 / 检测设置 -->
    <ServiceFormDlg v-model="svcDlg" :row="editingSvc" :groups="groups" @saved="loadAll" />
    <ScanDlg v-model="scanDlg" :services="services" @added="loadAll" />
    <DockerCfgDlg v-model="dockerCfgDlg" @saved="loadAll" />
    <MonCfgDlg v-model="monCfgDlg" @saved="loadAll" />
    <IkuaiCfgDlg v-model="ikuaiCfgDlg" @saved="loadAll" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, nextTick } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Edit, Delete } from "@element-plus/icons-vue";
import Sortable from "sortablejs";
import ServiceFormDlg from "../components/ServiceFormDlg.vue";
import ScanDlg from "../components/ScanDlg.vue";
import DockerCfgDlg from "../components/DockerCfgDlg.vue";
import MonCfgDlg from "../components/MonCfgDlg.vue";
import IkuaiCfgDlg from "../components/IkuaiCfgDlg.vue";
import BookmarkManager from "../components/BookmarkManager.vue";
import api from "../api";
import { hexToRgba, dockerClass, dockerText } from "../utils";

const token = ref(localStorage.getItem("nav_token") || "");
const loading = ref(false);
const tab = ref("services");
const isMobile = ref(false);

const services = ref<any[]>([]);

const svcDlg = ref(false);
const editingSvc = ref<any>(null);
const scanDlg = ref(false);
const dockerCfgDlg = ref(false);
const monCfgDlg = ref(false);
const ikuaiCfgDlg = ref(false);
const groups = ref<any[]>([]);

function openSvcForm(row?: any) {
  editingSvc.value = row || null;
  svcDlg.value = true;
}

// ---- 分组管理（一级 tab，UI 仿服务管理：表格/移动卡片，拖拽排序） ----
const newGroupName = ref("");
let groupSortable: Sortable | null = null;
let groupSortableMobile: Sortable | null = null;

async function loadGroups() {
  try {
    groups.value = await api.get("/admin/groups");
  } catch (e) {
    handleErr(e);
    return;
  }
  await nextTick();
  initGroupSortable();
}
function initGroupSortable() {
  if (groupSortable) groupSortable.destroy();
  if (groupSortableMobile) groupSortableMobile.destroy();
  groupSortable = null;
  groupSortableMobile = null;
  const tbody = document.querySelector(".g-table-wrap .el-table__body-wrapper tbody");
  if (tbody) {
    groupSortable = Sortable.create(tbody as HTMLElement, {
      animation: 180,
      handle: ".drag-handle",
      ghostClass: "sortable-ghost",
      onEnd: saveGroupOrder,
    });
  }
  const list = document.querySelector(".g-card-list");
  if (list) {
    groupSortableMobile = Sortable.create(list as HTMLElement, {
      animation: 180,
      handle: ".drag-handle",
      ghostClass: "sortable-ghost",
      onEnd: saveGroupOrder,
    });
  }
}
// 分组排序：乐观更新 + 串行化 + 失败回滚
let groupReorderChain: Promise<any> = Promise.resolve();
async function saveGroupOrder() {
  // 用 DOM 行上的 data-gid 取 id（原来按名称匹配，重名分组会错乱）
  const ids = Array.from(
    document.querySelectorAll(".g-table-wrap .el-table__body-wrapper tbody .t-name, .g-card-list .m-title")
  )
    .map((el) => Number((el as HTMLElement).dataset.gid))
    .filter((n) => Number.isInteger(n));
  if (ids.length < 2) return;
  groups.value.sort((a: any, b: any) => ids.indexOf(a.id) - ids.indexOf(b.id)); // 先乐观排序
  groupReorderChain = groupReorderChain
    .then(() => api.put("/admin/groups/reorder", { ids }))
    .then(() => ElMessage.success("分组顺序已保存"))
    .catch((e: any) => {
      groupReorderChain = Promise.resolve(); // 丢弃排队项，防旧 ids 覆盖回滚结果
      ElMessage.error("分组排序保存失败，已恢复原顺序");
      loadGroups(); // 回拉服务端顺序
      handleErr(e);
    });
}
function svcCountOf(gid: number) {
  return services.value.filter((s: any) => s.group_id === gid).length;
}
// tab 切换或窗口跨断点时重建分组 Sortable（跨断点后容器变化需重新绑定）
watch([tab, isMobile], () => {
  if (tab.value === "groups") loadGroups();
});
async function saveGroup() {
  const name = newGroupName.value.trim();
  if (!name) return ElMessage.warning("分组名称不能为空");
  try {
    await api.post("/admin/groups", { name, icon: "📁" });
    ElMessage.success(`已创建分组「${name}」`);
    newGroupName.value = "";
    await loadGroups();
  } catch (e) {
    handleErr(e);
  }
}
async function renameGroup(g: any) {
  try {
    const { value } = await ElMessageBox.prompt("新的分组名称", "重命名分组", {
      inputValue: g.name,
      confirmButtonText: "保存",
      cancelButtonText: "取消",
    });
    if (!value.trim()) return;
    await api.put(`/admin/groups/${g.id}`, { name: value.trim(), icon: g.icon });
    ElMessage.success("已重命名");
    await loadGroups();
    loadAll(); // 服务表格里的分组列同步刷新
  } catch {
    /* 取消 */
  }
}
async function deleteGroup(g: any) {
  const cnt = svcCountOf(g.id);
  try {
    await ElMessageBox.confirm(
      `删除分组「${g.name}」？${cnt ? `（组内 ${cnt} 个服务将一并删除！）` : ""}`,
      "删除分组",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }
  try {
    await api.delete(`/admin/groups/${g.id}`);
    ElMessage.success("已删除");
    await loadGroups();
    loadAll();
  } catch (e) {
    handleErr(e);
  }
}

// ---- Docker 设置 ----
const dockerChecking = ref(false);
let dockerRefreshTimer: number | undefined; // 定时刷新句柄（卸载/重复触发时清理）
async function refreshDocker() {
  dockerChecking.value = true;
  try {
    await api.post("/admin/docker/check");
    ElMessage.success("已触发检测，稍后刷新页面查看结果");
    if (dockerRefreshTimer) clearTimeout(dockerRefreshTimer);
    dockerRefreshTimer = window.setTimeout(() => loadAll(), 8000);
  } catch (e) {
    handleErr(e);
  } finally {
    dockerChecking.value = false;
  }
}

function updateViewport() {
  isMobile.value = window.innerWidth < 768;
}
onMounted(async () => {
  updateViewport();
  window.addEventListener("resize", updateViewport);
  if (!token.value) await autoLogin();
  loadAll();
});
watch(
  () => [services.value, isMobile.value],
  () => initSortable(),
  { deep: true }
);
initSortable();
onBeforeUnmount(() => {
  window.removeEventListener("resize", updateViewport);
  if (dockerRefreshTimer) clearTimeout(dockerRefreshTimer);
  destroySortable();
});

// 免密登录：直接获取会话 token
// 互斥锁：并发 401 时只发一次登录请求，其余调用复用同一 Promise（避免 token 竞态写入）
let loginPromise: Promise<any> | null = null;
function autoLogin() {
  if (loginPromise) return loginPromise;
  loading.value = true;
  loginPromise = api
    .post("/admin/login", {})
    .then((data: any) => {
      token.value = data.token;
      localStorage.setItem("nav_token", data.token);
      return data;
    })
    .catch((e: any) => {
      ElMessage.error(e.response?.data?.error || "登录失败");
      throw e;
    })
    .finally(() => {
      loading.value = false;
      loginPromise = null;
    });
  return loginPromise;
}

// ---- 拖拽排序 ----
let sortableTable: Sortable | null = null;
let sortableMobile: Sortable | null = null;

function destroySortable() {
  sortableTable?.destroy();
  sortableMobile?.destroy();
  sortableTable = null;
  sortableMobile = null;
}

// 服务排序：乐观更新 + 串行化（防连续拖拽并发 PUT 后写覆盖先写）+ 失败回滚
let reorderChain: Promise<any> = Promise.resolve();
function reorder(evt: Sortable.SortableEvent) {
  if (evt.oldIndex == null || evt.newIndex == null) return;
  if (evt.oldIndex === evt.newIndex) return; // 无位移不提交
  const arr = [...services.value];
  const [moved] = arr.splice(evt.oldIndex, 1);
  arr.splice(evt.newIndex, 0, moved);
  services.value = arr;
  const ids = arr.map((s: any) => s.id);
  reorderChain = reorderChain
    .then(() => api.put("/admin/services/reorder", { ids }))
    .then(() => ElMessage.success("排序已保存"))
    .catch((e: any) => {
      reorderChain = Promise.resolve(); // 丢弃排队中的后续请求，防止旧 ids 覆盖回滚结果
      ElMessage.error("排序保存失败，已恢复原顺序");
      loadAll(); // 回拉服务端顺序
      handleErr(e);
    });
}

function initSortable() {
  nextTick(() => {
    destroySortable();
    const tbody = document.querySelector(".svc-table-wrap .el-table__body-wrapper tbody");
    if (tbody) {
      sortableTable = new Sortable(tbody as HTMLElement, {
        animation: 180,
        handle: ".drag-handle",
        ghostClass: "sortable-ghost",
        onEnd: reorder,
      });
    }
    const list = document.querySelector(".svc-card-list");
    if (list) {
      sortableMobile = new Sortable(list as HTMLElement, {
        animation: 180,
        handle: ".drag-handle",
        ghostClass: "sortable-ghost",
        onEnd: reorder,
      });
    }
  });
}

// 统一错误处理：401 自动重新登录（免密模式）
// 3s 节流防重登风暴（异常后端"登录成功但业务仍 401"时避免无限循环刷请求）
let lastReLoginAt = 0;
function handleErr(e: any) {
  if (e?.response?.status === 401) {
    const now = Date.now();
    if (now - lastReLoginAt < 3000) return;
    lastReLoginAt = now;
    localStorage.removeItem("nav_token");
    token.value = "";
    autoLogin()
      .then(loadAll)
      .catch(() => {}); // 登录失败：rejection 已由 autoLogin 提示，此处消费防 unhandled
  }
}

async function loadAll() {
  try {
    services.value = await api.get("/services");
  } catch (e) {
    handleErr(e);
  }
  try {
    groups.value = await api.get("/admin/groups");
  } catch (e) {
    handleErr(e);
  }
}

// ---- 服务导入导出（书签管理已抽到 BookmarkManager.vue） ----
const svcImportInput = ref<HTMLInputElement>();

async function exportServices() {
  try {
    const blob: any = await api.get("/admin/services/export", { responseType: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "net-nav-services.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); // 延迟回收，防旧版 Safari 取消下载
    ElMessage.success("已导出服务 JSON");
  } catch (e) {
    handleErr(e);
  }
}

async function onImportSvcFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const text = await file.text();
  // JSON 解析失败单独提示（原来被 handleErr 静默吞掉，点了没反应）
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return ElMessage.error("文件不是有效的 JSON，请使用本系统导出的 net-nav-services.json");
  }
  if (!data || data.type !== "net-nav-services" || !Array.isArray(data.groups)) {
    return ElMessage.error("文件格式不正确（请使用本系统导出的服务 JSON）");
  }
  try {
    const r: any = await api.post("/admin/services/import", data);
    ElMessage.success(`导入完成：新增分组 ${r.addedGroups} 个、服务 ${r.addedServices} 个，跳过重复 ${r.skippedServices} 个`);
    await loadAll();
  } catch (e) {
    handleErr(e);
  }
}

// ---- Docker 镜像更新标签（dockerClass/dockerText 共用 utils，与首页一致） ----

// ---- 服务 ----
// 服务表单弹窗（子组件 ServiceFormDlg 保存成功后 loadAll 刷新）
async function removeService(row: any) {
  try {
    await ElMessageBox.confirm(`确定删除服务「${row.name}」？`, "提示", { type: "warning" });
    await api.delete(`/admin/services/${row.id}`);
    ElMessage.success("已删除");
    loadAll();
  } catch (e) {
    handleErr(e);
  }
}
</script>

<style scoped>
.admin-panel {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px;
  min-height: 100vh;
}
.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 10px;
}
.toolbar {
  margin-bottom: 14px;
}

/* 分组管理（UI 与服务管理一致，表格/移动卡片） */
.g-table-wrap {
  margin-top: 4px;
}
.t-group {
  font-size: 12px;
  color: #7dd3fc;
  background: rgba(56, 132, 255, 0.14);
  padding: 2px 8px;
  border-radius: 999px;
}

/* ===== 桌面表格（主题化） ===== */
.drag-handle {
  display: inline-flex;
  cursor: grab;
  color: var(--text-dim);
  font-size: 15px;
  letter-spacing: -2px;
  user-select: none;
  padding: 4px 2px;
  transition: color 0.2s;
}
.drag-handle:hover {
  color: var(--text);
}
.drag-handle:active {
  cursor: grabbing;
}
.m-handle {
  font-size: 13px;
}
.sortable-ghost {
  opacity: 0.35;
}
.sortable-ghost * {
  visibility: hidden;
}
.sortable-drag {
  opacity: 0.9;
}
.table-wrap {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 16px;
  padding: 8px 10px;
  backdrop-filter: blur(16px);
  overflow: hidden;
}
:deep(.table-wrap .el-table) {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: rgba(255, 255, 255, 0.05);
  --el-table-header-text-color: var(--text-dim);
  --el-table-text-color: var(--text);
  --el-table-border-color: var(--card-border);
  --el-table-row-hover-bg-color: rgba(255, 255, 255, 0.06);
  font-size: 13.5px;
}
:deep(.table-wrap .el-table th.el-table__cell) {
  font-weight: 600;
}
:deep(.table-wrap .el-table__inner-wrapper::before) {
  display: none;
}
.t-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  border: 1px solid rgba(56, 189, 248, 0.35);
  font-size: 19px;
}
.t-name {
  font-weight: 600;
}
.t-url {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  color: var(--text-dim);
}
.t-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
}
.t-status.on {
  color: #22c55e;
}
.t-status.off {
  color: #ef4444;
}
.t-status.unk {
  color: var(--text-dim);
}
.t-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}
.t-status.on .t-dot {
  box-shadow: 0 0 8px currentColor;
  animation: tPulse 2s infinite;
}
@keyframes tPulse {
  0% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(34, 197, 94, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
  }
}
.t-clicks {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--card-border);
  border-radius: 20px;
  padding: 2px 10px;
  font-size: 12px;
}
.docker-badge {
  border-radius: 20px;
  padding: 2px 8px;
  font-size: 11px;
  border: 1px solid;
  white-space: nowrap;
  display: inline-block;
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
}
.docker-badge.d-checking,
.docker-badge.d-unknown {
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.08);
  border-color: rgba(148, 163, 184, 0.25);
}
.t-dash {
  color: var(--text-dim);
}
.card-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.m-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: linear-gradient(150deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.03));
  border: 1px solid var(--card-border);
  border-radius: 16px;
  padding: 14px;
  backdrop-filter: blur(16px);
  transition: transform 0.15s, box-shadow 0.15s;
}
.m-card:active {
  transform: scale(0.99);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
.m-icon {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 23px;
  border: 1px solid rgba(56, 189, 248, 0.35);
  flex-shrink: 0;
}
.m-body {
  flex: 1;
  min-width: 0;
}
.m-title {
  font-weight: 600;
  font-size: 15px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.m-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 20px;
  padding: 1px 8px;
  border: 1px solid var(--card-border);
  background: rgba(255, 255, 255, 0.05);
}
.m-status.on {
  color: #22c55e;
}
.m-status.off {
  color: #ef4444;
}
.m-status.unk {
  color: var(--text-dim);
}
.m-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.m-status.on .m-dot {
  box-shadow: 0 0 6px currentColor;
}
.m-sub {
  font-size: 12px;
  color: var(--text-dim);
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.m-tags {
  font-size: 11px;
  color: var(--text-dim);
  margin-top: 5px;
}
.m-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.m-empty {
  text-align: center;
  color: var(--text-dim);
  padding: 30px;
  background: var(--card-bg);
  border: 1px dashed var(--card-border);
  border-radius: 16px;
  font-size: 13px;
}

/* ===== 移动端整体 ===== */
@media (max-width: 768px) {
  .admin-panel {
    padding: 12px;
  }
  .admin-header h1 {
    font-size: 20px;
  }
  .header-btns {
    width: 100%;
    display: flex;
    gap: 8px;
  }
  .header-btns .el-button {
    flex: 1;
    margin-left: 0;
  }
  :deep(.el-dialog) {
    margin-top: 6vh;
  }
  :deep(.el-dialog__body) {
    padding: 12px 16px;
  }
}
</style>
