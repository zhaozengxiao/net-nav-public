<template>
  <el-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" title="🔍 自动发现内网服务" :width="'min(640px, 96vw)'">
    <div class="scan-form">
      <el-input v-model="form.network" placeholder="网段，如 192.168.1.0/24" style="flex: 1">
        <template #prepend>网段</template>
      </el-input>
      <el-select v-model="form.mode" style="width: 110px">
        <el-option label="快速" value="fast" />
        <el-option label="完整" value="full" />
      </el-select>
      <el-button type="primary" :loading="scanning" @click="startScan">开始扫描</el-button>
    </div>
    <div v-if="scanning" class="scan-tip">{{ progress || "正在准备扫描…" }}</div>

    <div v-if="results.length" class="scan-results">
      <div class="scan-summary">发现 {{ results.length }} 个服务，耗时 {{ elapsed }}s</div>
      <el-table :data="results" size="small" max-height="300" @selection-change="(rows: any[]) => (selected = rows)">
        <el-table-column type="selection" width="40" />
        <el-table-column prop="ip" label="IP" width="130" />
        <el-table-column prop="port" label="端口" width="70" />
        <el-table-column prop="name" label="类型" width="110" />
        <el-table-column prop="title" label="页面标题（识别到的服务）" show-overflow-tooltip />
      </el-table>
      <div class="scan-actions">
        <el-button type="primary" :disabled="!selected.length" @click="addSelected">
          ➕ 添加所选 {{ selected.length }} 个服务
        </el-button>
        <el-button @click="results = []">清空结果</el-button>
      </div>
    </div>
    <div v-if="error" class="scan-error">{{ error }}</div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { ElMessage } from "element-plus";
import api from "../api";

const props = defineProps<{ modelValue: boolean; services?: any[] }>();
const emit = defineEmits<{ (e: "update:modelValue", v: boolean): void; (e: "added"): void }>();

const form = ref({ network: "", mode: "fast" });
const scanning = ref(false);
const progress = ref("");
const results = ref<any[]>([]);
const selected = ref<any[]>([]);
const elapsed = ref(0);
const error = ref("");

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return;
    error.value = "";
    // 根据当前访问地址自动推导网段
    if (!form.value.network) {
      const h = location.hostname;
      if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
        const p = h.split(".");
        form.value.network = `${p[0]}.${p[1]}.${p[2]}.0/24`;
      } else {
        form.value.network = "192.168.1.0/24";
      }
    }
  }
);

async function startScan() {
  if (!form.value.network) return ElMessage.warning("请输入网段");
  scanning.value = true;
  error.value = "";
  progress.value = "";
  results.value = [];
  selected.value = [];
  try {
    // NDJSON 流式：边扫描边收进度，最后一行是 done（结果）或 error
    const resp = await fetch("/api/admin/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("nav_token") || ""}`,
      },
      body: JSON.stringify(form.value),
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
      for (const line of lines) {
        if (!line.trim()) continue;
        let d: any;
        try {
          d = JSON.parse(line);
        } catch {
          continue;
        }
        if (d.type === "progress") {
          progress.value = `正在扫描 ${d.done}/${d.total} 个地址（已发现 ${d.found} 个服务）…`;
        } else if (d.type === "done") {
          results.value = d.found;
          elapsed.value = Math.round(d.elapsed / 1000);
          if (!d.found.length) ElMessage.info("未发现在线服务");
        } else if (d.type === "error") {
          error.value = d.error;
        }
      }
    }
  } catch (e: any) {
    error.value = e?.message || "扫描失败，请确认已登录后台";
  } finally {
    scanning.value = false;
    progress.value = "";
  }
}

async function addSelected() {
  if (!selected.value.length) return;
  // 去重：跳过已存在的服务（按 http(s)://ip:port 归一化比较）
  const existing = new Set(
    (props.services || []).map((s: any) => s.url.replace(/\/+$/, ""))
  );
  const todo = selected.value.filter((s: any) => {
    const scheme = [443, 8443].includes(s.port) ? "https" : "http";
    const url = `${scheme}://${s.ip}:${s.port}`;
    return !existing.has(url);
  });
  if (!todo.length) return ElMessage.info("所选服务已全部存在");
  // 并行添加（限并发 5），失败计数
  let ok = 0;
  let fail = 0;
  const workers = Array.from({ length: Math.min(5, todo.length) }, async () => {
    while (todo.length) {
      const s = todo.pop()!;
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
        fail++;
      }
    }
  });
  await Promise.all(workers);
  ElMessage.success(`已添加 ${ok} 个服务${fail ? `，失败 ${fail} 个` : ""}`);
  emit("update:modelValue", false);
  results.value = [];
  emit("added");
}
</script>

<style scoped>
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
</style>
