<template>
  <el-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" title="🐳 Docker 服务器设置" :width="'min(420px, 94vw)'">
    <el-form label-width="70px" @submit.prevent>
      <el-form-item label="主机"><el-input v-model="cfg.host" placeholder="如 192.168.50.242" /></el-form-item>
      <el-form-item label="端口"><el-input-number v-model="cfg.port" :min="1" :max="65535" /></el-form-item>
      <el-form-item label="用户名"><el-input v-model="cfg.user" placeholder="SSH 用户名" /></el-form-item>
      <el-form-item label="密码">
        <el-input
          v-model="cfg.pass"
          type="password"
          show-password
          :placeholder="cfg.hasPass ? '已设置密码，留空保持不变' : 'SSH 密码'"
        />
      </el-form-item>
    </el-form>
    <div class="scan-tip">保存后自动检测所有已配置容器的服务镜像是否有更新</div>
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

const cfg = ref({ host: "", port: 22, user: "", pass: "", hasPass: false });

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return;
    api
      .get("/admin/docker-config")
      .then((r: any) => {
        // 密码不回传明文：已设置密码时显示空 + 提示占位，留空保存 = 保持不变
        cfg.value = { ...r, pass: r.hasPass ? "" : r.pass || "", hasPass: !!r.hasPass };
      })
      .catch(() => ElMessage.error("加载配置失败"));
  }
);

async function save() {
  try {
    await api.put("/admin/docker-config", cfg.value);
    ElMessage.success("已保存，开始检测容器更新");
    emit("update:modelValue", false);
    emit("saved");
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || "保存失败");
  }
}
</script>

<style scoped>
.scan-tip {
  color: #909399;
  font-size: 13px;
  margin-bottom: 8px;
}
</style>
