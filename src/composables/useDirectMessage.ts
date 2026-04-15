import { ref, computed } from 'vue';
import type { AudioConfig } from '../types/chat';
import type {
  DMRequest,
  AudioCallRequest,
  VideoCallRequest,
  FileTransferState,
  DMChat,
  DMNotice
} from '../types/directMessage';
import mqtt from 'mqtt';
import { NO_WEBCAM_DEVICE_ID, NO_MIC_DEVICE_ID } from './useMediaDevices';

interface RTCConnection {
  peerConnection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  isInitiator: boolean;
  audioSenders: RTCRtpSender[];
  videoSenders: RTCRtpSender[];
  audioReceivers: RTCRtpReceiver[];
  videoReceivers: RTCRtpReceiver[];
}

export function useDirectMessage(
  username: { value: string },
  _roomId: string,
  mqttClient: mqtt.MqttClient | null,
  onConnect: (callback: () => void) => void,
  audioConfig: AudioConfig | null = null,
  options?: { runtimeMode?: 'full' | 'presence' }
) {
  // State
  const pendingRequests = ref<DMRequest[]>([]);
  const pendingAudioCalls = ref<AudioCallRequest[]>([]);
  const pendingVideoCalls = ref<VideoCallRequest[]>([]);
  const outgoingAudioCalls = ref<AudioCallRequest[]>([]);
  const outgoingVideoCalls = ref<VideoCallRequest[]>([]);
  const activeChats = ref<Map<string, DMChat>>(new Map());
  const outgoingRequests = ref<string[]>([]);
  const deniedRequests = ref<string[]>([]);
  const notices = ref<DMNotice[]>([]);
  const rtcConnections = new Map<string, RTCConnection>();
  const signalQueue = new Map<string, any[]>();
  const pendingIceCandidates = new Map<string, RTCIceCandidateInit[]>();
  const callTimers = new Map<string, NodeJS.Timeout>();
  const pendingOutgoingFiles = new Map<string, { user: string; file: File }>();
  const pendingTextMessages = new Map<string, Array<{ messageId: string; message: string; effect: string; duration: number }>>();
  let messageHandlerRegistered = false;
  let noticeIdCounter = 0;
  const deniedRequestTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  const isPresenceRuntime = options?.runtimeMode === 'presence';

  function dmLog(message: string, details?: unknown) {
    const mode = isPresenceRuntime ? 'presence' : 'full';
    const prefix = `[DM:${mode}:${username.value || 'unknown'}]`;
    if (details === undefined) {
      console.log(`${prefix} ${message}`);
      return;
    }

    console.log(`${prefix} ${message}`, details);
  }

  function createEmptyChat(user: string): DMChat {
    return {
      user,
      messages: [],
      dataChannel: null,
      isConnected: false,
      pendingDisplayMessages: [],
      isTyping: false,
      audioEnabled: false,
      videoEnabled: false,
      localMediaStream: null,
      remoteMediaStream: null,
      fileTransfers: new Map(),
      callStartTime: null,
      callDuration: 0,
      videoCallActive: false,
    };
  }

  function ensurePresenceChat(user: string) {
    if (activeChats.value.has(user)) {
      return;
    }

    setOrUpdateChat(user, createEmptyChat(user));
  }

  function flashDeniedRequest(user: string, timeout = 1800) {
    if (!deniedRequests.value.includes(user)) {
      deniedRequests.value = [...deniedRequests.value, user];
    }

    const existingTimeout = deniedRequestTimeouts.get(user);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const nextTimeout = setTimeout(() => {
      deniedRequests.value = deniedRequests.value.filter((entry) => entry !== user);
      deniedRequestTimeouts.delete(user);
    }, timeout);

    deniedRequestTimeouts.set(user, nextTimeout);
  }

  function pushNotice(
    message: string,
    type?: 'audio-call' | 'video-call' | 'call-status' | 'info' | 'file-offer',
    from?: string,
    fileId?: string,
    timeout = 4000
  ) {
    const id = ++noticeIdCounter;
    notices.value = [...notices.value, { id, message, type, from, fileId }];

    if (timeout > 0) {
      setTimeout(() => {
        notices.value = notices.value.filter((n) => n.id !== id);
      }, timeout);
    }
  }

  function clearCallRequestNotice(fromUser: string, type: 'audio-call' | 'video-call') {
    notices.value = notices.value.filter((notice) => {
      if (notice.type !== type) {
        return true;
      }

      return notice.from !== fromUser;
    });
  }

  // Start call duration timer
  function startCallTimer(user: string) {
    const chat = activeChats.value.get(user);
    if (!chat) return;

    // Clear any existing timer
    if (callTimers.has(user)) {
      clearInterval(callTimers.get(user)!);
    }

    chat.callStartTime = Date.now();
    chat.callDuration = 0;
    setOrUpdateChat(user, chat);

    const timer = setInterval(() => {
      if (chat.callStartTime) {
        chat.callDuration = Math.floor((Date.now() - chat.callStartTime) / 1000);
        setOrUpdateChat(user, chat);
      }
    }, 1000);

    callTimers.set(user, timer);
  }

  // Stop call duration timer
  function stopCallTimer(user: string) {
    const chat = activeChats.value.get(user);
    if (chat) {
      chat.callStartTime = null;
      chat.callDuration = 0;
      setOrUpdateChat(user, chat);
    }

    if (callTimers.has(user)) {
      clearInterval(callTimers.get(user)!);
      callTimers.delete(user);
    }
  }

  // Format call duration
  function formatCallDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  // RTCConfiguration with STUN servers
  const rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302'] },
      { urls: ['stun:stun1.l.google.com:19302'] },
      { urls: ['stun:stun2.l.google.com:19302'] }
    ]
  };

  // Topics for signaling
  function getSignalTopic(toUser: string) {
    return `agent_lobby/dm_signal/${username.value}/${toUser}`;
  }

  function getIncomingSignalTopic() {
    return `agent_lobby/dm_signal/+/${username.value}`;
  }

  // Initialize subscriptions when connected
  function initializeSubscriptions() {
    if (!mqttClient) return;

    mqttClient.subscribe(getIncomingSignalTopic());

    // Register the message handler if not already registered
    if (!messageHandlerRegistered) {
      mqttClient.on('message', (topic: string, payload: Buffer) => {
        handleMQTTMessage(topic, payload);
      });

      messageHandlerRegistered = true;
    }
  }

  // Handle MQTT signaling messages
  function handleMQTTMessage(topic: string, payload: Buffer) {
    const raw = payload.toString();

    // Check if it's a DM signal message
    const dmSignalMatch = topic.match(
      new RegExp(`agent_lobby/dm_signal/([^/]+)/${username.value}$`)
    );
    if (dmSignalMatch) {
      const fromUser = dmSignalMatch[1];
      try {
        const data = JSON.parse(raw);
        handleSignalingMessage(fromUser, data);
      } catch (e) {
        console.error('Failed to parse signaling message:', e);
      }
      return;
    }
  }

  // Handle signaling messages (request, offer, answer, ice candidates)
  async function handleSignalingMessage(fromUser: string, data: any) {
    if (data.type === 'request') {
      handleDMRequest(fromUser);
    } else if (data.type === 'accept') {
      outgoingRequests.value = outgoingRequests.value.filter((user) => user !== fromUser);
      if (isPresenceRuntime) {
        ensurePresenceChat(fromUser);
        return;
      }
      void startDMAsInitiator(fromUser);
    } else if (data.type === 'reject') {
      outgoingRequests.value = outgoingRequests.value.filter((user) => user !== fromUser);
      flashDeniedRequest(fromUser);
      pushNotice(`${fromUser} denied your DM request.`);
      closeDM(fromUser, false);
    } else if (data.type === 'cancel') {
      const hadPending = pendingRequests.value.some((r) => r.from === fromUser);
      pendingRequests.value = pendingRequests.value.filter((r) => r.from !== fromUser);
      if (hadPending) {
        pushNotice(`${fromUser} cancelled the DM request.`);
      }
    } else if (data.type === 'close') {
      // Remote peer explicitly closed this DM thread.
      closeDM(fromUser, false);
    } else if (data.type === 'audio-request') {
      if (isPresenceRuntime) {
        return;
      }
      // Create peer connection and handle offer from audio request
      let rtcConn = rtcConnections.get(fromUser);
      if (!rtcConn) {
        rtcConn = createRTCConnection(fromUser, false);
        rtcConnections.set(fromUser, rtcConn);
      }

      if (data.offer) {
        console.log('[DMRTC] signaling:audio-request', {
          fromUser,
          hasOffer: true,
          signalingState: rtcConn.peerConnection.signalingState,
        });
        try {
          await setRemoteDescriptionSafely(rtcConn.peerConnection, data.offer, 'audio-request');
        } catch (e) {
          console.error('Failed to set remote description for audio request:', e);
        }
      }

      // Add to pending audio calls
      const chat = activeChats.value.get(fromUser);
      if (chat) {
        // Remove if already pending
        pendingAudioCalls.value = pendingAudioCalls.value.filter(r => r.from !== fromUser);
        pendingAudioCalls.value.push({ from: fromUser, timestamp: Date.now() });
        clearCallRequestNotice(fromUser, 'audio-call');
        pushNotice(`${fromUser} is requesting an audio call`, 'audio-call', fromUser, undefined, 0);
      }
    } else if (data.type === 'accept-audio') {
      if (isPresenceRuntime) {
        return;
      }
      pendingAudioCalls.value = pendingAudioCalls.value.filter(r => r.from !== fromUser);
      clearCallRequestNotice(fromUser, 'audio-call');
      // Acceptor accepted our audio call, handle their answer if present
      const rtcConn = rtcConnections.get(fromUser);
      if (rtcConn && data.answer) {
        console.log('[DMRTC] signaling:accept-audio', {
          fromUser,
          hasAnswer: true,
          signalingState: rtcConn.peerConnection.signalingState,
        });
        try {
          await waitForStableSignalingState(rtcConn.peerConnection);
          await setRemoteDescriptionSafely(rtcConn.peerConnection, data.answer, 'accept-audio');
        } catch (e) {
          console.error('Failed to set remote description for accept-audio:', e);
        }
      }
      pushNotice(`${fromUser} accepted your audio call`, 'call-status', fromUser);
    } else if (data.type === 'audio-reject') {
      if (isPresenceRuntime) {
        return;
      }
      pendingAudioCalls.value = pendingAudioCalls.value.filter(r => r.from !== fromUser);
      outgoingAudioCalls.value = outgoingAudioCalls.value.filter(r => r.from !== fromUser);
      clearCallRequestNotice(fromUser, 'audio-call');
      pushNotice(`${fromUser} declined your audio call request.`, 'call-status', fromUser);
    } else if (data.type === 'video-request') {
      if (isPresenceRuntime) {
        return;
      }
      dmLog(`received video-request from ${fromUser}`, {
        hasOffer: Boolean(data.offer),
      });
      // Create peer connection and handle offer from video request.
      let rtcConn = rtcConnections.get(fromUser);
      if (!rtcConn) {
        rtcConn = createRTCConnection(fromUser, false);
        rtcConnections.set(fromUser, rtcConn);
      }

      if (data.offer) {
        console.log('[DMRTC] signaling:video-request', {
          fromUser,
          hasOffer: true,
          signalingState: rtcConn.peerConnection.signalingState,
        });
        try {
          await setRemoteDescriptionSafely(rtcConn.peerConnection, data.offer, 'video-request');
        } catch (e) {
          console.error('Failed to set remote description for video request:', e);
        }
      }

      // Add to pending video calls
      const chat = activeChats.value.get(fromUser);
      if (chat) {
        // Remove if already pending
        pendingVideoCalls.value = pendingVideoCalls.value.filter(r => r.from !== fromUser);
        pendingVideoCalls.value.push({ from: fromUser, timestamp: Date.now() });
        clearCallRequestNotice(fromUser, 'video-call');

        try {
          await acquireLocalMediaStream(fromUser, true);
        } catch (videoPreviewError) {
          console.warn('Failed to initialize local video preview for incoming video request:', videoPreviewError);
        }

        pushNotice(`${fromUser} is requesting a video call`, 'video-call', fromUser, undefined, 0);
      }
    } else if (data.type === 'video-reject') {
      if (isPresenceRuntime) {
        return;
      }
      pendingVideoCalls.value = pendingVideoCalls.value.filter(r => r.from !== fromUser);
      outgoingVideoCalls.value = outgoingVideoCalls.value.filter(r => r.from !== fromUser);
      clearCallRequestNotice(fromUser, 'video-call');
      endCall(fromUser, false);
      pushNotice(`${fromUser} declined your video call request.`, 'call-status', fromUser);
    } else if (data.type === 'accept-video') {
      if (isPresenceRuntime) {
        return;
      }
      pendingVideoCalls.value = pendingVideoCalls.value.filter(r => r.from !== fromUser);
      outgoingVideoCalls.value = outgoingVideoCalls.value.filter(r => r.from !== fromUser);
      clearCallRequestNotice(fromUser, 'video-call');
      // Acceptor accepted our video call and may include an SDP answer.
      const rtcConn = rtcConnections.get(fromUser);
      if (rtcConn && data.answer) {
        console.log('[DMRTC] signaling:accept-video', {
          fromUser,
          hasAnswer: true,
          signalingState: rtcConn.peerConnection.signalingState,
        });
        try {
          await waitForStableSignalingState(rtcConn.peerConnection);
          await setRemoteDescriptionSafely(rtcConn.peerConnection, data.answer, 'accept-video');
        } catch (e) {
          console.error('Failed to set remote description for accept-video:', e);
        }
      }
      pushNotice(`${fromUser} accepted your video call`, 'call-status', fromUser);
    } else if (data.type === 'end-call') {
      if (isPresenceRuntime) {
        return;
      }
      endCall(fromUser, false);
      pushNotice(`${fromUser} ended the active call.`, 'call-status', fromUser);
    } else if (data.type === 'offer' || data.type === 'answer' || data.candidate) {
      if (isPresenceRuntime) {
        return;
      }
      // Handle offer/answer/ICE candidate
      const rtcConn = rtcConnections.get(fromUser);
      if (rtcConn) {
        handleSignal(rtcConn.peerConnection, data);
      } else {
        // Queue the signal until the peer is created
        if (!signalQueue.has(fromUser)) {
          signalQueue.set(fromUser, []);
        }
        signalQueue.get(fromUser)!.push(data);
      }
    }
  }

  async function waitForStableSignalingState(peerConnection: RTCPeerConnection, timeoutMs = 1500) {
    if (peerConnection.signalingState === 'stable') {
      return;
    }

    console.log('[DMRTC] waitForStableSignalingState:start', {
      signalingState: peerConnection.signalingState,
      timeoutMs,
    });

    await new Promise<void>((resolve) => {
      let settled = false;

      const cleanup = () => {
        peerConnection.removeEventListener('signalingstatechange', onStateChange);
      };

      const complete = () => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        console.log('[DMRTC] waitForStableSignalingState:done', {
          signalingState: peerConnection.signalingState,
        });
        resolve();
      };

      const onStateChange = () => {
        if (peerConnection.signalingState === 'stable') {
          complete();
        }
      };

      peerConnection.addEventListener('signalingstatechange', onStateChange);
      setTimeout(() => complete(), timeoutMs);
    });
  }

  async function setRemoteDescriptionSafely(
    peerConnection: RTCPeerConnection,
    description: RTCSessionDescriptionInit,
    context: string
  ) {
    console.log('[DMRTC] setRemoteDescriptionSafely:start', {
      context,
      type: description.type,
      signalingState: peerConnection.signalingState,
    });
    // If an offer arrives while we're not stable, roll back first to avoid glare races.
    if (description.type === 'offer' && peerConnection.signalingState !== 'stable') {
      dmLog(`setRemoteDescriptionSafely rollback before offer (${context})`, {
        signalingState: peerConnection.signalingState,
      });
      console.log('[DMRTC] setRemoteDescriptionSafely:rollback', {
        context,
        signalingState: peerConnection.signalingState,
      });
      try {
        await peerConnection.setLocalDescription({ type: 'rollback' });
      } catch (rollbackError) {
        console.warn(`Failed to rollback local description (${context}):`, rollbackError);
      }
      await waitForStableSignalingState(peerConnection);
    }

    await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
    console.log('[DMRTC] setRemoteDescriptionSafely:done', {
      context,
      type: description.type,
      signalingState: peerConnection.signalingState,
    });

    // Applying remote SDP unlocks ICE candidate application for this peer.
    await flushPendingIceCandidates(peerConnection, `setRemoteDescriptionSafely:${context}`);
  }

  function resolveUserFromPeerConnection(peerConnection: RTCPeerConnection): string | null {
    return Array.from(rtcConnections.entries()).find(([, conn]) => conn.peerConnection === peerConnection)?.[0] ?? null;
  }

  async function flushPendingIceCandidates(peerConnection: RTCPeerConnection, context: string) {
    const user = resolveUserFromPeerConnection(peerConnection);
    if (!user) {
      return;
    }

    const pending = pendingIceCandidates.get(user);
    if (!pending || pending.length === 0) {
      return;
    }

    if (!peerConnection.remoteDescription) {
      return;
    }

    pendingIceCandidates.delete(user);
    console.log('[DMRTC] flushPendingIceCandidates:start', {
      user,
      count: pending.length,
      context,
    });

    for (const candidate of pending) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.debug('Pending ICE candidate error:', error);
      }
    }

    console.log('[DMRTC] flushPendingIceCandidates:done', {
      user,
      context,
    });
  }

  // Apply a signaling message (offer, answer, or ICE candidate)
  async function handleSignal(peerConnection: RTCPeerConnection, data: any) {
    try {
      if (data.type === 'offer') {
        console.log('[DMRTC] handleSignal:offer', {
          signalingState: peerConnection.signalingState,
        });
        await setRemoteDescriptionSafely(peerConnection, data, 'handleSignal:offer');
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        console.log('[DMRTC] handleSignal:offer:created-answer', {
          signalingState: peerConnection.signalingState,
        });

        // Send answer back via MQTT
        const fromUser = Array.from(rtcConnections.entries()).find(
          ([_, conn]) => conn.peerConnection === peerConnection
        )?.[0];
        if (fromUser && mqttClient) {
          mqttClient.publish(getSignalTopic(fromUser), JSON.stringify(answer));
        }
      } else if (data.type === 'answer') {
        console.log('[DMRTC] handleSignal:answer', {
          signalingState: peerConnection.signalingState,
        });
        await waitForStableSignalingState(peerConnection);
        await setRemoteDescriptionSafely(peerConnection, data, 'handleSignal:answer');
      } else if (data.candidate) {
        const user = resolveUserFromPeerConnection(peerConnection);
        if (!peerConnection.remoteDescription) {
          if (user) {
            const pending = pendingIceCandidates.get(user) ?? [];
            pending.push(data);
            pendingIceCandidates.set(user, pending);
            console.log('[DMRTC] queueIceCandidate:remoteDescription-null', {
              user,
              pendingCount: pending.length,
            });
          }
          return;
        }

        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(data));
        } catch (e) {
          // Ignore duplicate or late ICE candidates
          console.debug('ICE candidate error:', e);
        }
      }
    } catch (e) {
      console.error('Error handling signal:', e);
    }
  }

  // Create and setup an RTCPeerConnection
  function createRTCConnection(otherUser: string, isInitiator: boolean): RTCConnection {
    const peerConnection = new RTCPeerConnection(rtcConfig);
    console.log('[DMRTC] createRTCConnection', {
      user: otherUser,
      isInitiator,
      signalingState: peerConnection.signalingState,
      connectionState: peerConnection.connectionState,
      iceConnectionState: peerConnection.iceConnectionState,
    });

    // If initiator, create data channel
    if (isInitiator) {
      const dataChannel = peerConnection.createDataChannel('dm', {
        ordered: true
      });
      setupDataChannel(dataChannel, otherUser);
    }

    // Handle incoming data channels (from non-initiator)
    peerConnection.ondatachannel = (event) => {
      const dataChannel = event.channel;
      setupDataChannel(dataChannel, otherUser);
    };

    // Setup remote media streams
    setupRemoteMediaStreams(otherUser, peerConnection);

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && mqttClient) {
        mqttClient.publish(
          getSignalTopic(otherUser),
          JSON.stringify(event.candidate)
        );
      }
    };

    peerConnection.onconnectionstatechange = () => {
      console.log('[DMRTC] connectionstatechange', {
        user: otherUser,
        signalingState: peerConnection.signalingState,
        connectionState: peerConnection.connectionState,
        iceConnectionState: peerConnection.iceConnectionState,
      });
      const chat = activeChats.value.get(otherUser);
      if (chat) {
        chat.isConnected = peerConnection.connectionState === 'connected';
      }

      if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'closed') {
        closeDM(otherUser, false);
      }
    };

    peerConnection.onsignalingstatechange = () => {
      console.log('[DMRTC] signalingstatechange', {
        user: otherUser,
        signalingState: peerConnection.signalingState,
        connectionState: peerConnection.connectionState,
        iceConnectionState: peerConnection.iceConnectionState,
      });
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log('[DMRTC] iceconnectionstatechange', {
        user: otherUser,
        signalingState: peerConnection.signalingState,
        connectionState: peerConnection.connectionState,
        iceConnectionState: peerConnection.iceConnectionState,
      });
    };

    return {
      peerConnection,
      dataChannel: null,
      isInitiator,
      audioSenders: [],
      videoSenders: [],
      audioReceivers: [],
      videoReceivers: []
    };
  }

  // Setup data channel event handlers
  function setupDataChannel(dataChannel: RTCDataChannel, otherUser: string) {
    const rtcConn = rtcConnections.get(otherUser);
    if (rtcConn) {
      rtcConn.dataChannel = dataChannel;
    }

    dataChannel.onopen = () => {
      dmLog(`data channel opened with ${otherUser}`);
      const chat = activeChats.value.get(otherUser);
      if (chat) {
        chat.isConnected = true;
        chat.dataChannel = dataChannel;
        setOrUpdateChat(otherUser, chat);
      }

      flushPendingTextMessages(otherUser, dataChannel);
    };

    dataChannel.onmessage = (event) => {
      try {
        // Handle binary data (file chunks)
        if (event.data instanceof ArrayBuffer) {
          handleIncomingBinaryChunk(otherUser, event.data);
          return;
        }

        if (event.data instanceof Blob) {
          void event.data.arrayBuffer().then((buffer) => {
            handleIncomingBinaryChunk(otherUser, buffer);
          });
          return;
        }

        // Handle text messages (JSON)
        const data = JSON.parse(event.data);
        const chat = activeChats.value.get(otherUser);
        if (!chat) return;

        // Check if this is a file transfer message
        if (handleFileTransferMessage(data, otherUser, dataChannel)) {
          return;
        }

        if (data.type === 'audio-toggle') {
          chat.audioEnabled = Boolean(data.enabled);
          setOrUpdateChat(otherUser, chat);
          return;
        }

        if (data.type === 'video-toggle') {
          chat.videoEnabled = Boolean(data.enabled);
          chat.videoCallActive = Boolean(data.enabled);
          setOrUpdateChat(otherUser, chat);
          return;
        }

        if (data.type === 'end-call') {
          endCall(otherUser, false);
          pushNotice(`${otherUser} ended the active call.`, 'call-status', otherUser);
          return;
        }

        // Check if this is a typing indicator
        if (data.typing) {
          chat.isTyping = true;
          return;
        }

        // Check if this is a stop_typing indicator
        if (data.stop_typing) {
          chat.isTyping = false;
          return;
        }

        // Check if this is an ACK message
        if (data.ack) {
          // Remove message from pending display queue when peer has animated it
          chat.pendingDisplayMessages = chat.pendingDisplayMessages.filter(
            (msg) => msg.id !== data.msgId
          );
          return;
        }

        // Regular message - add to chat with effect metadata
        chat.messages.push({
          user: otherUser,
          message: data.m || '',
          isSystem: false,
          effect: data.e || 'none',
          duration: data.t || 0,
          messageId: data.id
        });
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    dataChannel.onerror = (event) => {
      console.error(`[DM] Data channel error with ${otherUser}:`, event);
    };

    dataChannel.onclose = () => {
      closeDM(otherUser, false);
    };
  }

  function normalizeFileId(rawId: string): string {
    return rawId.replace(/\0/g, '').trim();
  }

  function createFileId(): string {
    const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(16).padStart(12, '0')}-${Math.random().toString(16).slice(2, 26).padEnd(23, '0')}`;
    return uuid.slice(0, 36).padEnd(36, '0');
  }

  function markFileSaved(user: string, fileId: string) {
    if (isPresenceRuntime) return;

    const chat = activeChats.value.get(user);
    if (!chat) return;

    const transfer = chat.fileTransfers.get(fileId);
    if (!transfer) return;

    transfer.savedToDisk = true;
    setOrUpdateChat(user, chat);
  }

  function removeFileTransfer(user: string, fileId: string) {
    if (isPresenceRuntime) return;

    const chat = activeChats.value.get(user);
    if (!chat) return;

    chat.fileTransfers.delete(fileId);
    setOrUpdateChat(user, chat);
  }

  function handleIncomingBinaryChunk(otherUser: string, data: ArrayBuffer) {
    if (data.byteLength < 40) {
      console.warn('[DM] Ignoring malformed file chunk: too short');
      return;
    }

    const view = new Uint8Array(data);
    const fileId = normalizeFileId(new TextDecoder().decode(view.slice(0, 36)));
    const chunkIndex = new DataView(data).getUint32(36, false);
    const chunkData = view.slice(40);

    const chat = activeChats.value.get(otherUser);
    if (!chat) return;

    const transfer = chat.fileTransfers.get(fileId);
    if (!transfer || transfer.direction !== 'incoming') return;
    if (transfer.chunks.has(chunkIndex)) {
      return;
    }

    transfer.chunks.set(chunkIndex, chunkData);
    transfer.receivedSize += chunkData.length;
    transfer.progress = transfer.totalSize > 0
      ? Math.min(100, (transfer.receivedSize / transfer.totalSize) * 100)
      : 100;
    transfer.status = 'in-progress';
    setOrUpdateChat(otherUser, chat);
  }

  async function waitForDataChannelBackpressure(
    channel: RTCDataChannel,
    maxBufferedAmount = 512 * 1024,
    timeoutMs = 10000
  ) {
    const start = Date.now();
    while (channel.readyState === 'open' && channel.bufferedAmount > maxBufferedAmount) {
      if (Date.now() - start >= timeoutMs) {
        throw new Error('Timed out waiting for RTC data channel buffer to drain');
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 8);
      });
    }
  }

  async function streamFileToPeer(otherUser: string, fileId: string, file: File) {
    const chat = activeChats.value.get(otherUser);
    const sendChannel = resolveOpenDataChannel(otherUser, chat?.dataChannel);
    if (!chat || !sendChannel || sendChannel.readyState !== 'open') {
      pushNotice('File transfer requires active connection');
      return;
    }

    const transfer = chat.fileTransfers.get(fileId);
    if (!transfer) return;

    const chunkSize = 16384;
    const buffer = await file.arrayBuffer();
    const totalChunks = Math.ceil(buffer.byteLength / chunkSize);

    transfer.totalChunks = totalChunks;
    transfer.totalSize = file.size;
    transfer.status = 'in-progress';
    transfer.progress = 0;
    setOrUpdateChat(otherUser, chat);

    try {
      await waitForDataChannelBackpressure(sendChannel);
      sendChannel.send(JSON.stringify({
        type: 'file-start',
        id: fileId,
        filename: file.name,
        mimeType: file.type,
        totalSize: file.size,
        totalChunks
      }));

      const fileBuffer = new Uint8Array(buffer);
      const idBytes = new TextEncoder().encode(fileId);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, buffer.byteLength);
        const chunk = fileBuffer.slice(start, end);

        const chunkMessage = new ArrayBuffer(40 + chunk.byteLength);
        const chunkView = new Uint8Array(chunkMessage);
        chunkView.set(idBytes, 0);
        new DataView(chunkMessage).setUint32(36, i);
        chunkView.set(chunk, 40);

        await waitForDataChannelBackpressure(sendChannel);
        sendChannel.send(chunkMessage);

        transfer.receivedSize = end;
        transfer.progress = ((i + 1) / totalChunks) * 100;
        setOrUpdateChat(otherUser, chat);
      }

      await waitForDataChannelBackpressure(sendChannel);
      sendChannel.send(JSON.stringify({
        type: 'file-complete',
        id: fileId
      }));

      // Wait for explicit receiver acknowledgement before marking sender-side completion.
      transfer.progress = 100;
      setOrUpdateChat(otherUser, chat);
    } catch (error) {
      console.error('File transfer error:', error);
      transfer.status = 'failed';
      setOrUpdateChat(otherUser, chat);

      try {
        if (sendChannel.readyState === 'open') {
          sendChannel.send(JSON.stringify({
            type: 'file-error',
            id: fileId
          }));
        }
      } catch {
        // Ignore follow-up send errors on broken channels.
      }

      pushNotice(`Failed to send file to ${otherUser}`);
    } finally {
      pendingOutgoingFiles.delete(fileId);
    }
  }

  // Handle file transfer via data channel messages
  function resolveOpenDataChannel(otherUser: string, preferred?: RTCDataChannel | null): RTCDataChannel | null {
    if (preferred && preferred.readyState === 'open') {
      return preferred;
    }

    const chat = activeChats.value.get(otherUser);
    if (chat?.dataChannel && chat.dataChannel.readyState === 'open') {
      return chat.dataChannel;
    }

    const rtcConn = rtcConnections.get(otherUser);
    if (rtcConn?.dataChannel && rtcConn.dataChannel.readyState === 'open') {
      return rtcConn.dataChannel;
    }

    return null;
  }

  function handleFileTransferMessage(data: any, otherUser: string, sourceChannel?: RTCDataChannel): boolean {
    const chat = activeChats.value.get(otherUser);
    if (!chat) return false;

    if (data.type === 'file-offer') {
      const incomingOffer: FileTransferState = {
        id: data.id,
        filename: data.filename,
        mimeType: data.mimeType,
        totalSize: data.totalSize,
        receivedSize: 0,
        totalChunks: data.totalChunks,
        chunks: new Map(),
        progress: 0,
        direction: 'incoming',
        status: 'pending',
        savedToDisk: false
      };
      chat.fileTransfers.set(data.id, incomingOffer);
      setOrUpdateChat(otherUser, chat);
      pushNotice(`${otherUser} wants to send "${data.filename}"`, 'file-offer', otherUser, data.id, 10000);
      return true;
    }

    if (data.type === 'file-accept') {
      const pending = pendingOutgoingFiles.get(data.id);
      if (!pending || pending.user !== otherUser) return true;

      void streamFileToPeer(otherUser, data.id, pending.file);
      return true;
    }

    if (data.type === 'file-reject') {
      const transfer = chat.fileTransfers.get(data.id);
      if (transfer) {
        transfer.status = 'rejected';
        setOrUpdateChat(otherUser, chat);
        pushNotice(`${otherUser} declined the file transfer.`, 'info', otherUser);
      }
      pendingOutgoingFiles.delete(data.id);
      return true;
    }

    if (data.type === 'file-start') {
      const transfer = chat.fileTransfers.get(data.id);
      if (transfer) {
        transfer.totalChunks = data.totalChunks;
        transfer.totalSize = data.totalSize;
        transfer.mimeType = data.mimeType;
        transfer.status = 'in-progress';
        transfer.progress = 0;
        setOrUpdateChat(otherUser, chat);
      }
      return true;
    }

    if (data.type === 'file-complete') {
      const transfer = chat.fileTransfers.get(data.id);
      if (transfer) {
        const hasAllChunks = transfer.chunks.size === transfer.totalChunks && transfer.receivedSize >= transfer.totalSize;

        transfer.status = hasAllChunks ? 'completed' : 'failed';
        transfer.progress = hasAllChunks ? 100 : transfer.progress;
        setOrUpdateChat(otherUser, chat);

        const ackChannel = resolveOpenDataChannel(otherUser, sourceChannel);
        if (ackChannel) {
          ackChannel.send(JSON.stringify({
            type: 'file-received',
            id: data.id,
            ok: hasAllChunks
          }));
        }
      }
      return true;
    }

    if (data.type === 'file-received') {
      const transfer = chat.fileTransfers.get(data.id);
      if (transfer && transfer.direction === 'outgoing') {
        if (data.ok === false) {
          transfer.status = 'failed';
          pushNotice(`${otherUser} reported an incomplete file transfer.`);
        } else {
          transfer.status = 'completed';
          transfer.progress = 100;
        }
        setOrUpdateChat(otherUser, chat);
      }
      return true;
    }

    if (data.type === 'file-error') {
      const transfer = chat.fileTransfers.get(data.id);
      if (transfer) {
        transfer.status = 'failed';
        setOrUpdateChat(otherUser, chat);
      }
      pendingOutgoingFiles.delete(data.id);
      return true;
    }

    return false;
  }

  function queueTextMessage(user: string, payload: { messageId: string; message: string; effect: string; duration: number }) {
    const existing = pendingTextMessages.get(user) ?? [];
    existing.push(payload);
    pendingTextMessages.set(user, existing);
    dmLog(`queued message for ${user}`, { pending: existing.length, messageId: payload.messageId });
  }

  function flushPendingTextMessages(user: string, channel?: RTCDataChannel | null) {
    const queued = pendingTextMessages.get(user);
    if (!queued || queued.length === 0) {
      return;
    }

    const chat = activeChats.value.get(user);
    const sendChannel = resolveOpenDataChannel(user, channel ?? chat?.dataChannel);
    if (!chat || !sendChannel || sendChannel.readyState !== 'open') {
      return;
    }

    dmLog(`flushing queued messages for ${user}`, { count: queued.length });

    for (const payload of queued) {
      try {
        sendChannel.send(JSON.stringify({
          u: username.value,
          m: payload.message,
          e: payload.effect,
          t: payload.duration,
          id: payload.messageId
        }));

        chat.pendingDisplayMessages.push({
          id: payload.messageId,
          text: payload.message
        });

        chat.messages.push({
          user: username.value,
          message: payload.message,
          isSystem: false,
          effect: payload.effect,
          duration: payload.duration,
          messageId: payload.messageId
        });
      } catch (error) {
        console.error(`Failed to flush queued message to ${user}:`, error);
        return;
      }
    }

    setOrUpdateChat(user, chat);
    pendingTextMessages.delete(user);
  }

  async function ensureDirectLine(targetUser: string) {
    if (isPresenceRuntime || !mqttClient) {
      return;
    }

    ensurePresenceChat(targetUser);

    const existingConnection = rtcConnections.get(targetUser);
    const existingChannel = resolveOpenDataChannel(targetUser, existingConnection?.dataChannel ?? null);
    if (existingChannel && existingChannel.readyState === 'open') {
      return;
    }

    let rtcConn = existingConnection;
    if (!rtcConn) {
      rtcConn = createRTCConnection(targetUser, true);
      rtcConnections.set(targetUser, rtcConn);
      dmLog(`created initiator rtc connection for ${targetUser} during ensureDirectLine`);
    }

    const localDescriptionType = rtcConn.peerConnection.localDescription?.type;
    if (localDescriptionType === 'offer') {
      return;
    }

    try {
      const offer = await rtcConn.peerConnection.createOffer();
      await rtcConn.peerConnection.setLocalDescription(offer);
      mqttClient.publish(getSignalTopic(targetUser), JSON.stringify(offer));
      dmLog(`published bootstrap offer for ${targetUser}`);
    } catch (error) {
      console.error(`Failed to bootstrap direct line for ${targetUser}:`, error);
    }
  }

  function acceptFileTransfer(fromUser: string, fileId: string) {
    if (isPresenceRuntime) return;

    const chat = activeChats.value.get(fromUser);
    const channel = resolveOpenDataChannel(fromUser, chat?.dataChannel ?? null);
    if (!chat || !channel || channel.readyState !== 'open') return;

    const transfer = chat.fileTransfers.get(fileId);
    if (!transfer || transfer.direction !== 'incoming') return;

    transfer.status = 'in-progress';
    setOrUpdateChat(fromUser, chat);

    try {
      channel.send(JSON.stringify({
        type: 'file-accept',
        id: fileId
      }));
    } catch (e) {
      console.error('Failed to accept file transfer:', e);
      transfer.status = 'failed';
      setOrUpdateChat(fromUser, chat);
    }
  }

  function rejectFileTransfer(fromUser: string, fileId: string) {
    if (isPresenceRuntime) return;

    const chat = activeChats.value.get(fromUser);
    const channel = resolveOpenDataChannel(fromUser, chat?.dataChannel ?? null);
    if (!chat || !channel || channel.readyState !== 'open') return;

    const transfer = chat.fileTransfers.get(fileId);
    if (!transfer || transfer.direction !== 'incoming') return;

    transfer.status = 'rejected';
    setOrUpdateChat(fromUser, chat);

    try {
      channel.send(JSON.stringify({
        type: 'file-reject',
        id: fileId
      }));
    } catch (e) {
      console.error('Failed to reject file transfer:', e);
    }
  }

  // Send a file offer to another user
  async function sendFile(toUser: string, file: File) {
    if (isPresenceRuntime) return;

    const chat = activeChats.value.get(toUser);
    const channel = resolveOpenDataChannel(toUser, chat?.dataChannel ?? null);
    if (!chat || !channel || channel.readyState !== 'open') {
      pushNotice('File transfer requires active connection');
      return;
    }

    const fileId = createFileId();
    const chunkSize = 16384;
    const totalChunks = Math.ceil(file.size / chunkSize);

    const fileTransfer: FileTransferState = {
      id: fileId,
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      totalSize: file.size,
      receivedSize: 0,
      totalChunks,
      chunks: new Map(),
      progress: 0,
      direction: 'outgoing',
      status: 'awaiting-accept',
      savedToDisk: false
    };

    chat.fileTransfers.set(fileId, fileTransfer);
    setOrUpdateChat(toUser, chat);
    pendingOutgoingFiles.set(fileId, { user: toUser, file });

    try {
      channel.send(JSON.stringify({
        type: 'file-offer',
        id: fileId,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        totalSize: file.size,
        totalChunks
      }));
    } catch (error) {
      console.error('File transfer offer error:', error);
      fileTransfer.status = 'failed';
      setOrUpdateChat(toUser, chat);
      pendingOutgoingFiles.delete(fileId);
      pushNotice(`Failed to offer file to ${toUser}`);
    }
  }

  // Flush queued signals for a user
  function flushSignalQueue(user: string, peerConnection: RTCPeerConnection) {
    const queue = signalQueue.get(user);
    if (queue) {
      queue.forEach(signal => {
        handleSignal(peerConnection, signal);
      });
      signalQueue.delete(user);
    }
  }

  function setOrUpdateChat(user: string, chat: DMChat) {
    const nextChats = new Map(activeChats.value);
    nextChats.set(user, chat);
    activeChats.value = nextChats;
  }

  function removeChat(user: string) {
    if (!activeChats.value.has(user)) return;
    const nextChats = new Map(activeChats.value);
    nextChats.delete(user);
    activeChats.value = nextChats;
  }

  // Request DM from another user - create initiator peer
  async function requestDM(targetUser: string) {
    if (!mqttClient) return;

    // Clear stale state, then send a DM request notice.
    closeDM(targetUser, false);
    deniedRequests.value = deniedRequests.value.filter((user) => user !== targetUser);
    if (!outgoingRequests.value.includes(targetUser)) {
      outgoingRequests.value = [...outgoingRequests.value, targetUser];
    }
    mqttClient.publish(
      getSignalTopic(targetUser),
      JSON.stringify({ type: 'request' })
    );
  }

  async function startDMAsInitiator(targetUser: string) {
    if (isPresenceRuntime) {
      ensurePresenceChat(targetUser);
      return;
    }

    // Reset stale state before creating a fresh peer.
    closeDM(targetUser, false);

    const rtcConn = createRTCConnection(targetUser, true);
    rtcConnections.set(targetUser, rtcConn);

    // Create and send offer
    try {
      const offer = await rtcConn.peerConnection.createOffer();
      await rtcConn.peerConnection.setLocalDescription(offer);

      if (mqttClient) {
        mqttClient.publish(getSignalTopic(targetUser), JSON.stringify(offer));
        dmLog(`published initiator offer to ${targetUser}`);
      }

      // Flush any queued signals (answers/candidates)
      flushSignalQueue(targetUser, rtcConn.peerConnection);

      // Store in active chats
      ensurePresenceChat(targetUser);
    } catch (e) {
      console.error('Error creating offer:', e);
    }
  }

  // Accept incoming DM request - create non-initiator peer to respond to offer
  function acceptDM(fromUser: string) {
    if (!mqttClient) return;

    mqttClient.publish(
      getSignalTopic(fromUser),
      JSON.stringify({ type: 'accept' })
    );

    // Reset stale state but keep the pending request until chat is re-created.
    closeDM(fromUser, false, false);

    if (isPresenceRuntime) {
      ensurePresenceChat(fromUser);
      pendingRequests.value = pendingRequests.value.filter(r => r.from !== fromUser);
      return;
    }

    const rtcConn = createRTCConnection(fromUser, false);
    rtcConnections.set(fromUser, rtcConn);

    // Flush any queued signals (offer from requester)
    flushSignalQueue(fromUser, rtcConn.peerConnection);

    // Store in active chats
    ensurePresenceChat(fromUser);

    // Remove pending only after the chat tab exists.
    pendingRequests.value = pendingRequests.value.filter(r => r.from !== fromUser);
  }

  // Reject incoming DM request
  function rejectDM(fromUser: string) {
    pendingRequests.value = pendingRequests.value.filter(r => r.from !== fromUser);

    if (!mqttClient) return;

    mqttClient.publish(
      getSignalTopic(fromUser),
      JSON.stringify({ type: 'reject' })
    );

    closeDM(fromUser, false);
  }

  function cancelDMRequest(targetUser: string) {
    const wasWaiting = outgoingRequests.value.includes(targetUser);
    outgoingRequests.value = outgoingRequests.value.filter((user) => user !== targetUser);

    if (!wasWaiting || !mqttClient) return;

    mqttClient.publish(
      getSignalTopic(targetUser),
      JSON.stringify({ type: 'cancel' })
    );
  }

  // Reject incoming audio call
  function rejectAudioCall(fromUser: string) {
    if (isPresenceRuntime) return;

    pendingAudioCalls.value = pendingAudioCalls.value.filter(r => r.from !== fromUser);
    clearCallRequestNotice(fromUser, 'audio-call');

    if (!mqttClient) return;

    mqttClient.publish(
      getSignalTopic(fromUser),
      JSON.stringify({ type: 'audio-reject' })
    );
  }

  // Reject incoming video call
  function rejectVideoCall(fromUser: string) {
    if (isPresenceRuntime) return;

    pendingVideoCalls.value = pendingVideoCalls.value.filter(r => r.from !== fromUser);
    clearCallRequestNotice(fromUser, 'video-call');
    cleanupPendingVideoPreview(fromUser);

    if (!mqttClient) return;

    mqttClient.publish(
      getSignalTopic(fromUser),
      JSON.stringify({ type: 'video-reject' })
    );
  }

  // Send a DM message
  function sendDMMessage(toUser: string, message: string, effect: string = 'none') {
    if (isPresenceRuntime) return;

    const chat = activeChats.value.get(toUser);
    if (!chat) {
      dmLog(`sendDMMessage aborted: no chat for ${toUser}`);
      return;
    }

    // Generate unique message ID
    const messageId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Calculate animation duration based on effect
    const getAnimationDuration = (eff: string, textLength: number): number => {
      const len = Math.max(1, textLength);
      switch (eff) {
        case 'typewriter':
          return 1000 + len * 50;
        case 'scan':
          return 1000 + len * 20;
        case 'codex':
          return 1500 + len * 30;
        case 'glitch':
          return 1200 + len * 20;
        case 'flames':
          return 1800 + len * 40;
        case 'pacman':
          return 2200 + len * 20;
        case 'bubbles':
          return 2500 + len * 30;
        case 'smoke':
          return 2600 + len * 30;
        default:
          return 0;
      }
    };

    const duration = getAnimationDuration(effect, message.length);
    const sendChannel = resolveOpenDataChannel(toUser, chat.dataChannel);

    if (!sendChannel || sendChannel.readyState !== 'open') {
      queueTextMessage(toUser, { messageId, message, effect, duration });
      void ensureDirectLine(toUser);
      pushNotice(`Re-establishing direct line with ${toUser}...`, 'info', toUser, undefined, 1800);
      return;
    }

    try {
      sendChannel.send(JSON.stringify({
        u: username.value,
        m: message,
        e: effect,
        t: duration,
        id: messageId
      }));
      // Add to pending display messages queue
      chat.pendingDisplayMessages.push({
        id: messageId,
        text: message
      });
      // Add to local message history with effect info
      chat.messages.push({
        user: username.value,
        message: message,
        isSystem: false,
        effect: effect,
        duration: duration,
        messageId: messageId
      });
      setOrUpdateChat(toUser, chat);
    } catch (e) {
      console.error('Failed to send message:', e);
    }
  }

  // Send typing indicator
  function sendTyping(toUser: string) {
    if (isPresenceRuntime) return;

    const chat = activeChats.value.get(toUser);
    if (!chat || !chat.dataChannel || chat.dataChannel.readyState !== 'open') return;

    try {
      chat.dataChannel.send(JSON.stringify({ typing: true }));
    } catch (e) {
      console.error('Failed to send typing indicator:', e);
    }
  }

  // Send stop typing indicator
  function sendStopTyping(toUser: string) {
    if (isPresenceRuntime) return;

    const chat = activeChats.value.get(toUser);
    if (!chat || !chat.dataChannel || chat.dataChannel.readyState !== 'open') return;

    try {
      chat.dataChannel.send(JSON.stringify({ stop_typing: true }));
    } catch (e) {
      console.error('Failed to send stop typing indicator:', e);
    }
  }

  // Close a DM connection
  function closeDM(otherUser: string, notifyPeer = true, clearPendingRequest = true) {
    try {
      if (notifyPeer && mqttClient) {
        mqttClient.publish(getSignalTopic(otherUser), JSON.stringify({ type: 'close' }));
      }
    } catch (e) {
      console.debug('Failed to notify peer of DM close:', e);
    }

    // Stop all media streams first
    const chat = activeChats.value.get(otherUser);
    if (chat) {
      // Stop local media tracks
      if (chat.localMediaStream) {
        chat.localMediaStream.getTracks().forEach(track => {
          track.stop();
          console.log('Stopped local track:', track.kind);
        });
        chat.localMediaStream = null;
      }

      // Stop remote media tracks
      if (chat.remoteMediaStream) {
        chat.remoteMediaStream.getTracks().forEach(track => {
          track.stop();
          console.log('Stopped remote track:', track.kind);
        });
        chat.remoteMediaStream = null;
      }
    }

    const rtcConn = rtcConnections.get(otherUser);
    if (rtcConn) {
      try {
        if (rtcConn.dataChannel) {
          rtcConn.dataChannel.onopen = null;
          rtcConn.dataChannel.onmessage = null;
          rtcConn.dataChannel.onerror = null;
          rtcConn.dataChannel.onclose = null;
          rtcConn.dataChannel.close();
        }
      } catch (e) {
        console.debug(`Failed closing data channel with ${otherUser}:`, e);
      }

      try {
        rtcConn.peerConnection.ondatachannel = null;
        rtcConn.peerConnection.onicecandidate = null;
        rtcConn.peerConnection.onconnectionstatechange = null;
        rtcConn.peerConnection.close();
      } catch (e) {
        console.debug(`Failed closing peer connection with ${otherUser}:`, e);
      }
    }

    rtcConnections.delete(otherUser);
    pendingIceCandidates.delete(otherUser);
    signalQueue.delete(otherUser);
    stopCallTimer(otherUser);
    outgoingRequests.value = outgoingRequests.value.filter((user) => user !== otherUser);

    // Drop queued outgoing file offers for this peer.
    pendingOutgoingFiles.forEach((pending, fileId) => {
      if (pending.user === otherUser) {
        pendingOutgoingFiles.delete(fileId);
      }
    });

    removeChat(otherUser);
    if (clearPendingRequest) {
      pendingRequests.value = pendingRequests.value.filter(r => r.from !== otherUser);
    }
  }

  // Handle incoming DM request
  function handleDMRequest(fromUser: string) {
    // Check if already pending or active
    const alreadyPending = pendingRequests.value.some(r => r.from === fromUser);
    const alreadyActive = activeChats.value.has(fromUser);

    if (!alreadyPending && !alreadyActive) {
      pendingRequests.value.push({
        from: fromUser,
        timestamp: Date.now()
      });
    }
  }

  // Cancel pending display messages (messages waiting to be animated on peer's side)
  function cancelPendingMessages(toUser: string) {
    if (isPresenceRuntime) return;

    const chat = activeChats.value.get(toUser);
    if (chat) {
      chat.pendingDisplayMessages = [];
    }
  }

  // Setup remote media streams handler
  function setupRemoteMediaStreams(user: string, peerConnection: RTCPeerConnection) {
    peerConnection.ontrack = (event) => {
      console.log(`Received ${event.track.kind} track from ${user}`, event.track);
      const chat = activeChats.value.get(user);
      if (!chat) {
        console.log('Chat not found for user:', user);
        return;
      }

      // Create a new MediaStream to hold the remote tracks
      if (!chat.remoteMediaStream) {
        console.log('Creating new remoteMediaStream for', user);
        chat.remoteMediaStream = new MediaStream();
      }

      console.log('Adding track to remoteMediaStream:', event.track.kind);
      chat.remoteMediaStream.addTrack(event.track);
      console.log('Remote stream now has', chat.remoteMediaStream.getTracks().length, 'tracks');

      // Update flags based on track kind
      if (event.track.kind === 'audio') {
        chat.audioEnabled = true;
      } else if (event.track.kind === 'video') {
        chat.videoEnabled = true;
      }

      // Replace the Map entry through helper so Vue updates consumers.
      setOrUpdateChat(user, chat);
      console.log('Triggered remoteMediaStream reactivity for', user);
    };
  }

  // Request audio call from another user
  async function requestAudioCall(targetUser: string) {
    if (isPresenceRuntime) return;

    if (!mqttClient) return;

    const chat = activeChats.value.get(targetUser);
    if (!chat) {
      dmLog(`requestAudioCall creating presence chat for ${targetUser}`);
      ensurePresenceChat(targetUser);
    }

    const activeChat = activeChats.value.get(targetUser);
    if (!activeChat) {
      pushNotice(`No active DM with ${targetUser}`);
      return;
    }

    dmLog(`requestAudioCall start for ${targetUser}`);

    try {
      // Get audio track from default or selected device
      const noMicSelected = audioConfig?.audioInputDeviceId === NO_MIC_DEVICE_ID;
      const audioConstraints: MediaTrackConstraints | boolean = noMicSelected
        ? false
        : audioConfig
          ? { deviceId: audioConfig.audioInputDeviceId ? { ideal: audioConfig.audioInputDeviceId } : undefined }
          : {};

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
      } catch (mediaError) {
        console.warn('No local audio device available, proceeding receive-only:', mediaError);
        stream = new MediaStream();
        pushNotice('Microphone unavailable — joining as listener only.');
      }

      activeChat.localMediaStream = stream;

      // Create or get peer connection and add audio tracks
      let rtcConn = rtcConnections.get(targetUser);
      if (!rtcConn) {
        rtcConn = createRTCConnection(targetUser, true);
        rtcConnections.set(targetUser, rtcConn);
      }

      stream.getAudioTracks().forEach(track => {
        rtcConn!.peerConnection.addTrack(track, stream);
      });

      // Create offer
      try {
        console.log('[DMRTC] requestAudioCall:createOffer:start', {
          targetUser,
          signalingState: rtcConn.peerConnection.signalingState,
        });
        await waitForStableSignalingState(rtcConn.peerConnection);
        const offer = await rtcConn.peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
        });
        await rtcConn.peerConnection.setLocalDescription(offer);
        console.log('[DMRTC] requestAudioCall:createOffer:done', {
          targetUser,
          signalingState: rtcConn.peerConnection.signalingState,
        });

        mqttClient!.publish(
          getSignalTopic(targetUser),
          JSON.stringify({ type: 'audio-request', offer })
        );
      } catch (e) {
        console.error('Failed to create audio offer:', e);
      }

      outgoingAudioCalls.value = [...outgoingAudioCalls.value, { from: targetUser, timestamp: Date.now() }];

      // Start call timer for initiator
      startCallTimer(targetUser);

      setOrUpdateChat(targetUser, activeChat);
      pushNotice(`Audio call requested to ${targetUser}`);
    } catch (error) {
      console.error('Failed to get audio:', error);
      pushNotice('Failed to access microphone. Check permissions.');
    }
  }

  // Accept incoming audio call
  async function acceptAudioCall(fromUser: string) {
    if (isPresenceRuntime) return;

    if (!mqttClient) return;

    // Clear from pending requests
    pendingAudioCalls.value = pendingAudioCalls.value.filter(r => r.from !== fromUser);
    clearCallRequestNotice(fromUser, 'audio-call');

    try {
      const noMicSelected = audioConfig?.audioInputDeviceId === NO_MIC_DEVICE_ID;
      const audioConstraints: MediaTrackConstraints | boolean = noMicSelected
        ? false
        : audioConfig
          ? { deviceId: audioConfig.audioInputDeviceId ? { ideal: audioConfig.audioInputDeviceId } : undefined }
          : {};

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
      } catch (mediaError) {
        console.warn('No local audio device available, proceeding receive-only:', mediaError);
        stream = new MediaStream();
        pushNotice('Microphone unavailable — joining as listener only.');
      }

      const chat = activeChats.value.get(fromUser);
      if (chat) {
        chat.localMediaStream = stream;
      }

      // Get or create peer connection and add audio tracks
      const rtcConn = rtcConnections.get(fromUser);
      if (!rtcConn) {
        console.error('No RTCConnection found when accepting audio call');
        return;
      }

      stream.getAudioTracks().forEach(track => {
        rtcConn.peerConnection.addTrack(track, stream);
      });

      // Create answer
      try {
        console.log('[DMRTC] acceptAudioCall:createAnswer:start', {
          fromUser,
          signalingState: rtcConn.peerConnection.signalingState,
        });
        const answer = await rtcConn.peerConnection.createAnswer();
        await rtcConn.peerConnection.setLocalDescription(answer);
        console.log('[DMRTC] acceptAudioCall:createAnswer:done', {
          fromUser,
          signalingState: rtcConn.peerConnection.signalingState,
        });

        // Send accept signal with answer
        mqttClient.publish(
          getSignalTopic(fromUser),
          JSON.stringify({ type: 'accept-audio', answer })
        );
      } catch (e) {
        console.error('Failed to create audio answer:', e);
      }

      // Start call duration timer
      startCallTimer(fromUser);

      pushNotice(`Audio call accepted with ${fromUser}`, 'call-status', fromUser);
    } catch (error) {
      console.error('Failed to accept audio call:', error);
      pushNotice('Failed to access microphone for audio call.');
    }
  }

  // Toggle audio stream on/off during call
  async function toggleAudioStream(user: string, enabled: boolean) {
    if (isPresenceRuntime) return;

    const chat = activeChats.value.get(user);
    if (!chat || !chat.localMediaStream) return;

    chat.localMediaStream.getAudioTracks().forEach(track => {
      track.enabled = enabled;
    });
    chat.audioEnabled = enabled;
    setOrUpdateChat(user, chat);

    // Notify peer
    try {
      if (chat.dataChannel && chat.dataChannel.readyState === 'open') {
        chat.dataChannel.send(JSON.stringify({
          type: 'audio-toggle',
          enabled
        }));
      }
    } catch (e) {
      console.error('Failed to send audio toggle:', e);
    }
  }

  async function acquireLocalMediaStream(user: string, includeVideo: boolean): Promise<MediaStream> {
    const chat = activeChats.value.get(user);
    if (!chat) {
      return new MediaStream();
    }

    const hasExistingVideo = chat.localMediaStream?.getVideoTracks().some((track) => track.readyState === 'live');
    if (includeVideo && hasExistingVideo) {
      return chat.localMediaStream as MediaStream;
    }

    const noMicSelected = audioConfig?.audioInputDeviceId === NO_MIC_DEVICE_ID;
    const audioConstraints: MediaTrackConstraints | boolean = noMicSelected
      ? false
      : audioConfig
        ? { deviceId: audioConfig.audioInputDeviceId ? { ideal: audioConfig.audioInputDeviceId } : undefined }
        : {};

    const noWebcamSelected = audioConfig?.videoInputDeviceId === NO_WEBCAM_DEVICE_ID;
    const videoConstraints: MediaTrackConstraints | boolean = includeVideo && !noWebcamSelected
      ? audioConfig
        ? { deviceId: audioConfig.videoInputDeviceId ? { ideal: audioConfig.videoInputDeviceId } : undefined }
        : {}
      : false;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: videoConstraints
      });
    } catch (mediaError) {
      console.warn('No local media devices available, proceeding receive-only:', mediaError);
      stream = new MediaStream();
      pushNotice('No mic/camera found — joining as listener only.');
    }

    chat.localMediaStream = stream;
    setOrUpdateChat(user, chat);
    return stream;
  }

  function cleanupPendingVideoPreview(user: string) {
    const chat = activeChats.value.get(user);
    if (!chat || chat.videoCallActive || !chat.localMediaStream) {
      return;
    }

    const hasVideoTrack = chat.localMediaStream.getVideoTracks().length > 0;
    if (!hasVideoTrack) {
      return;
    }

    chat.localMediaStream.getTracks().forEach((track) => track.stop());
    chat.localMediaStream = null;
    setOrUpdateChat(user, chat);
  }

  // Request video call
  async function requestVideoCall(targetUser: string) {
    if (isPresenceRuntime) return;

    if (!mqttClient) return;

    const chat = activeChats.value.get(targetUser);
    if (!chat) {
      dmLog(`requestVideoCall creating presence chat for ${targetUser}`);
      ensurePresenceChat(targetUser);
    }

    const activeChat = activeChats.value.get(targetUser);
    if (!activeChat) {
      pushNotice(`No active DM with ${targetUser}`);
      return;
    }

    dmLog(`requestVideoCall start for ${targetUser}`);

    try {
      const noMicSelected = audioConfig?.audioInputDeviceId === NO_MIC_DEVICE_ID;
      const audioConstraints: MediaTrackConstraints | boolean = noMicSelected
        ? false
        : audioConfig
          ? { deviceId: audioConfig.audioInputDeviceId ? { ideal: audioConfig.audioInputDeviceId } : undefined }
          : {};

      const noWebcamSelected = audioConfig?.videoInputDeviceId === NO_WEBCAM_DEVICE_ID;
      const videoConstraints: MediaTrackConstraints | boolean = noWebcamSelected
        ? false
        : audioConfig
          ? {
              deviceId: audioConfig.videoInputDeviceId ? { ideal: audioConfig.videoInputDeviceId } : undefined
            }
          : {};

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: videoConstraints
        });
      } catch (mediaError) {
        console.warn('No local media devices available, proceeding receive-only:', mediaError);
        stream = new MediaStream();
        pushNotice('No mic/camera found — joining as listener only.');
      }

      console.log('Initiator setting local stream for video call, tracks:', stream.getTracks());
      activeChat.localMediaStream = stream;
      activeChat.videoCallActive = true;
      setOrUpdateChat(targetUser, activeChat);

      // Add any available local tracks to peer connection
      let rtcConn = rtcConnections.get(targetUser);
      if (!rtcConn) {
        rtcConn = createRTCConnection(targetUser, true);
        rtcConnections.set(targetUser, rtcConn);
      }
      if (rtcConn) {
        console.log('Initiator adding local tracks to peer connection');
        stream.getTracks().forEach(track => {
          rtcConn.peerConnection.addTrack(track, stream);
        });

        // Explicitly renegotiate from requester, mirroring audio-request flow.
        console.log('[DMRTC] requestVideoCall:createOffer:start', {
          targetUser,
          signalingState: rtcConn.peerConnection.signalingState,
        });
        await waitForStableSignalingState(rtcConn.peerConnection);
        const offer = await rtcConn.peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await rtcConn.peerConnection.setLocalDescription(offer);
        console.log('[DMRTC] requestVideoCall:createOffer:done', {
          targetUser,
          signalingState: rtcConn.peerConnection.signalingState,
        });

        mqttClient.publish(
          getSignalTopic(targetUser),
          JSON.stringify({ type: 'video-request', offer })
        );

        dmLog(`published video-request offer to ${targetUser}`);
      }

      outgoingVideoCalls.value = [...outgoingVideoCalls.value, { from: targetUser, timestamp: Date.now() }];

      // Start call timer for initiator
      startCallTimer(targetUser);

      pushNotice(`Video call requested to ${targetUser}`);
    } catch (error) {
      console.error('Failed to start video call:', error);
      pushNotice('Failed to start video call.');
    }
  }

  // Accept incoming video call
  async function acceptVideoCall(fromUser: string) {
    if (isPresenceRuntime) return;

    if (!mqttClient) return;

    // Clear from pending requests
    pendingVideoCalls.value = pendingVideoCalls.value.filter(r => r.from !== fromUser);
    clearCallRequestNotice(fromUser, 'video-call');

    try {
      const chat = activeChats.value.get(fromUser);
      const stream = chat?.localMediaStream?.getVideoTracks().some((track) => track.readyState === 'live')
        ? chat.localMediaStream
        : await acquireLocalMediaStream(fromUser, true);

      if (chat) {
        console.log('Setting local stream for video call, tracks:', stream.getTracks());
        chat.localMediaStream = stream;
        chat.videoCallActive = true;
        setOrUpdateChat(fromUser, chat);
      }

      let rtcConn = rtcConnections.get(fromUser);
      if (!rtcConn) {
        rtcConn = createRTCConnection(fromUser, false);
        rtcConnections.set(fromUser, rtcConn);
        flushSignalQueue(fromUser, rtcConn.peerConnection);
      }

      if (rtcConn && chat) {
        // Add any available local tracks to peer connection
        console.log('Adding local tracks to peer connection');
        stream.getTracks().forEach(track => {
          rtcConn.peerConnection.addTrack(track, stream);
        });

        // Answer requester's offer (same semantics as accept-audio).
        console.log('[DMRTC] acceptVideoCall:createAnswer:start', {
          fromUser,
          signalingState: rtcConn.peerConnection.signalingState,
        });
        const answer = await rtcConn.peerConnection.createAnswer();
        await rtcConn.peerConnection.setLocalDescription(answer);
        console.log('[DMRTC] acceptVideoCall:createAnswer:done', {
          fromUser,
          signalingState: rtcConn.peerConnection.signalingState,
        });

        mqttClient.publish(
          getSignalTopic(fromUser),
          JSON.stringify({ type: 'accept-video', answer })
        );

        dmLog(`published accept-video answer to ${fromUser}`);
      }

      // Start call duration timer
      startCallTimer(fromUser);

      pushNotice(`Video call accepted with ${fromUser}`, 'call-status', fromUser);
    } catch (error) {
      console.error('Failed to accept video call:', error);
      pushNotice('Failed to accept video call.');
    }
  }

  // Toggle video stream
  async function toggleVideoStream(user: string, enabled: boolean) {
    if (isPresenceRuntime) return;

    const chat = activeChats.value.get(user);
    if (!chat || !chat.localMediaStream) return;

    chat.localMediaStream.getVideoTracks().forEach(track => {
      track.enabled = enabled;
    });
    chat.videoEnabled = enabled;
    chat.videoCallActive = enabled;
    setOrUpdateChat(user, chat);

    // Notify peer
    try {
      if (chat.dataChannel && chat.dataChannel.readyState === 'open') {
        chat.dataChannel.send(JSON.stringify({
          type: 'video-toggle',
          enabled
        }));
      }
    } catch (e) {
      console.error('Failed to send video toggle:', e);
    }
  }

  function endCall(user: string, notifyPeer = true) {
    if (isPresenceRuntime) return;

    const chat = activeChats.value.get(user);
    if (!chat) return;

    if (notifyPeer && mqttClient) {
      mqttClient.publish(
        getSignalTopic(user),
        JSON.stringify({ type: 'end-call' })
      );
    }

    if (chat.localMediaStream) {
      chat.localMediaStream.getTracks().forEach((track) => track.stop());
      chat.localMediaStream = null;
    }

    if (chat.remoteMediaStream) {
      chat.remoteMediaStream.getTracks().forEach((track) => track.stop());
      chat.remoteMediaStream = null;
    }

    const rtcConn = rtcConnections.get(user);
    if (rtcConn) {
      for (const sender of rtcConn.peerConnection.getSenders()) {
        const kind = sender.track?.kind;
        if (kind === 'audio' || kind === 'video') {
          try {
            rtcConn.peerConnection.removeTrack(sender);
          } catch {
            // Fallback: detach the sender if removeTrack isn't supported.
            void sender.replaceTrack(null).catch(() => undefined);
          }
        }
      }
    }

    chat.audioEnabled = false;
    chat.videoEnabled = false;
    chat.videoCallActive = false;
    setOrUpdateChat(user, chat);
    stopCallTimer(user);
  }

  // Cleanup on disconnect
  function cleanup() {
    activeChats.value.forEach((chat) => {
      if (chat.localMediaStream) {
        chat.localMediaStream.getTracks().forEach((track) => track.stop());
        chat.localMediaStream = null;
      }

      if (chat.remoteMediaStream) {
        chat.remoteMediaStream.getTracks().forEach((track) => track.stop());
        chat.remoteMediaStream = null;
      }
    });

    rtcConnections.forEach(rtcConn => {
      if (rtcConn.dataChannel) {
        rtcConn.dataChannel.close();
      }
      rtcConn.peerConnection.close();
    });
    rtcConnections.clear();
    pendingIceCandidates.clear();
    signalQueue.clear();
    pendingTextMessages.clear();
    pendingOutgoingFiles.clear();
    activeChats.value.clear();
    outgoingRequests.value = [];
    deniedRequests.value = [];
    pendingRequests.value = [];
    deniedRequestTimeouts.forEach((timeout) => clearTimeout(timeout));
    deniedRequestTimeouts.clear();
    messageHandlerRegistered = false;
  }

  // Initialize when connection is ready
  onConnect(() => {
    initializeSubscriptions();
  });

  return {
    pendingRequests: computed(() => pendingRequests.value),
    pendingAudioCalls: computed(() => pendingAudioCalls.value),
    pendingVideoCalls: computed(() => pendingVideoCalls.value),
    outgoingAudioCalls: computed(() => outgoingAudioCalls.value),
    outgoingVideoCalls: computed(() => outgoingVideoCalls.value),
    activeChats: computed(() => activeChats.value),
    outgoingRequests: computed(() => outgoingRequests.value),
    deniedRequests: computed(() => deniedRequests.value),
    notices: computed(() => notices.value),
    requestDM,
    cancelDMRequest,
    acceptDM,
    rejectDM,
    rejectAudioCall,
    rejectVideoCall,
    sendDMMessage,
    sendTyping,
    sendStopTyping,
    cancelPendingMessages,
    closeDM,
    requestAudioCall,
    acceptAudioCall,
    endCall,
    toggleAudioStream,
    requestVideoCall,
    acceptVideoCall,
    toggleVideoStream,
    formatCallDuration,
    sendFile,
    acceptFileTransfer,
    rejectFileTransfer,
    markFileSaved,
    removeFileTransfer,
    ensureDirectLine,
    cleanup
  };
}
