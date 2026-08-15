<template>
  <el-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" title="⏱️ 检测设置" :width="'min(420px, 94vw)'">
    <el-form label-width="110px" @submit.prevent>
      <el-form-item label="Ping 间隔">
        <el-input-number v-model="cfg.pingInterval" :min="5" :max="3600" />
        <span class="cfg-unit">秒</span>
        <div class="cfg-tip">服务在线状态探测间隔（默认 60 秒，最小 5 秒）</div>
      </el-form-item>
      <el-form-item label="Docker 间隔">
        <el-input-number v-model="cfg.dockerInterval" :min="1" :max="168" />
        <span class="cfg-unit">小时</span>
        <div class="cfg-tip">容器镜像更新检测间隔（默认 6 小时）</div>
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

const cfg = ref({ pingInterval: 60, dockerInterval: 6 });

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return;
    api
      .get("/admin/monitor-config")
      .then((r: any) => {
        cfg.value = r;
      })
      .catch(() => ElMessage.error("加载配置失败"));
  }
);

async function save() {
  try {
    await api.put("/admin/monitor-config", cfg.value);
    ElMessage.success("已保存，检测间隔已生效");
    emit("update:modelValue", false);
    emit("saved");
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || "保存失败");
  }
}
</script>

<style scoped>
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
</style>
