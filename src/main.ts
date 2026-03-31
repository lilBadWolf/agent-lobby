import { createApp } from "vue";
import App from "./App.vue";
import "./styles/global.css";
import { runAutoUpdater } from "./composables/useAutoUpdater";

createApp(App).mount("#app");

void runAutoUpdater();
