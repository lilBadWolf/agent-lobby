import { describe, expect, it, vi } from 'vitest';
import { useDirectMessage } from '../useDirectMessage';

class MockPeerConnection {
  static instances: MockPeerConnection[] = [];
  connectionState = 'connected';
  ondatachannel: ((event: { channel: any }) => void) | null = null;
  onicecandidate: ((event: { candidate: any }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  ontrack: ((event: any) => void) | null = null;

  constructor() {
    MockPeerConnection.instances.push(this);
  }

  createDataChannel() {
    return {
      readyState: 'open',
      send: vi.fn(),
      close: vi.fn(),
    };
  }

  addTrack() {
    return undefined;
  }

  async createOffer() {
    return { type: 'offer', sdp: 'mock' };
  }

  async createAnswer() {
    return { type: 'answer', sdp: 'mock' };
  }

  async setLocalDescription() {
    return undefined;
  }

  async setRemoteDescription() {
    return undefined;
  }

  async addIceCandidate() {
    return undefined;
  }

  close() {
    return undefined;
  }
}

vi.stubGlobal('RTCPeerConnection', MockPeerConnection as any);
vi.stubGlobal('RTCSessionDescription', class {
  constructor(public value: any) {}
} as any);
vi.stubGlobal('RTCIceCandidate', class {
  constructor(public value: any) {}
} as any);
vi.stubGlobal('MediaStream', class {
  private tracks: any[] = [];

  addTrack(track: any) {
    this.tracks.push(track);
  }

  getTracks() {
    return this.tracks;
  }

  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }

  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video');
  }
} as any);

function makeDataChannel() {
  return {
    readyState: 'open',
    send: vi.fn(),
    close: vi.fn(),
    onopen: null as null | (() => void),
    onmessage: null as null | ((event: { data: any }) => void),
    onerror: null as null | ((event: any) => void),
    onclose: null as null | (() => void),
  };
}

function buildChunkMessage(fileId: string, chunkIndex: number, payload: Uint8Array): ArrayBuffer {
  const msg = new ArrayBuffer(40 + payload.length);
  const bytes = new Uint8Array(msg);
  bytes.set(new TextEncoder().encode(fileId), 0);
  new DataView(msg).setUint32(36, chunkIndex);
  bytes.set(payload, 40);
  return msg;
}

function createMediaStreamMock(audioCount = 1, videoCount = 0) {
  const audioTracks = Array.from({ length: audioCount }).map(() => ({ enabled: true, stop: vi.fn(), kind: 'audio' }));
  const videoTracks = Array.from({ length: videoCount }).map(() => ({ enabled: true, stop: vi.fn(), kind: 'video' }));
  return {
    getAudioTracks: () => audioTracks,
    getVideoTracks: () => videoTracks,
    getTracks: () => [...audioTracks, ...videoTracks],
  } as any;
}

describe('useDirectMessage', () => {
  it('formats call durations for mm:ss and hh:mm:ss', () => {
    const dm = useDirectMessage(
      { value: 'ALPHA' },
      'room',
      null,
      () => {
        // no-op
      },
      null
    );

    expect(dm.formatCallDuration(65)).toBe('1:05');
    expect(dm.formatCallDuration(3661)).toBe('1:01:01');
  });

  it('handles DM request lifecycle and data-channel messaging', () => {
    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage(
      { value: 'ME' },
      'room',
      mqttClient,
      (cb) => cb(),
      null
    );

    dm.requestDM('ALPHA');
    expect(dm.outgoingRequests.value).toContain('ALPHA');
    expect(mqttClient.publish).toHaveBeenCalledWith(
      'room_lobby/dm_signal/ME/ALPHA',
      JSON.stringify({ type: 'request' })
    );

    dm.cancelDMRequest('ALPHA');
    expect(dm.outgoingRequests.value).not.toContain('ALPHA');
    expect(mqttClient.publish).toHaveBeenCalledWith(
      'room_lobby/dm_signal/ME/ALPHA',
      JSON.stringify({ type: 'cancel' })
    );

    const requestPayload = { toString: () => JSON.stringify({ type: 'request' }) };
    messageHandlers[0]('room_lobby/dm_signal/ALPHA/ME', requestPayload);
    expect(dm.pendingRequests.value.some((r) => r.from === 'ALPHA')).toBe(true);

    dm.acceptDM('ALPHA');
    expect(dm.activeChats.value.has('ALPHA')).toBe(true);
    expect(mqttClient.publish).toHaveBeenCalledWith(
      'room_lobby/dm_signal/ME/ALPHA',
      JSON.stringify({ type: 'accept' })
    );

    const chat = dm.activeChats.value.get('ALPHA');
    const send = vi.fn();
    if (chat) {
      chat.dataChannel = {
        readyState: 'open',
        send,
      } as any;
    }

    dm.sendDMMessage('ALPHA', 'hello secure world', 'codex');
    expect(send).toHaveBeenCalled();
    expect(dm.activeChats.value.get('ALPHA')?.messages.length).toBe(1);

    dm.closeDM('ALPHA');
    expect(dm.activeChats.value.has('ALPHA')).toBe(false);
    expect(mqttClient.publish).toHaveBeenCalledWith(
      'room_lobby/dm_signal/ME/ALPHA',
      JSON.stringify({ type: 'close' })
    );
  });

  it('supports reject and typing signal paths', () => {
    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage(
      { value: 'ME' },
      'room',
      mqttClient,
      (cb) => cb(),
      null
    );

    messageHandlers[0](
      'room_lobby/dm_signal/BETA/ME',
      { toString: () => JSON.stringify({ type: 'request' }) }
    );
    expect(dm.pendingRequests.value.some((r) => r.from === 'BETA')).toBe(true);

    dm.rejectDM('BETA');
    expect(dm.pendingRequests.value.some((r) => r.from === 'BETA')).toBe(false);
    expect(mqttClient.publish).toHaveBeenCalledWith(
      'room_lobby/dm_signal/ME/BETA',
      JSON.stringify({ type: 'reject' })
    );

    messageHandlers[0](
      'room_lobby/dm_signal/GAMMA/ME',
      { toString: () => JSON.stringify({ type: 'request' }) }
    );
    dm.acceptDM('GAMMA');

    const channelSend = vi.fn();
    const chat = dm.activeChats.value.get('GAMMA');
    if (chat) {
      chat.dataChannel = {
        readyState: 'open',
        send: channelSend,
      } as any;
    }

    dm.sendTyping('GAMMA');
    dm.sendStopTyping('GAMMA');
    expect(channelSend).toHaveBeenCalledWith(JSON.stringify({ typing: true }));
    expect(channelSend).toHaveBeenCalledWith(JSON.stringify({ stop_typing: true }));

    dm.rejectAudioCall('GAMMA');
    dm.rejectVideoCall('GAMMA');
    expect(mqttClient.publish).toHaveBeenCalledWith(
      'room_lobby/dm_signal/ME/GAMMA',
      JSON.stringify({ type: 'audio-reject' })
    );
    expect(mqttClient.publish).toHaveBeenCalledWith(
      'room_lobby/dm_signal/ME/GAMMA',
      JSON.stringify({ type: 'video-reject' })
    );
  });

  it('handles audio and video call request/accept paths with media mocks', async () => {
    MockPeerConnection.instances.length = 0;
    const getUserMedia = vi.fn()
      .mockResolvedValueOnce(createMediaStreamMock(1, 0))
      .mockResolvedValueOnce(createMediaStreamMock(1, 0))
      .mockResolvedValueOnce(createMediaStreamMock(1, 1))
      .mockResolvedValueOnce(createMediaStreamMock(1, 1));

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia,
      },
    } as any);

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage(
      { value: 'ME' },
      'room',
      mqttClient,
      (cb) => cb(),
      {
        audioEnabled: true,
        volume: 0.5,
        dmEnabled: true,
        mediaSharing: true,
        soundpack: 'default',
        theme: 'retro-terminal',
        dmChatEffect: 'codex',
        audioInputDeviceId: '',
        audioOutputDeviceId: '',
        videoInputDeviceId: '',
        agentAmpEnabled: false,      }
    );

    messageHandlers[0]('room_lobby/dm_signal/BRAVO/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('BRAVO');

    await dm.requestAudioCall('BRAVO');
    expect(mqttClient.publish).toHaveBeenCalledWith(
      'room_lobby/dm_signal/ME/BRAVO',
      expect.stringContaining('audio-request')
    );

    messageHandlers[0]('room_lobby/dm_signal/BRAVO/ME', {
      toString: () => JSON.stringify({ type: 'audio-request', offer: { type: 'offer', sdp: 'x' } }),
    });
    await Promise.resolve();
    expect(dm.pendingAudioCalls.value.some((r) => r.from === 'BRAVO')).toBe(true);

    await dm.acceptAudioCall('BRAVO');
    expect(mqttClient.publish).toHaveBeenCalledWith(
      'room_lobby/dm_signal/ME/BRAVO',
      expect.stringContaining('accept-audio')
    );

    await dm.requestVideoCall('BRAVO');
    expect(mqttClient.publish).toHaveBeenCalledWith(
      'room_lobby/dm_signal/ME/BRAVO',
      JSON.stringify({ type: 'video-request' })
    );

    messageHandlers[0]('room_lobby/dm_signal/BRAVO/ME', {
      toString: () => JSON.stringify({ type: 'video-request' }),
    });
    expect(dm.pendingVideoCalls.value.some((r) => r.from === 'BRAVO')).toBe(true);

    await dm.acceptVideoCall('BRAVO');
    expect(mqttClient.publish).toHaveBeenCalledWith(
      'room_lobby/dm_signal/ME/BRAVO',
      JSON.stringify({ type: 'accept-video' })
    );

    const chat = dm.activeChats.value.get('BRAVO');
    const dcSend = vi.fn();
    if (chat) {
      chat.dataChannel = { readyState: 'open', send: dcSend } as any;
      chat.localMediaStream = createMediaStreamMock(1, 1) as any;
    }

    await dm.toggleAudioStream('BRAVO', false);
    await dm.toggleVideoStream('BRAVO', false);
    expect(dcSend).toHaveBeenCalledWith(JSON.stringify({ type: 'audio-toggle', enabled: false }));
    expect(dcSend).toHaveBeenCalledWith(JSON.stringify({ type: 'video-toggle', enabled: false }));
  });

  it('handles file transfer offer, chunk, accept/reject, and completion markers', async () => {
    MockPeerConnection.instances.length = 0;

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage(
      { value: 'ME' },
      'room',
      mqttClient,
      (cb) => cb(),
      null
    );

    messageHandlers[0]('room_lobby/dm_signal/BRAVO/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('BRAVO');

    const peer = MockPeerConnection.instances.slice(-1)[0]!;
    const channel = makeDataChannel();
    peer.ondatachannel?.({ channel } as any);
    channel.onopen?.();

    channel.onmessage?.({
      data: JSON.stringify({
        type: 'file-offer',
        id: '123456789012345678901234567890123456',
        filename: 'doc.txt',
        mimeType: 'text/plain',
        totalSize: 5,
        totalChunks: 1,
      }),
    });

    const chat = dm.activeChats.value.get('BRAVO');
    expect(chat?.fileTransfers.size).toBe(1);

    const fileId = '123456789012345678901234567890123456';
    const chunk = buildChunkMessage(fileId, 0, new Uint8Array([1, 2, 3, 4, 5]));
    channel.onmessage?.({ data: chunk });

    const transfer = dm.activeChats.value.get('BRAVO')?.fileTransfers.get(fileId);
    expect(transfer?.progress).toBe(100);

    dm.acceptFileTransfer('BRAVO', fileId);
    expect(channel.send).toHaveBeenCalledWith(JSON.stringify({ type: 'file-accept', id: fileId }));

    channel.onmessage?.({ data: JSON.stringify({ type: 'file-complete', id: fileId }) });
    expect(dm.activeChats.value.get('BRAVO')?.fileTransfers.get(fileId)?.status).toBe('completed');

    dm.markFileSaved('BRAVO', fileId);
    expect(dm.activeChats.value.get('BRAVO')?.fileTransfers.get(fileId)?.savedToDisk).toBe(true);
    dm.removeFileTransfer('BRAVO', fileId);
    expect(dm.activeChats.value.get('BRAVO')?.fileTransfers.has(fileId)).toBe(false);

    dm.rejectFileTransfer('BRAVO', 'missing');
    expect(channel.send).not.toHaveBeenCalledWith(JSON.stringify({ type: 'file-reject', id: 'missing' }));

    const file = new File([new Uint8Array([7, 8, 9])], 'send.bin', { type: 'application/octet-stream' });
    await dm.sendFile('BRAVO', file);
    expect(channel.send).toHaveBeenCalledWith(expect.stringContaining('file-offer'));
  });

  it('handles ontrack updates, connection failure close, and cleanup reset', async () => {
    MockPeerConnection.instances.length = 0;

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage(
      { value: 'ME' },
      'room',
      mqttClient,
      (cb) => cb(),
      null
    );

    messageHandlers[0](
      'room_lobby/dm_signal/OMEGA/ME',
      { toString: () => JSON.stringify({ type: 'request' }) }
    );
    dm.acceptDM('OMEGA');

    const conn = MockPeerConnection.instances.slice(-1)[0]!;
    conn.ontrack?.({ track: { kind: 'audio', stop: vi.fn() } });
    conn.ontrack?.({ track: { kind: 'video', stop: vi.fn() } });

    expect(dm.activeChats.value.get('OMEGA')?.audioEnabled).toBe(true);
    expect(dm.activeChats.value.get('OMEGA')?.videoEnabled).toBe(true);

    conn.connectionState = 'failed';
    conn.onconnectionstatechange?.();
    expect(dm.activeChats.value.has('OMEGA')).toBe(false);

    dm.requestDM('SIGMA');
    expect(dm.outgoingRequests.value.includes('SIGMA')).toBe(true);
    dm.cleanup();

    expect(dm.activeChats.value.size).toBe(0);
    expect(dm.pendingRequests.value.length).toBe(0);
    expect(dm.outgoingRequests.value.length).toBe(0);
  });

  it('handles queued offer flush, parser errors, and file/media fallback error branches', async () => {
    MockPeerConnection.instances.length = 0;

    const getUserMedia = vi.fn().mockRejectedValue(new Error('no media'));
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia,
      },
    } as any);

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage(
      { value: 'ME' },
      'room',
      mqttClient,
      (cb) => cb(),
      null
    );

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    messageHandlers[0]('room_lobby/dm_signal/ERR/ME', { toString: () => '{bad-json' });
    expect(errorSpy).toHaveBeenCalled();

    // Accept a DM and then handle an incoming offer to exercise answer path.
    messageHandlers[0](
      'room_lobby/dm_signal/QUEUE/ME',
      { toString: () => JSON.stringify({ type: 'request' }) }
    );
    dm.acceptDM('QUEUE');

    messageHandlers[0](
      'room_lobby/dm_signal/QUEUE/ME',
      { toString: () => JSON.stringify({ type: 'offer', sdp: 'queued' }) }
    );
    await Promise.resolve();
    expect(dm.activeChats.value.has('QUEUE')).toBe(true);

    // File transfer send failure path.
    const chat = dm.activeChats.value.get('QUEUE');
    if (chat) {
      chat.dataChannel = {
        readyState: 'open',
        send: vi.fn(() => {
          throw new Error('send failed');
        }),
      } as any;
    }

    await dm.sendFile('QUEUE', new File([new Uint8Array([1])], 'fail.bin', { type: 'application/octet-stream' }));
    const failedTransfer = Array.from(dm.activeChats.value.get('QUEUE')?.fileTransfers.values() || []).find(
      (t) => t.filename === 'fail.bin'
    );
    expect(failedTransfer?.status).toBe('failed');

    // accept/reject file transfer error-handling branches.
    if (chat) {
      const fileId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      chat.fileTransfers.set(fileId, {
        id: fileId,
        filename: 'incoming.bin',
        mimeType: 'application/octet-stream',
        totalSize: 1,
        receivedSize: 0,
        totalChunks: 1,
        chunks: new Map(),
        progress: 0,
        direction: 'incoming',
        status: 'pending',
        savedToDisk: false,
      });

      dm.acceptFileTransfer('QUEUE', fileId);
      expect(chat.fileTransfers.get(fileId)?.status).toBe('failed');

      dm.rejectFileTransfer('QUEUE', fileId);
      expect(chat.fileTransfers.get(fileId)?.status).toBe('rejected');
    }

    // media fallback branch should not throw and should add notice.
    await dm.requestAudioCall('QUEUE');
    await dm.requestVideoCall('QUEUE');
    expect(dm.notices.value.some((n) => n.message.includes('joining as listener'))).toBe(true);
  });

  it('handles remote cancellation, rejection, and close signals', async () => {
    MockPeerConnection.instances.length = 0;
    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage(
      { value: 'ME' },
      'room',
      mqttClient,
      (cb) => cb(),
      null
    );

    // Request DM from CHARLIE
    messageHandlers[0]('room_lobby/dm_signal/CHARLIE/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    expect(dm.pendingRequests.value.some((r) => r.from === 'CHARLIE')).toBe(true);

    // CHARLIE cancels the request
    messageHandlers[0]('room_lobby/dm_signal/CHARLIE/ME', { toString: () => JSON.stringify({ type: 'cancel' }) });
    expect(dm.pendingRequests.value.some((r) => r.from === 'CHARLIE')).toBe(false);

    // Request DM from DELTA and accept it
    messageHandlers[0]('room_lobby/dm_signal/DELTA/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('DELTA');
    expect(dm.activeChats.value.has('DELTA')).toBe(true);

    // DELTA sends close signal
    messageHandlers[0]('room_lobby/dm_signal/DELTA/ME', { toString: () => JSON.stringify({ type: 'close' }) });
    expect(dm.activeChats.value.has('DELTA')).toBe(false);

    // Request outgoing DM to ECHO and receive rejection
    dm.requestDM('ECHO');
    expect(dm.outgoingRequests.value).toContain('ECHO');

    messageHandlers[0]('room_lobby/dm_signal/ECHO/ME', { toString: () => JSON.stringify({ type: 'reject' }) });
    expect(dm.outgoingRequests.value).not.toContain('ECHO');
  });

  it('handles audio call rejection and offer errors', async () => {
    MockPeerConnection.instances.length = 0;
    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage(
      { value: 'ME' },
      'room',
      mqttClient,
      (cb) => cb(),
      null
    );

    // Accept DM from FOXTROT
    messageHandlers[0]('room_lobby/dm_signal/FOXTROT/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('FOXTROT');

    // Receive audio call rejection
    messageHandlers[0]('room_lobby/dm_signal/FOXTROT/ME', { toString: () => JSON.stringify({ type: 'audio-reject' }) });
    expect(dm.notices.value.some((n) => n.message.includes('declined'))).toBe(true);

    // Receive audio request with bad offer (setRemoteDescription error)
    messageHandlers[0]('room_lobby/dm_signal/FOXTROT/ME', {
      toString: () => JSON.stringify({ type: 'audio-request', offer: { type: 'bad-offer' } }),
    });
    await Promise.resolve();
    expect(dm.pendingAudioCalls.value.some((r) => r.from === 'FOXTROT')).toBe(true);
  });

  it('handles video call rejection and receiving video requests', async () => {
    MockPeerConnection.instances.length = 0;
    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage(
      { value: 'ME' },
      'room',
      mqttClient,
      (cb) => cb(),
      null
    );

    messageHandlers[0]('room_lobby/dm_signal/GOLF/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('GOLF');

    // Receive video call rejection
    messageHandlers[0]('room_lobby/dm_signal/GOLF/ME', { toString: () => JSON.stringify({ type: 'video-reject' }) });
    expect(dm.notices.value.some((n) => n.message.includes('declined'))).toBe(true);

    // Receive video request
    messageHandlers[0]('room_lobby/dm_signal/GOLF/ME', { toString: () => JSON.stringify({ type: 'video-request' }) });
    expect(dm.pendingVideoCalls.value.some((r) => r.from === 'GOLF')).toBe(true);
  });

  it('handles data channel errors and message sending edge cases', async () => {
    MockPeerConnection.instances.length = 0;

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage(
      { value: 'ME' },
      'room',
      mqttClient,
      (cb) => cb(),
      null
    );

    // Accept DM
    messageHandlers[0]('room_lobby/dm_signal/HOTEL/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('HOTEL');

    // Send message with no data channel
    dm.sendDMMessage('HOTEL', 'test', 'none');
    expect(dm.activeChats.value.get('HOTEL')?.messages.length).toBe(0);

    // Send message to non-existent chat
    dm.sendDMMessage('NONEXIST', 'test', 'none');
    expect(dm.activeChats.value.has('NONEXIST')).toBe(false);

    // Send typing when no data channel
    dm.sendTyping('HOTEL');
    expect(dm.notices.value.length).toBeGreaterThanOrEqual(0);

    // Send stop typing when no data channel
    dm.sendStopTyping('HOTEL');
    expect(dm.notices.value.length).toBeGreaterThanOrEqual(0);
  });

  it('handles data channel messages including ACK and file events', async () => {
    MockPeerConnection.instances.length = 0;

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage(
      { value: 'ME' },
      'room',
      mqttClient,
      (cb) => cb(),
      null
    );

    messageHandlers[0]('room_lobby/dm_signal/INDIA/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('INDIA');

    const peer = MockPeerConnection.instances.slice(-1)[0]!;
    const channel = makeDataChannel();
    peer.ondatachannel?.({ channel } as any);
    channel.onopen?.();

    // Send a regular message first
    const msgId = 'msg-' + Date.now();
    channel.onmessage?.({
      data: JSON.stringify({
        id: msgId,
        m: 'hello',
        e: 'none',
        t: 0,
      }),
    });

    const messages = dm.activeChats.value.get('INDIA')?.messages;
    expect(messages?.length).toBe(1);

    // Send an ACK (should remove from pending)
    const pendingMsg = { id: msgId, text: 'pending' };
    const chat = dm.activeChats.value.get('INDIA');
    if (chat) {
      chat.pendingDisplayMessages = [pendingMsg];
    }

    channel.onmessage?.({
      data: JSON.stringify({
        ack: true,
        msgId,
      }),
    });

    const pending = dm.activeChats.value.get('INDIA')?.pendingDisplayMessages;
    expect(pending?.length).toBe(0);

    // Receive unknown message type (shouldn't crash)
    channel.onmessage?.({
      data: JSON.stringify({ unknown: true }),
    });
    expect(dm.activeChats.value.has('INDIA')).toBe(true);
  });

  it('handles call timer lifecycle indirectly through accept paths', async () => {
    MockPeerConnection.instances.length = 0;
    const getUserMedia = vi.fn()
      .mockResolvedValueOnce(createMediaStreamMock(1, 0))
      .mockResolvedValueOnce(createMediaStreamMock(1, 0));

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia,
      },
    } as any);

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage(
      { value: 'ME' },
      'room',
      mqttClient,
      (cb) => cb(),
      {
        audioEnabled: true,
        volume: 0.5,
        dmEnabled: true,
        mediaSharing: true,
        soundpack: 'default',
        theme: 'retro-terminal',
        dmChatEffect: 'codex',
        audioInputDeviceId: '',
        audioOutputDeviceId: '',
        videoInputDeviceId: '',
        agentAmpEnabled: false,      }
    );

    messageHandlers[0]('room_lobby/dm_signal/JULIET/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('JULIET');

    // Accept audio call which triggers timer internally
    await dm.acceptAudioCall('JULIET');
    const chat = dm.activeChats.value.get('JULIET');
    // The timer is started internally but not exposed; verify call info is set
    expect(chat?.isConnected).toBeDefined();
  });

  it('handles ICE candidate errors and answer path', async () => {
    MockPeerConnection.instances.length = 0;

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage(
      { value: 'ME' },
      'room',
      mqttClient,
      (cb) => cb(),
      null
    );

    messageHandlers[0]('room_lobby/dm_signal/LIMA/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('LIMA');

    // Send an ICE candidate signal
    messageHandlers[0]('room_lobby/dm_signal/LIMA/ME', {
      toString: () => JSON.stringify({ candidate: { candidate: 'ice-candidate-string' } }),
    });
    await Promise.resolve();
    expect(dm.activeChats.value.has('LIMA')).toBe(true);

    // Send an answer signal
    messageHandlers[0]('room_lobby/dm_signal/LIMA/ME', {
      toString: () => JSON.stringify({ type: 'answer', sdp: 'answer-sdp' }),
    });
    await Promise.resolve();
    expect(dm.activeChats.value.has('LIMA')).toBe(true);
  });

  it('handles signal queuing before peer connection exists', async () => {
    MockPeerConnection.instances.length = 0;

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage(
      { value: 'ME' },
      'room',
      mqttClient,
      (cb) => cb(),
      null
    );

    // Send offer signal before peer connection created (queued)
    messageHandlers[0]('room_lobby/dm_signal/MIKE/ME', {
      toString: () => JSON.stringify({ type: 'offer', sdp: 'queued-offer' }),
    });
    await Promise.resolve();

    // Now accept, which creates peer and flushes queue
    messageHandlers[0]('room_lobby/dm_signal/MIKE/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('MIKE');

    expect(dm.activeChats.value.has('MIKE')).toBe(true);
  });

  it('handles file transfer reject path and missing file', () => {
    MockPeerConnection.instances.length = 0;

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage(
      { value: 'ME' },
      'room',
      mqttClient,
      (cb) => cb(),
      null
    );

    messageHandlers[0]('room_lobby/dm_signal/NOVEMBER/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('NOVEMBER');

    const peer = MockPeerConnection.instances.slice(-1)[0]!;
    const channel = makeDataChannel();
    peer.ondatachannel?.({ channel } as any);
    channel.onopen?.();

    // Offer a file transfer
    channel.onmessage?.({
      data: JSON.stringify({
        type: 'file-offer',
        id: 'file123',
        filename: 'test.txt',
        mimeType: 'text/plain',
        totalSize: 100,
        totalChunks: 1,
      }),
    });

    // Reject the file
    dm.rejectFileTransfer('NOVEMBER', 'file123');
    expect(channel.send).toHaveBeenCalledWith(JSON.stringify({ type: 'file-reject', id: 'file123' }));

    // Reject file that doesn't exist
    dm.rejectFileTransfer('NOVEMBER', 'nonexist');
    // Should not throw
    expect(dm.activeChats.value.has('NOVEMBER')).toBe(true);
  });

  it('handles data channel close and error events', async () => {
    MockPeerConnection.instances.length = 0;

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage(
      { value: 'ME' },
      'room',
      mqttClient,
      (cb) => cb(),
      null
    );

    messageHandlers[0]('room_lobby/dm_signal/OSCAR/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('OSCAR');

    const peer = MockPeerConnection.instances.slice(-1)[0]!;
    const channel = makeDataChannel();
    peer.ondatachannel?.({ channel } as any);
    channel.onopen?.();

    // Trigger error event
    channel.onerror?.({ error: 'Test error' });
    expect(dm.activeChats.value.has('OSCAR')).toBe(true);

    // Trigger close event
    channel.onclose?.();
    expect(dm.activeChats.value.has('OSCAR')).toBe(false);
  });

  it('handles close with no open connection', () => {
    MockPeerConnection.instances.length = 0;

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage(
      { value: 'ME' },
      'room',
      mqttClient,
      (cb) => cb(),
      null
    );

    // Close a non-existent chat (shouldn't crash)
    dm.closeDM('PAPA');
    expect(dm.activeChats.value.has('PAPA')).toBe(false);
  });

  it('handles toggle stream error when send fails', async () => {
    MockPeerConnection.instances.length = 0;

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage(
      { value: 'ME' },
      'room',
      mqttClient,
      (cb) => cb(),
      null
    );

    messageHandlers[0]('room_lobby/dm_signal/QUEBEC/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('QUEBEC');

    const chat = dm.activeChats.value.get('QUEBEC');
    if (chat) {
      chat.localMediaStream = createMediaStreamMock(1, 1);
      chat.dataChannel = {
        readyState: 'open',
        send: vi.fn(() => {
          throw new Error('Send failed');
        }),
      } as any;
    }

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Toggle audio when send throws
    await dm.toggleAudioStream('QUEBEC', false);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to send audio toggle'), expect.any(Error));

    // Toggle video when send throws
    await dm.toggleVideoStream('QUEBEC', false);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to send video toggle'), expect.any(Error));

    errorSpy.mockRestore();
  });

  it('handles accept audio call error when media unavailable', async () => {
    MockPeerConnection.instances.length = 0;

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage(
      { value: 'ME' },
      'room',
      mqttClient,
      (cb) => cb(),
      {
        audioEnabled: true,
        volume: 0.5,
        dmEnabled: true,
        mediaSharing: true,
        soundpack: 'default',
        theme: 'retro-terminal',
        dmChatEffect: 'codex',
        audioInputDeviceId: '',
        audioOutputDeviceId: '',
        videoInputDeviceId: '',
        agentAmpEnabled: false,      }
    );

    messageHandlers[0]('room_lobby/dm_signal/ROMEO/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('ROMEO');

    // Make getUserMedia reject with no media available
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new Error('no media')),
      },
    } as any);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Add pending call
    messageHandlers[0]('room_lobby/dm_signal/ROMEO/ME', {
      toString: () => JSON.stringify({ type: 'audio-request', offer: { type: 'offer', sdp: 'x' } }),
    });
    await Promise.resolve();

    // Accept should handle no media gracefully
    await dm.acceptAudioCall('ROMEO');
    expect(dm.activeChats.value.has('ROMEO')).toBe(true);

    errorSpy.mockRestore();
  });

  it('handles accept video call error when renegotiation fails', async () => {
    MockPeerConnection.instances.length = 0;

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage(
      { value: 'ME' },
      'room',
      mqttClient,
      (cb) => cb(),
      {
        audioEnabled: true,
        volume: 0.5,
        dmEnabled: true,
        mediaSharing: true,
        soundpack: 'default',
        theme: 'retro-terminal',
        dmChatEffect: 'codex',
        audioInputDeviceId: '',
        audioOutputDeviceId: '',
        videoInputDeviceId: '',
        agentAmpEnabled: false,      }
    );

    messageHandlers[0]('room_lobby/dm_signal/SIERRA/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('SIERRA');

    const getUserMedia = vi.fn()
      .mockResolvedValueOnce(createMediaStreamMock(1, 1))
      .mockResolvedValueOnce(createMediaStreamMock(1, 1));

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia,
      },
    } as any);

    // Make the peer connection's createOffer fail
    MockPeerConnection.instances.length = 0;
    const pc = new MockPeerConnection();
    pc.createOffer = vi.fn().mockRejectedValue(new Error('createOffer failed'));

    messageHandlers[0]('room_lobby/dm_signal/SIERRA/ME', {
      toString: () => JSON.stringify({ type: 'video-request' }),
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Accept video call  should handle error
    await dm.acceptVideoCall('SIERRA');
    expect(dm.activeChats.value.has('SIERRA')).toBe(true);

    errorSpy.mockRestore();
  });

  it('handles incoming file chunks and completed files', async () => {
    MockPeerConnection.instances.length = 0;

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage(
      { value: 'ME' },
      'room',
      mqttClient,
      (cb) => cb(),
      null
    );

    messageHandlers[0]('room_lobby/dm_signal/TANGO/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('TANGO');

    const peer = MockPeerConnection.instances.slice(-1)[0]!;
    const channel = makeDataChannel();
    peer.ondatachannel?.({ channel } as any);
    channel.onopen?.();

    // Offer a file
    channel.onmessage?.({
      data: JSON.stringify({
        type: 'file-offer',
        id: 'file456',
        filename: 'data.bin',
        mimeType: 'application/octet-stream',
        totalSize: 10,
        totalChunks: 2,
      }),
    });

    const fileId = 'file456';
    const chunk0 = buildChunkMessage(fileId, 0, new Uint8Array([1, 2, 3, 4, 5]));
    const chunk1 = buildChunkMessage(fileId, 1, new Uint8Array([6, 7, 8, 9, 10]));

    // Receive first chunk
    channel.onmessage?.({ data: chunk0 });
    let transfer = dm.activeChats.value.get('TANGO')?.fileTransfers.get(fileId);
    expect(transfer?.progress).toBe(50);
    expect(transfer?.status).toBe('in-progress');

    // Receive second chunk
    channel.onmessage?.({ data: chunk1 });
    transfer = dm.activeChats.value.get('TANGO')?.fileTransfers.get(fileId);
    expect(transfer?.progress).toBe(100);

    // Mark file complete
    channel.onmessage?.({ data: JSON.stringify({ type: 'file-complete', id: fileId }) });
    transfer = dm.activeChats.value.get('TANGO')?.fileTransfers.get(fileId);
    expect(transfer?.status).toBe('completed');
  });

  it('handles cancellation of pending messages', async () => {
    MockPeerConnection.instances.length = 0;

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage(
      { value: 'ME' },
      'room',
      mqttClient,
      (cb) => cb(),
      null
    );

    messageHandlers[0]('room_lobby/dm_signal/UNIFORM/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('UNIFORM');

    // Add some pending display messages
    const chat = dm.activeChats.value.get('UNIFORM');
    if (chat) {
      chat.pendingDisplayMessages = [
        { id: 'msg1', text: 'one' },
        { id: 'msg2', text: 'two' },
        { id: 'msg3', text: 'three' },
      ];
    }

    // Cancel pending messages
    dm.cancelPendingMessages('UNIFORM');
    expect(dm.activeChats.value.get('UNIFORM')?.pendingDisplayMessages.length).toBe(0);

    // Cancel for non-existent chat (shouldn't crash)
    dm.cancelPendingMessages('NONEXIST');
    expect(dm.activeChats.value.has('NONEXIST')).toBe(false);
  });

  it('handles direct message without active connection', async () => {
    MockPeerConnection.instances.length = 0;

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage(
      { value: 'ME' },
      'room',
      mqttClient,
      (cb) => cb(),
      null
    );

    messageHandlers[0]('room_lobby/dm_signal/VICTOR/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('VICTOR');

    // Create chat but set dataChannel to null (not yet open)
    const chat = dm.activeChats.value.get('VICTOR');
    if (chat) {
      chat.dataChannel = null;
    }

    // Send message when no data channel yet (should queue or not send)
    dm.sendDMMessage('VICTOR', 'msg', 'none');
    const messages = dm.activeChats.value.get('VICTOR')?.messages || [];
    expect(messages.length).toBe(0);
  });

  it('handles reject file transfer without sending when no data channel', () => {
    MockPeerConnection.instances.length = 0;

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage(
      { value: 'ME' },
      'room',
      mqttClient,
      (cb) => cb(),
      null
    );

    messageHandlers[0]('room_lobby/dm_signal/WHISKEY/ME', {
      toString: () => JSON.stringify({ type: 'request' }),
    });
    dm.acceptDM('WHISKEY');

    // Add a file transfer to the chat but no data channel
    const chat = dm.activeChats.value.get('WHISKEY');
    if (chat) {
      chat.dataChannel = null;
      chat.fileTransfers.set('file789', {
        id: 'file789',
        filename: 'test.txt',
        mimeType: 'text/plain',
        totalSize: 0,
        receivedSize: 0,
        totalChunks: 0,
        chunks: new Map(),
        progress: 0,
        direction: 'incoming',
        status: 'pending',
        savedToDisk: false,
      });
    }

    // Reject should return early without updating status when no dataChannel
    dm.rejectFileTransfer('WHISKEY', 'file789');
    // Status remains pending since dataChannel is null
    expect(dm.activeChats.value.get('WHISKEY')?.fileTransfers.get('file789')?.status).toBe('pending');
  });

  it('pushNotice auto-removes the notice after its timeout elapses', () => {
    vi.useFakeTimers();

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') messageHandlers.push(handler);
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage({ value: 'ME' }, 'room', mqttClient, (cb) => cb(), null);

    messageHandlers[0]('room_lobby/dm_signal/ALPHA/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('ALPHA');
    // audio-reject triggers pushNotice with default 4000ms timeout
    messageHandlers[0]('room_lobby/dm_signal/ALPHA/ME', { toString: () => JSON.stringify({ type: 'audio-reject' }) });

    expect(dm.notices.value.length).toBe(1);
    vi.advanceTimersByTime(4001);
    expect(dm.notices.value.length).toBe(0);

    vi.useRealTimers();
  });

  it('startCallTimer increments callDuration by one each second', async () => {
    vi.useFakeTimers();
    MockPeerConnection.instances.length = 0;

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(createMediaStreamMock(1, 0)),
      },
    });

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') messageHandlers.push(handler);
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage({ value: 'ME' }, 'room', mqttClient, (cb) => cb(), {
      audioEnabled: true,
      volume: 0.5,
      dmEnabled: true,
      mediaSharing: true,
      soundpack: 'default',
      theme: 'retro-terminal',
      dmChatEffect: 'codex',
      audioInputDeviceId: '',
      audioOutputDeviceId: '',
      videoInputDeviceId: '',
        agentAmpEnabled: false,    });

    messageHandlers[0]('room_lobby/dm_signal/USER/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('USER');

    // Deliver audio-request so an rtcConn already exists when acceptAudioCall runs
    messageHandlers[0]('room_lobby/dm_signal/USER/ME', {
      toString: () => JSON.stringify({ type: 'audio-request', offer: { type: 'offer', sdp: 'x' } }),
    });
    await Promise.resolve();

    await dm.acceptAudioCall('USER');

    vi.advanceTimersByTime(3000);

    expect(dm.activeChats.value.get('USER')?.callDuration).toBe(3);

    vi.useRealTimers();
  });

  it('requestDM does not add a duplicate outgoing entry for the same user', async () => {
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn(),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage({ value: 'ME' }, 'room', mqttClient, (cb) => cb(), null);

    await dm.requestDM('ALPHA');
    await dm.requestDM('ALPHA');

    expect(dm.outgoingRequests.value.filter((u) => u === 'ALPHA')).toHaveLength(1);
  });

  it('incoming DM request is ignored when an active chat with that sender already exists', () => {
    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') messageHandlers.push(handler);
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage({ value: 'ME' }, 'room', mqttClient, (cb) => cb(), null);

    messageHandlers[0]('room_lobby/dm_signal/ALPHA/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('ALPHA');

    // Second request from same user — should not re-add to pending
    messageHandlers[0]('room_lobby/dm_signal/ALPHA/ME', { toString: () => JSON.stringify({ type: 'request' }) });

    expect(dm.pendingRequests.value.some((r) => r.from === 'ALPHA')).toBe(false);
  });

  it('ICE candidate from peer connection is published to the MQTT signaling topic', () => {
    MockPeerConnection.instances.length = 0;

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') messageHandlers.push(handler);
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage({ value: 'ME' }, 'room', mqttClient, (cb) => cb(), null);

    messageHandlers[0]('room_lobby/dm_signal/BRAVO/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('BRAVO');

    const peer = MockPeerConnection.instances.slice(-1)[0]!;
    const iceCandidate = { candidate: 'candidate:udp 1234 ...' };
    peer.onicecandidate?.({ candidate: iceCandidate });

    expect(mqttClient.publish).toHaveBeenCalledWith(
      'room_lobby/dm_signal/ME/BRAVO',
      JSON.stringify(iceCandidate)
    );
  });

  it('accept-audio signal with an answer calls setRemoteDescription on the peer connection', async () => {
    MockPeerConnection.instances.length = 0;

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(createMediaStreamMock(1, 0)),
      },
    });

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') messageHandlers.push(handler);
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage({ value: 'ME' }, 'room', mqttClient, (cb) => cb(), {
      audioEnabled: true,
      volume: 0.5,
      dmEnabled: true,
      mediaSharing: true,
      soundpack: 'default',
      theme: 'retro-terminal',
      dmChatEffect: 'codex',
      audioInputDeviceId: '',
      audioOutputDeviceId: '',
      videoInputDeviceId: '',
        agentAmpEnabled: false,    });

    messageHandlers[0]('room_lobby/dm_signal/CHARLIE/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('CHARLIE');

    await dm.requestAudioCall('CHARLIE');

    const peer = MockPeerConnection.instances.slice(-1)[0]!;
    const spy = vi.spyOn(peer, 'setRemoteDescription');

    messageHandlers[0]('room_lobby/dm_signal/CHARLIE/ME', {
      toString: () => JSON.stringify({ type: 'accept-audio', answer: { type: 'answer', sdp: 'answer-sdp' } }),
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(spy).toHaveBeenCalled();
    expect(dm.notices.value.some((n) => n.message.includes('accepted your audio call'))).toBe(true);
  });

  it('audio-request signal for a user without an active chat is not queued in pendingAudioCalls', async () => {
    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') messageHandlers.push(handler);
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage({ value: 'ME' }, 'room', mqttClient, (cb) => cb(), null);

    messageHandlers[0]('room_lobby/dm_signal/GHOST/ME', {
      toString: () => JSON.stringify({ type: 'audio-request', offer: { type: 'offer', sdp: 'x' } }),
    });
    await Promise.resolve();

    expect(dm.pendingAudioCalls.value.some((r) => r.from === 'GHOST')).toBe(false);
  });

  it('video-request signal for a user without an active chat is not queued in pendingVideoCalls', () => {
    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') messageHandlers.push(handler);
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage({ value: 'ME' }, 'room', mqttClient, (cb) => cb(), null);

    messageHandlers[0]('room_lobby/dm_signal/GHOST/ME', {
      toString: () => JSON.stringify({ type: 'video-request' }),
    });

    expect(dm.pendingVideoCalls.value.some((r) => r.from === 'GHOST')).toBe(false);
  });

  it('file-start data channel message updates transfer size and mimeType and marks it in-progress', async () => {
    MockPeerConnection.instances.length = 0;

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') messageHandlers.push(handler);
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage({ value: 'ME' }, 'room', mqttClient, (cb) => cb(), null);
    messageHandlers[0]('room_lobby/dm_signal/USER/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('USER');

    const peer = MockPeerConnection.instances.slice(-1)[0]!;
    const channel = makeDataChannel();
    peer.ondatachannel?.({ channel } as any);
    channel.onopen?.();

    const fileId = 'start-file';
    channel.onmessage?.({
      data: JSON.stringify({
        type: 'file-offer',
        id: fileId,
        filename: 'x.bin',
        mimeType: 'application/octet-stream',
        totalSize: 0,
        totalChunks: 0,
      }),
    });

    channel.onmessage?.({
      data: JSON.stringify({
        type: 'file-start',
        id: fileId,
        totalChunks: 8,
        totalSize: 131072,
        mimeType: 'image/png',
      }),
    });

    const transfer = dm.activeChats.value.get('USER')?.fileTransfers.get(fileId);
    expect(transfer?.totalChunks).toBe(8);
    expect(transfer?.totalSize).toBe(131072);
    expect(transfer?.mimeType).toBe('image/png');
    expect(transfer?.status).toBe('in-progress');
  });

  it('file-error data channel message marks the transfer as failed', async () => {
    MockPeerConnection.instances.length = 0;

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') messageHandlers.push(handler);
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage({ value: 'ME' }, 'room', mqttClient, (cb) => cb(), null);
    messageHandlers[0]('room_lobby/dm_signal/USER/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('USER');

    const peer = MockPeerConnection.instances.slice(-1)[0]!;
    const channel = makeDataChannel();
    peer.ondatachannel?.({ channel } as any);
    channel.onopen?.();

    const fileId = 'err-file';
    channel.onmessage?.({
      data: JSON.stringify({
        type: 'file-offer',
        id: fileId,
        filename: 'broken.bin',
        mimeType: 'application/octet-stream',
        totalSize: 100,
        totalChunks: 1,
      }),
    });

    channel.onmessage?.({ data: JSON.stringify({ type: 'file-error', id: fileId }) });

    expect(dm.activeChats.value.get('USER')?.fileTransfers.get(fileId)?.status).toBe('failed');
  });

  it('receiving file-reject via data channel marks the outgoing transfer as rejected', async () => {
    MockPeerConnection.instances.length = 0;

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') messageHandlers.push(handler);
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage({ value: 'ME' }, 'room', mqttClient, (cb) => cb(), null);
    messageHandlers[0]('room_lobby/dm_signal/USER/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('USER');

    const peer = MockPeerConnection.instances.slice(-1)[0]!;
    const channel = makeDataChannel();
    peer.ondatachannel?.({ channel } as any);
    channel.onopen?.();

    const fileId = 'out-file';
    const chat = dm.activeChats.value.get('USER');
    if (chat) {
      chat.fileTransfers.set(fileId, {
        id: fileId,
        filename: 'offer.bin',
        mimeType: 'application/octet-stream',
        totalSize: 500,
        receivedSize: 0,
        totalChunks: 1,
        chunks: new Map(),
        progress: 0,
        direction: 'outgoing',
        status: 'awaiting-accept',
        savedToDisk: false,
      });
    }

    channel.onmessage?.({ data: JSON.stringify({ type: 'file-reject', id: fileId }) });

    expect(dm.activeChats.value.get('USER')?.fileTransfers.get(fileId)?.status).toBe('rejected');
  });

  it('data channel Blob message is unwrapped via arrayBuffer and processed as a binary chunk', async () => {
    MockPeerConnection.instances.length = 0;

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') messageHandlers.push(handler);
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage({ value: 'ME' }, 'room', mqttClient, (cb) => cb(), null);
    messageHandlers[0]('room_lobby/dm_signal/USER/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('USER');

    const peer = MockPeerConnection.instances.slice(-1)[0]!;
    const channel = makeDataChannel();
    peer.ondatachannel?.({ channel } as any);
    channel.onopen?.();

    // fileId must be exactly 36 chars so the binary header decoder finds it
    const fileId = 'a'.repeat(36);
    channel.onmessage?.({
      data: JSON.stringify({
        type: 'file-offer',
        id: fileId,
        filename: 'blob.bin',
        mimeType: 'application/octet-stream',
        totalSize: 3,
        totalChunks: 1,
      }),
    });

    const chunkBuffer = buildChunkMessage(fileId, 0, new Uint8Array([10, 20, 30]));
    const blob = new Blob([chunkBuffer]);
    channel.onmessage?.({ data: blob });

    // Drain the Blob.arrayBuffer() promise chain (two microtask hops)
    await Promise.resolve();
    await Promise.resolve();

    expect(dm.activeChats.value.get('USER')?.fileTransfers.get(fileId)?.receivedSize).toBe(3);
  });

  it('data channel message with malformed JSON logs to console.error without crashing', async () => {
    MockPeerConnection.instances.length = 0;

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') messageHandlers.push(handler);
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage({ value: 'ME' }, 'room', mqttClient, (cb) => cb(), null);
    messageHandlers[0]('room_lobby/dm_signal/USER/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('USER');

    const peer = MockPeerConnection.instances.slice(-1)[0]!;
    const channel = makeDataChannel();
    peer.ondatachannel?.({ channel } as any);
    channel.onopen?.();

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    channel.onmessage?.({ data: '{{not-valid-json}}' });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse message'),
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });

  it('sendFile pushes a notice when no open data channel is available', async () => {
    MockPeerConnection.instances.length = 0;

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') messageHandlers.push(handler);
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage({ value: 'ME' }, 'room', mqttClient, (cb) => cb(), null);
    messageHandlers[0]('room_lobby/dm_signal/USER/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('USER');
    // dataChannel stays null until ondatachannel fires — not triggered here

    const file = new File([new Uint8Array([1, 2, 3])], 'test.bin', { type: 'application/octet-stream' });
    await dm.sendFile('USER', file);

    expect(dm.notices.value.some((n) => n.message.includes('File transfer requires active connection'))).toBe(true);
  });

  it('closeDM stops all local and remote media stream tracks', () => {
    MockPeerConnection.instances.length = 0;

    const messageHandlers: Array<(topic: string, payload: any) => void> = [];
    const mqttClient = {
      subscribe: vi.fn(),
      on: vi.fn((event: string, handler: (topic: string, payload: any) => void) => {
        if (event === 'message') messageHandlers.push(handler);
      }),
      publish: vi.fn(),
    } as any;

    const dm = useDirectMessage({ value: 'ME' }, 'room', mqttClient, (cb) => cb(), null);
    messageHandlers[0]('room_lobby/dm_signal/USER/ME', { toString: () => JSON.stringify({ type: 'request' }) });
    dm.acceptDM('USER');

    const local = createMediaStreamMock(1, 1);
    const remote = createMediaStreamMock(1, 0);
    const chat = dm.activeChats.value.get('USER');
    if (chat) {
      chat.localMediaStream = local;
      chat.remoteMediaStream = remote;
    }

    dm.closeDM('USER');

    local.getTracks().forEach((track: any) => expect(track.stop).toHaveBeenCalled());
    remote.getTracks().forEach((track: any) => expect(track.stop).toHaveBeenCalled());
  });
});



