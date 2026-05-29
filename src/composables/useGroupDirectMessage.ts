import { ref } from 'vue';
import type mqtt from 'mqtt';
import type { ChatMessage } from '../types/chat';
import type { GroupAudioState, GroupDMGroup, GroupDMInvite, GroupGameChallenge, GroupGameEvent, GroupGameKind, GroupGameState } from '../types/groupDirectMessage';

type GroupSignalMessage =
  | { type: 'invite'; inviteId: string; groupId: string; from: string; owner: string; members: string[]; timestamp: number }
  | { type: 'invite-response'; inviteId: string; groupId: string; from: string; accepted: boolean }
  | { type: 'sync'; group: GroupDMGroup }
  | { type: 'chat'; groupId: string; message: ChatMessage }
  | { type: 'audio-state'; groupId: string; user: string; joined: boolean; micMuted: boolean; soundMuted: boolean }
  | { type: 'audio-signal'; groupId: string; from: string; signal: RTCSessionDescriptionInit | RTCIceCandidateInit }
  | { type: 'game-state'; groupId: string; game: GroupGameState | null }
  | { type: 'game-challenge'; groupId: string; challenge: GroupGameChallenge }
  | { type: 'game-challenge-response'; groupId: string; challengeId: string; from: string; accepted: boolean }
  | { type: 'game-relay'; groupId: string; from: string; payload: string }
  | { type: 'leave'; groupId: string; from: string }
  | { type: 'end'; groupId: string; from: string };

const MAX_GROUP_MEMBERS = 5;
const MAX_GAME_EVENTS = 300;
const AUDIO_RECONNECT_DELAYS_MS = [1200, 2500, 5000, 8000];
const MAX_AUDIO_RECONNECT_ATTEMPTS = AUDIO_RECONNECT_DELAYS_MS.length;
const RTC_AUDIO_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302'] },
    { urls: ['stun:stun1.l.google.com:19302'] },
    { urls: ['stun:stun2.l.google.com:19302'] },
  ],
};

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useGroupDirectMessage(
  username: { value: string },
  _roomId: string,
  mqttClient: mqtt.MqttClient | null,
  onConnect: (callback: () => void) => void
) {
  const activeGroup = ref<GroupDMGroup | null>(null);
  const pendingInvites = ref<GroupDMInvite[]>([]);
  const messages = ref<ChatMessage[]>([]);
  const activeGame = ref<GroupGameState | null>(null);
  const audioStates = ref<GroupAudioState[]>([]);
  const pendingGameChallenges = ref<GroupGameChallenge[]>([]);
  const gameEvents = ref<GroupGameEvent[]>([]);

  let messageHandlerRegistered = false;
  let messageHandler: ((topic: string, payload: Buffer) => void) | null = null;
  let gameEventSequence = 0;
  const outgoingGameChallenges = new Map<string, GroupGameChallenge>();
  const audioPeerConnections = new Map<string, RTCPeerConnection>();
  const remoteAudioStreams = new Map<string, MediaStream>();
  const remoteAudioElements = new Map<string, HTMLAudioElement>();
  const pendingRemoteIceCandidates = new Map<string, RTCIceCandidateInit[]>();
  const audioReconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const audioReconnectAttempts = new Map<string, number>();
  let localAudioStream: MediaStream | null = null;

  function incomingTopic() {
    return `agent_lobby/group_dm/${username.value}`;
  }

  function publishToUser(toUser: string, payload: GroupSignalMessage) {
    if (!mqttClient) {
      return;
    }

    mqttClient.publish(`agent_lobby/group_dm/${toUser}`, JSON.stringify(payload));
  }

  function ensureUniqueMembers(input: string[]): string[] {
    const deduped: string[] = [];
    for (const user of input) {
      if (!user || deduped.includes(user)) {
        continue;
      }
      deduped.push(user);
    }
    return deduped.slice(0, MAX_GROUP_MEMBERS);
  }

  function publishGroupSync(group: GroupDMGroup) {
    for (const member of group.members) {
      if (member === username.value) {
        continue;
      }
      publishToUser(member, { type: 'sync', group });
    }
  }

  function normalizeAudioState(state: GroupAudioState): GroupAudioState {
    return {
      user: state.user,
      joined: Boolean(state.joined),
      micMuted: Boolean(state.micMuted),
      soundMuted: Boolean(state.soundMuted),
    };
  }

  function upsertAudioState(nextState: GroupAudioState) {
    const normalized = normalizeAudioState(nextState);
    const filtered = audioStates.value.filter((entry) => entry.user !== normalized.user);
    audioStates.value = [...filtered, normalized].sort((a, b) => a.user.localeCompare(b.user));
  }

  function removeAudioState(user: string) {
    audioStates.value = audioStates.value.filter((entry) => entry.user !== user);
  }

  function appendGameEvent(from: string, payload: string) {
    const nextEvent: GroupGameEvent = {
      sequence: ++gameEventSequence,
      from,
      payload,
    };

    const next = [...gameEvents.value, nextEvent];
    gameEvents.value = next.length > MAX_GAME_EVENTS ? next.slice(next.length - MAX_GAME_EVENTS) : next;
  }

  function publishAudioState(user: string, joined: boolean, micMuted: boolean, soundMuted: boolean) {
    const group = activeGroup.value;
    if (!group) {
      return;
    }

    for (const member of group.members) {
      if (member === username.value) {
        continue;
      }

      publishToUser(member, {
        type: 'audio-state',
        groupId: group.id,
        user,
        joined,
        micMuted,
        soundMuted,
      });
    }
  }

  function publishAudioSignal(toUser: string, signal: RTCSessionDescriptionInit | RTCIceCandidateInit) {
    const group = activeGroup.value;
    if (!group) {
      return;
    }

    publishToUser(toUser, {
      type: 'audio-signal',
      groupId: group.id,
      from: username.value,
      signal,
    });
  }

  function clearAudioReconnectTimer(user: string) {
    const timer = audioReconnectTimers.get(user);
    if (timer) {
      clearTimeout(timer);
      audioReconnectTimers.delete(user);
    }
  }

  function resetAudioReconnectState(user: string) {
    clearAudioReconnectTimer(user);
    audioReconnectAttempts.delete(user);
  }

  function canReconnectAudioWith(user: string): boolean {
    const group = activeGroup.value;
    const selfAudio = audioStates.value.find((entry) => entry.user === username.value);
    const peerAudio = audioStates.value.find((entry) => entry.user === user);
    return Boolean(group && group.members.includes(user) && selfAudio?.joined && peerAudio?.joined);
  }

  async function flushPendingIceCandidates(user: string, peerConnection: RTCPeerConnection) {
    const queued = pendingRemoteIceCandidates.get(user);
    if (!queued?.length) {
      return;
    }

    pendingRemoteIceCandidates.delete(user);
    for (const candidate of queued) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error(`[GroupDM] Failed to flush queued ICE candidate for ${user}:`, error);
      }
    }
  }

  async function restartAudioConnectionWithPeer(user: string) {
    closePeerConnectionForUser(user, { clearReconnect: false });
    await startAudioOffer(user);
  }

  function scheduleAudioReconnect(user: string, reason: string) {
    if (!canReconnectAudioWith(user)) {
      return;
    }

    if (audioReconnectTimers.has(user)) {
      return;
    }

    const attempt = audioReconnectAttempts.get(user) ?? 0;
    if (attempt >= MAX_AUDIO_RECONNECT_ATTEMPTS) {
      audioReconnectAttempts.delete(user);
      addSystemMessage(`Group audio reconnect failed with ${user}. Rejoin audio to retry.`);
      return;
    }

    const delay = AUDIO_RECONNECT_DELAYS_MS[attempt] ?? AUDIO_RECONNECT_DELAYS_MS[AUDIO_RECONNECT_DELAYS_MS.length - 1];
    const timer = setTimeout(() => {
      audioReconnectTimers.delete(user);
      audioReconnectAttempts.set(user, attempt + 1);

      if (!canReconnectAudioWith(user)) {
        return;
      }

      void restartAudioConnectionWithPeer(user);
    }, delay);

    audioReconnectTimers.set(user, timer);
    console.warn(`[GroupDM] Scheduling audio reconnect with ${user} in ${delay}ms (${reason}, attempt ${attempt + 1}).`);
  }

  function closeAudioElementForUser(user: string) {
    const element = remoteAudioElements.get(user);
    if (!element) {
      return;
    }

    try {
      element.pause();
      element.srcObject = null;
      element.remove();
    } catch {
      // Ignore best-effort cleanup failures.
    }

    remoteAudioElements.delete(user);
    remoteAudioStreams.delete(user);
  }

  function closePeerConnectionForUser(user: string, options?: { clearReconnect?: boolean }) {
    const clearReconnect = options?.clearReconnect ?? true;
    const peerConnection = audioPeerConnections.get(user);
    if (!peerConnection) {
      closeAudioElementForUser(user);
      pendingRemoteIceCandidates.delete(user);
      if (clearReconnect) {
        resetAudioReconnectState(user);
      }
      return;
    }

    try {
      peerConnection.onicecandidate = null;
      peerConnection.ontrack = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.close();
    } catch {
      // Ignore close failures.
    }

    audioPeerConnections.delete(user);
    pendingRemoteIceCandidates.delete(user);
    closeAudioElementForUser(user);
    if (clearReconnect) {
      resetAudioReconnectState(user);
    }
  }

  function closeAllAudioConnections() {
    for (const user of [...audioPeerConnections.keys()]) {
      closePeerConnectionForUser(user);
    }
  }

  function stopLocalAudioStream() {
    if (!localAudioStream) {
      return;
    }

    for (const track of localAudioStream.getTracks()) {
      track.stop();
    }
    localAudioStream = null;
  }

  function applySoundMutedToRemoteElements(muted: boolean) {
    for (const element of remoteAudioElements.values()) {
      element.muted = muted;
      element.volume = muted ? 0 : 1;
    }
  }

  async function ensureLocalAudioStream(): Promise<MediaStream | null> {
    if (localAudioStream) {
      return localAudioStream;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return null;
    }

    try {
      localAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      return localAudioStream;
    } catch (error) {
      console.error('[GroupDM] Unable to acquire local audio stream:', error);
      addSystemMessage('Unable to access microphone for Group Audio.');
      return null;
    }
  }

  function shouldInitiateAudioWithUser(otherUser: string): boolean {
    return username.value.localeCompare(otherUser) < 0;
  }

  async function createAudioPeerConnection(otherUser: string): Promise<RTCPeerConnection> {
    const existing = audioPeerConnections.get(otherUser);
    if (existing) {
      return existing;
    }

    const peerConnection = new RTCPeerConnection(RTC_AUDIO_CONFIG);

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }

      publishAudioSignal(otherUser, event.candidate.toJSON());
    };

    peerConnection.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) {
        return;
      }

      remoteAudioStreams.set(otherUser, stream);

      let element = remoteAudioElements.get(otherUser);
      if (!element) {
        if (typeof document === 'undefined') {
          return;
        }

        element = document.createElement('audio');
        element.autoplay = true;
        element.playsInline = true;
        element.style.display = 'none';
        document.body.appendChild(element);
        remoteAudioElements.set(otherUser, element);
      }

      element.srcObject = stream;
      const muted = audioStates.value.find((entry) => entry.user === username.value)?.soundMuted ?? false;
      element.muted = muted;
      element.volume = muted ? 0 : 1;
      void element.play().catch(() => undefined);
    };

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      if (state === 'connected') {
        resetAudioReconnectState(otherUser);
        return;
      }

      if (state === 'failed' || state === 'disconnected') {
        scheduleAudioReconnect(otherUser, state);
        return;
      }

      if (state === 'closed') {
        if (!canReconnectAudioWith(otherUser)) {
          closePeerConnectionForUser(otherUser);
          return;
        }

        scheduleAudioReconnect(otherUser, state);
      }
    };

    audioPeerConnections.set(otherUser, peerConnection);
    return peerConnection;
  }

  async function ensureLocalAudioTracks(peerConnection: RTCPeerConnection): Promise<boolean> {
    const stream = await ensureLocalAudioStream();
    if (!stream) {
      return false;
    }

    const existingIds = new Set(
      peerConnection.getSenders().map((sender) => sender.track?.id).filter((id): id is string => Boolean(id))
    );

    for (const track of stream.getAudioTracks()) {
      if (existingIds.has(track.id)) {
        continue;
      }

      peerConnection.addTrack(track, stream);
    }

    return true;
  }

  async function startAudioOffer(otherUser: string) {
    if (!canReconnectAudioWith(otherUser)) {
      return;
    }

    try {
      const peerConnection = await createAudioPeerConnection(otherUser);
      const hasTracks = await ensureLocalAudioTracks(peerConnection);
      if (!hasTracks) {
        return;
      }

      const offer = await peerConnection.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
      await peerConnection.setLocalDescription(offer);
      publishAudioSignal(otherUser, offer);
    } catch (error) {
      console.error(`[GroupDM] Failed to create audio offer for ${otherUser}:`, error);
    }
  }

  async function ensureAudioConnectionWithPeer(otherUser: string) {
    const selfAudio = audioStates.value.find((entry) => entry.user === username.value);
    const peerAudio = audioStates.value.find((entry) => entry.user === otherUser);
    if (!selfAudio?.joined || !peerAudio?.joined) {
      return;
    }

    await createAudioPeerConnection(otherUser);
    if (shouldInitiateAudioWithUser(otherUser)) {
      await startAudioOffer(otherUser);
    }
  }

  async function handleIncomingAudioSignal(fromUser: string, signal: RTCSessionDescriptionInit | RTCIceCandidateInit) {
    const selfAudio = audioStates.value.find((entry) => entry.user === username.value);
    if (!selfAudio?.joined) {
      return;
    }

    try {
      const peerConnection = await createAudioPeerConnection(fromUser);

      if ('type' in signal && signal.type) {
        await peerConnection.setRemoteDescription(signal);
        await flushPendingIceCandidates(fromUser, peerConnection);
        if (signal.type === 'offer') {
          const hasTracks = await ensureLocalAudioTracks(peerConnection);
          if (!hasTracks) {
            return;
          }

          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          publishAudioSignal(fromUser, answer);
        }
        return;
      }

      if ('candidate' in signal && signal.candidate) {
        if (!peerConnection.remoteDescription) {
          const queued = pendingRemoteIceCandidates.get(fromUser) ?? [];
          queued.push(signal);
          pendingRemoteIceCandidates.set(fromUser, queued);
          return;
        }

        await peerConnection.addIceCandidate(new RTCIceCandidate(signal));
      }
    } catch (error) {
      console.error(`[GroupDM] Failed to process audio signal from ${fromUser}:`, error);
    }
  }

  function publishGameState(nextGame: GroupGameState | null) {
    const group = activeGroup.value;
    if (!group) {
      return;
    }

    for (const member of group.members) {
      if (member === username.value) {
        continue;
      }

      publishToUser(member, {
        type: 'game-state',
        groupId: group.id,
        game: nextGame,
      });
    }
  }

  function publishGameChallenge(challenge: GroupGameChallenge) {
    const group = activeGroup.value;
    if (!group) {
      return;
    }

    for (const member of group.members) {
      if (member === username.value) {
        continue;
      }

      publishToUser(member, {
        type: 'game-challenge',
        groupId: group.id,
        challenge,
      });
    }
  }

  function publishGameChallengeResponse(challengeId: string, accepted: boolean) {
    const group = activeGroup.value;
    if (!group) {
      return;
    }

    for (const member of group.members) {
      if (member === username.value) {
        continue;
      }

      publishToUser(member, {
        type: 'game-challenge-response',
        groupId: group.id,
        challengeId,
        from: username.value,
        accepted,
      });
    }
  }

  function publishGameRelay(payload: string) {
    const group = activeGroup.value;
    if (!group) {
      return;
    }

    for (const member of group.members) {
      if (member === username.value) {
        continue;
      }

      publishToUser(member, {
        type: 'game-relay',
        groupId: group.id,
        from: username.value,
        payload,
      });
    }
  }

  function addSystemMessage(text: string) {
    messages.value = [...messages.value, {
      user: 'SYSTEM',
      message: text,
      isSystem: true,
      effect: 'none',
      duration: 0,
      messageId: createId('group-system'),
    }];
  }

  function setActiveGroup(next: GroupDMGroup | null) {
    const previousGroupId = activeGroup.value?.id ?? null;
    activeGroup.value = next;
    if (previousGroupId && (!next || next.id !== previousGroupId)) {
      closeAllAudioConnections();
      stopLocalAudioStream();
    }

    if (!next) {
      messages.value = [];
      activeGame.value = null;
      audioStates.value = [];
      pendingGameChallenges.value = [];
      gameEvents.value = [];
      outgoingGameChallenges.clear();
      gameEventSequence = 0;
    }
  }

  function ensureCurrentUserAudioDefaults() {
    if (!activeGroup.value) {
      return;
    }

    const existing = audioStates.value.find((entry) => entry.user === username.value);
    if (existing) {
      return;
    }

    upsertAudioState({
      user: username.value,
      joined: false,
      micMuted: false,
      soundMuted: false,
    });
  }

  function requestGroupTunnel(targetUser: string): boolean {
    if (!targetUser || targetUser === username.value) {
      return false;
    }

    if (activeGroup.value) {
      return false;
    }

    const group: GroupDMGroup = {
      id: createId('group'),
      owner: username.value,
      members: [username.value],
      createdAt: Date.now(),
    };

    setActiveGroup(group);
    ensureCurrentUserAudioDefaults();
    addSystemMessage(`Group tunnel created. Invite sent to ${targetUser}.`);

    const inviteId = createId('invite');
    publishToUser(targetUser, {
      type: 'invite',
      inviteId,
      groupId: group.id,
      from: username.value,
      owner: username.value,
      members: [...group.members],
      timestamp: Date.now(),
    });

    return true;
  }

  function inviteToGroup(targetUser: string): boolean {
    const group = activeGroup.value;
    if (!group || !targetUser || targetUser === username.value) {
      return false;
    }

    if (group.members.includes(targetUser)) {
      return false;
    }

    if (group.members.length >= MAX_GROUP_MEMBERS) {
      return false;
    }

    const inviteId = createId('invite');
    publishToUser(targetUser, {
      type: 'invite',
      inviteId,
      groupId: group.id,
      from: username.value,
      owner: group.owner,
      members: [...group.members],
      timestamp: Date.now(),
    });

    addSystemMessage(`Invite sent to ${targetUser}.`);
    return true;
  }

  function sendGroupMessage(message: string) {
    const group = activeGroup.value;
    const trimmed = message.trim();
    if (!group || !trimmed) {
      return;
    }

    const payload: ChatMessage = {
      user: username.value,
      message: trimmed,
      effect: 'none',
      duration: 0,
      messageId: createId('group-msg'),
    };

    messages.value = [...messages.value, payload];

    for (const member of group.members) {
      if (member === username.value) {
        continue;
      }

      publishToUser(member, {
        type: 'chat',
        groupId: group.id,
        message: payload,
      });
    }
  }

  function acceptInvite(inviteId: string): boolean {
    const invite = pendingInvites.value.find((entry) => entry.id === inviteId);
    if (!invite) {
      return false;
    }

    if (activeGroup.value) {
      publishToUser(invite.from, {
        type: 'invite-response',
        inviteId: invite.id,
        groupId: invite.groupId,
        from: username.value,
        accepted: false,
      });
      pendingInvites.value = pendingInvites.value.filter((entry) => entry.id !== inviteId);
      return false;
    }

    const nextMembers = ensureUniqueMembers([...invite.members, username.value]);
    if (nextMembers.length > MAX_GROUP_MEMBERS) {
      return false;
    }

    setActiveGroup({
      id: invite.groupId,
      owner: invite.owner,
      members: nextMembers,
      createdAt: invite.timestamp,
    });
    ensureCurrentUserAudioDefaults();

    pendingInvites.value = pendingInvites.value.filter((entry) => entry.id !== inviteId);

    publishToUser(invite.from, {
      type: 'invite-response',
      inviteId: invite.id,
      groupId: invite.groupId,
      from: username.value,
      accepted: true,
    });

    addSystemMessage(`Joined group tunnel from ${invite.from}.`);
    return true;
  }

  function rejectInvite(inviteId: string): boolean {
    const invite = pendingInvites.value.find((entry) => entry.id === inviteId);
    if (!invite) {
      return false;
    }

    pendingInvites.value = pendingInvites.value.filter((entry) => entry.id !== inviteId);

    publishToUser(invite.from, {
      type: 'invite-response',
      inviteId: invite.id,
      groupId: invite.groupId,
      from: username.value,
      accepted: false,
    });

    return true;
  }

  function leaveGroup() {
    const group = activeGroup.value;
    if (!group) {
      return;
    }

    if (group.owner === username.value) {
      for (const member of group.members) {
        if (member === username.value) {
          continue;
        }

        publishToUser(member, {
          type: 'end',
          groupId: group.id,
          from: username.value,
        });
      }

      setActiveGroup(null);
      return;
    }

    for (const member of group.members) {
      if (member === username.value) {
        continue;
      }

      publishToUser(member, {
        type: 'leave',
        groupId: group.id,
        from: username.value,
      });
    }

    setActiveGroup(null);
  }

  async function joinAudio() {
    if (!activeGroup.value) {
      return;
    }

    const stream = await ensureLocalAudioStream();
    if (!stream) {
      return;
    }

    const existing = audioStates.value.find((entry) => entry.user === username.value);
    const micMuted = existing?.micMuted ?? false;
    const soundMuted = existing?.soundMuted ?? false;
    for (const track of stream.getAudioTracks()) {
      track.enabled = !micMuted;
    }

    upsertAudioState({ user: username.value, joined: true, micMuted, soundMuted });
    applySoundMutedToRemoteElements(soundMuted);
    publishAudioState(username.value, true, micMuted, soundMuted);

    const group = activeGroup.value;
    if (!group) {
      return;
    }

    for (const member of group.members) {
      if (member === username.value) {
        continue;
      }

      resetAudioReconnectState(member);
      await ensureAudioConnectionWithPeer(member);
    }
  }

  function leaveAudio() {
    if (!activeGroup.value) {
      return;
    }

    const existing = audioStates.value.find((entry) => entry.user === username.value);
    const micMuted = existing?.micMuted ?? false;
    const soundMuted = existing?.soundMuted ?? false;
    for (const member of [...audioReconnectTimers.keys()]) {
      resetAudioReconnectState(member);
    }
    closeAllAudioConnections();
    stopLocalAudioStream();
    upsertAudioState({ user: username.value, joined: false, micMuted, soundMuted });
    publishAudioState(username.value, false, micMuted, soundMuted);
  }

  function setMicMuted(muted: boolean) {
    if (!activeGroup.value) {
      return;
    }

    const existing = audioStates.value.find((entry) => entry.user === username.value);
    if (!existing?.joined) {
      return;
    }

    upsertAudioState({
      user: username.value,
      joined: true,
      micMuted: muted,
      soundMuted: existing.soundMuted,
    });

    if (localAudioStream) {
      for (const track of localAudioStream.getAudioTracks()) {
        track.enabled = !muted;
      }
    }

    publishAudioState(username.value, true, muted, existing.soundMuted);
  }

  function setSoundMuted(muted: boolean) {
    if (!activeGroup.value) {
      return;
    }

    const existing = audioStates.value.find((entry) => entry.user === username.value);
    if (!existing?.joined) {
      return;
    }

    upsertAudioState({
      user: username.value,
      joined: true,
      micMuted: existing.micMuted,
      soundMuted: muted,
    });

    applySoundMutedToRemoteElements(muted);
    publishAudioState(username.value, true, existing.micMuted, muted);
  }

  function challengeUserToGame(targetUser: string, kind: GroupGameKind): boolean {
    const group = activeGroup.value;
    if (!group || group.members.length < 2 || activeGame.value) {
      return false;
    }

    if (!group.members.includes(targetUser) || targetUser === username.value) {
      return false;
    }

    const challenge: GroupGameChallenge = {
      id: createId('game-challenge'),
      kind,
      from: username.value,
      to: targetUser,
      createdAt: Date.now(),
    };

    outgoingGameChallenges.set(challenge.id, challenge);
    publishGameChallenge(challenge);
    addSystemMessage(`Challenge sent: ${username.value} vs ${targetUser} (${kind.toUpperCase()})`);
    return true;
  }

  function respondGameChallenge(challengeId: string, accepted: boolean): boolean {
    const challenge = pendingGameChallenges.value.find((entry) => entry.id === challengeId);
    if (!challenge) {
      return false;
    }

    pendingGameChallenges.value = pendingGameChallenges.value.filter((entry) => entry.id !== challengeId);

    if (!accepted || activeGame.value) {
      publishGameChallengeResponse(challengeId, false);
      return false;
    }

    const nextGame: GroupGameState = {
      kind: challenge.kind,
      players: [challenge.from, challenge.to],
      challengeId: challenge.id,
    };

    activeGame.value = nextGame;
    gameEvents.value = [];
    gameEventSequence = 0;
    publishGameState(nextGame);
    publishGameChallengeResponse(challenge.id, true);
    addSystemMessage(`Challenge accepted: ${challenge.from} vs ${challenge.to} (${challenge.kind.toUpperCase()})`);
    return true;
  }

  function relayGameMessage(payload: string): boolean {
    const game = activeGame.value;
    if (!game || !payload) {
      return false;
    }

    if (!game.players.includes(username.value)) {
      return false;
    }

    appendGameEvent(username.value, payload);
    publishGameRelay(payload);
    return true;
  }

  function stopGame() {
    if (!activeGroup.value) {
      return;
    }

    activeGame.value = null;
    gameEvents.value = [];
    gameEventSequence = 0;
    pendingGameChallenges.value = [];
    outgoingGameChallenges.clear();
    publishGameState(null);
  }

  function handleIncoming(payload: GroupSignalMessage) {
    if (payload.type === 'invite') {
      if (activeGroup.value) {
        publishToUser(payload.from, {
          type: 'invite-response',
          inviteId: payload.inviteId,
          groupId: payload.groupId,
          from: username.value,
          accepted: false,
        });
        return;
      }

      pendingInvites.value = [
        ...pendingInvites.value.filter((entry) => entry.id !== payload.inviteId),
        {
          id: payload.inviteId,
          groupId: payload.groupId,
          from: payload.from,
          owner: payload.owner,
          members: ensureUniqueMembers(payload.members),
          timestamp: payload.timestamp,
        },
      ];
      return;
    }

    if (payload.type === 'invite-response') {
      const group = activeGroup.value;
      if (!group || group.id !== payload.groupId || !payload.accepted) {
        if (!payload.accepted) {
          addSystemMessage(`${payload.from} declined your group invite.`);
        }
        return;
      }

      if (!group.members.includes(payload.from) && group.members.length < MAX_GROUP_MEMBERS) {
        const nextGroup: GroupDMGroup = {
          ...group,
          members: ensureUniqueMembers([...group.members, payload.from]),
        };
        setActiveGroup(nextGroup);
        publishGroupSync(nextGroup);
        addSystemMessage(`${payload.from} joined the group.`);
      }
      return;
    }

    if (payload.type === 'sync') {
      const group = payload.group;
      if (activeGroup.value && activeGroup.value.id !== group.id) {
        return;
      }

      const nextMembers = ensureUniqueMembers(group.members);
      const previousMembers = new Set(activeGroup.value?.members ?? []);
      setActiveGroup({
        ...group,
        members: nextMembers,
      });

      for (const member of previousMembers) {
        if (!nextMembers.includes(member)) {
          closePeerConnectionForUser(member);
        }
      }

      audioStates.value = audioStates.value.filter((entry) => nextMembers.includes(entry.user));
      if (activeGame.value && activeGame.value.players.some((player) => !nextMembers.includes(player))) {
        activeGame.value = null;
        gameEvents.value = [];
        gameEventSequence = 0;
      }
      pendingGameChallenges.value = pendingGameChallenges.value.filter((challenge) => nextMembers.includes(challenge.from) && nextMembers.includes(challenge.to));
      ensureCurrentUserAudioDefaults();

      const selfAudio = audioStates.value.find((entry) => entry.user === username.value);
      if (selfAudio?.joined) {
        for (const member of nextMembers) {
          if (member === username.value) {
            continue;
          }
          void ensureAudioConnectionWithPeer(member);
        }
      }
      return;
    }

    if (payload.type === 'chat') {
      const group = activeGroup.value;
      if (!group || group.id !== payload.groupId) {
        return;
      }

      messages.value = [...messages.value, payload.message];
      return;
    }

    if (payload.type === 'leave') {
      const group = activeGroup.value;
      if (!group || group.id !== payload.groupId) {
        return;
      }

      if (!group.members.includes(payload.from)) {
        return;
      }

      const nextGroup: GroupDMGroup = {
        ...group,
        members: group.members.filter((member) => member !== payload.from),
      };

      removeAudioState(payload.from);
      closePeerConnectionForUser(payload.from);
      if (activeGame.value && activeGame.value.players.includes(payload.from)) {
        activeGame.value = null;
        gameEvents.value = [];
        gameEventSequence = 0;
      }
      pendingGameChallenges.value = pendingGameChallenges.value.filter((challenge) => challenge.from !== payload.from && challenge.to !== payload.from);

      setActiveGroup(nextGroup);
      if (group.owner === username.value) {
        publishGroupSync(nextGroup);
      }
      addSystemMessage(`${payload.from} left the group.`);
      return;
    }

    if (payload.type === 'end') {
      const group = activeGroup.value;
      if (!group || group.id !== payload.groupId) {
        return;
      }

      setActiveGroup(null);
      addSystemMessage('Group owner ended the group tunnel.');
      return;
    }

    if (payload.type === 'audio-state') {
      const group = activeGroup.value;
      if (!group || group.id !== payload.groupId) {
        return;
      }

      upsertAudioState({
        user: payload.user,
        joined: payload.joined,
        micMuted: payload.micMuted,
        soundMuted: payload.soundMuted,
      });

      if (payload.user === username.value) {
        return;
      }

      if (!payload.joined) {
        closePeerConnectionForUser(payload.user);
        return;
      }

      const selfAudio = audioStates.value.find((entry) => entry.user === username.value);
      if (!selfAudio?.joined) {
        return;
      }

      resetAudioReconnectState(payload.user);
      void startAudioOffer(payload.user);
      return;
    }

    if (payload.type === 'audio-signal') {
      const group = activeGroup.value;
      if (!group || group.id !== payload.groupId) {
        return;
      }

      if (!group.members.includes(payload.from)) {
        return;
      }

      void handleIncomingAudioSignal(payload.from, payload.signal);
      return;
    }

    if (payload.type === 'game-state') {
      const group = activeGroup.value;
      if (!group || group.id !== payload.groupId) {
        return;
      }

      activeGame.value = payload.game;
      gameEvents.value = [];
      gameEventSequence = 0;
      if (!payload.game) {
        pendingGameChallenges.value = [];
        outgoingGameChallenges.clear();
      }
      return;
    }

    if (payload.type === 'game-challenge') {
      const group = activeGroup.value;
      if (!group || group.id !== payload.groupId || activeGame.value) {
        return;
      }

      if (payload.challenge.to !== username.value) {
        return;
      }

      pendingGameChallenges.value = [
        ...pendingGameChallenges.value.filter((entry) => entry.id !== payload.challenge.id),
        payload.challenge,
      ];
      return;
    }

    if (payload.type === 'game-challenge-response') {
      const group = activeGroup.value;
      if (!group || group.id !== payload.groupId) {
        return;
      }

      const challenge = outgoingGameChallenges.get(payload.challengeId);
      if (!challenge) {
        return;
      }

      outgoingGameChallenges.delete(payload.challengeId);
      if (!payload.accepted) {
        addSystemMessage(`${payload.from} declined your ${challenge.kind.toUpperCase()} challenge.`);
        return;
      }

      const nextGame: GroupGameState = {
        kind: challenge.kind,
        players: [challenge.from, challenge.to],
        challengeId: challenge.id,
      };

      activeGame.value = nextGame;
      gameEvents.value = [];
      gameEventSequence = 0;
      publishGameState(nextGame);
      return;
    }

    if (payload.type === 'game-relay') {
      const group = activeGroup.value;
      if (!group || group.id !== payload.groupId || !activeGame.value) {
        return;
      }

      if (!activeGame.value.players.includes(payload.from)) {
        return;
      }

      appendGameEvent(payload.from, payload.payload);
    }
  }

  function initializeSubscriptions() {
    if (!mqttClient) {
      return;
    }

    mqttClient.subscribe(incomingTopic());

    if (messageHandlerRegistered) {
      return;
    }

    const handler = (topic: string, payload: Buffer) => {
      if (topic !== incomingTopic()) {
        return;
      }

      try {
        const parsed = JSON.parse(payload.toString()) as GroupSignalMessage;
        handleIncoming(parsed);
      } catch (error) {
        console.error('[GroupDM] Failed to parse message:', error);
      }
    };

    messageHandler = handler;
    mqttClient.on('message', handler);
    messageHandlerRegistered = true;
  }

  onConnect(() => {
    initializeSubscriptions();
  });

  function cleanup() {
    for (const user of [...audioReconnectTimers.keys()]) {
      resetAudioReconnectState(user);
    }
    pendingRemoteIceCandidates.clear();
    closeAllAudioConnections();
    stopLocalAudioStream();

    if (!mqttClient) {
      return;
    }

    try {
      mqttClient.unsubscribe(incomingTopic());
    } catch {
      // Ignore unsubscribe failures.
    }

    if (messageHandlerRegistered && messageHandler) {
      mqttClient.off('message', messageHandler);
      messageHandlerRegistered = false;
      messageHandler = null;
    }
  }

  return {
    activeGroup,
    pendingInvites,
    messages,
    activeGame,
    audioStates,
    pendingGameChallenges,
    gameEvents,
    maxMembers: MAX_GROUP_MEMBERS,
    requestGroupTunnel,
    inviteToGroup,
    acceptInvite,
    rejectInvite,
    sendGroupMessage,
    joinAudio,
    leaveAudio,
    setMicMuted,
    setSoundMuted,
    challengeUserToGame,
    respondGameChallenge,
    relayGameMessage,
    stopGame,
    leaveGroup,
    cleanup,
  };
}
