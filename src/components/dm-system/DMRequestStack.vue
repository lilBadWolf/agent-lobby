<template>
  <div v-if="hasEntries" class="dm-request-stack" aria-live="polite">
    <div v-for="request in pendingRequests" :key="`dm-${request.from}`" class="request-card">
      <div class="request-inline-row">
        <div class="request-body">{{ request.from }} wants a direct line.</div>
        <div class="request-actions">
          <button class="accept-btn" @click="emit('acceptDm', request.from)">✅</button>
          <button class="reject-btn" @click="emit('rejectDm', request.from)">❌</button>
        </div>
      </div>
    </div>

    <div v-for="invite in groupPendingInvites" :key="`group-${invite.id}`" class="request-card">
      <div class="request-inline-row">
        <div class="request-body">{{ invite.from }} invited you to a group tunnel.</div>
        <div class="request-actions">
          <button class="accept-btn" @click="emit('acceptGroupInvite', invite.id)">✅</button>
          <button class="reject-btn" @click="emit('rejectGroupInvite', invite.id)">❌</button>
        </div>
      </div>
    </div>

    <div v-for="missed in missedCalls" :key="`missed-${missed.id}`" class="request-card missed-card">
      <div class="request-inline-row">
        <div class="missed-body">
          <span class="missed-icon">📵</span>
          <span class="missed-text">Missed tunnel from <strong>{{ missed.from }}</strong></span>
          <span class="missed-time">{{ timeAgo(missed.timestamp, now) }}</span>
        </div>
        <div class="request-actions">
          <button class="dismiss-btn" @click="emit('dismissMissedCall', missed.id)" title="Dismiss">✕</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import type { DMRequest } from '../../types/directMessage';
import type { MissedDMCall } from '../../types/directMessage';
import type { GroupDMInvite } from '../../types/groupDirectMessage';

const props = defineProps<{
  pendingRequests: DMRequest[];
  groupPendingInvites?: GroupDMInvite[];
  missedCalls?: MissedDMCall[];
}>();

const emit = defineEmits<{
  acceptDm: [user: string];
  rejectDm: [user: string];
  acceptGroupInvite: [inviteId: string];
  rejectGroupInvite: [inviteId: string];
  dismissMissedCall: [id: number];
}>();

const groupPendingInvites = computed(() => props.groupPendingInvites ?? []);
const missedCalls = computed(() => props.missedCalls ?? []);
const hasEntries = computed(
  () => props.pendingRequests.length > 0 || groupPendingInvites.value.length > 0 || missedCalls.value.length > 0
);

const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  ticker = setInterval(() => { now.value = Date.now(); }, 30_000);
});
onUnmounted(() => {
  if (ticker !== null) clearInterval(ticker);
});

function timeAgo(timestamp: number, currentTime: number): string {
  const diffMs = currentTime - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}
</script>

<style scoped>
.dm-request-stack {
  position: absolute;
  right: 12px;
  bottom: 126px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
  width: auto;
  max-width: min(420px, calc(100vw - 300px));
  z-index: 320;
  pointer-events: none;
}

.dm-request-stack > .request-card {
  width: max-content;
  max-width: min(420px, calc(100vw - 300px));
}

.request-card {
  pointer-events: auto;
  border: none;
  border-radius: 10px;
  background: var(--color-dm-request-card-bg);
  box-shadow: var(--color-dm-request-card-shadow);
  padding: 8px 10px;
  backdrop-filter: blur(4px);
}

.request-body {
  font-size: 11px;
  line-height: 1.25;
  color: var(--color-text-primary);
}

.request-inline-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.request-inline-row .request-body {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.request-actions {
  display: flex;
  gap: 6px;
  margin-top: 0;
  justify-content: flex-end;
  flex-wrap: nowrap;
  flex-shrink: 0;
}

.request-actions button {
  background: transparent;
  border: none;
  color: inherit;
  padding: 4px 7px;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  font: inherit;
  width: 24px;
  height: 22px;
  min-width: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.accept-btn {
  color: var(--color-accent);
}

.accept-btn:hover {
  background: var(--color-dm-request-accept-hover);
}

.reject-btn {
  color: var(--color-danger);
}

.reject-btn:hover {
  background: var(--color-dm-request-reject-hover);
}

.missed-card {
  opacity: 0.88;
}

.missed-body {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  min-width: 0;
}

.missed-icon {
  flex-shrink: 0;
}

.missed-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.missed-time {
  flex-shrink: 0;
  font-size: 10px;
  opacity: 0.6;
}

.dismiss-btn {
  color: var(--color-text-secondary, var(--color-text-primary));
  font-size: 11px;
}

.dismiss-btn:hover {
  color: var(--color-text-primary);
  background: var(--color-dm-request-reject-hover);
}

@media (max-width: 900px) {
  .dm-request-stack {
    right: 16px;
    bottom: 84px;
    width: auto;
    max-width: calc(100vw - 32px);
    align-items: flex-end;
  }

  .dm-request-stack > .request-card {
    width: max-content;
    max-width: calc(100vw - 32px);
  }
}
</style>
