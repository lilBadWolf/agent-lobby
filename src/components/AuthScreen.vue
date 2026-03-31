<script setup lang="ts">
import { ref } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import SinewaveBackground from './SinewaveBackground.vue';

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ === 'object';
}

defineProps<{
  showAuth: boolean;
  authError: boolean;
}>();

const emit = defineEmits<{
  login: [handle: string];
  ambience: [];
  'config-clicked': [];
}>();

const usernameInput = ref('');
const hasTauriWindow = isTauriRuntime();

function handleLogin() {
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

<template>
  <div v-if="showAuth" id="auth-screen">
    <SinewaveBackground />
    <div class="login-box">
      <button class="config-btn" @click="handleConfigClick">π</button>
      <h2 class="glitch-text">AGENT LOBBY</h2>
      <div class="input-group">
        <span class="prompt-char">&gt;</span>
        <input
          v-model="usernameInput"
          type="text"
          id="username-in"
          placeholder="HANDLE"
          maxlength="12"
          autocomplete="off"
          @click="handleInputClick"
          @keydown.enter="handleLogin"
        />
      </div>
      <p v-if="authError" id="auth-err">ERROR: HANDLE_ALREADY_EXISTS</p>
      <button id="login-btn" @click="handleLogin">INITIALIZE LINK</button>
      <button v-if="hasTauriWindow" id="quit-btn" @click="quit">QUIT</button>
    </div>
  </div>
</template>

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
  content: 'System Online';
  position: absolute;
  bottom: -10px;
  right: 10px;
  background: #020a02;
  padding: 0 5px;
  font-size: 10px;
  color: var(--neon-green);
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

@media (max-width: 600px) {
  .login-box {
    width: 90%;
    padding: 20px;
  }

  .glitch-text {
    font-size: 18px;
  }
}
</style>
