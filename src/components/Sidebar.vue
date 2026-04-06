<template>
  <aside id="sidebar" :class="{ compact: props.isCompact }">
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
    <div id="user-list">
      <div
        v-for="user in userList"
        :key="user.username"
        class="user-node"
        :class="{ 'away-user': user.isAway, 'compact-user-node': props.isCompact }"
        :style="{ color: getUserColor(user.username) }"
      >
        <button
          type="button"
          class="user-handle-btn"
          :class="{ 'compact-user-handle-btn': props.isCompact, 'typing-user': user.isTyping }"
          :aria-label="`Mention ${user.username}`"
          @click="emit('mentionRequest', user.username)"
        >
          {{ props.isCompact ? getCompactUserLabel(user.username) : user.username }}
        </button>
        <button
          v-if="user.dmAvailable && !user.isAway"
          class="dm-btn"
          :class="[{ 'compact-dm-btn': props.isCompact }, getDMBubbleClass(user.username)]"
          :aria-label="getDMBubbleTitle(user.username)"
          @click="emit('dmRequest', user.username)"
        >
          {{ getDMBubbleIcon(user.username) }}
        </button>
        <span
          v-else-if="!props.isCompact"
          class="dm-btn-placeholder"
          :class="{ 'compact-dm-btn-placeholder': props.isCompact }"
          aria-hidden="true"
        ></span>
      </div>
    </div>
    <button id="disconnect-btn" :class="{ 'compact-disconnect-btn': props.isCompact }" @click="emit('disconnect')">{{ props.isCompact ? 'X' : 'TERMINATE' }}</button>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { UserPresence } from '../types/chat';
import { useTheme } from '../composables/useTheme';

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
  showDmWindow: [];
  toggleAway: [];
}>();

const { getUserColor } = useTheme();
const onlineCount = computed(() =>
  Object.values(props.users || {}).filter(user => Boolean(user.username)).length
);
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

function getDMBubbleIcon(user: string): string {
  return getDMBubbleState(user) === 'denied' ? '✕' : '💬';
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
</script>

<style scoped>
#sidebar {
  grid-area: sidebar;
  width: 220px;
  padding: 10px;
  padding-bottom: 20px;
  background: var(--color-sidebar-bg);
  display: flex;
  flex-direction: column;
  min-height: 0;
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
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-sidebar-status-dot);
  box-shadow: 0 0 8px var(--color-sidebar-status-dot-glow);
  animation: status-dot-flash 2.6s ease-in-out infinite;
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
  margin-bottom: 3px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 0;
  transition: opacity 0.2s;
}

.user-node:hover {
  opacity: 0.8;
}

.user-node.away-user {
  opacity: 0.45;
}

.user-node.away-user:hover {
  opacity: 0.6;
}

.user-node::before {
  content: '[O] ';
  color: var(--color-accent);
  opacity: 0.5;
  margin-right: 4px;
}

#sidebar.compact .user-node {
  margin-bottom: 3px;
  padding: 1px 2px;
  gap: 4px;
  justify-content: flex-start;
  min-width: 0;
}

#sidebar.compact .user-node::before {
  content: none;
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
  text-align: left;
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
  margin-top: 10px;
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
  margin-top: 6px;
  padding: 4px;
  font-size: 11px;
  line-height: 1;
}

#disconnect-btn:hover {
  background: var(--color-danger);
  color: var(--color-on-danger);
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
