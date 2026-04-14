import { createApp } from "vue";
import App from "./App.vue";
import DMWindowApp from "./DMWindowApp.vue";
import AgentAmpWindowApp from "./AgentAmpWindowApp.vue";
import PinnedVideoWindowApp from "./PinnedVideoWindowApp.vue";
import "./styles/global.css";
import { runAutoUpdater } from "./composables/useAutoUpdater";

const params = new URLSearchParams(window.location.search);
const isDMWindow = params.get('view') === 'dm';
const isAgentAmpWindow = params.get('view') === 'agentamp';
const isPinnedVideoWindow = params.get('view') === 'pinned-video';

if (typeof document !== 'undefined') {
	const viewName = isDMWindow ? 'dm' : isAgentAmpWindow ? 'agentamp' : isPinnedVideoWindow ? 'pinned-video' : 'main';
	document.documentElement.setAttribute('data-app-view', viewName);
	document.body.setAttribute('data-app-view', viewName);
}

createApp(isDMWindow ? DMWindowApp : isAgentAmpWindow ? AgentAmpWindowApp : isPinnedVideoWindow ? PinnedVideoWindowApp : App).mount("#app");

void runAutoUpdater();
