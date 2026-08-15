<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :title="form.id ? '编辑服务' : '新增服务'"
    :width="'min(480px, 94vw)'"
  >
    <el-form label-width="70px" @submit.prevent>
      <el-form-item label="名称"><el-input v-model="form.name" placeholder="如：GitLab" /></el-form-item>
      <el-form-item label="地址"><el-input v-model="form.url" placeholder="http://192.168.1.10" /></el-form-item>
      <el-form-item label="分组">
        <el-select v-model="form.group_id" placeholder="选择分组" style="width: 100%">
          <el-option v-for="g in groups" :key="g.id" :label="g.icon + ' ' + g.name" :value="g.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="描述"><el-input v-model="form.description" placeholder="选填" /></el-form-item>
      <el-form-item label="图标"><el-input v-model="form.icon" placeholder="🔗" maxlength="4" /></el-form-item>
      <el-form-item label="颜色">
        <div class="colors">
          <span
            v-for="c in colors"
            :key="c"
            class="color-dot"
            :style="{ background: c }"
            :class="{ active: form.color === c }"
            @click="form.color = c"
          ></span>
        </div>
      </el-form-item>
      <el-form-item label="排序"><el-input-number v-model="form.sort" :min="0" :max="999" /></el-form-item>
      <el-form-item label="容器名">
        <el-input v-model="form.docker_container" placeholder="Docker 容器名，如 new-api（留空不检测）" />
      </el-form-item>
      <el-form-item label="镜像">
        <el-input v-model="form.docker_image" placeholder="镜像名:tag，如 calciumion/new-api:latest" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue";
import { ElMessage } from "element-plus";
import api from "../api";

const props = defineProps<{ modelValue: boolean; row: any; groups: any[] }>();
const emit = defineEmits<{ (e: "update:modelValue", v: boolean): void; (e: "saved"): void }>();

const colors = ["#38bdf8", "#a78bfa", "#f97316", "#22c55e", "#eab308", "#f43f5e", "#06b6d4", "#ec4899"];

const empty = () => ({ name: "", url: "", description: "", icon: "🔗", color: "#38bdf8", sort: 0, docker_container: "", docker_image: "", group_id: 0 });
const form = reactive<any>(empty());

watch(
  () => [props.modelValue, props.row],
  () => {
    Object.assign(form, props.row ? { ...props.row } : empty());
    if (!props.row && !form.group_id && props.groups.length) form.group_id = props.groups[0].id;
  },
  { immediate: true }
);

async function save() {
  if (!form.name || !form.url) return ElMessage.warning("名称和地址必填");
  try {
    if (form.id) {
      await api.put(`/admin/services/${form.id}`, form);
      ElMessage.success("已更新");
    } else {
      await api.post("/admin/services", form);
      ElMessage.success("已创建");
    }
    emit("update:modelValue", false);
    emit("saved");
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || "保存失败");
  }
}
</script>

<style scoped>
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
</style>
