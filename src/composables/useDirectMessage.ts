import { ref, computed } from 'vue';
import type { ChatMessage, AudioConfig } from './useLobbyChat';
import mqtt from 'mqtt';
import { NO_WEBCAM_DEVICE_ID, NO_MIC_DEVICE_ID } from './useMediaDevices';

export interface DMRequest {
  from: string;
  timestamp: number;
}

export interface AudioCallRequest {
  from: string;
  timestamp: number;
}

export interface VideoCallRequest {
  from: string;
  timestamp: number;
}

export type FileTransferDirection = 'incoming' | 'outgoing';

export interface FileTransferState {
  id: string;
  filename: string;
  mimeType: string;
  totalSize: number;
  receivedSize: number;
  totalChunks: number;
  chunks: Map<number, Uint8Array>;
  progress: number;
  direction: FileTransferDirection;
  status: 'pending' | 'awaiting-accept' | 'in-progress' | 'completed' | 'rejected' | 'failed';
  savedToDisk: boolean;
}

export interface DMChat {
  user: string;
  messages: ChatMessage[];
  dataChannel: RTCDataChannel | null;
  isConnected: boolean;
  pendingDisplayMessages: Array<{ id: string; text: string }>;  // Messages waiting for peer to animate
  isTyping: boolean;  // Whether the peer is currently typing
  audioEnabled: boolean;
  videoEnabled: boolean;
  localMediaStream: MediaStream | null;
  remoteMediaStream: MediaStream | null;
  fileTransfers: Map<string, FileTransferState>;
  callStartTime: number | null;
  callDuration: number;
  videoCallActive: boolean;
}

export interface DMNotice {
  id: number;
  message: string;
  type?: 'audio-call' | 'video-call' | 'info' | 'file-offer';
  from?: string;
  fileId?: string;
}

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
  roomId: string,
  mqttClient: mqtt.MqttClient | null,
  onConnect: (callback: () => void) => void,
  audioConfig: AudioConfig | null = null
) {
  // State
  const pendingRequests = ref<DMRequest[]>([]);
  const pendingAudioCalls = ref<AudioCallRequest[]>([]);
  const pendingVideoCalls = ref<VideoCallRequest[]>([]);
  const activeChats = ref<Map<string, DMChat>>(new Map());
  const outgoingRequests = ref<string[]>([]);
  const notices = ref<DMNotice[]>([]);
  const rtcConnections = new Map<string, RTCConnection>();
  const signalQueue = new Map<string, any[]>();
  const callTimers = new Map<string, NodeJS.Timeout>();
  const pendingOutgoingFiles = new Map<string, { user: string; file: File }>();
  let messageHandlerRegistered = false;
  let noticeIdCounter = 0;

  function pushNotice(
    message: string,
    type?: 'audio-call' | 'video-call' | 'info' | 'file-offer',
    from?: string,
    fileId?: string,
    timeout = 4000
  ) {
    const id = ++noticeIdCounter;
    notices.value = [...notices.value, { id, message, type, from, fileId }];

    setTimeout(() => {
      notices.value = notices.value.filter((n) => n.id !== id);
    }, timeout);
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
    return `${roomId}_lobby/dm_signal/${username.value}/${toUser}`;
  }

  function getIncomingSignalTopic() {
    return `${roomId}_lobby/dm_signal/+/${username.value}`;
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
      new RegExp(`${roomId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_lobby/dm_signal/([^/]+)/${username.value}$`)
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
      void startDMAsInitiator(fromUser);
    } else if (data.type === 'reject') {
      outgoingRequests.value = outgoingRequests.value.filter((user) => user !== fromUser);
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
      // Create peer connection and handle offer from audio request
      let rtcConn = rtcConnections.get(fromUser);
      if (!rtcConn) {
        rtcConn = createRTCConnection(fromUser, false);
        rtcConnections.set(fromUser, rtcConn);
      }

      if (data.offer) {
        try {
          await rtcConn.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
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
        pushNotice(`${fromUser} is requesting an audio call`, 'audio-call', fromUser);
      }
    } else if (data.type === 'accept-audio') {
      // Acceptor accepted our audio call, handle their answer if present
      const rtcConn = rtcConnections.get(fromUser);
      if (rtcConn && data.answer) {
        try {
          await rtcConn.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (e) {
          console.error('Failed to set remote description for accept-audio:', e);
        }
      }
      pushNotice(`${fromUser} accepted your audio call`, 'info');
    } else if (data.type === 'audio-reject') {
      pushNotice(`${fromUser} declined your audio call request.`);
    } else if (data.type === 'video-request') {
      // Add to pending video calls
      const chat = activeChats.value.get(fromUser);
      if (chat) {
        // Remove if already pending
        pendingVideoCalls.value = pendingVideoCalls.value.filter(r => r.from !== fromUser);
        pendingVideoCalls.value.push({ from: fromUser, timestamp: Date.now() });
        pushNotice(`${fromUser} is requesting a video call`, 'video-call', fromUser);
      }
    } else if (data.type === 'video-reject') {
      pushNotice(`${fromUser} declined your video call request.`);
    } else if (data.type === 'offer' || data.type === 'answer' || data.candidate) {
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

  // Apply a signaling message (offer, answer, or ICE candidate)
  async function handleSignal(peerConnection: RTCPeerConnection, data: any) {
    try {
      if (data.type === 'offer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // Send answer back via MQTT
        const fromUser = Array.from(rtcConnections.entries()).find(
          ([_, conn]) => conn.peerConnection === peerConnection
        )?.[0];
        if (fromUser && mqttClient) {
          mqttClient.publish(getSignalTopic(fromUser), JSON.stringify(answer));
        }
      } else if (data.type === 'answer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
      } else if (data.candidate) {
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
      const chat = activeChats.value.get(otherUser);
      if (chat) {
        chat.isConnected = peerConnection.connectionState === 'connected';
      }

      if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'closed') {
        closeDM(otherUser, false);
      }
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
      console.log(`Data channel opened with ${otherUser}`);
      const chat = activeChats.value.get(otherUser);
      if (chat) {
        chat.isConnected = true;
        chat.dataChannel = dataChannel;
      }
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
        if (handleFileTransferMessage(data, otherUser)) {
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
      console.error(`Data channel error with ${otherUser}:`, event);
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
    const chat = activeChats.value.get(user);
    if (!chat) return;

    const transfer = chat.fileTransfers.get(fileId);
    if (!transfer) return;

    transfer.savedToDisk = true;
    setOrUpdateChat(user, chat);
  }

  function handleIncomingBinaryChunk(otherUser: string, data: ArrayBuffer) {
    const view = new Uint8Array(data);
    const fileId = normalizeFileId(new TextDecoder().decode(view.slice(0, 36)));
    const chunkIndex = new DataView(data).getUint32(36);
    const chunkData = view.slice(40);

    const chat = activeChats.value.get(otherUser);
    if (!chat) return;

    const transfer = chat.fileTransfers.get(fileId);
    if (!transfer || transfer.direction !== 'incoming') return;

    transfer.chunks.set(chunkIndex, chunkData);
    transfer.receivedSize += chunkData.length;
    transfer.progress = Math.min(100, (transfer.receivedSize / transfer.totalSize) * 100);
    transfer.status = 'in-progress';
    setOrUpdateChat(otherUser, chat);
  }

  async function streamFileToPeer(otherUser: string, fileId: string, file: File) {
    const chat = activeChats.value.get(otherUser);
    if (!chat || !chat.dataChannel || chat.dataChannel.readyState !== 'open') {
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
      chat.dataChannel.send(JSON.stringify({
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

        chat.dataChannel.send(chunkMessage);

        transfer.receivedSize = end;
        transfer.progress = ((i + 1) / totalChunks) * 100;
        setOrUpdateChat(otherUser, chat);
      }

      chat.dataChannel.send(JSON.stringify({
        type: 'file-complete',
        id: fileId
      }));

      transfer.status = 'completed';
      transfer.progress = 100;
      setOrUpdateChat(otherUser, chat);
    } catch (error) {
      console.error('File transfer error:', error);
      transfer.status = 'failed';
      setOrUpdateChat(otherUser, chat);

      try {
        chat.dataChannel.send(JSON.stringify({
          type: 'file-error',
          id: fileId
        }));
      } catch {
        // Ignore follow-up send errors on broken channels.
      }

      pushNotice(`Failed to send file to ${otherUser}`);
    } finally {
      pendingOutgoingFiles.delete(fileId);
    }
  }

  // Handle file transfer via data channel messages
  function handleFileTransferMessage(data: any, otherUser: string): boolean {
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
        transfer.status = 'completed';
        transfer.progress = 100;
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
      return true;
    }

    return false;
  }

  function acceptFileTransfer(fromUser: string, fileId: string) {
    const chat = activeChats.value.get(fromUser);
    if (!chat || !chat.dataChannel || chat.dataChannel.readyState !== 'open') return;

    const transfer = chat.fileTransfers.get(fileId);
    if (!transfer || transfer.direction !== 'incoming') return;

    transfer.status = 'in-progress';
    setOrUpdateChat(fromUser, chat);

    try {
      chat.dataChannel.send(JSON.stringify({
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
    const chat = activeChats.value.get(fromUser);
    if (!chat || !chat.dataChannel || chat.dataChannel.readyState !== 'open') return;

    const transfer = chat.fileTransfers.get(fileId);
    if (!transfer || transfer.direction !== 'incoming') return;

    transfer.status = 'rejected';
    setOrUpdateChat(fromUser, chat);

    try {
      chat.dataChannel.send(JSON.stringify({
        type: 'file-reject',
        id: fileId
      }));
    } catch (e) {
      console.error('Failed to reject file transfer:', e);
    }
  }

  // Send a file offer to another user
  async function sendFile(toUser: string, file: File) {
    const chat = activeChats.value.get(toUser);
    if (!chat || !chat.dataChannel || chat.dataChannel.readyState !== 'open') {
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
      chat.dataChannel.send(JSON.stringify({
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
    if (!outgoingRequests.value.includes(targetUser)) {
      outgoingRequests.value = [...outgoingRequests.value, targetUser];
    }
    mqttClient.publish(
      getSignalTopic(targetUser),
      JSON.stringify({ type: 'request' })
    );
  }

  async function startDMAsInitiator(targetUser: string) {
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
      }

      // Flush any queued signals (answers/candidates)
      flushSignalQueue(targetUser, rtcConn.peerConnection);

      // Store in active chats
      if (!activeChats.value.has(targetUser)) {
        setOrUpdateChat(targetUser, {
          user: targetUser,
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
          videoCallActive: false
        });
      }
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

    const rtcConn = createRTCConnection(fromUser, false);
    rtcConnections.set(fromUser, rtcConn);

    // Flush any queued signals (offer from requester)
    flushSignalQueue(fromUser, rtcConn.peerConnection);

    // Store in active chats
    setOrUpdateChat(fromUser, {
      user: fromUser,
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
      videoCallActive: false
    });

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
    pendingAudioCalls.value = pendingAudioCalls.value.filter(r => r.from !== fromUser);

    if (!mqttClient) return;

    mqttClient.publish(
      getSignalTopic(fromUser),
      JSON.stringify({ type: 'audio-reject' })
    );
  }

  // Reject incoming video call
  function rejectVideoCall(fromUser: string) {
    pendingVideoCalls.value = pendingVideoCalls.value.filter(r => r.from !== fromUser);

    if (!mqttClient) return;

    mqttClient.publish(
      getSignalTopic(fromUser),
      JSON.stringify({ type: 'video-reject' })
    );
  }

  // Send a DM message
  function sendDMMessage(toUser: string, message: string, effect: string = 'none') {
    const chat = activeChats.value.get(toUser);
    if (!chat || !chat.dataChannel || chat.dataChannel.readyState !== 'open') return;

    // Generate unique message ID
    const messageId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Calculate animation duration based on effect
    const getAnimationDuration = (eff: string, textLength: number): number => {
      const len = Math.max(1, textLength);
      switch (eff) {
        case 'typewriter': return 1000 + len * 50;
        case 'scan': return 1000 + len * 20;
        case 'matrix': return 1500 + len * 30;
        case 'glitch': return 1200 + len * 20;
        case 'flames': return 1800 + len * 40;
        default: return 0;
      }
    };

    const duration = getAnimationDuration(effect, message.length);

    const payload = JSON.stringify({
      u: username.value,
      m: message,
      e: effect,
      t: duration,
      id: messageId
    });

    try {
      chat.dataChannel.send(payload);
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
    } catch (e) {
      console.error('Failed to send message:', e);
    }
  }

  // Send typing indicator
  function sendTyping(toUser: string) {
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
    if (!mqttClient) return;

    const chat = activeChats.value.get(targetUser);
    if (!chat) {
      pushNotice(`No active DM with ${targetUser}`);
      return;
    }

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

      chat.localMediaStream = stream;

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
        const offer = await rtcConn.peerConnection.createOffer();
        await rtcConn.peerConnection.setLocalDescription(offer);

        mqttClient!.publish(
          getSignalTopic(targetUser),
          JSON.stringify({ type: 'audio-request', offer })
        );
      } catch (e) {
        console.error('Failed to create audio offer:', e);
      }

      // Start call timer for initiator
      startCallTimer(targetUser);

      pushNotice(`Audio call requested to ${targetUser}`);
    } catch (error) {
      console.error('Failed to get audio:', error);
      pushNotice('Failed to access microphone. Check permissions.');
    }
  }

  // Accept incoming audio call
  async function acceptAudioCall(fromUser: string) {
    if (!mqttClient) return;

    // Clear from pending requests
    pendingAudioCalls.value = pendingAudioCalls.value.filter(r => r.from !== fromUser);

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
        const answer = await rtcConn.peerConnection.createAnswer();
        await rtcConn.peerConnection.setLocalDescription(answer);

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

      pushNotice(`Audio call accepted with ${fromUser}`, 'info');
    } catch (error) {
      console.error('Failed to accept audio call:', error);
      pushNotice('Failed to access microphone for audio call.');
    }
  }

  // Toggle audio stream on/off during call
  async function toggleAudioStream(user: string, enabled: boolean) {
    const chat = activeChats.value.get(user);
    if (!chat || !chat.localMediaStream) return;

    chat.localMediaStream.getAudioTracks().forEach(track => {
      track.enabled = enabled;
    });

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

  // Request video call
  async function requestVideoCall(targetUser: string) {
    if (!mqttClient) return;

    const chat = activeChats.value.get(targetUser);
    if (!chat) {
      pushNotice(`No active DM with ${targetUser}`);
      return;
    }

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
      chat.localMediaStream = stream;
      chat.videoCallActive = true;
      setOrUpdateChat(targetUser, chat);

      // Add any available local tracks to peer connection
      const rtcConn = rtcConnections.get(targetUser);
      if (rtcConn) {
        console.log('Initiator adding local tracks to peer connection');
        stream.getTracks().forEach(track => {
          rtcConn.peerConnection.addTrack(track, stream);
        });
      }

      // Send video request signal
      mqttClient.publish(
        getSignalTopic(targetUser),
        JSON.stringify({ type: 'video-request' })
      );

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
    if (!mqttClient) return;

    // Clear from pending requests
    pendingVideoCalls.value = pendingVideoCalls.value.filter(r => r.from !== fromUser);

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

      const chat = activeChats.value.get(fromUser);
      if (chat) {
        console.log('Setting local stream for video call, tracks:', stream.getTracks());
        chat.localMediaStream = stream;
        chat.videoCallActive = true;
        setOrUpdateChat(fromUser, chat);
      }

      const rtcConn = rtcConnections.get(fromUser);
      if (rtcConn && chat) {
        // Add any available local tracks to peer connection
        console.log('Adding local tracks to peer connection');
        stream.getTracks().forEach(track => {
          rtcConn.peerConnection.addTrack(track, stream);
        });

        // Renegotiate only from the acceptor side to avoid offer glare.
        try {
          const offer = await rtcConn.peerConnection.createOffer();
          await rtcConn.peerConnection.setLocalDescription(offer);
          mqttClient.publish(
            getSignalTopic(fromUser),
            JSON.stringify(offer)
          );
          console.log('Acceptor created and sent renegotiation offer');
        } catch (e) {
          console.error('Failed to renegotiate video on accept:', e);
        }
      }

      // Send accept signal
      mqttClient.publish(
        getSignalTopic(fromUser),
        JSON.stringify({ type: 'accept-video' })
      );

      // Start call duration timer
      startCallTimer(fromUser);

      pushNotice(`Video call accepted with ${fromUser}`, 'info');
    } catch (error) {
      console.error('Failed to accept video call:', error);
      pushNotice('Failed to accept video call.');
    }
  }

  // Toggle video stream
  async function toggleVideoStream(user: string, enabled: boolean) {
    const chat = activeChats.value.get(user);
    if (!chat || !chat.localMediaStream) return;

    chat.localMediaStream.getVideoTracks().forEach(track => {
      track.enabled = enabled;
    });

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

  // Cleanup on disconnect
  function cleanup() {
    rtcConnections.forEach(rtcConn => {
      if (rtcConn.dataChannel) {
        rtcConn.dataChannel.close();
      }
      rtcConn.peerConnection.close();
    });
    rtcConnections.clear();
    signalQueue.clear();
    pendingOutgoingFiles.clear();
    activeChats.value.clear();
    outgoingRequests.value = [];
    pendingRequests.value = [];
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
    activeChats: computed(() => activeChats.value),
    outgoingRequests: computed(() => outgoingRequests.value),
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
    toggleAudioStream,
    requestVideoCall,
    acceptVideoCall,
    toggleVideoStream,
    formatCallDuration,
    sendFile,
    acceptFileTransfer,
    rejectFileTransfer,
    markFileSaved,
    cleanup
  };
}
