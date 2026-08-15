// 书签数据层（首页书签面板）：加载 / 导入 / 删除 / 连通性检测 / 树构建
import { computed, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import api from "../api";
import type { BmNode } from "../components/BmTree.vue";

export interface Bookmark {
  id: number;
  name: string;
  url: string;
  path: string[];
  sort: number;
}

export function useBookmarks() {
  const bookmarks = ref<Bookmark[]>([]);
  const bmStatus = ref<Record<string, { online: boolean; ms: number }>>({});
  const importInput = ref<HTMLInputElement>();

  // 按需检测书签连通性：展开哪个文件夹就重新检测哪个（先重置状态再检测）
  async function checkBookmarks(urls?: string[]) {
    let todo: string[];
    if (urls && urls.length) {
      todo = urls;
    } else {
      // 打开面板：只检测根目录直属书签
      todo = bookmarks.value.filter((b) => b.path.length === 0).map((b) => b.url);
    }
    if (!todo.length) return;
    // 先重置这些书签的状态（显示为检测中），避免旧状态残留
    const next = { ...bmStatus.value };
    todo.forEach((u) => delete next[u]);
    bmStatus.value = next;
    try {
      // 流式检测：每完成一条立即返回，边收边更新状态点（不等待全部）
      const resp = await fetch("/api/bookmarks/check-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: todo }),
      });
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        const next: Record<string, { online: boolean; ms: number }> = {};
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const d = JSON.parse(line);
            next[d.url] = { online: d.online, ms: d.ms };
          } catch {
            /* 忽略不完整行 */
          }
        }
        if (Object.keys(next).length) bmStatus.value = { ...bmStatus.value, ...next };
      }
    } catch {
      /* 检测失败保持 unknown */
    }
  }

  // 平铺书签 -> 文件夹树
  const bmTree = computed<BmNode[]>(() => {
    const root: BmNode[] = [];
    const map = new Map<string, BmNode>();
    const key = (p: string[]) => p.join("\u0000");
    for (const b of [...bookmarks.value].sort((a, c) => a.path.length - c.path.length || a.sort - c.sort)) {
      let cur = root;
      const acc: string[] = [];
      for (const seg of b.path) {
        acc.push(seg);
        const k = key(acc);
        let node = map.get(k);
        if (!node) {
          node = { type: "folder", name: seg, path: [...acc], children: [], open: false };
          map.set(k, node);
          cur.push(node);
        }
        cur = node.children!;
      }
      cur.push({ type: "bookmark", name: b.name, url: b.url, id: b.id });
    }
    return reactive(root) as BmNode[]; // 深度响应式，文件夹折叠状态可更新
  });

  function openUrl(b: string | { url: string }) {
    const url = typeof b === "string" ? b : b.url;
    window.open(url, "_blank");
  }

  // 导入浏览器书签 HTML
  async function importBookmarks(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const html = await file.text();
    try {
      const r = await api.post("/bookmarks/import", { html });
      await loadBookmarks();
      ElMessage.success(`导入完成：新增 ${r.added} 个，跳过重复 ${r.skipped} 个`);
    } catch {
      ElMessage.error("导入失败，请确认文件是浏览器导出的书签 HTML");
    }
  }

  async function loadBookmarks() {
    try {
      // 过滤空文件夹占位行（url 为空，仅后台用于表示空文件夹）
      const rows: any[] = await api.get("/bookmarks", { silent: true });
      bookmarks.value = rows.filter((b: any) => b.url);
    } catch {
      /* 后端未启动/断网：保持已有书签或空列表，不弹错误 */
    }
  }

  return {
    bookmarks,
    bmStatus,
    importInput,
    checkBookmarks,
    bmTree,
    openUrl,
    importBookmarks,
    loadBookmarks,
  };
}
