<template>
  <div v-if="showAuth" id="auth-screen">
    <SinewaveBackground />
    <div
      class="login-box"
      :class="systemStatusClass"
      :data-system-status="systemStatusLabel"
    >
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
import { computed, ref } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import SinewaveBackground from './SinewaveBackground.vue';

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ === 'object';
}

const props = defineProps<{
  showAuth: boolean;
  authError: boolean;
  onlineAgentCount: number;
  presenceReady: boolean;
  presenceStatus: 'idle' | 'connecting' | 'checking-users' | 'cooldown' | 'ready' | 'error';
  presenceStatusMessage: string;
}>();

const emit = defineEmits<{
  login: [handle: string];
  ambience: [];
  'config-clicked': [];
}>();

const usernameInput = ref('');
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
const quit = async () => {
  if (!hasTauriWindow) {
    return;
  }

  const appWindow = getCurrentWindow();
  await appWindow.close();
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
  border: 2px solid var(--neon-green);
  padding: 40px;
  background: rgba(0, 20, 0, 0.8);
  box-shadow: 0 0 20px rgba(57, 255, 20, 0.2);
  position: relative;
  text-align: center;
}

.login-box::before {
  content: 'SYS_MSG: AUTH_PENDING';
  position: absolute;
  top: -10px;
  left: 10px;
  background: #020a02;
  padding: 0 5px;
  font-size: 10px;
  color: var(--neon-green);
}

.login-box::after {
  content: attr(data-system-status);
  position: absolute;
  bottom: -10px;
  right: 10px;
  background: #020a02;
  padding: 0 5px;
  font-size: 10px;
  color: var(--neon-green);
}

.login-box.online::after {
  color: var(--neon-green);
}

.login-box.offline::after {
  color: var(--alert-red);
}

.login-box.checking::after {
  color: var(--text-white);
}

.glitch-text {
  font-size: 24px;
  letter-spacing: 3px;
  margin-bottom: 30px;
  text-shadow: 2px 0 var(--alert-red), -2px 0 blue;
  animation: glitch 1s infinite alternate-reverse;
}

.input-group {
  position: relative;
  margin-bottom: 25px;
  display: flex;
  align-items: center;
  border-bottom: 2px solid var(--neon-green);
  background: var(--dim-green);
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
  color: var(--neon-green);
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
  border: 2px solid var(--neon-green);
  color: var(--neon-green);
  font-family: inherit;
  font-weight: bold;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
  text-transform: uppercase;
  letter-spacing: 2px;
}

#login-btn:hover {
  background: var(--neon-green);
  color: #000;
  box-shadow: 0 0 15px var(--neon-green);
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
  border: 2px solid var(--alert-red);
  color: var(--alert-red);
  font-family: inherit;
  font-weight: bold;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
  text-transform: uppercase;
  letter-spacing: 2px;
}

#quit-btn:hover {
  background: var(--alert-red);
  color: #000;
  box-shadow: 0 0 15px var(--alert-red);
}

#auth-err {
  color: var(--alert-red);
  font-size: 10px;
  margin-top: -15px;
  margin-bottom: 10px;
  display: block;
}

#online-count {
  color: var(--text-white);
  font-size: 12px;
  font-weight: 800;
  margin-top: -8px;
  margin-bottom: 14px;
  letter-spacing: 1px;
}

#online-count.pending {
  color: var(--neon-green);
  opacity: 0.9;
}

#online-count.cooldown {
  color: var(--alert-red);
  opacity: 0.92;
}

#online-count.ready {
  color: var(--text-white);
}

#online-count.error {
  color: var(--alert-red);
}

@keyframes glitch {
  0% {
    text-shadow: 1px 0 0 red, -1px 0 0 blue;
  }
  100% {
    text-shadow: -1px 0 0 red, 1px 0 0 blue;
  }
}

.config-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  background: none;
  border: none;
  color: var(--neon-green);
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
  text-shadow: 0 0 8px rgba(57, 255, 20, 0.5);
}

</style>
