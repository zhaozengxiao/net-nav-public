import { createApp } from "vue";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import App from "./App.vue";
import router from "./router";
import "./styles.css";
import Vue3FlipClock from "vue3-flip-clock";
import "vue3-flip-clock/dist/style.css";
import Particles from "@tsparticles/vue3";
import { loadSlim } from "@tsparticles/slim";

const app = createApp(App);
app.use(ElementPlus, { locale: zhCn });
app.use(Vue3FlipClock);
app.use(Particles, {
  init: async (engine: any) => {
    await loadSlim(engine);
  },
});
app.use(router);
app.mount("#app");
