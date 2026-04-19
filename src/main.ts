import { createApp } from "vue";
import * as THREE from 'three';
import App from "./App.vue";
import DMWindowApp from "./DMWindowApp.vue";
import AgentAmpWindowApp from "./AgentAmpWindowApp.vue";
import PinnedVideoWindowApp from "./PinnedVideoWindowApp.vue";
import MediaLibraryWindowApp from "./MediaLibraryWindowApp.vue";
import ThemeEditorWindowApp from "./ThemeEditorWindowApp.vue";
import "./styles/global.css";
import { runAutoUpdater } from "./composables/useAutoUpdater";
import { resolvePersistedThemeSync } from "./composables/useTheme";

declare global {
  interface Window {
    THREE?: typeof THREE;
  }
}

window.THREE = THREE;

const params = new URLSearchParams(window.location.search);
const isDMWindow = params.get('view') === 'dm';
const isAgentAmpWindow = params.get('view') === 'agentamp';
const isPinnedVideoWindow = params.get('view') === 'pinned-video';
const isMediaLibraryWindow = params.get('view') === 'media-library';
const isThemeEditorWindow = params.get('view') === 'theme-editor';

if (typeof document !== 'undefined') {
	const viewName = isDMWindow ? 'dm' : isAgentAmpWindow ? 'agentamp' : isPinnedVideoWindow ? 'pinned-video' : isMediaLibraryWindow ? 'media-library' : isThemeEditorWindow ? 'theme-editor' : 'main';
	document.documentElement.setAttribute('data-app-view', viewName);
	document.body.setAttribute('data-app-view', viewName);

	const persistedTheme = resolvePersistedThemeSync();
	if (persistedTheme) {
		document.documentElement.setAttribute('data-theme', persistedTheme);
	}
}

createApp(
	isDMWindow ? DMWindowApp
	: isAgentAmpWindow ? AgentAmpWindowApp
	: isPinnedVideoWindow ? PinnedVideoWindowApp
	: isMediaLibraryWindow ? MediaLibraryWindowApp
	: isThemeEditorWindow ? ThemeEditorWindowApp
	: App
).mount("#app");

if (!isPinnedVideoWindow) {
  void runAutoUpdater();
}
