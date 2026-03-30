import { ref, computed } from 'vue';
import type { ChatMessage } from './useLobbyChat';
import mqtt from 'mqtt';

export interface DMRequest {
  from: string;
  timestamp: number;
}

export interface DMChat {
  user: string;
  messages: ChatMessage[];
  dataChannel: RTCDataChannel | null;
  isConnected: boolean;
  pendingDisplayMessages: Array<{ id: string; text: string }>;  // Messages waiting for peer to animate
  isTyping: boolean;  // Whether the peer is currently typing
}

export interface DMNotice {
  id: number;
  message: string;
}

interface RTCConnection {
  peerConnection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  isInitiator: boolean;
}

export function useDirectMessage(
  username: { value: string },
  roomId: string,
  mqttClient: mqtt.MqttClient | null,
  onConnect: (callback: () => void) => void
) {
  // State
  const pendingRequests = ref<DMRequest[]>([]);
  const activeChats = ref<Map<string, DMChat>>(new Map());
  const outgoingRequests = ref<string[]>([]);
  const notices = ref<DMNotice[]>([]);
  const rtcConnections = new Map<string, RTCConnection>();
  const signalQueue = new Map<string, any[]>();
  let messageHandlerRegistered = false;
  let noticeIdCounter = 0;

  function pushNotice(message: string) {
    const id = ++noticeIdCounter;
    notices.value = [...notices.value, { id, message }];

    setTimeout(() => {
      notices.value = notices.value.filter((n) => n.id !== id);
    }, 4000);
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
  function handleSignalingMessage(fromUser: string, data: any) {
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
      isInitiator
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
        const data = JSON.parse(event.data);
        const chat = activeChats.value.get(otherUser);
        if (!chat) return;

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
          isTyping: false
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
      isTyping: false
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
    outgoingRequests.value = outgoingRequests.value.filter((user) => user !== otherUser);
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
    activeChats: computed(() => activeChats.value),
    outgoingRequests: computed(() => outgoingRequests.value),
    notices: computed(() => notices.value),
    requestDM,
    cancelDMRequest,
    acceptDM,
    rejectDM,
    sendDMMessage,
    sendTyping,
    sendStopTyping,
    cancelPendingMessages,
    closeDM,
    cleanup
  };
}
