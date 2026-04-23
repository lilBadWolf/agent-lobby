<template>
  <div v-if="showAuth" id="auth-screen">
    <AuthBackground :soundpack="soundpack" />
    <div
      class="login-box"
      :class="systemStatusClass"
      :data-system-status="systemStatusLabel"
    >
      <div class="app-version-badge">
        <span class="app-version-label">APP_VER:</span>
        <span class="app-version-number">{{ appVersion }}</span>
      </div>
      <button class="config-btn" @click="handleConfigClick">π</button>
      <h2 class="glitch-text">AGENT LOBBY</h2>
      <div class="input-group">
        <span class="prompt-char">&gt;</span>
        <input
          v-model="usernameInput"
          type="text"
          id="username-in"
          name="agent-handle"
          placeholder="HANDLE"
          maxlength="12"
          autocomplete="new-password"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="go"
          data-form-type="other"
          data-lpignore="true"
          @click="handleInputClick"
          @keydown.enter="handleLogin"
        />
      </div>
      <p v-if="authError" id="auth-err">ERROR: HANDLE_ALREADY_EXISTS</p>
      <p id="online-count" :class="presenceStatusClass">
        {{ presenceStatusMessage }}
      </p>
      <button id="login-btn" :disabled="!canInitialize" @click="handleLogin">INITIALIZE LINK</button>
      <button v-if="hasTauriWindow" id="quit-btn" @click="quit">QUIT</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AuthBackground from './AuthBackground.vue';

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ === 'object';
}

const props = defineProps<{
  showAuth: boolean;
  appVersion: string;
  authError: boolean;
  onlineAgentCount: number;
  presenceReady: boolean;
  presenceStatus: 'idle' | 'connecting' | 'checking-users' | 'cooldown' | 'ready' | 'error';
  presenceStatusMessage: string;
  soundpack?: string;
  initialHandle?: string | null;
}>();

const emit = defineEmits<{
  login: [handle: string];
  ambience: [];
  'config-clicked': [];
  quit: [];
}>();

const usernameInput = ref('');

watch(
  () => props.initialHandle,
  (nextHandle) => {
    if (nextHandle && !usernameInput.value) {
      usernameInput.value = nextHandle;
    }
  },
  { immediate: true }
);
const hasTauriWindow = isTauriRuntime();
const canInitialize = computed(() => props.presenceStatus === 'ready');
const isSystemOnline = computed(() => props.presenceStatus === 'ready');
const isSystemOffline = computed(() => props.presenceStatus === 'cooldown' || props.presenceStatus === 'error');
const systemStatusLabel = computed(() => {
  if (isSystemOnline.value) {
    return 'System Online';
  }

  if (isSystemOffline.value) {
    return 'System Offline';
  }

  return 'System Checking';
});
const systemStatusClass = computed(() => ({
  online: isSystemOnline.value,
  offline: isSystemOffline.value,
  checking: !isSystemOnline.value && !isSystemOffline.value,
}));
const presenceStatusClass = computed(() => ({
  pending: props.presenceStatus === 'connecting' || props.presenceStatus === 'checking-users',
  cooldown: props.presenceStatus === 'cooldown',
  error: props.presenceStatus === 'error',
  ready: props.presenceStatus === 'ready',
}));

function handleLogin() {
  if (!canInitialize.value) {
    return;
  }

  if (usernameInput.value.trim()) {
    emit('login', usernameInput.value.trim().toUpperCase());
    usernameInput.value = '';
  }
}

function handleInputClick() {
  emit('ambience');
}

function handleConfigClick() {
  emit('config-clicked');
}
const quit = () => {
  emit('quit');
}
</script>

<style scoped>
#auth-screen {
  position: absolute;
  inset: 0;
  background: transparent;
  z-index: 200;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.login-box {
  width: 400px;
  border: 2px solid var(--color-accent);
  padding: 40px;
  background: var(--color-auth-surface);
  box-shadow: 0 0 20px var(--color-auth-surface-glow);
  position: relative;
  text-align: center;
}

.app-version-badge {
  position: absolute;
  top: -10px;
  left: 10px;
  background: var(--color-auth-badge-bg);
  padding: 0 5px;
  font-size: 10px;
  letter-spacing: 0;
}

.app-version-label {
  color: var(--color-accent);
}

.app-version-number {
  color: var(--color-text-primary);
  font-weight: 700;
}

.login-box::after {
  content: attr(data-system-status);
  position: absolute;
  bottom: -10px;
  right: 10px;
  background: var(--color-auth-badge-bg);
  padding: 0 5px;
  font-size: 10px;
  color: var(--color-accent);
}

.login-box.online::after {
  color: var(--color-accent);
}

.login-box.offline::after {
  color: var(--color-danger);
}

.login-box.checking::after {
  color: var(--color-text-primary);
}

.glitch-text {
  font-size: 24px;
  letter-spacing: 3px;
  margin-bottom: 30px;
  text-shadow: 2px 0 var(--color-auth-glitch-primary), -2px 0 var(--color-auth-glitch-secondary);
  animation: glitch 1s infinite alternate-reverse;
}

.input-group {
  position: relative;
  margin-bottom: 25px;
  display: flex;
  align-items: center;
  border-bottom: 2px solid var(--color-accent);
  background: var(--color-accent-muted);
}

.prompt-char {
  padding-left: 10px;
  font-weight: bold;
  font-size: 18px;
}

#username-in {
  width: 100%;
  background: transparent;
  border: none;
  color: var(--color-accent);
  padding: 15px 10px;
  font-family: inherit;
  font-size: 18px;
  outline: none;
  text-transform: uppercase;
}

#login-btn {
  width: 100%;
  padding: 15px;
  background: transparent;
  border: 2px solid var(--color-accent);
  color: var(--color-accent);
  font-family: inherit;
  font-weight: bold;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
  text-transform: uppercase;
  letter-spacing: 2px;
}

#login-btn:hover {
  background: var(--color-accent);
  color: var(--color-on-accent);
  box-shadow: 0 0 15px var(--color-accent);
}

#login-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

#quit-btn {
  width: 100%;
  padding: 15px;
  margin-top: 10px;
  background: transparent;
  border: 2px solid var(--color-danger);
  color: var(--color-danger);
  font-family: inherit;
  font-weight: bold;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
  text-transform: uppercase;
  letter-spacing: 2px;
}

#quit-btn:hover {
  background: var(--color-danger);
  color: var(--color-on-danger);
  box-shadow: 0 0 15px var(--color-danger);
}

#auth-err {
  color: var(--color-danger);
  font-size: 10px;
  margin-top: -15px;
  margin-bottom: 10px;
  display: block;
}

#online-count {
  color: var(--color-text-primary);
  font-size: 12px;
  font-weight: 800;
  margin-top: -8px;
  margin-bottom: 14px;
  letter-spacing: 1px;
}

#online-count.pending {
  color: var(--color-accent);
  opacity: 0.9;
}

#online-count.cooldown {
  color: var(--color-danger);
  opacity: 0.92;
}

#online-count.ready {
  color: var(--color-text-primary);
}

#online-count.error {
  color: var(--color-danger);
}

@keyframes glitch {
  0% {
    text-shadow: 1px 0 0 var(--color-auth-glitch-primary), -1px 0 0 var(--color-auth-glitch-secondary);
  }
  100% {
    text-shadow: -1px 0 0 var(--color-auth-glitch-primary), 1px 0 0 var(--color-auth-glitch-secondary);
  }
}

.config-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  background: none;
  border: none;
  color: var(--color-accent);
  font-size: 8px;
  opacity: 0.3;
  transition: all 0.2s;
  padding: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.config-btn:hover {
  opacity: 0.8;
  text-shadow: 0 0 8px var(--color-auth-config-glow);
}

</style>
