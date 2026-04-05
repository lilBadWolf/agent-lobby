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

    <div
      v-for="notice in visibleNotices"
      :key="`notice-${notice.id}`"
      class="request-card transient-card"
      :class="notice.type === 'call-status' ? 'call-card' : 'info-card'"
    >
      <div class="request-body">{{ notice.message }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AudioCallRequest, DMNotice, DMRequest, VideoCallRequest } from '../types/directMessage';

const props = defineProps<{
  pendingRequests: DMRequest[];
  pendingAudioCalls: AudioCallRequest[];
  pendingVideoCalls: VideoCallRequest[];
  notices: DMNotice[];
}>();

const emit = defineEmits<{
  acceptDm: [user: string];
  rejectDm: [user: string];
  acceptAudio: [user: string];
  rejectAudio: [user: string];
  acceptVideo: [user: string];
  rejectVideo: [user: string];
}>();

const visibleNotices = computed(() =>
  props.notices.filter(
    (notice) => notice.type !== 'file-offer' && notice.type !== 'audio-call' && notice.type !== 'video-call'
  )
);
const hasEntries = computed(() =>
  props.pendingRequests.length > 0 ||
  visibleNotices.value.length > 0
);
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

.info-card {
  box-shadow: var(--color-dm-request-info-shadow);
}

.call-card {
  box-shadow: var(--color-dm-request-call-shadow);
}

.transient-card .request-actions {
  display: none;
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
