import axios from "axios";
import { ElMessage } from "element-plus";

const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("nav_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 统一错误处理：401 提示重新登录，其他错误弹具体原因
api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const status = err.response?.status;
    const msg = err.response?.data?.error;
    if (status === 401) {
      localStorage.removeItem("nav_token");
      ElMessage.error(msg || "登录已过期，请重新登录");
    } else if (msg) {
      ElMessage.error(msg);
    } else {
      ElMessage.error(`请求失败 (${status || "网络错误"})，请检查后端是否运行`);
    }
    return Promise.reject(err);
  }
);

export default api;
