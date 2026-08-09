<template>
  <!-- 管理界面（免密，直接进入） -->
  <div class="admin-panel">
    <div class="admin-header">
      <h1>⚙️ 管理后台</h1>
      <div class="header-btns">
        <el-button :loading="checking" @click="checkUpdate">🔄 检查更新</el-button>
        <el-button @click="$router.push('/')">查看导航页</el-button>
      </div>
    </div>

    <el-tabs v-model="tab">
      <!-- ===== 服务管理 ===== -->
      <el-tab-pane label="服务管理" name="services">
        <div class="toolbar">
          <el-button type="primary" @click="openService()">➕ 新增服务</el-button>
          <el-button type="success" plain @click="openScan()">🔍 自动发现</el-button>
          <el-button plain @click="openDockerCfg()">🐳 Docker 设置</el-button>
          <el-button plain :loading="dockerChecking" @click="refreshDocker">🔄 刷新 Docker 检测</el-button>
        </div>

        <!-- 桌面端：表格（主题化） -->
        <div v-if="!isMobile" class="table-wrap">
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
                <el-button size="small" @click="openService(row)">编辑</el-button>
                <el-button size="small" type="danger" plain @click="removeService(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- 移动端：卡片列表 -->
        <div v-else class="card-list">
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
              <el-button size="small" circle @click="openService(s)"><el-icon><Edit /></el-icon></el-button>
              <el-button size="small" circle type="danger" @click="removeService(s)"><el-icon><Delete /></el-icon></el-button>
            </div>
          </div>
          <div v-if="services.length === 0" class="m-empty">暂无服务，点上方按钮新增</div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 自动发现对话框 -->
    <el-dialog v-model="scanDlg" title="🔍 自动发现内网服务" :width="'min(640px, 96vw)'">
      <div class="scan-form">
        <el-input v-model="scanForm.network" placeholder="网段，如 192.168.1.0/24" style="flex: 1">
          <template #prepend>网段</template>
        </el-input>
        <el-select v-model="scanForm.mode" style="width: 110px">
          <el-option label="快速" value="fast" />
          <el-option label="完整" value="full" />
        </el-select>
        <el-button type="primary" :loading="scanning" @click="startScan">开始扫描</el-button>
      </div>
      <div v-if="scanning" class="scan-tip">正在扫描 {{ scanForm.network }}… 约需 10-40 秒</div>

      <div v-if="scanResults.length" class="scan-results">
        <div class="scan-summary">发现 {{ scanResults.length }} 个服务，耗时 {{ scanElapsed }}s</div>
        <el-table :data="scanResults" size="small" max-height="300" @selection-change="(rows) => (scanSelected = rows)">
          <el-table-column type="selection" width="40" />
          <el-table-column prop="ip" label="IP" width="130" />
          <el-table-column prop="port" label="端口" width="70" />
          <el-table-column prop="name" label="类型" width="110" />
          <el-table-column prop="title" label="页面标题（识别到的服务）" show-overflow-tooltip />
        </el-table>
        <div class="scan-actions">
          <el-button type="primary" :disabled="!scanSelected.length" @click="addSelected">
            ➕ 添加所选 {{ scanSelected.length }} 个服务
          </el-button>
          <el-button @click="scanResults = []">清空结果</el-button>
        </div>
      </div>
      <div v-if="scanError" class="scan-error">{{ scanError }}</div>
    </el-dialog>

    <!-- Docker SSH 设置对话框 -->
    <el-dialog v-model="dockerCfgDlg" title="🐳 Docker 服务器设置" :width="'min(420px, 94vw)'">
      <el-form label-width="70px" @submit.prevent>
        <el-form-item label="主机"><el-input v-model="dockerCfg.host" placeholder="如 192.168.50.242" /></el-form-item>
        <el-form-item label="端口"><el-input-number v-model="dockerCfg.port" :min="1" :max="65535" /></el-form-item>
        <el-form-item label="用户名"><el-input v-model="dockerCfg.user" placeholder="SSH 用户名" /></el-form-item>
        <el-form-item label="密码">
          <el-input v-model="dockerCfg.pass" type="password" show-password placeholder="SSH 密码（内网明文保存）" />
        </el-form-item>
      </el-form>
      <div class="scan-tip">保存后自动检测所有已配置容器的服务镜像是否有更新</div>
      <template #footer>
        <el-button @click="dockerCfgDlg = false">取消</el-button>
        <el-button type="primary" @click="saveDockerCfg">保存</el-button>
      </template>
    </el-dialog>

    <!-- 服务对话框 -->
    <el-dialog v-model="svcDlg" :title="svcForm.id ? '编辑服务' : '新增服务'" :width="'min(480px, 94vw)'">
      <el-form label-width="70px" @submit.prevent>
        <el-form-item label="名称"><el-input v-model="svcForm.name" placeholder="如：GitLab" /></el-form-item>
        <el-form-item label="地址"><el-input v-model="svcForm.url" placeholder="http://192.168.1.10" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="svcForm.description" placeholder="选填" /></el-form-item>
        <el-form-item label="图标"><el-input v-model="svcForm.icon" placeholder="🔗" maxlength="4" /></el-form-item>
        <el-form-item label="颜色">
          <div class="colors">
            <span
              v-for="c in colors"
              :key="c"
              class="color-dot"
              :style="{ background: c }"
              :class="{ active: svcForm.color === c }"
              @click="svcForm.color = c"
            ></span>
          </div>
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="svcForm.sort" :min="0" :max="999" /></el-form-item>
        <el-form-item label="容器名">
          <el-input v-model="svcForm.docker_container" placeholder="Docker 容器名，如 new-api（留空不检测）" />
        </el-form-item>
        <el-form-item label="镜像">
          <el-input v-model="svcForm.docker_image" placeholder="镜像名:tag，如 calciumion/new-api:latest" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="svcDlg = false">取消</el-button>
        <el-button type="primary" @click="saveService">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, nextTick } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Edit, Delete } from "@element-plus/icons-vue";
import Sortable from "sortablejs";
import api from "../api";

const colors = ["#38bdf8", "#a78bfa", "#f97316", "#22c55e", "#eab308", "#f43f5e", "#06b6d4", "#ec4899"];

const token = ref(localStorage.getItem("nav_token") || "");
const loading = ref(false);
const tab = ref("services");
const isMobile = ref(false);

const services = ref<any[]>([]);

const svcDlg = ref(false);
const svcForm = ref<any>({ name: "", url: "", description: "", icon: "🔗", color: "#38bdf8", sort: 0, docker_container: "", docker_image: "" });

// ---- Docker 设置 ----
const dockerCfgDlg = ref(false);
const dockerCfg = ref({ host: "", port: 22, user: "", pass: "" });
const dockerChecking = ref(false);

function openDockerCfg() {
  api.get("/admin/docker-config").then((r) => {
    dockerCfg.value = r;
    dockerCfgDlg.value = true;
  }).catch((e) => handleErr(e));
}
async function saveDockerCfg() {
  try {
    await api.put("/admin/docker-config", dockerCfg.value);
    ElMessage.success("已保存，开始检测容器更新");
    dockerCfgDlg.value = false;
  } catch (e) {
    handleErr(e);
  }
}
async function refreshDocker() {
  dockerChecking.value = true;
  try {
    await api.post("/admin/docker/check");
    ElMessage.success("已触发检测，稍后刷新页面查看结果");
    setTimeout(() => loadAll(), 8000);
  } catch (e) {
    handleErr(e);
  } finally {
    dockerChecking.value = false;
  }
}

// ---- 版本更新检测 ----
const checking = ref(false);
async function checkUpdate() {
  checking.value = true;
  try {
    const r = await api.get("/update");
    if (r.error) return ElMessage.warning(r.error);
    if (r.hasUpdate) {
      await ElMessageBox.alert(
        `检测到新版本！\n\n本地版本：${r.local.slice(0, 7)}\n最新版本：${r.remote.slice(0, 7)}\n\n更新方式：在服务器执行 git pull，或重新构建 Docker 镜像。`,
        "🆕 有更新可用",
        { confirmButtonText: "知道了" }
      );
    } else {
      ElMessage.success(`已是最新版本（${(r.local || "?").slice(0, 7)}）`);
    }
  } catch (e) {
    handleErr(e);
  } finally {
    checking.value = false;
  }
}

// ---- 自动发现 ----
const scanDlg = ref(false);
const scanForm = ref({ network: "", mode: "fast" });
const scanning = ref(false);
const scanResults = ref<any[]>([]);
const scanSelected = ref<any[]>([]);
const scanElapsed = ref(0);
const scanError = ref("");

function openScan() {
  scanError.value = "";
  // 根据当前访问地址自动推导网段
  if (!scanForm.value.network) {
    const h = location.hostname;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
      const p = h.split(".");
      scanForm.value.network = `${p[0]}.${p[1]}.${p[2]}.0/24`;
    } else {
      scanForm.value.network = "192.168.1.0/24";
    }
  }
  scanDlg.value = true;
}

async function startScan() {
  if (!scanForm.value.network) return ElMessage.warning("请输入网段");
  scanning.value = true;
  scanError.value = "";
  scanResults.value = [];
  scanSelected.value = [];
  try {
    const data = await api.post("/admin/scan", scanForm.value);
    scanResults.value = data.found;
    scanElapsed.value = Math.round(data.elapsed / 1000);
    if (!data.found.length) ElMessage.info("未发现在线服务");
  } catch (e: any) {
    scanError.value = e.response?.data?.error || "扫描失败";
  } finally {
    scanning.value = false;
  }
}

async function addSelected() {
  if (!scanSelected.value.length) return;
  let ok = 0;
  for (const s of scanSelected.value) {
    try {
      const scheme = [443, 8443].includes(s.port) ? "https" : "http";
      const name = s.title ? `${s.title}` : `${s.name} ${s.ip}`;
      await api.post("/admin/services", {
        name: name.slice(0, 20),
        url: `${scheme}://${s.ip}:${s.port}`,
        description: `${s.ip}:${s.port}`, // 保留原始地址信息
      });
      ok++;
    } catch {
      /* 单条失败继续 */
    }
  }
  ElMessage.success(`已添加 ${ok} 个服务`);
  scanDlg.value = false;
  scanResults.value = [];
  loadAll();
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
  destroySortable();
});

// 免密登录：直接获取会话 token
async function autoLogin() {
  loading.value = true;
  try {
    const data = await api.post("/admin/login", {});
    token.value = data.token;
    localStorage.setItem("nav_token", data.token);
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || "登录失败");
  } finally {
    loading.value = false;
  }
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

function reorder(evt: Sortable.SortableEvent) {
  if (evt.oldIndex == null || evt.newIndex == null) return;
  const arr = [...services.value];
  const [moved] = arr.splice(evt.oldIndex, 1);
  arr.splice(evt.newIndex, 0, moved);
  services.value = arr;
  // 拖拽的可能是空序号占位，用 DOM 顺序对应的 id 保存
  api.put("/admin/services/reorder", { ids: arr.map((s: any) => s.id) }).catch((e) => handleErr(e));
}

function initSortable() {
  nextTick(() => {
    destroySortable();
    const tbody = document.querySelector(".table-wrap .el-table__body-wrapper tbody");
    if (tbody) {
      sortableTable = new Sortable(tbody as HTMLElement, {
        animation: 180,
        handle: ".drag-handle",
        ghostClass: "sortable-ghost",
        onEnd: reorder,
      });
    }
    const list = document.querySelector(".card-list");
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

function hexToRgba(hex: string, a: number) {
  hex = hex || "#38bdf8";
  const m = hex.replace("#", "");
  const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// 统一错误处理：401 自动重新登录（免密模式）
function handleErr(e: any) {
  if (e?.response?.status === 401) {
    localStorage.removeItem("nav_token");
    token.value = "";
    autoLogin().then(loadAll);
  }}

async function loadAll() {
  try {
    services.value = await api.get("/services");
  } catch (e) {
    handleErr(e);
  }
}

// ---- Docker 镜像更新标签 ----
function dockerClass(s: any) {
  const st = s.docker?.status;
  if (st === "latest") return "d-latest";
  if (st === "update") return "d-update";
  if (st === "checking") return "d-checking";
  return "d-unknown";
}
function dockerText(s: any) {
  const st = s.docker?.status;
  if (!st || st === "checking") return "🐳 检测中";
  switch (st) {
    case "latest":
      return "🐳 已最新";
    case "update":
      return "🔄 可更新";
    case "notfound":
      return "🐳 容器未找到";
    default:
      return "🐳 检测失败";
  }
}

// ---- 服务 ----
function openService(row?: any) {
  svcForm.value = row
    ? { ...row }
    : { name: "", url: "", description: "", icon: "🔗", color: "#38bdf8", sort: 0, docker_container: "", docker_image: "" };
  svcDlg.value = true;
}
async function saveService() {
  if (!svcForm.value.name || !svcForm.value.url) return ElMessage.warning("名称和地址必填");
  try {
    if (svcForm.value.id) {
      await api.put(`/admin/services/${svcForm.value.id}`, svcForm.value);
      ElMessage.success("已更新");
    } else {
      await api.post("/admin/services", svcForm.value);
      ElMessage.success("已创建");
    }
    svcDlg.value = false;
    loadAll();
  } catch (e) {
    handleErr(e);
  }
}
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

/* ===== 自动发现 ===== */
.scan-form {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.scan-tip {
  color: #909399;
  font-size: 13px;
  margin-bottom: 8px;
}
.scan-summary {
  color: #67c23a;
  font-size: 13px;
  margin-bottom: 8px;
  font-weight: 600;
}
.scan-error {
  color: #f56c6c;
  font-size: 13px;
  margin-top: 8px;
}
.scan-results {
  margin-top: 4px;
}
.scan-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
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

/* ===== 移动端卡片列表 ===== */
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

.colors {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.color-dot {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.15s;
  border: 2px solid transparent;
}
.color-dot:hover {
  transform: scale(1.15);
}
.color-dot.active {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.6);
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
