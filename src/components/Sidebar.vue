<template>
  <aside id="sidebar">
    <div class="sidebar-header">
      <div class="agent-header-title">
        <span>[{{ onlineCount }}] AGENTS</span>
        <button
          class="away-toggle-btn"
          :class="{ active: props.isAway }"
          type="button"
          :title="props.isAway ? 'Set status to active' : 'Set status to away'"
          :aria-label="props.isAway ? 'Set status to active' : 'Set status to away'"
          @click="emit('toggleAway')"
        >
          <span v-if="!props.isAway" class="status-dot" aria-hidden="true"></span>
          <span v-else aria-hidden="true">💤</span>
        </button>
      </div>
    </div>
    <div id="user-list">
      <div
        v-for="user in userList"
        :key="user.username"
        class="user-node"
        :class="{ 'away-user': user.isAway }"
        :style="{ color: getUserColor(user.username) }"
      >
        <button
          type="button"
          class="user-handle-btn"
          :class="{ 'typing-user': user.isTyping }"
          @click="emit('mentionRequest', user.username)"
        >
          {{ user.username }}
        </button>
        <button
          v-if="user.dmAvailable && !user.isAway"
          class="dm-btn"
          :class="getDMBubbleClass(user.username)"
          :title="getDMBubbleTitle(user.username)"
          :aria-label="getDMBubbleTitle(user.username)"
          @click="emit('dmRequest', user.username)"
        >
          {{ getDMBubbleIcon(user.username) }}
        </button>
        <span v-else class="dm-btn-placeholder" aria-hidden="true"></span>
      </div>
    </div>
    <button
      v-if="props.showDmLauncher"
      id="show-dm-btn"
      type="button"
      @click="emit('showDmWindow')"
    >
      SHOW DM
    </button>
    <button id="disconnect-btn" @click="emit('disconnect')">TERMINATE</button>
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
}>(), {
  users: () => ({}), // Default to an empty object
  isAway: false,
  dmBubbleStates: () => ({}),
  showDmLauncher: false,
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
</script>

<style scoped>
#sidebar {
  grid-area: sidebar;
  width: 220px;
  padding: 10px;
  padding-bottom: 20px;
  background: rgba(0, 20, 0, 0.3);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.sidebar-header {
  border-bottom: 1px solid var(--neon-green);
  padding-bottom: 5px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
}

.agent-header-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.away-toggle-btn {
  background: transparent;
  border: none;
  color: var(--neon-green);
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
  color: var(--text-main);
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #36ff6f;
  box-shadow: 0 0 8px #36ff6f;
  animation: status-dot-flash 1s ease-in-out infinite;
}

@keyframes status-dot-flash {
  0%,
  100% {
    opacity: 1;
    box-shadow: 0 0 8px #36ff6f;
  }
  50% {
    opacity: 0.35;
    box-shadow: 0 0 2px #36ff6f;
  }
}

#user-list {
  margin-top: 10px;
  font-size: 13px;
  flex-grow: 1;
  overflow-y: auto;
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
  color: var(--neon-green);
  opacity: 0.5;
  margin-right: 4px;
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

.dm-btn:hover {
  opacity: 1;
  text-shadow: 0 0 5px currentColor;
}

.dm-btn-active {
  color: #6dff8f;
  border-color: rgba(109, 255, 143, 0.55);
  box-shadow: 0 0 10px rgba(109, 255, 143, 0.45);
  opacity: 1;
}

.dm-btn-pending {
  color: #ffd84a;
  border-color: rgba(255, 216, 74, 0.55);
  box-shadow: 0 0 10px rgba(255, 216, 74, 0.4);
  opacity: 1;
}

.dm-btn-denied {
  color: var(--alert-red);
  border-color: rgba(255, 57, 57, 0.65);
  box-shadow: 0 0 10px rgba(255, 57, 57, 0.42);
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
  border: 1px solid var(--alert-red);
  color: var(--alert-red);
  padding: 10px;
  width: 100%;
  font-size: 12px;
  cursor: pointer;
  transition: 0.2s;
  text-transform: uppercase;
  font-family: inherit;
}

#disconnect-btn:hover {
  background: var(--alert-red);
  color: #000;
}

#show-dm-btn {
  margin-top: 10px;
  background: transparent;
  border: 1px solid var(--neon-green);
  color: var(--neon-green);
  padding: 10px;
  width: 100%;
  font-size: 12px;
  cursor: pointer;
  transition: 0.2s;
  text-transform: uppercase;
  font-family: inherit;
}

#show-dm-btn:hover {
  background: var(--neon-green);
  color: #000;
}

</style>
