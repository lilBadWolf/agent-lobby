<template>
  <aside id="sidebar" :class="{ compact: props.isCompact }" @contextmenu.prevent>
    <div v-if="!props.isCompact" class="sidebar-header">
      <div class="agent-header-title">
        <span>[{{ onlineCount }}] AGENTS</span>
        <button
          class="away-toggle-btn"
          :class="{ active: props.isAway }"
          type="button"
          :aria-label="props.isAway ? 'Set status to active' : 'Set status to away'"
          @click="emit('toggleAway')"
        >
          <span v-if="!props.isAway" class="status-dot" aria-hidden="true"></span>
          <span v-else aria-hidden="true">💤</span>
        </button>
      </div>
    </div>
    <div v-else class="compact-header-divider">
      <button
        class="away-toggle-btn compact-away-toggle-btn"
        :class="{ active: props.isAway }"
        type="button"
        :aria-label="props.isAway ? 'Set status to active' : 'Set status to away'"
        @click="emit('toggleAway')"
      >
        <span v-if="!props.isAway" class="status-dot" aria-hidden="true"></span>
        <span v-else aria-hidden="true">💤</span>
      </button>
    </div>
    <div id="user-list" @click="hideContextMenu">
      <div
        v-for="user in userList"
        :key="user.username"
        class="user-node"
        :class="{ 'away-user': user.isAway, 'compact-user-node': props.isCompact, 'media-active': user.mediaSharing && user.activeMedia?.label }"
        :style="{ color: getUserColor(user.username) }"
      >
        <button
          v-if="!props.isCompact"
          type="button"
          class="user-bullet-btn"
          :class="{ 'user-bullet-clickable': user.mediaSharing && user.activeMedia?.label }"
          :aria-label="`Show presence menu for ${user.username}`"
          @mouseenter.stop="showUserContextMenu(user, $event)"
        >
          <span v-if="user.isBot" aria-hidden="true">🤖</span>
          <span v-else-if="user.isAway" aria-hidden="true">💤</span>
          <span v-else-if="user.isTyping" aria-hidden="true" class="typing-bullet">
            <span></span><span></span><span></span>
          </span>
          <span v-else-if="user.activeMedia?.mediaType === 'audio'" aria-hidden="true">⚡</span>
          <span v-else-if="user.activeMedia?.label" aria-hidden="true">🎞️</span>
          <span v-else aria-hidden="true" class="status-dot"></span>
        </button>
        <button
          type="button"
          class="user-handle-btn"
          :class="{ 'compact-user-handle-btn': props.isCompact, 'typing-user': user.isTyping }"
          :aria-label="`Mention ${user.username}`"
          @click="emit('mentionRequest', user.username)"
          @mouseenter.stop="showUserDetails(user, $event)"
          @mouseleave="scheduleHideUserDetails()"
          @contextmenu.prevent.stop="showUserContextMenu(user, $event)"
        >
          {{ props.isCompact ? getCompactUserLabel(user.username) : user.username }}
        </button>
      </div>
    </div>
    <div v-if="contextMenu.visible" class="user-context-tooltip" :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }" @click.stop @mouseleave="hideContextMenu">
      <div class="user-context-title">{{ contextMenuTitle }}</div>
      <div
        v-if="contextMenuWatcherLine && contextMenuTitle !== 'BOTH WATCHING'"
        class="user-context-title user-context-watcher-line"
      >
        {{ contextMenuWatcherLine }}
      </div>
      <div class="user-context-label">{{ contextMenuLabel }}</div>
      <button
        v-if="contextMenuActionVisible"
        type="button"
        class="user-context-action"
        @click="pinUserMedia"
      >
        PIN SAME VIDEO
      </button>
    </div>
    <div
      v-if="hoveredUser"
      class="user-details-popup"
      :style="{ left: `${hoverPopup.x}px`, top: `${hoverPopup.y}px` }"
      @mouseenter="clearHoverTimeout"
      @mouseleave="scheduleHideUserDetails"
    >
      <div class="user-details-card">
        <div class="user-details-avatar-wrap">
          <div
            v-if="getUserDetailsAvatarSpriteStyle(hoveredUser)"
            class="user-details-avatar-sprite"
            :style="getUserDetailsAvatarSpriteStyle(hoveredUser)"
            aria-hidden="true"
          />
          <img
            v-else-if="getUserDetailsAvatarUrl(hoveredUser)"
            :src="getUserDetailsAvatarUrl(hoveredUser)"
            alt=""
            class="user-details-avatar"
          />
          <div v-else class="user-details-avatar-placeholder">
            {{ hoveredUser.username.slice(0, 1) }}
          </div>
        </div>
        <div class="user-details-body">
          <div class="user-details-name">{{ hoveredUser.username }}</div>
          <div class="user-details-tagline">{{ hoveredUser.tagline?.trim() || 'No tagline set' }}</div>
          <button
            v-if="hoveredUser.dmAvailable && !hoveredUser.isAway"
            type="button"
            class="request-tunnel-btn"
            :class="getDMBubbleClass(hoveredUser.username)"
            :aria-label="getDMBubbleTitle(hoveredUser.username)"
            @click.stop="emit('dmRequest', hoveredUser.username)"
          >
            REQUEST TUNNEL
          </button>
        </div>
      </div>
    </div>
    <button id="disconnect-btn" :class="{ 'compact-disconnect-btn': props.isCompact }" @click="emit('disconnect')">{{ props.isCompact ? 'X' : 'TERMINATE' }}</button>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { UserPresence } from '../types/chat';
import { useTheme } from '../composables/useTheme';
import { parseAvatarUrl, resolveAvatarSrc, getAvatarObjectPosition } from '../composables/useAvatarPacks';

const props = withDefaults(defineProps<{
  users: Record<string, UserPresence>;
  currentUsername?: string;
  isAway?: boolean;
  dmBubbleStates?: Record<string, 'active' | 'pending' | 'denied'>;
  showDmLauncher?: boolean;
  isCompact?: boolean;
}>(), {
  users: () => ({}), // Default to an empty object
  isAway: false,
  dmBubbleStates: () => ({}),
  showDmLauncher: false,
  isCompact: false,
});

const emit = defineEmits<{
  disconnect: [];
  dmRequest: [user: string];
  mentionRequest: [user: string];
  pinUserMedia: [{ url: string; currentTime?: number }];
  showDmWindow: [];
  toggleAway: [];
}>();

const { getUserColor } = useTheme();
const onlineCount = computed(() =>
  Object.values(props.users || {}).filter(user => Boolean(user.username)).length
);
const contextMenu = ref<{
  visible: boolean;
  x: number;
  y: number;
  username: string | null;
}>({ visible: false, x: 0, y: 0, username: null });
const hoveredUser = ref<UserPresence | null>(null);
const hoverPopup = ref({ x: 0, y: 0 });
let hoverTimeout: number | null = null;

function clearHoverTimeout() {
  if (hoverTimeout !== null) {
    window.clearTimeout(hoverTimeout);
    hoverTimeout = null;
  }
}

function showUserDetails(user: UserPresence, event: MouseEvent) {
  clearHoverTimeout();

  const target = event.currentTarget as HTMLElement | null;
  const rect = target?.getBoundingClientRect();
  const width = 280;
  const x = rect
    ? props.isCompact
      ? Math.max(8, rect.left - width - 4)
      : Math.max(8, rect.left - width + 48)
    : event.clientX - width + 8;
  const y = rect ? (props.isCompact ? rect.top - 8 : rect.top - 24) : event.clientY - 18;

  hoverPopup.value = {
    x: Math.min(window.innerWidth - width, x),
    y: Math.min(window.innerHeight - 220, Math.max(8, y)),
  };
  hoveredUser.value = user;
}

function scheduleHideUserDetails() {
  clearHoverTimeout();
  hoverTimeout = window.setTimeout(() => {
    hoveredUser.value = null;
  }, 100);
}

function getSafeAvatarUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if ((!/^https?:\/\//i.test(trimmed) && !/^pack:\/\//i.test(trimmed)) || /\s/.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}

function getUserDetailsAvatarUrl(user: UserPresence): string | undefined {
  const url = getSafeAvatarUrl(user.avatarUrl);
  if (!url) {
    return undefined;
  }

  const parsed = parseAvatarUrl(url);
  if (parsed?.src?.startsWith('pack://')) {
    return undefined;
  }

  return resolveAvatarSrc(url);
}

function getUserDetailsAvatarSpriteStyle(user: UserPresence): Record<string, string> | undefined {
  const url = getSafeAvatarUrl(user.avatarUrl);
  if (!url) {
    return undefined;
  }

  const parsed = parseAvatarUrl(url);
  if (!parsed || parsed.avatarIndex === null) {
    return undefined;
  }

  const resolvedSrc = resolveAvatarSrc(url);
  if (!resolvedSrc) {
    return undefined;
  }

  return {
    backgroundImage: `url(${resolvedSrc})`,
    backgroundSize: '300% 300%',
    backgroundPosition: getAvatarObjectPosition(parsed.avatarIndex),
    width: '100%',
    height: '100%',
    backgroundRepeat: 'no-repeat',
  };
}

const contextMenuActiveMedia = computed(() => {
  const currentUsername = contextMenu.value.username;
  const presence = currentUsername ? props.users?.[currentUsername] : undefined;
  if (!presence?.mediaSharing || !presence?.activeMedia?.label) {
    return null;
  }
  return presence.activeMedia;
});
const contextMenuLabel = computed(() => contextMenuActiveMedia.value?.label ?? '');
const contextMenuUrl = computed(() => (typeof contextMenuActiveMedia.value?.url === 'string' ? contextMenuActiveMedia.value.url : null));
const contextMenuTargetUsername = computed(() => contextMenu.value.username);
const contextMenuWatcherCount = computed(() => {
  const url = contextMenuUrl.value;
  if (!url) {
    return 0;
  }
  return Object.values(props.users || {}).filter(
    (user) => user.activeMedia?.url === url
  ).length;
});
const contextMenuIsCurrentUserPinnedSameVideo = computed(() => {
  const currentPresence = props.currentUsername ? props.users?.[props.currentUsername] : undefined;
  return Boolean(contextMenuUrl.value && currentPresence?.activeMedia?.url === contextMenuUrl.value);
});
const contextMenuWatcherUsernames = computed(() => {
  const url = contextMenuUrl.value;
  if (!url) {
    return [] as string[];
  }
  return Object.values(props.users || {})
    .filter((user) => user.activeMedia?.url === url && user.username !== contextMenuTargetUsername.value)
    .map((user) => user.username)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
});
const contextMenuOtherWatcherNames = computed(() => {
  const currentUsername = props.currentUsername;
  return contextMenuWatcherUsernames.value.filter((username) => username !== currentUsername);
});
const contextMenuTitle = computed(() => {
  if (!contextMenuUrl.value) {
    return 'LISTENING TO';
  }

  const count = contextMenuWatcherCount.value;
  if (count > 2 && contextMenuIsCurrentUserPinnedSameVideo.value) {
    return `${count} AGENTS WATCHING`;
  }
  if (count === 2 && contextMenuIsCurrentUserPinnedSameVideo.value) {
    return 'BOTH WATCHING';
  }
  if (contextMenuWatcherUsernames.value.length > 0) {
    return 'WATCHING WITH';
  }
  return 'WATCHING';
});
const contextMenuWatcherLine = computed(() => {
  if (contextMenuWatcherUsernames.value.length === 0) {
    return '';
  }

  if (contextMenuIsCurrentUserPinnedSameVideo.value) {
    return ['You', ...contextMenuOtherWatcherNames.value].join(', ');
  }

  return contextMenuWatcherUsernames.value.join(', ');
});
const contextMenuActionVisible = computed(() => Boolean(contextMenuUrl.value && !contextMenuIsCurrentUserPinnedSameVideo.value));

watch(contextMenuActiveMedia, (next) => {
  if (contextMenu.value.visible && !next) {
    hideContextMenu();
  }
});

const userList = computed(() => {
  const filteredUsers = Object.values(props.users || {}).filter(
    user => user.username !== props.currentUsername
  );

  const botUsers = filteredUsers.filter((user) => user.isBot);
  const nonBotUsers = filteredUsers.filter((user) => !user.isBot);
  return [...botUsers, ...nonBotUsers];
});

function getDMBubbleState(user: string): 'active' | 'pending' | 'denied' | 'idle' {
  return props.dmBubbleStates?.[user] ?? 'idle';
}

function getDMBubbleClass(user: string) {
  const state = getDMBubbleState(user);
  return {
    'dm-btn-active': state === 'active',
    'dm-btn-pending': state === 'pending',
    'dm-btn-denied': state === 'denied',
  };
}

function getDMBubbleTitle(user: string): string {
  const state = getDMBubbleState(user);
  if (state === 'active') return `Active DM with ${user}`;
  if (state === 'pending') return `DM request pending with ${user}`;
  if (state === 'denied') return `${user} denied your DM request`;
  return `Send direct message to ${user}`;
}

function getCompactUserLabel(user: string): string {
  return user.toUpperCase();
}

function hideContextMenu() {
  contextMenu.value.visible = false;
  contextMenu.value.username = null;
}

function showUserContextMenu(user: UserPresence, event: MouseEvent) {
  const presence = props.users?.[user.username];
  if (!presence?.mediaSharing || !presence.activeMedia?.label) {
    return;
  }

  contextMenu.value = {
    visible: true,
    x: Math.min(window.innerWidth - 280, event.clientX + 6),
    y: Math.min(window.innerHeight - 120, event.clientY + 6),
    username: user.username,
  };
}

function pinUserMedia() {
  if (!contextMenuUrl.value) {
    return;
  }

  console.debug('[Sidebar] pinUserMedia', {
    username: contextMenuTargetUsername.value,
    url: contextMenuUrl.value,
    activeMedia: contextMenuActiveMedia.value,
  });

  emit('pinUserMedia', {
    url: contextMenuUrl.value,
    currentTime: contextMenuActiveMedia.value?.currentTime,
  });
  hideContextMenu();
}
</script>

<style scoped>
#sidebar {
  grid-area: sidebar;
  width: 220px;
  padding: 10px;
  background: var(--color-sidebar-bg);
  display: flex;
  flex-direction: column;
  min-height: 0;
  user-select: none;
  -webkit-user-select: none;
}

#sidebar, #sidebar * {
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

#sidebar.compact {
  width: 88px;
  padding: 8px 6px 10px;
}

.sidebar-header {
  border-bottom: 1px solid var(--color-accent);
  padding-bottom: 5px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
}

.compact-header-divider {
  height: 27px;
  border-bottom: 1px solid var(--color-accent);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding-left: 2px;
  padding-bottom: 5px;
}

.compact-away-toggle-btn {
  width: 18px;
  height: 18px;
  font-size: 11px;
  margin-left: -4px;
}

.agent-header-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.away-toggle-btn {
  background: transparent;
  border: none;
  color: var(--color-accent);
  opacity: 1;
  width: 22px;
  height: 22px;
  line-height: 1;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.2s;
  padding: 0;
}

.away-toggle-btn:hover {
  transform: scale(1.08);
}

.away-toggle-btn.active {
  color: var(--color-text-primary);
}

.status-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-sidebar-status-dot);
  box-shadow: 0 0 8px var(--color-sidebar-status-dot-glow);
  animation: status-dot-flash 2.6s ease-in-out infinite;
}

.typing-bullet {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 18px;
}

.typing-bullet span {
  display: inline-block;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.25;
  animation: typing-dot-flash 1s linear infinite;
}

.typing-bullet span:nth-child(1) {
  animation-delay: 0s;
}

.typing-bullet span:nth-child(2) {
  animation-delay: 0.15s;
}

.typing-bullet span:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes typing-dot-flash {
  0%,
  100% {
    opacity: 0.25;
  }
  50% {
    opacity: 1;
  }
}

@keyframes status-dot-flash {
  0%,
  100% {
    opacity: 0.72;
    box-shadow: 0 0 4px var(--color-sidebar-status-dot-glow-soft);
  }
  50% {
    opacity: 1;
    box-shadow: 0 0 12px var(--color-sidebar-status-dot-glow-strong);
  }
}

#user-list {
  margin-top: 10px;
  font-size: 13px;
  flex-grow: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

#sidebar.compact #user-list {
  margin-top: 4px;
}

.user-node {
  margin-bottom: 4px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  padding: 6px 0;
}

.user-bullet-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: inherit;
  font: inherit;
  font-weight: bold;
  cursor: default;
  width: 22px;
  padding: 0;
  text-align: center;
}

.user-bullet-clickable {
  cursor: pointer;
}

#sidebar.compact .user-node {
  margin-bottom: 3px;
  padding: 1px 2px;
  gap: 4px;
  justify-content: flex-start;
  min-width: 0;
}

#sidebar.compact .user-bullet-btn {
  display: none;
}

.user-handle-btn {
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  font-weight: inherit;
  cursor: pointer;
  padding: 0;
  flex: 1 1 auto;
  min-width: 0;
}

.away-user {
  opacity: 0.55;
}

.compact-user-handle-btn {
  min-width: 0;
  flex: 1 1 auto;
  display: block;
  width: 100%;
  font-size: 10px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-handle-btn:hover {
  text-shadow: 0 0 6px currentColor;
}

.dm-btn {
  background: none;
  border: 1px solid transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  opacity: 0.6;
  transition: opacity 0.2s, color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s;
  padding: 2px 4px;
  border-radius: 999px;
  min-width: 24px;
}

.request-tunnel-btn {
  margin-top: 10px;
  background: var(--color-input-bg);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--color-text-primary);
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: bold;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  opacity: 0.9;
  transition: opacity 0.2s, transform 0.2s, border-color 0.2s;
}

.request-tunnel-btn:hover {
  opacity: 1;
  transform: translateY(-1px);
  border-color: var(--color-accent);
}

.compact-dm-btn {
  min-width: 14px;
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  padding: 0;
  font-size: 10px;
  line-height: 1;
  opacity: 0.8;
  border-width: 1px;
}

.compact-dm-btn-placeholder {
  flex: 0 0 14px;
  width: 14px;
}

.dm-btn:hover {
  opacity: 1;
  text-shadow: 0 0 5px currentColor;
}

.dm-btn-active {
  color: var(--color-sidebar-dm-active);
  border-color: var(--color-sidebar-dm-active-border);
  box-shadow: 0 0 10px var(--color-sidebar-dm-active-glow);
  opacity: 1;
}

.dm-btn-pending {
  color: var(--color-sidebar-dm-pending);
  border-color: var(--color-sidebar-dm-pending-border);
  box-shadow: 0 0 10px var(--color-sidebar-dm-pending-glow);
  opacity: 1;
  animation: dm-pending-pulse 1s ease-in-out infinite;
}

@keyframes dm-pending-pulse {
  0%,
  100% {
    box-shadow: 0 0 8px var(--color-sidebar-dm-pending-glow);
    opacity: 0.85;
  }
  50% {
    box-shadow: 0 0 14px var(--color-sidebar-dm-pending-glow-strong);
    opacity: 1;
  }
}

.dm-btn-denied {
  color: var(--color-danger);
  border-color: var(--color-sidebar-dm-denied-border);
  box-shadow: 0 0 10px var(--color-sidebar-dm-denied-glow);
  opacity: 1;
  animation: dm-denied-flash 0.22s step-end 6;
}

@keyframes dm-denied-flash {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.25;
    transform: scale(0.92);
  }
}

.dm-btn-placeholder {
  display: inline-block;
  width: 24px;
  height: 18px;
  flex-shrink: 0;
}

.compact-dm-btn-placeholder {
  width: 14px;
  height: 14px;
}


.typing-user {
  animation: typing-flash 1s step-end infinite;
  text-shadow: 0 0 6px currentColor;
}

@keyframes typing-flash {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

#disconnect-btn {
  margin-top: auto;
  background: transparent;
  border: 1px solid var(--color-danger);
  color: var(--color-danger);
  padding: 10px;
  width: 100%;
  font-size: 12px;
  cursor: pointer;
  transition: 0.2s;
  text-transform: uppercase;
  font-family: inherit;
}

#disconnect-btn.compact-disconnect-btn {
  padding: 4px;
  font-size: 11px;
  line-height: 1;
}

#disconnect-btn:hover {
  background: var(--color-danger);
  color: var(--color-on-danger);
}

.user-details-popup {
  position: fixed;
  z-index: 1003;
  width: min(260px, calc(100vw - 24px));
  max-width: 260px;
  pointer-events: auto;
}

.user-details-card {
  background: rgba(16, 18, 26, 0.98);
  border: 1px solid rgba(120, 138, 255, 0.28);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
  border-radius: 18px;
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 12px;
  padding: 14px;
}

.user-details-avatar-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.user-details-avatar {
  width: 72px;
  height: 72px;
  border-radius: 18px;
  object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
}

.user-details-avatar-sprite {
  width: 72px;
  height: 72px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.user-details-avatar-placeholder {
  width: 72px;
  height: 72px;
  border-radius: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  color: var(--color-text-primary);
  font-size: 28px;
  text-transform: uppercase;
}

.user-details-body {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.user-details-name {
  font-weight: bold;
  margin-bottom: 6px;
  color: var(--color-accent);
}

.user-details-tagline {
  font-size: 13px;
  line-height: 1.4;
  color: var(--color-text-primary);
}

.user-context-tooltip {
  position: fixed;
  width: min(260px, calc(100vw - 24px));
  max-width: 260px;
  z-index: 1002;
  padding: 10px;
  border-radius: 10px;
  background: rgba(16, 18, 26, 0.96);
  border: 1px solid rgba(120, 138, 255, 0.24);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
  color: var(--color-text-primary);
  backdrop-filter: blur(10px);
}

.user-context-title {
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-accent);
  margin-bottom: 7px;
}

.user-context-label {
  font-size: 13px;
  line-height: 1.3;
  margin-bottom: 10px;
  max-height: 3.9em;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-context-watcher-line {
  margin-top: 4px;
  margin-bottom: 8px;
  color: var(--color-accent);
}

.user-context-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  border: 1px solid rgba(120, 138, 255, 0.4);
  background: transparent;
  color: var(--color-accent);
  cursor: pointer;
  padding: 8px 0;
  border-radius: 8px;
  font-size: 12px;
  text-transform: uppercase;
}

.user-context-action:hover {
  background: rgba(120, 138, 255, 0.12);
}

#show-dm-btn {
  margin-top: 10px;
  background: transparent;
  border: 1px solid var(--color-accent);
  color: var(--color-accent);
  padding: 10px;
  width: 100%;
  font-size: 12px;
  cursor: pointer;
  transition: 0.2s;
  text-transform: uppercase;
  font-family: inherit;
}

#show-dm-btn.compact-show-dm-btn {
  margin-top: 6px;
  padding: 4px;
  font-size: 10px;
}

#show-dm-btn:hover {
  background: var(--color-accent);
  color: var(--color-on-accent);
}

</style>
