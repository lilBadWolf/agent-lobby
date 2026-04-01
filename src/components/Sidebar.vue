<template>
  <aside id="sidebar" :class="{ 'mobile-collapsed': isMobile && !isOpen, 'mobile-open': isMobile && isOpen }">
    <div class="sidebar-header">
      <span>Agents</span>
      <button
        v-if="isMobile"
        class="sidebar-close-btn"
        type="button"
        aria-label="Hide agent list"
        @click="emit('closeMobile')"
      >
        HIDE
      </button>
    </div>
    <div id="user-list">
      <div v-for="user in userList" :key="user.username" class="user-node" :style="{ color: getUserColor(user.username) }">
        <span :class="{ 'typing-user': user.isTyping }">{{ user.username }}</span>
        <button v-if="user.dmAvailable" class="dm-btn" @click="emit('dmRequest', user.username)">💬</button>
      </div>
    </div>
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
  isMobile?: boolean;
  isOpen?: boolean;
}>(), {
  users: () => ({}), // Default to an empty object
  isMobile: false,
  isOpen: true,
});

const emit = defineEmits<{
  disconnect: [];
  dmRequest: [user: string];
  closeMobile: [];
}>();

const { getUserColor } = useTheme();
const userList = computed(() =>
  Object.values(props.users || {}).filter(user => user.username !== props.currentUsername)
);
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
  justify-content: space-between;
  gap: 8px;
}

.sidebar-close-btn {
  border: 1px solid var(--neon-green);
  background: transparent;
  color: var(--neon-green);
  font-family: inherit;
  font-size: 10px;
  letter-spacing: 0.4px;
  padding: 3px 6px;
  cursor: pointer;
}

.sidebar-close-btn:active {
  background: var(--neon-green);
  color: #000;
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

.user-node::before {
  content: '[O] ';
  color: var(--neon-green);
  opacity: 0.5;
  margin-right: 4px;
}

.dm-btn {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  opacity: 0.6;
  transition: opacity 0.2s;
  padding: 2px 4px;
}

.dm-btn:hover {
  opacity: 1;
  text-shadow: 0 0 5px currentColor;
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

@media (max-width: 900px) {
  #sidebar {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 40;
    width: min(78vw, 320px);
    padding: 12px;
    font-size: 11px;
    transform: translateX(0);
    transition: transform 0.2s ease;
    border-left: 1px solid var(--dim-green);
    box-shadow: -8px 0 24px rgba(0, 0, 0, 0.35);
  }

  #sidebar.mobile-collapsed {
    transform: translateX(105%);
    pointer-events: none;
  }

  #sidebar.mobile-open {
    transform: translateX(0);
  }

  #user-list {
    font-size: 10px;
  }

  .dm-btn {
    font-size: 10px;
  }
}
</style>
