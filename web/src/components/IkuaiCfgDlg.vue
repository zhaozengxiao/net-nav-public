<template>
  <el-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" title="📶 爱快网速设置" :width="'min(420px, 94vw)'">
    <el-form label-width="70px" @submit.prevent>
      <el-form-item label="地址"><el-input v-model="cfg.host" placeholder="如 192.168.1.1" /></el-form-item>
      <el-form-item label="端口">
        <el-input-number v-model="cfg.port" :min="1" :max="65535" />
      </el-form-item>
      <el-form-item>
        <template #label><span>HTTPS</span></template>
        <el-switch v-model="cfg.https" />
        <span class="cfg-hint">端口 443 自动启用</span>
      </el-form-item>
      <el-form-item label="Token">
        <el-input
          v-model="cfg.token"
          type="password"
          show-password
          :placeholder="cfg.hasToken ? '已设置 token，留空保持不变' : 'v4.0 API Bearer Token'"
        />
      </el-form-item>
      <el-form-item label="间隔（秒）">
        <el-input-number v-model="cfg.interval" :min="1" :max="30" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="testing" @click="testConn">测试连接</el-button>
        <span v-if="testResult" :class="testResult.ok ? 'test-ok' : 'test-fail'">{{ testResult.msg }}</span>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { ElMessage } from "element-plus";
import api from "../api";

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: "update:modelValue", v: boolean): void; (e: "saved"): void }>();

const cfg = ref({ host: "", port: 443, token: "", interval: 3, https: true, hasToken: false });
const testing = ref(false);
const testResult = ref<{ ok: boolean; msg: string } | null>(null);

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return;
    testResult.value = null;
    api
      .get("/admin/ikuai-config")
      .then((r: any) => {
        cfg.value = {
          host: r.host || "",
          port: r.port || 443,
          token: r.hasToken ? "" : r.token || "",
          interval: r.interval ?? 3,
          https: r.https !== false,
          hasToken: !!r.hasToken,
        };
      })
      .catch(() => ElMessage.error("加载配置失败"));
  }
);

async function testConn() {
  testing.value = true;
  testResult.value = null;
  try {
    const r: any = await api.post("/admin/ikuai-test", {
      host: cfg.value.host,
      port: cfg.value.port,
      token: cfg.value.token || undefined,
      https: cfg.value.https !== false,
    });
    if (r.ok) {
      testResult.value = { ok: true, msg: `✅ 连接成功，↓ ${r.down} KB/s ↑ ${r.up} KB/s` };
    } else {
      testResult.value = { ok: false, msg: `❌ 连接失败：${r.error || "未知错误"}` };
    }
  } catch (e: any) {
    testResult.value = { ok: false, msg: `❌ ${e.message}` };
  } finally {
    testing.value = false;
  }
}

async function save() {
  try {
    await api.put("/admin/ikuai-config", cfg.value);
    ElMessage.success("已保存爱快配置");
    emit("update:modelValue", false);
    emit("saved");
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || "保存失败");
  }
}
</script>

<style scoped>
.test-ok {
  color: #67c23a;
  font-size: 13px;
  margin-left: 8px;
}
.test-fail {
  color: #f56c6c;
  font-size: 13px;
  margin-left: 8px;
}
.cfg-hint {
  color: var(--text-dim);
  font-size: 12px;
  margin-left: 6px;
}
</style>