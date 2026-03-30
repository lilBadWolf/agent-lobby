<script setup lang="ts">
import { computed } from 'vue';
import { useTheme } from '../composables/useTheme';

export interface UserPresence {
  username: string;
  dmAvailable: boolean;
}

const props = withDefaults(defineProps<{
  users: Record<string, UserPresence>;
  currentUsername?: string;
}>(), {
  users: () => ({}) // Default to an empty object
});

const emit = defineEmits<{
  disconnect: [];
  dmRequest: [user: string];
}>();

const { getUserColor } = useTheme();
const userList = computed(() =>
  Object.values(props.users || {}).filter(user => user.username !== props.currentUsername)
);
</script>

<template>
  <aside id="sidebar">
    <div style="border-bottom: 1px solid var(--neon-green); padding-bottom: 5px">Agents</div>
    <div id="user-list">
      <div v-for="user in userList" :key="user.username" class="user-node" :style="{ color: getUserColor(user.username) }">
        <span>{{ user.username }}</span>
        <button v-if="user.dmAvailable" class="dm-btn" @click="emit('dmRequest', user.username)" title="Request DM">💬</button>
      </div>
    </div>
    <button id="disconnect-btn" @click="emit('disconnect')">TERMINATE</button>
  </aside>
</template>

<style scoped>
#sidebar {
  width: 220px;
  padding: 20px;
  background: rgba(0, 20, 0, 0.3);
  display: flex;
  flex-direction: column;
}

#user-list {
  margin-top: 15px;
  font-size: 13px;
  flex-grow: 1;
  overflow-y: auto;
}

.user-node {
  margin-bottom: 5px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
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

@media (max-width: 600px) {
  #sidebar {
    width: 100px;
    padding: 10px;
    font-size: 10px;
  }

  #user-list {
    font-size: 10px;
  }

  .dm-btn {
    font-size: 10px;
  }
}
</style>
