<script setup lang="ts">
const props = defineProps<{
  users: Set<string>;
}>();

const emit = defineEmits<{
  disconnect: [];
}>();

function getUserColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash % 360)}, 80%, 60%)`;
}

const userList = computed(() => Array.from(props.users));

import { computed } from 'vue';
</script>

<template>
  <aside id="sidebar">
    <div style="border-bottom: 1px solid var(--neon-green); padding-bottom: 5px">Agents</div>
    <div id="user-list">
      <div v-for="user in userList" :key="user" class="user-node" :style="{ color: getUserColor(user) }">
        {{ user }}
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
}

.user-node::before {
  content: '[O] ';
  color: var(--neon-green);
  opacity: 0.5;
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
}
</style>
