import { createApp } from "vue";
import App from "./App.vue";
import DMWindowApp from "./DMWindowApp.vue";
import "./styles/global.css";
import { runAutoUpdater } from "./composables/useAutoUpdater";

const params = new URLSearchParams(window.location.search);
const isDMWindow = params.get('view') === 'dm';

createApp(isDMWindow ? DMWindowApp : App).mount("#app");

void runAutoUpdater();
