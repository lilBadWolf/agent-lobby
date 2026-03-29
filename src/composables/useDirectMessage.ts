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
  const rtcConnections = new Map<string, RTCConnection>();
  const signalQueue = new Map<string, any[]>();
  let messageHandlerRegistered = false;

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
        const message = JSON.parse(event.data);
        const chat = activeChats.value.get(otherUser);
        if (chat) {
          chat.messages.push({
            user: otherUser,
            message: message.m || '',
            isSystem: false
          });
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    dataChannel.onerror = (event) => {
      console.error(`Data channel error with ${otherUser}:`, event);
    };

    dataChannel.onclose = () => {
      const chat = activeChats.value.get(otherUser);
      if (chat) {
        chat.isConnected = false;
      }
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

  // Request DM from another user - create initiator peer
  async function requestDM(targetUser: string) {
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
        activeChats.value.set(targetUser, {
          user: targetUser,
          messages: [],
          dataChannel: null,
          isConnected: false
        });
      }
    } catch (e) {
      console.error('Error creating offer:', e);
    }
  }

  // Accept incoming DM request - create non-initiator peer to respond to offer
  function acceptDM(fromUser: string) {
    // Remove from pending
    pendingRequests.value = pendingRequests.value.filter(r => r.from !== fromUser);

    const rtcConn = createRTCConnection(fromUser, false);
    rtcConnections.set(fromUser, rtcConn);

    // Flush any queued signals (offer from requester)
    flushSignalQueue(fromUser, rtcConn.peerConnection);

    // Store in active chats
    if (!activeChats.value.has(fromUser)) {
      activeChats.value.set(fromUser, {
        user: fromUser,
        messages: [],
        dataChannel: null,
        isConnected: false
      });
    }
  }

  // Reject incoming DM request
  function rejectDM(fromUser: string) {
    pendingRequests.value = pendingRequests.value.filter(r => r.from !== fromUser);
  }

  // Send a DM message
  function sendDMMessage(toUser: string, message: string) {
    const chat = activeChats.value.get(toUser);
    if (!chat || !chat.dataChannel || chat.dataChannel.readyState !== 'open') return;

    const payload = JSON.stringify({
      u: username.value,
      m: message
    });

    try {
      chat.dataChannel.send(payload);
      // Add to local message history
      chat.messages.push({
        user: username.value,
        message: message,
        isSystem: false
      });
    } catch (e) {
      console.error('Failed to send message:', e);
    }
  }

  // Close a DM connection
  function closeDM(otherUser: string) {
    const rtcConn = rtcConnections.get(otherUser);
    if (rtcConn) {
      if (rtcConn.dataChannel) {
        rtcConn.dataChannel.close();
      }
      rtcConn.peerConnection.close();
      rtcConnections.delete(otherUser);
    }
    activeChats.value.delete(otherUser);
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
    requestDM,
    acceptDM,
    rejectDM,
    sendDMMessage,
    closeDM,
    cleanup
  };
}
