<template>
  <div>
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
          <a v-if="isSafeUrl(row.url)" :href="row.url" target="_blank" class="bm-url" rel="noopener">{{ row.url }}</a>
          <span v-else class="bm-url">{{ row.url }}</span>
          <span class="bm-tree-ops">
            <el-button size="small" @click="openBmEdit({ id: row.id, name: row.name, url: row.url })">编辑</el-button>
            <el-button size="small" type="danger" plain @click="removeBookmark({ id: row.id, name: row.name })">删除</el-button>
          </span>
        </template>
      </div>
    </div>

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
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, nextTick } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import Sortable from "sortablejs";
import api from "../api";
import { isSafeUrl } from "../utils";

const emit = defineEmits<{ (e: "auth-error"): void }>();

// 401 时通知父级（Admin）重新登录并刷新；其他错误由 api.ts 拦截器统一 toast
function handleErr(e: any) {
  if (e?.response?.status === 401) emit("auth-error");
}

// ---- 书签数据 ----
const bookmarks = ref<any[]>([]);
const bmFileInput = ref<HTMLInputElement>();

async function loadBookmarks() {
  try {
    bookmarks.value = await api.get("/bookmarks");
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
    setTimeout(() => URL.revokeObjectURL(url), 1000); // 延迟回收，防旧版 Safari 取消下载
    ElMessage.success("已导出书签 HTML");
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
  try {
    // 批量接口：一次性删除
    const r: any = await api.delete("/bookmarks");
    ElMessage.success(`已清空 ${r.removed} 条书签`);
  } catch (e) {
    handleErr(e);
    return;
  }
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

// 文件夹的 sort：优先取真实书签的 sort（占位行只表示空文件夹，不应支配文件夹位置，防拖拽后沉底）
function folderSortOf(p: string[]) {
  const key = JSON.stringify(p);
  const first = bookmarks.value.find((b: any) => JSON.stringify(b.path || []) === key && b.url);
  if (first) return first.sort;
  const ph = bookmarks.value.find((b: any) => JSON.stringify(b.path || []) === key && !b.url);
  return ph?.sort ?? 0;
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
  if (!dragActive) return; // 非拖拽中直接忽略（常驻监听的廉价门控）
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
  // mousemove（悬停高亮计算）在 onMounted 只注册一次、onBeforeUnmount 移除，避免每次重建树时泄漏监听器
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
      if (evt.cancelled) {
        // 取消拖拽（如按 Esc）：只清理悬停高亮，不提交排序
        document.querySelectorAll(".bm-tree-row.is-folder").forEach((r) => r.classList.remove("hover-into"));
        hoverFolderKey = null;
        hoverFolderPath = null;
        el.classList.remove("dragging-into");
        return;
      }
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
// 串行化保存：连续拖拽时后一次排队等前一次完成，避免并发 POST 乱序覆盖
let bmReorderChain: Promise<any> = Promise.resolve();
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
  // 占位行（空文件夹）不发 reorder（避免 sort 被写乱），只排序真实书签
  const realIds = newArr.filter((b: any) => b.url).map((b: any) => b.id);
  bmReorderChain = bmReorderChain
    .then(() => api.post("/bookmarks/reorder", { ids: realIds, paths }))
    .then(() => {
      movedPaths.clear();
    })
    .catch((e: any) => {
      bmReorderChain = Promise.resolve(); // 丢弃排队中的后续请求，防旧 ids/paths 覆盖回滚结果
      movedPaths.clear();
      ElMessage.error("书签排序保存失败，已恢复服务端顺序");
      loadBookmarks();
    });
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
    await loadBookmarks(); // 树形列表为 computed，数据变化后自动重建
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
    await loadBookmarks(); // 树形列表为 computed，数据变化后自动重建
  } catch (e) {
    handleErr(e);
  }
}

onMounted(() => {
  document.addEventListener("mousemove", updateHoverTarget);
  loadBookmarks();
});
onBeforeUnmount(() => {
  document.removeEventListener("mousemove", updateHoverTarget);
  bmSortable?.destroy();
  bmSortable = null;
});
</script>

<style scoped>
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
.m-empty {
  text-align: center;
  color: var(--text-dim);
  padding: 30px;
  background: var(--card-bg);
  border: 1px dashed var(--card-border);
  border-radius: 16px;
  font-size: 13px;
}
</style>
