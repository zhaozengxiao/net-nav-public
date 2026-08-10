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
      <!-- ===== 服务管理 ===== -->
      <el-tab-pane label="服务管理" name="services">
        <div class="toolbar">
          <el-button type="primary" @click="openService()">➕ 新增服务</el-button>
          <el-button type="success" plain @click="openScan()">🔍 自动发现</el-button>
          <el-button plain @click="openGroupMgr()">🗂️ 分组管理</el-button>
          <el-button plain @click="openDockerCfg()">🐳 Docker 设置</el-button>
          <el-button plain @click="openMonCfg()">⏱️ 检测设置</el-button>
          <el-button plain :loading="dockerChecking" @click="refreshDocker">🔄 刷新 Docker 检测</el-button>
          <el-button plain @click="exportServices">📤 导出</el-button>
          <el-button plain @click="svcImportInput?.click()">📥 导入</el-button>
          <input ref="svcImportInput" type="file" accept=".json,application/json" style="display: none" @change="onImportSvcFile" />
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

      <!-- ===== 书签管理 ===== -->
      <el-tab-pane label="书签管理" name="bookmarks">
        <div class="toolbar">
          <el-button type="primary" @click="bmFileInput?.click()">📥 导入书签 HTML</el-button>
          <el-button @click="exportBmHtml">📤 导出 HTML</el-button>
          <el-button @click="openNewFolder">➕ 新建文件夹</el-button>
          <el-button type="danger" plain :disabled="!bookmarks.length" @click="clearBookmarks">🗑️ 清空全部</el-button>
          <span class="bm-count">共 {{ bmCount }} 条</span>
        </div>
        <input ref="bmFileInput" type="file" accept=".html,text/html" style="display: none" @change="onImportBmFile" />
        <div ref="bmTreeEl" class="bm-tree-wrap">
          <div v-if="bookmarks.length === 0" class="m-empty">暂无书签，可导入浏览器导出的书签 HTML</div>
          <div
            v-for="row in treeRows"
            :key="row.type + (row.id || row.path.join('/'))"
            class="bm-tree-row"
            :class="{ 'is-folder': row.type === 'folder' }"
            :style="{ paddingLeft: 8 + row.depth * 22 + 'px' }"
            :data-id="row.id || ''"
            :data-path="JSON.stringify(row.path)"
            :data-parent="parentKey(row)"
          >
            <template v-if="row.type === 'folder'">
              <span class="bm-drag" title="拖动排序">⠿</span>
              <span class="bm-caret" @click="toggleFolder(row)">{{ row.open ? "▾" : "▸" }}</span>
              <span class="bm-folder-ico">📁</span>
              <span class="bm-tree-name">{{ row.name }}</span>
              <span class="bm-tree-count">{{ row.count }} 条</span>
              <span class="bm-tree-ops">
                <el-button size="small" @click="renameFolder(row)">重命名</el-button>
                <el-button size="small" type="danger" plain @click="deleteFolder(row)">删除</el-button>
              </span>
            </template>
            <template v-else>
              <span class="bm-drag" title="拖动排序">⠿</span>
              <span class="bm-caret bm-caret-empty"></span>
              <span class="bm-dot"></span>
              <span class="bm-tree-name">{{ row.name }}</span>
              <a :href="row.url" target="_blank" class="bm-url" rel="noopener">{{ row.url }}</a>
              <span class="bm-tree-ops">
                <el-button size="small" @click="openBmEdit({ id: row.id, name: row.name, url: row.url })">编辑</el-button>
                <el-button size="small" type="danger" plain @click="removeBookmark({ id: row.id, name: row.name })">删除</el-button>
              </span>
            </template>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 编辑书签对话框 -->
    <el-dialog v-model="bmEditDlg" title="✏️ 编辑书签" :width="'min(420px, 94vw)'">
      <el-form label-width="60px">
        <el-form-item label="名称">
          <el-input v-model="bmEditForm.name" placeholder="书签名称" />
        </el-form-item>
        <el-form-item label="网址">
          <el-input v-model="bmEditForm.url" placeholder="https://..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="bmEditDlg = false">取消</el-button>
        <el-button type="primary" @click="saveBmEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 新建文件夹对话框 -->
    <el-dialog v-model="newFolderDlg" title="📁 新建文件夹" :width="'min(420px, 94vw)'">
      <el-form label-width="70px">
        <el-form-item label="名称">
          <el-input v-model="newFolderForm.name" placeholder="文件夹名称" />
        </el-form-item>
        <el-form-item label="父文件夹">
          <el-select v-model="newFolderForm.parent" placeholder="选择父文件夹" style="width: 100%">
            <el-option label="根目录" :value="''" />
            <el-option v-for="f in folderOptions" :key="f.join('/')" :label="f.join(' / ')" :value="JSON.stringify(f)" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="newFolderDlg = false">取消</el-button>
        <el-button type="primary" @click="saveNewFolder">创建</el-button>
      </template>
    </el-dialog>

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

    <!-- 检测设置对话框 -->
    <el-dialog v-model="monCfgDlg" title="⏱️ 检测设置" :width="'min(420px, 94vw)'">
      <el-form label-width="110px" @submit.prevent>
        <el-form-item label="Ping 间隔">
          <el-input-number v-model="monCfg.pingInterval" :min="5" :max="3600" />
          <span class="cfg-unit">秒</span>
          <div class="cfg-tip">服务在线状态探测间隔（默认 60 秒，最小 5 秒）</div>
        </el-form-item>
        <el-form-item label="Docker 间隔">
          <el-input-number v-model="monCfg.dockerInterval" :min="1" :max="168" />
          <span class="cfg-unit">小时</span>
          <div class="cfg-tip">容器镜像更新检测间隔（默认 6 小时）</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="monCfgDlg = false">取消</el-button>
        <el-button type="primary" @click="saveMonCfg">保存</el-button>
      </template>
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
        <el-form-item label="分组">
          <el-select v-model="svcForm.group_id" placeholder="选择分组" style="width: 100%">
            <el-option v-for="g in groups" :key="g.id" :label="g.icon + ' ' + g.name" :value="g.id" />
          </el-select>
        </el-form-item>
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

    <!-- 分组管理 -->
    <el-dialog v-model="groupDlg" title="🗂️ 分组管理" :width="'min(420px, 94vw)'">
      <div class="group-new">
        <el-input v-model="newGroupName" placeholder="新分组名称，如：开发" @keyup.enter="saveGroup" style="flex: 1" />
        <el-button type="primary" @click="saveGroup">➕ 新建分组</el-button>
      </div>
      <div class="group-list">
        <div v-for="g in groups" :key="g.id" class="group-row">
          <span class="group-ico">{{ g.icon }}</span>
          <span class="group-name">{{ g.name }}</span>
          <span class="group-cnt">{{ svcCountOf(g.id) }} 个服务</span>
          <el-button size="small" @click="renameGroup(g)">重命名</el-button>
          <el-button size="small" type="danger" plain @click="deleteGroup(g)">删除</el-button>
        </div>
        <div v-if="!groups.length" class="m-empty">暂无分组，先新建一个</div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, nextTick } from "vue";
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
const svcForm = ref<any>({ name: "", url: "", description: "", icon: "🔗", color: "#38bdf8", sort: 0, docker_container: "", docker_image: "", group_id: 0 });
const groups = ref<any[]>([]);

// ---- 分组管理 ----
const groupDlg = ref(false);
const newGroupName = ref("");

async function loadGroups() {
  groups.value = await api.get("/admin/groups");
}
function svcCountOf(gid: number) {
  return services.value.filter((s: any) => s.group_id === gid).length;
}
function openGroupMgr() {
  newGroupName.value = "";
  loadGroups();
  groupDlg.value = true;
}
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
    loadServices();
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
    loadServices();
  } catch (e) {
    handleErr(e);
  }
}

// ---- Docker 设置 ----
const dockerCfgDlg = ref(false);
const dockerCfg = ref({ host: "", port: 22, user: "", pass: "" });
const dockerChecking = ref(false);

// ---- 检测设置 ----
const monCfgDlg = ref(false);
const monCfg = ref({ pingInterval: 60, dockerInterval: 6 });

function openMonCfg() {
  api.get("/admin/monitor-config").then((r) => {
    monCfg.value = r;
    monCfgDlg.value = true;
  }).catch((e) => handleErr(e));
}
async function saveMonCfg() {
  try {
    await api.put("/admin/monitor-config", monCfg.value);
    ElMessage.success("已保存，检测间隔已生效");
    monCfgDlg.value = false;
  } catch (e) {
    handleErr(e);
  }
}

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
  try {
    groups.value = await api.get("/admin/groups");
  } catch (e) {
    handleErr(e);
  }
  loadBookmarks();
}

// ---- 书签管理 ----
const bmFileInput = ref<HTMLInputElement>();
const svcImportInput = ref<HTMLInputElement>();

async function exportServices() {
  try {
    const blob: any = await api.get("/admin/services/export", { responseType: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "net-nav-services.json";
    a.click();
    URL.revokeObjectURL(url);
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
  try {
    const data = JSON.parse(text);
    const r: any = await api.post("/admin/services/import", data);
    ElMessage.success(`导入完成：新增分组 ${r.addedGroups} 个、服务 ${r.addedServices} 个，跳过重复 ${r.skippedServices} 个`);
    await loadServices();
  } catch (e) {
    handleErr(e);
  }
}

async function exportBmHtml() {
  try {
    const blob: any = await api.get("/bookmarks/export", { responseType: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bookmarks.html";
    a.click();
    URL.revokeObjectURL(url);
    ElMessage.success("已导出书签 HTML");
  } catch (e) {
    handleErr(e);
  }
}
const bookmarks = ref<any[]>([]);

async function loadBookmarks() {
  try {
    bookmarks.value = await api.get("/bookmarks");
  } catch (e) {
    handleErr(e);
  }
}

function onImportBmFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const r = await api.post("/bookmarks/import", { html: String(reader.result) });
      ElMessage.success(`导入完成：新增 ${r.added} 条，跳过重复 ${r.skipped} 条`);
      loadBookmarks();
    } catch (err) {
      handleErr(err);
    }
  };
  reader.readAsText(file);
}

async function removeBookmark(row: any) {
  try {
    await ElMessageBox.confirm(`删除书签「${row.name}」？`, "确认删除", { type: "warning" });
  } catch {
    return;
  }
  try {
    await api.delete(`/bookmarks/${row.id}`);
    ElMessage.success("已删除");
    loadBookmarks();
  } catch (e) {
    handleErr(e);
  }
}

async function clearBookmarks() {
  try {
    await ElMessageBox.confirm(
      `确定清空全部 ${bookmarks.value.length} 条书签？此操作不可恢复！`,
      "危险操作",
      { type: "error", confirmButtonText: "清空", confirmButtonClass: "el-button--danger" }
    );
  } catch {
    return;
  }
  for (const b of [...bookmarks.value]) {
    await api.delete(`/bookmarks/${b.id}`).catch(() => {});
  }
  ElMessage.success("已清空");
  loadBookmarks();
}

// ---- 编辑书签 ----
const bmEditDlg = ref(false);
const bmEditForm = ref({ id: 0, name: "", url: "" });

function openBmEdit(row: any) {
  bmEditForm.value = { id: row.id, name: row.name, url: row.url };
  bmEditDlg.value = true;
}

async function saveBmEdit() {
  const name = bmEditForm.value.name.trim();
  const url = bmEditForm.value.url.trim();
  if (!name) return ElMessage.warning("名称不能为空");
  if (!/^https?:\/\//.test(url)) return ElMessage.warning("网址需以 http(s):// 开头");
  try {
    await api.put(`/bookmarks/${bmEditForm.value.id}`, { name, url });
    ElMessage.success("已保存");
    bmEditDlg.value = false;
    loadBookmarks();
  } catch (e) {
    handleErr(e);
  }
}

// ---- 树形列表（文件夹展开/折叠，书签缩进在文件夹下） ----
const folderOpen = reactive(new Map<string, boolean>());

interface BmRow {
  type: "folder" | "bookmark";
  path: string[];
  name: string;
  url?: string;
  id?: number;
  depth: number;
  open: boolean;
  count: number;
}

function allFolderPaths() {
  const set = new Set<string>();
  const arr: string[][] = [];
  bookmarks.value.forEach((b) => {
    const p = b.path || [];
    for (let i = 1; i <= p.length; i++) {
      const key = JSON.stringify(p.slice(0, i));
      if (!set.has(key)) {
        set.add(key);
        arr.push(p.slice(0, i));
      }
    }
  });
  // 与首页一致：同深度按 sort 排序（folder 的 sort = 占位行 sort 或第一个包含它的书签 sort）
  return arr.sort((a, b) => folderSortOf(a) - folderSortOf(b) || a.join("/").localeCompare(b.join("/")));
}

// 文件夹的 sort：占位行（url=''）优先，否则取 path 完全匹配的第一个书签
function folderSortOf(p: string[]) {
  const key = JSON.stringify(p);
  const ph = bookmarks.value.find((b: any) => JSON.stringify(b.path || []) === key && !b.url);
  if (ph) return ph.sort;
  const first = bookmarks.value.find((b: any) => JSON.stringify(b.path || []) === key);
  return first?.sort ?? 0;
}

const realBookmarks = computed(() => bookmarks.value.filter((b: any) => b.url));
const bmCount = computed(() => realBookmarks.value.length);

const treeRows = computed<BmRow[]>(() => {
  const rows: BmRow[] = [];
  const folders = allFolderPaths();
  const keyOf = (p: string[]) => JSON.stringify(p);
  const countTree = (p: string[]) =>
    realBookmarks.value.filter((b: any) => {
      const bp = b.path || [];
      return bp.length >= p.length && p.every((seg, i) => bp[i] === seg);
    }).length;

  // 直属书签 + 子文件夹按 sort 混合排序（与首页 bmTree 同深度排序一致）
  const kidsOf = (p: string[]) =>
    [
      ...realBookmarks.value
        .filter((b: any) => keyOf(b.path || []) === keyOf(p))
        .map((b: any) => ({ kind: "b" as const, b, sort: b.sort })),
      ...folders
        .filter((cp) => cp.length === p.length + 1 && p.every((seg, i) => cp[i] === seg))
        .map((cp) => ({ kind: "f" as const, cp, sort: folderSortOf(cp) })),
    ].sort((x, y) => x.sort - y.sort);

  const pushFolder = (p: string[], depth: number) => {
    const open = folderOpen.get(keyOf(p)) ?? false;
    rows.push({ type: "folder", path: p, name: p[p.length - 1], depth, open, count: countTree(p) });
    if (!open) return;
    for (const k of kidsOf(p)) {
      if (k.kind === "b") rows.push({ type: "bookmark", path: p, name: k.b.name, url: k.b.url, id: k.b.id, depth: depth + 1, open: false, count: 0 });
      else pushFolder(k.cp, depth + 1);
    }
  };

  // 根目录直属书签 + 顶层文件夹按 sort 混合排序（与首页一致）
  const rootKids = [
    ...realBookmarks.value
      .filter((b: any) => (b.path || []).length === 0)
      .map((b: any) => ({ kind: "b" as const, b, sort: b.sort })),
    ...folders.filter((p) => p.length === 1).map((p) => ({ kind: "f" as const, p, sort: folderSortOf(p) })),
  ].sort((x, y) => x.sort - y.sort);
  for (const k of rootKids) {
    if (k.kind === "b") rows.push({ type: "bookmark", path: [], name: k.b.name, url: k.b.url, id: k.b.id, depth: 0, open: false, count: 0 });
    else pushFolder(k.p, 0);
  }
  return rows;
});

function toggleFolder(row: BmRow) {
  folderOpen.set(JSON.stringify(row.path), !row.open);
}

function parentKey(row: BmRow) {
  return JSON.stringify(row.type === "folder" ? row.path.slice(0, -1) : row.path);
}

// ---- 新建文件夹 ----
const newFolderDlg = ref(false);
const newFolderForm = ref({ name: "", parent: "" });
const folderOptions = computed(() => allFolderPaths());

function openNewFolder() {
  newFolderForm.value = { name: "", parent: "" };
  newFolderDlg.value = true;
}

async function saveNewFolder() {
  const name = newFolderForm.value.name.trim();
  if (!name) return ElMessage.warning("文件夹名称不能为空");
  const parent = newFolderForm.value.parent ? JSON.parse(newFolderForm.value.parent) : [];
  try {
    await api.post("/bookmarks/new-folder", { parent, name });
    ElMessage.success(`已创建文件夹「${name}」`);
    newFolderDlg.value = false;
    await loadBookmarks();
  } catch (e) {
    handleErr(e);
  }
}

// ---- 拖动排序 ----
const bmTreeEl = ref<HTMLElement | null>(null);
let bmSortable: Sortable | null = null;
const movedPaths = new Map<number, string[]>(); // 待持久化的书签路径迁移
let hoverFolderPath: string[] | null = null; // 拖动书签时悬停的目标文件夹（中部=拖入）
let hoverFolderKey: string | null = null; // 当前高亮的文件夹 path（JSON 字符串），用于全量匹配真实行
let dragActive = false; // 当前是否正在拖动（document mousemove 仅拖动中生效）

// 拖动中实时计算鼠标所在文件夹行 → 高亮"拖入"目标（原生 mousemove，比 Sortable onMove 更实时可靠）
function updateHoverTarget(e: MouseEvent) {
  const el = bmTreeEl.value;
  if (!el) return;
  const draggedEl = el.querySelector(".bm-tree-row.dragging") as HTMLElement | null;
  let target: HTMLElement | null = null;
  if (draggedEl && !draggedEl.classList.contains("is-folder")) {
    const rows = [...el.querySelectorAll(".bm-tree-row.is-folder")] as HTMLElement[];
    for (const row of rows) {
      const r = row.getBoundingClientRect();
      if (e.clientY >= r.top && e.clientY <= r.bottom && e.clientX >= r.left && e.clientX <= r.right) {
        const frac = r.height ? (e.clientY - r.top) / r.height : 0.5;
        if (frac > 0.12 && frac < 0.88) { target = row; break; }
      }
    }
  }
  const targetKey = target ? JSON.stringify(JSON.parse(target.dataset.path || "[]")) : null;
  if (targetKey !== hoverFolderKey) {
    document.querySelectorAll(".bm-tree-row.is-folder").forEach((r) => {
      r.classList.toggle("hover-into", r.dataset.path === targetKey);
    });
    hoverFolderKey = targetKey;
  }
  if (target) {
    el.classList.add("dragging-into");
    hoverFolderPath = JSON.parse(target.dataset.path || "[]");
  } else {
    el.classList.remove("dragging-into");
    hoverFolderPath = null;
  }
}

function initBmSortable() {
  const el = bmTreeEl.value;
  if (!el) return;
  document.addEventListener("mousemove", updateHoverTarget);
  bmSortable?.destroy();
  bmSortable = new Sortable(el, {
    animation: 180,
    handle: ".bm-drag",
    ghostClass: "sortable-ghost",
    onMove: (evt) => {
      const dragged = evt.dragged as HTMLElement;
      const related = evt.related as HTMLElement | null;
      // 高亮/拖入目标由 document mousemove（updateHoverTarget）实时计算
      if (related) updateHoverTarget(evt.originalEvent as MouseEvent);
      if (dragged.classList.contains("is-folder")) {
        const draggedPath: string[] = JSON.parse(dragged.dataset.path || "[]");
        const relatedPath: string[] = related.classList.contains("is-folder")
          ? JSON.parse(related.dataset.path || "[]")
          : JSON.parse(related.dataset.parent || "[]");
        if (relatedPath.length > draggedPath.length && draggedPath.every((s, i) => relatedPath[i] === s)) {
          return false; // 目标在自身子树内
        }
      }
      return true;
    },
    onStart: (evt) => {
      evt.item.classList.add("dragging");
      dragActive = true;
    },
    onEnd: (evt) => {
      dragActive = false;
      evt.item.classList.remove("dragging");
      const el = bmTreeEl.value;
      if (!el) return;
      const domRows = [...el.querySelectorAll(".bm-tree-row")] as HTMLElement[];
      const item = evt.item as HTMLElement;
      // 新父级 = 插入位置前面最近一行的父级（folder 行为其父级，bookmark 行为所在文件夹）
      const idx = domRows.indexOf(item);
      let newParent: string[] = [];
      for (let i = idx - 1; i >= 0; i--) {
        newParent = JSON.parse(domRows[i].dataset.parent || "[]");
        break;
      }
      const isFolder = item.classList.contains("is-folder");
      if (isFolder) {
        // 文件夹：自身及子树全部书签的路径整体迁移
        const oldPath: string[] = JSON.parse(item.dataset.path || "[]");
        const newPath = [...newParent, oldPath[oldPath.length - 1]];
        if (JSON.stringify(oldPath) !== JSON.stringify(newPath)) {
          let moved = 0;
          for (const b of bookmarks.value) {
            const bp: string[] = b.path || [];
            if (bp.length >= oldPath.length && oldPath.every((s, i) => bp[i] === s)) {
              b.path = [...newPath, ...bp.slice(oldPath.length)];
              movedPaths.set(b.id, b.path);
              moved++;
            }
          }
          item.dataset.path = JSON.stringify(newPath);
          item.dataset.parent = JSON.stringify(newParent);
          ElMessage.success(`文件夹已移动到「${newParent.length ? newParent.join(" / ") : "根目录"}」，影响 ${moved} 条书签`);
        }
      } else {
        const b = bookmarks.value.find((x: any) => x.id === Number(item.dataset.id));
        // 拖入文件夹（悬停中部）：path 迁移 + 移到目标文件夹子树开头
        // 先验证 item 与目标文件夹行 DOM 相邻（防止拖动"经过"文件夹中部时误触发）
        if (b && hoverFolderPath && JSON.stringify(b.path || []) !== JSON.stringify(hoverFolderPath)) {
          const hIdx = domRows.findIndex((r) => r.classList.contains("is-folder") && r.dataset.path === JSON.stringify(hoverFolderPath));
          const near = hIdx >= 0 && Math.abs(idx - hIdx) <= 1;
          if (!near) hoverFolderPath = null; // 不相邻 → 误触发，退回兄弟排序逻辑
        }
        if (b && hoverFolderPath && JSON.stringify(b.path || []) !== JSON.stringify(hoverFolderPath)) {
          b.path = [...hoverFolderPath];
          movedPaths.set(b.id, b.path);
          const oldIdx = bookmarks.value.findIndex((x: any) => x.id === b.id);
          bookmarks.value.splice(oldIdx, 1);
          const fidx = bookmarks.value.findIndex((x: any) => {
            const pp: string[] = x.path || [];
            return pp.length >= hoverFolderPath.length && hoverFolderPath!.every((sg, i) => pp[i] === sg);
          });
          if (fidx >= 0) bookmarks.value.splice(fidx + 1, 0, b);
          else bookmarks.value.push(b);
          folderOpen.set(JSON.stringify(hoverFolderPath), true); // 展开目标文件夹看到结果
          ElMessage.success(`已移入「${hoverFolderPath.join(" / ")}」`);
        } else if (b && JSON.stringify(b.path || []) !== JSON.stringify(newParent)) {
          // 书签：按插入位置迁移父级（兄弟逻辑）
          item.dataset.parent = JSON.stringify(newParent);
          item.dataset.path = JSON.stringify(newParent);
          b.path = newParent;
          movedPaths.set(b.id, newParent);
          ElMessage.success(`已移动到「${newParent.length ? newParent.join(" / ") : "根目录"}」`);
        }
      }
      if (hoverFolderKey) {
        document.querySelectorAll(".bm-tree-row.is-folder").forEach((r) => r.classList.remove("hover-into"));
        hoverFolderKey = null;
      }
      el.classList.remove("dragging-into");
      hoverFolderPath = null;
      applyDomOrder();
    },
  });
}

// 按 DOM 可见顺序重排同父级项，其余子树保持原数组顺序
async function applyDomOrder() {
  await nextTick(); // 等待 DOM 反映 bookmarks 数组变更（拖入文件夹等）
  const el = bmTreeEl.value;
  if (!el) return;
  const domRows = [...el.querySelectorAll(".bm-tree-row")] as HTMLElement[];
  const byParent = new Map<string, { type: string; path: string[]; id: number }[]>();
  for (const r of domRows) {
    const type = r.classList.contains("is-folder") ? "folder" : "bookmark";
    const path = JSON.parse(r.dataset.path || "[]");
    const parent = r.dataset.parent || "[]";
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent)!.push({ type, path, id: Number(r.dataset.id) || 0 });
  }
  const newArr: any[] = [];
  const pushed = new Set<number>();
  const processParent = (pk: string) => {
    const items = byParent.get(pk);
    if (items && items.length) {
      for (const item of items) {
        if (item.type === "bookmark") {
          const b = bookmarks.value.find((x: any) => x.id === item.id);
          if (b && !pushed.has(b.id)) {
            newArr.push(b);
            pushed.add(b.id);
          }
        } else {
          processParent(JSON.stringify(item.path));
        }
      }
    } else {
      // 该父级折叠不可见：按数组原顺序整体追加子树
      const p = pk === "[]" ? [] : JSON.parse(pk);
      for (const b of bookmarks.value) {
        if (pushed.has(b.id)) continue;
        const bp = b.path || [];
        if (bp.length >= p.length && p.every((seg, i) => bp[i] === seg)) {
          newArr.push(b);
          pushed.add(b.id);
        }
      }
    }
  };
  processParent("[]");
  for (const b of bookmarks.value) if (!pushed.has(b.id)) newArr.push(b);
  bookmarks.value = newArr;
  const paths: Record<number, string[]> = {};
  movedPaths.forEach((p, id) => (paths[id] = p));
  api.post("/bookmarks/reorder", { ids: newArr.map((b) => b.id), paths })
    .then(() => {
      movedPaths.clear();
    })
    .catch((e: any) => console.error("[bm-reorder] err:", e?.message || e));
}

watch(treeRows, () => initBmSortable());

async function renameFolder(f: any) {
  const oldName = f.path[f.path.length - 1];
  let value: string;
  try {
    const r = await ElMessageBox.prompt("输入新名称", `重命名文件夹「${oldName}」`, {
      inputValue: oldName,
      confirmButtonText: "保存",
      cancelButtonText: "取消",
      inputValidator: (v: string) => (v && v.trim() ? true : "名称不能为空"),
    });
    value = r.value.trim();
  } catch {
    return;
  }
  if (value === oldName) return;
  try {
    const r = await api.post("/bookmarks/rename-folder", { oldPath: f.path, newName: value });
    ElMessage.success(`已重命名，影响 ${r.changed} 条书签`);
    await loadBookmarks();
    listFolders();
  } catch (e) {
    handleErr(e);
  }
}

async function deleteFolder(f: any) {
  try {
    await ElMessageBox.confirm(
      `删除文件夹「${f.path.join(" / ")}」？其下 ${f.count} 条书签（含子文件夹）将一并删除，不可恢复！`,
      "删除文件夹",
      { type: "error", confirmButtonText: "删除" }
    );
  } catch {
    return;
  }
  try {
    const r = await api.post("/bookmarks/delete-folder", { path: f.path });
    ElMessage.success(`已删除 ${r.removed} 条书签`);
    await loadBookmarks();
    listFolders();
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
    : { name: "", url: "", description: "", icon: "🔗", color: "#38bdf8", sort: 0, docker_container: "", docker_image: "", group_id: groups.value[0]?.id || 0 };
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

/* 分组管理 */
.group-new {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.group-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid var(--el-border-color-lighter, rgba(148, 163, 184, 0.2));
  border-radius: 8px;
  margin-bottom: 8px;
}
.group-ico {
  font-size: 16px;
}
.group-row .group-name {
  flex: 1;
  font-weight: 600;
}
.group-cnt {
  font-size: 12px;
  color: var(--el-text-color-secondary, #94a3b8);
  margin-right: 6px;
}
.t-group {
  font-size: 12px;
  color: #7dd3fc;
  background: rgba(56, 132, 255, 0.14);
  padding: 2px 8px;
  border-radius: 999px;
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
.cfg-unit {
  margin-left: 8px;
  color: var(--text-dim);
  font-size: 13px;
}
.cfg-tip {
  width: 100%;
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.5;
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

/* ===== 书签管理 ===== */
.bm-count {
  margin-left: auto;
  color: var(--text-dim);
  font-size: 13px;
}
.bm-name {
  font-weight: 600;
}
.bm-url {
  color: var(--accent, #38bdf8);
  text-decoration: none;
  word-break: break-all;
}
.bm-url:hover {
  text-decoration: underline;
}
.bm-path {
  color: var(--text-dim);
  font-size: 12px;
}
.bm-root {
  color: var(--text-dim);
  font-size: 12px;
  opacity: 0.7;
}
.bm-tree-wrap {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 16px;
  padding: 8px 6px;
  overflow-x: auto;
}
.bm-tree-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 10px;
  border-radius: 10px;
  transition: background 0.15s;
  white-space: nowrap;
}
.bm-tree-row:hover {
  background: rgba(255, 255, 255, 0.06);
}
.bm-tree-row.is-folder {
  font-weight: 600;
}
.bm-tree-row.dragging {
  opacity: 0.4;
}
.bm-tree-row.hover-into {
  background: rgba(100, 160, 255, 0.16) !important;
  outline: 2px solid rgba(100, 160, 255, 0.65);
  outline-offset: -2px;
}
.bm-tree-wrap.dragging-into .sortable-ghost {
  opacity: 0 !important;
}
.bm-tree-row.hover-into .bm-folder-name::after {
  content: " ⤵ 拖入";
  color: rgba(100, 160, 255, 0.9);
  font-size: 11px;
  margin-left: 4px;
}
.sortable-ghost {
  opacity: 0.55 !important;
  background: rgba(100, 160, 255, 0.12) !important;
  outline: 2px dashed rgba(100, 160, 255, 0.7);
  outline-offset: -2px;
}
.sortable-ghost * {
  pointer-events: none;
}
.bm-drag {
  color: var(--text-dim);
  opacity: 0.45;
  cursor: grab;
  flex-shrink: 0;
  font-size: 12px;
  user-select: none;
}
.bm-tree-row:hover .bm-drag {
  opacity: 0.9;
}
.bm-drag:active {
  cursor: grabbing;
}
.bm-caret {
  width: 14px;
  text-align: center;
  font-size: 11px;
  cursor: pointer;
  color: var(--text-dim);
  flex-shrink: 0;
  user-select: none;
}
.bm-caret-empty {
  cursor: default;
}
.bm-folder-ico {
  font-size: 13px;
  flex-shrink: 0;
}
.bm-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-dim);
  opacity: 0.6;
  flex-shrink: 0;
  margin-left: 3px;
}
.bm-tree-name {
  font-size: 13.5px;
  flex-shrink: 0;
}
.bm-tree-count {
  color: var(--text-dim);
  font-size: 12px;
  flex-shrink: 0;
}
.bm-tree-ops {
  margin-left: auto;
  display: flex;
  gap: 6px;
  flex-shrink: 0;
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
