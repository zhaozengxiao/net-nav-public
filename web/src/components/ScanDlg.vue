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
    <div v-if="scanning" class="scan-tip">正在扫描 {{ form.network }}… 约需 10-40 秒</div>

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

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: "update:modelValue", v: boolean): void; (e: "added"): void }>();

const form = ref({ network: "", mode: "fast" });
const scanning = ref(false);
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
  results.value = [];
  selected.value = [];
  try {
    const data: any = await api.post("/admin/scan", form.value);
    results.value = data.found;
    elapsed.value = Math.round(data.elapsed / 1000);
    if (!data.found.length) ElMessage.info("未发现在线服务");
  } catch (e: any) {
    error.value = e.response?.data?.error || "扫描失败";
  } finally {
    scanning.value = false;
  }
}

async function addSelected() {
  if (!selected.value.length) return;
  let ok = 0;
  for (const s of selected.value) {
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
  emit("update:modelValue", false);
  results.value = [];
  emit("added");
}
</script>
