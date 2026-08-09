import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 8888,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: "http://localhost:6666",
        changeOrigin: true,
        configure(proxy) {
          // SSE 需要实时推送，禁用缓冲
          proxy.on("proxyRes", (proxyRes, req, res) => {
            if (req.url.startsWith("/api/events")) {
              res.setHeader("Content-Type", "text/event-stream");
              res.setHeader("Cache-Control", "no-cache");
              res.setHeader("Connection", "keep-alive");
              res.flushHeaders();
            }
          });
        },
      },
    },
  },
});
