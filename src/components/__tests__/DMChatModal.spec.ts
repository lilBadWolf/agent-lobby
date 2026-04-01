import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import DMChatModal from '../DMChatModal.vue';

const {
  tauriExistsMock,
  tauriWriteFileMock,
  tauriDownloadDirMock,
  tauriJoinMock,
  tauriRevealItemMock,
} = vi.hoisted(() => ({
  tauriExistsMock: vi.fn().mockResolvedValue(false),
  tauriWriteFileMock: vi.fn().mockResolvedValue(undefined),
  tauriDownloadDirMock: vi.fn().mockResolvedValue('/downloads'),
  tauriJoinMock: vi.fn().mockResolvedValue('/downloads/report.txt'),
  tauriRevealItemMock: vi.fn().mockResolvedValue(undefined),
}));

const playAnimationMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../composables/useMessageAnimations', () => ({
  useMessageAnimations: () => ({
    playAnimation: playAnimationMock,
  }),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: {
    Download: 'Download',
  },
  exists: tauriExistsMock,
  writeFile: tauriWriteFileMock,
}));

vi.mock('@tauri-apps/api/path', () => ({
  downloadDir: tauriDownloadDirMock,
  join: tauriJoinMock,
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  revealItemInDir: tauriRevealItemMock,
}));

describe('DMChatModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();

    tauriExistsMock.mockReset();
    tauriWriteFileMock.mockReset();
    tauriDownloadDirMock.mockReset();
    tauriJoinMock.mockReset();
    tauriRevealItemMock.mockReset();

    tauriExistsMock.mockResolvedValue(false);
    tauriWriteFileMock.mockResolvedValue(undefined);
    tauriDownloadDirMock.mockResolvedValue('/downloads');
    tauriJoinMock.mockImplementation(async (base: string, leaf: string) => `${base}/${leaf}`);
    tauriRevealItemMock.mockResolvedValue(undefined);
  });

  function makeChat(connected = true) {
    return {
      user: 'BRAVO',
      messages: [],
      dataChannel: null,
      isConnected: connected,
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

  function setTauriRuntime(enabled: boolean) {
    if (enabled) {
      (window as any).__TAURI_INTERNALS__ = {};
      return;
    }
    delete (window as any).__TAURI_INTERNALS__;
  }

  it('renders and emits close event', async () => {
    setTauriRuntime(false);
    const wrapper = mount(DMChatModal, {
      props: {
        showModal: true,
        activeChats: new Map(),
        pendingRequests: [],
        pendingAudioCalls: [],
        pendingVideoCalls: [],
        outgoingRequests: [],
        notices: [],
        username: 'ALPHA',
        dmChatEffect: 'matrix',
      },
      global: {
        stubs: {
          VideoWindow: true,
        },
      },
    });

    await wrapper.find('.close-btn').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('emits accept/reject actions for incoming requests and cancel for outgoing request', async () => {
    setTauriRuntime(false);
    const wrapper = mount(DMChatModal, {
      props: {
        showModal: true,
        activeChats: new Map(),
        pendingRequests: [{ from: 'ECHO', timestamp: Date.now() }],
        pendingAudioCalls: [],
        pendingVideoCalls: [],
        outgoingRequests: ['DELTA'],
        notices: [],
        username: 'ALPHA',
        dmChatEffect: 'matrix',
      },
      global: {
        stubs: { VideoWindow: true },
      },
    });

    const buttons = wrapper.findAll('.requests-section .btn-accept, .requests-section .btn-reject');
    await buttons[0].trigger('click');
    await buttons[1].trigger('click');
    await wrapper.find('.btn-cancel-request').trigger('click');

    expect(wrapper.emitted('acceptDm')?.[0]).toEqual(['ECHO']);
    expect(wrapper.emitted('rejectDm')?.[0]).toEqual(['ECHO']);
    expect(wrapper.emitted('cancelRequest')?.[0]).toEqual(['DELTA']);
  });

  it('emits request actions, sendMessage, typing and stopTyping in active chat tab', async () => {
    setTauriRuntime(false);
    vi.useFakeTimers();

    const wrapper = mount(DMChatModal, {
      props: {
        showModal: true,
        activeChats: new Map([['BRAVO', makeChat(true) as any]]),
        pendingRequests: [],
        pendingAudioCalls: [],
        pendingVideoCalls: [],
        outgoingRequests: [],
        notices: [],
        username: 'ALPHA',
        dmChatEffect: 'glitch',
      },
      global: {
        stubs: { VideoWindow: true },
      },
    });

    await wrapper.find('.tab').trigger('click');

    await wrapper.find('.phone-btn').trigger('click');
    await wrapper.find('.camera-btn').trigger('click');

    const input = wrapper.find('.input-bar input');
    await input.setValue('hello dm');
    await wrapper.find('.send-btn').trigger('click');

    expect(wrapper.emitted('requestAudio')?.[0]).toEqual(['BRAVO']);
    expect(wrapper.emitted('requestVideo')?.[0]).toEqual(['BRAVO']);
    expect(wrapper.emitted('sendMessage')?.[0]).toEqual(['BRAVO', 'hello dm', 'glitch']);
    expect(wrapper.emitted('typing')?.[0]).toEqual(['BRAVO']);

    vi.advanceTimersByTime(1100);
    expect(wrapper.emitted('stopTyping')?.[0]).toEqual(['BRAVO']);
    vi.useRealTimers();
  });

  it('emits notice action events for audio/video notice buttons', async () => {
    setTauriRuntime(false);
    const wrapper = mount(DMChatModal, {
      props: {
        showModal: true,
        activeChats: new Map(),
        pendingRequests: [],
        pendingAudioCalls: [],
        pendingVideoCalls: [],
        outgoingRequests: [],
        notices: [
          { id: 1, message: 'audio req', type: 'audio-call', from: 'ECHO' },
          { id: 2, message: 'video req', type: 'video-call', from: 'DELTA' },
        ],
        username: 'ALPHA',
        dmChatEffect: 'matrix',
      },
      global: {
        stubs: { VideoWindow: true },
      },
    });

    const acceptButtons = wrapper.findAll('.notice-buttons .btn-accept');
    const rejectButtons = wrapper.findAll('.notice-buttons .btn-reject');

    await acceptButtons[0].trigger('click');
    await rejectButtons[0].trigger('click');
    await acceptButtons[1].trigger('click');
    await rejectButtons[1].trigger('click');

    expect(wrapper.emitted('acceptAudio')?.[0]).toEqual(['ECHO']);
    expect(wrapper.emitted('rejectAudio')?.[0]).toEqual(['ECHO']);
    expect(wrapper.emitted('acceptVideo')?.[0]).toEqual(['DELTA']);
    expect(wrapper.emitted('rejectVideo')?.[0]).toEqual(['DELTA']);
  });

  it('handles file drop send flow and enforces max-size guard', async () => {
    setTauriRuntime(false);
    const chat = makeChat(true) as any;
    const wrapper = mount(DMChatModal, {
      props: {
        showModal: true,
        activeChats: new Map([['BRAVO', chat]]),
        pendingRequests: [],
        pendingAudioCalls: [],
        pendingVideoCalls: [],
        outgoingRequests: [],
        notices: [],
        username: 'ALPHA',
        dmChatEffect: 'matrix',
      },
      global: {
        stubs: { VideoWindow: true },
      },
    });

    await wrapper.find('.tab').trigger('click');

    const validFile = new File([new Uint8Array([1, 2, 3])], 'small.bin');
    const oversized: any = { name: 'huge.bin', size: 600 * 1024 * 1024 };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await wrapper.find('.messages').trigger('drop', {
      dataTransfer: {
        files: [validFile, oversized],
      },
      preventDefault: () => undefined,
    });

    expect(wrapper.emitted('sendFile')?.[0]?.[0]).toBe('BRAVO');
    expect((wrapper.emitted('sendFile')?.[0]?.[1] as File).name).toBe('small.bin');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('emits closeDm and close when final active tab is closed', async () => {
    setTauriRuntime(false);
    const wrapper = mount(DMChatModal, {
      props: {
        showModal: true,
        activeChats: new Map([['BRAVO', makeChat(true) as any]]),
        pendingRequests: [],
        pendingAudioCalls: [],
        pendingVideoCalls: [],
        outgoingRequests: [],
        notices: [],
        username: 'ALPHA',
        dmChatEffect: 'matrix',
      },
      global: {
        stubs: { VideoWindow: true },
      },
    });

    await wrapper.find('.tab-close').trigger('click');

    expect(wrapper.emitted('closeDm')?.[0]).toEqual(['BRAVO']);
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('downloads completed incoming file and emits fileSaved', async () => {
    setTauriRuntime(false);
    vi.useFakeTimers();
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const chat = makeChat(true) as any;
    chat.fileTransfers.set('file-1', {
      id: 'file-1',
      filename: 'report.txt',
      mimeType: 'text/plain',
      totalSize: 4,
      receivedSize: 4,
      totalChunks: 1,
      chunks: new Map([[0, new Uint8Array([1, 2, 3, 4])]]),
      progress: 100,
      direction: 'incoming',
      status: 'completed',
      savedToDisk: false,
    });

    const wrapper = mount(DMChatModal, {
      props: {
        showModal: true,
        activeChats: new Map([['BRAVO', chat]]),
        pendingRequests: [],
        pendingAudioCalls: [],
        pendingVideoCalls: [],
        outgoingRequests: [],
        notices: [],
        username: 'ALPHA',
        dmChatEffect: 'matrix',
      },
      global: {
        stubs: { VideoWindow: true },
      },
    });

    await wrapper.find('.tab').trigger('click');
    await wrapper.find('.file-action-btn').trigger('click');
    await nextTick();

    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(wrapper.emitted('fileSaved')?.[0]).toEqual(['BRAVO', 'file-1']);
    vi.runAllTimers();
    expect(revokeSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('sends ACK for peer animated message and clears own pending queue message', async () => {
    setTauriRuntime(false);
    const channelSend = vi.fn();
    const chat = makeChat(true) as any;
    chat.dataChannel = { readyState: 'open', send: channelSend };

    const baseProps = {
      showModal: true,
      pendingRequests: [],
      pendingAudioCalls: [],
      pendingVideoCalls: [],
      outgoingRequests: [],
      notices: [],
      username: 'ALPHA',
      dmChatEffect: 'matrix',
    };

    const wrapper = mount(DMChatModal, {
      props: {
        ...baseProps,
        activeChats: new Map([['BRAVO', chat]]),
      },
      global: {
        stubs: { VideoWindow: true },
      },
    });

    await wrapper.find('.tab').trigger('click');

    // Peer message should animate and trigger ACK.
    const peerChat = {
      ...chat,
      messages: [{ user: 'BRAVO', message: 'hello', messageId: 'p1' }],
    };
    await wrapper.setProps({
      ...baseProps,
      activeChats: new Map([['BRAVO', peerChat]]),
    });
    await nextTick();
    await nextTick();

    expect(playAnimationMock).toHaveBeenCalled();
    expect(channelSend).toHaveBeenCalledWith(expect.stringContaining('"ack":true'));
    expect(channelSend).toHaveBeenCalledWith(expect.stringContaining('"msgId":"p1"'));

    // Own message should clear pending display queue by messageId.
    const ownChat = {
      ...peerChat,
      pendingDisplayMessages: [{ id: 'm-self', text: 'queued' }],
      messages: [{ user: 'ALPHA', message: 'mine', messageId: 'm-self' }],
    };
    await wrapper.setProps({
      ...baseProps,
      activeChats: new Map([['BRAVO', ownChat]]),
    });
    await nextTick();
    await nextTick();

    expect(ownChat.pendingDisplayMessages).toHaveLength(0);
  });

  it('emits cancelPendingMessages from waiting indicator action', async () => {
    setTauriRuntime(false);
    const chat = makeChat(true) as any;
    chat.pendingDisplayMessages = [{ id: 'q1', text: 'queued one' }];

    const wrapper = mount(DMChatModal, {
      props: {
        showModal: true,
        activeChats: new Map([['BRAVO', chat]]),
        pendingRequests: [],
        pendingAudioCalls: [],
        pendingVideoCalls: [],
        outgoingRequests: [],
        notices: [],
        username: 'ALPHA',
        dmChatEffect: 'matrix',
      },
      global: {
        stubs: { VideoWindow: true },
      },
    });

    await wrapper.find('.tab').trigger('click');
    await wrapper.find('.cancel-btn').trigger('click');

    expect(wrapper.emitted('cancelPendingMessages')?.[0]).toEqual(['BRAVO']);
  });

  it('opens video overlay for active call and forwards video window events', async () => {
    setTauriRuntime(false);
    const chat = makeChat(true) as any;
    chat.videoCallActive = true;

    const wrapper = mount(DMChatModal, {
      props: {
        showModal: true,
        activeChats: new Map([['BRAVO', chat]]),
        pendingRequests: [],
        pendingAudioCalls: [],
        pendingVideoCalls: [],
        outgoingRequests: [],
        notices: [],
        username: 'ALPHA',
        dmChatEffect: 'glitch',
      },
      global: {
        stubs: {
          VideoWindow: {
            template: `<div class="video-window-stub">
              <button class="emit-a" @click="$emit('toggle-audio', false)"></button>
              <button class="emit-v" @click="$emit('toggle-video', true)"></button>
              <button class="emit-m" @click="$emit('send-message', '  hi from video  ')"></button>
              <button class="emit-c" @click="$emit('close')"></button>
            </div>`,
          },
        },
      },
    });

    await wrapper.find('.tab').trigger('click');

    expect(wrapper.find('.video-window-stub').exists()).toBe(true);

    await wrapper.find('.emit-a').trigger('click');
    await wrapper.find('.emit-v').trigger('click');
    await wrapper.find('.emit-m').trigger('click');
    await wrapper.find('.emit-c').trigger('click');

    expect(wrapper.emitted('toggleAudio')?.[0]).toEqual(['BRAVO', false]);
    expect(wrapper.emitted('toggleVideo')?.[0]).toEqual(['BRAVO', true]);
    expect(wrapper.emitted('sendMessage')?.slice(-1)?.[0]).toEqual(['BRAVO', 'hi from video', 'glitch']);
    expect(wrapper.emitted('closeDm')?.slice(-1)?.[0]).toEqual(['BRAVO']);
  });

  it('saves incoming file through tauri APIs and reveals it in folder', async () => {
    setTauriRuntime(true);
    tauriExistsMock.mockResolvedValue(false);

    const chat = makeChat(true) as any;
    chat.fileTransfers.set('file-2', {
      id: 'file-2',
      filename: 'report.txt',
      mimeType: 'text/plain',
      totalSize: 4,
      receivedSize: 4,
      totalChunks: 1,
      chunks: new Map([[0, new Uint8Array([1, 2, 3, 4])]]),
      progress: 100,
      direction: 'incoming',
      status: 'completed',
      savedToDisk: false,
    });

    const wrapper = mount(DMChatModal, {
      props: {
        showModal: true,
        activeChats: new Map([['BRAVO', chat]]),
        pendingRequests: [],
        pendingAudioCalls: [],
        pendingVideoCalls: [],
        outgoingRequests: [],
        notices: [],
        username: 'ALPHA',
        dmChatEffect: 'matrix',
      },
      global: {
        stubs: { VideoWindow: true },
      },
    });

    await wrapper.find('.tab').trigger('click');

    const saveButton = wrapper.findAll('.file-action-btn').find((btn) => btn.text().includes('SAVE'));
    expect(saveButton).toBeTruthy();
    await saveButton!.trigger('click');
    await vi.waitFor(() => {
      expect(tauriWriteFileMock).toHaveBeenCalled();
    });
    expect(wrapper.emitted('fileSaved')?.slice(-1)?.[0]).toEqual(['BRAVO', 'file-2']);

    await nextTick();
    const revealButton = wrapper.findAll('.file-action-btn').find((btn) => btn.text().includes('SHOW IN FOLDER'));
    expect(revealButton).toBeTruthy();
    await revealButton!.trigger('click');

    expect(tauriRevealItemMock).toHaveBeenCalledWith('/downloads/report.txt');
  });

  it('handles empty file bytes save failure without emitting fileSaved', async () => {
    setTauriRuntime(false);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const chat = makeChat(true) as any;
    chat.fileTransfers.set('file-empty', {
      id: 'file-empty',
      filename: 'empty.bin',
      mimeType: 'application/octet-stream',
      totalSize: 1,
      receivedSize: 0,
      totalChunks: 1,
      chunks: new Map(),
      progress: 100,
      direction: 'incoming',
      status: 'completed',
      savedToDisk: false,
    });

    const wrapper = mount(DMChatModal, {
      props: {
        showModal: true,
        activeChats: new Map([['BRAVO', chat]]),
        pendingRequests: [],
        pendingAudioCalls: [],
        pendingVideoCalls: [],
        outgoingRequests: [],
        notices: [],
        username: 'ALPHA',
        dmChatEffect: 'matrix',
      },
      global: {
        stubs: { VideoWindow: true },
      },
    });

    await wrapper.find('.tab').trigger('click');
    await wrapper.find('.file-action-btn').trigger('click');
    await nextTick();

    expect(wrapper.emitted('fileSaved')).toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('hides files section when all transfers are rejected or failed', async () => {
    setTauriRuntime(false);

    const chat = makeChat(true) as any;
    chat.fileTransfers.set('rej', {
      id: 'rej', filename: 'x.bin', mimeType: 'application/octet-stream', totalSize: 1, receivedSize: 1,
      totalChunks: 1, chunks: new Map([[0, new Uint8Array([1])]]), progress: 100,
      direction: 'incoming', status: 'rejected', savedToDisk: false,
    });
    chat.fileTransfers.set('fail', {
      id: 'fail', filename: 'y.bin', mimeType: 'application/octet-stream', totalSize: 1, receivedSize: 1,
      totalChunks: 1, chunks: new Map([[0, new Uint8Array([1])]]), progress: 100,
      direction: 'incoming', status: 'failed', savedToDisk: false,
    });

    const wrapper = mount(DMChatModal, {
      props: {
        showModal: true,
        activeChats: new Map([['BRAVO', chat]]),
        pendingRequests: [],
        pendingAudioCalls: [],
        pendingVideoCalls: [],
        outgoingRequests: [],
        notices: [],
        username: 'ALPHA',
        dmChatEffect: 'matrix',
      },
      global: { stubs: { VideoWindow: true } },
    });

    await wrapper.find('.tab').trigger('click');
    expect(wrapper.find('.files-section').exists()).toBe(false);
  });

  it('keeps drag-over class when dragleave relatedTarget stays inside messages container', async () => {
    setTauriRuntime(false);

    const wrapper = mount(DMChatModal, {
      props: {
        showModal: true,
        activeChats: new Map([['BRAVO', makeChat(true) as any]]),
        pendingRequests: [],
        pendingAudioCalls: [],
        pendingVideoCalls: [],
        outgoingRequests: [],
        notices: [],
        username: 'ALPHA',
        dmChatEffect: 'matrix',
      },
      global: { stubs: { VideoWindow: true } },
    });

    await wrapper.find('.tab').trigger('click');
    const messages = wrapper.find('.messages');
    await messages.trigger('dragover', { preventDefault: () => undefined });
    expect(messages.classes()).toContain('drag-over');

    const child = document.createElement('div');
    (messages.element as HTMLElement).appendChild(child);
    await messages.trigger('dragleave', { relatedTarget: child });

    expect(messages.classes()).toContain('drag-over');
  });

  it('logs reveal error when show-in-folder fails after successful save', async () => {
    setTauriRuntime(true);
    tauriRevealItemMock.mockRejectedValue(new Error('reveal failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const chat = makeChat(true) as any;
    chat.fileTransfers.set('file-r', {
      id: 'file-r',
      filename: 'report.txt',
      mimeType: 'text/plain',
      totalSize: 4,
      receivedSize: 4,
      totalChunks: 1,
      chunks: new Map([[0, new Uint8Array([1, 2, 3, 4])]]),
      progress: 100,
      direction: 'incoming',
      status: 'completed',
      savedToDisk: false,
    });

    const wrapper = mount(DMChatModal, {
      props: {
        showModal: true,
        activeChats: new Map([['BRAVO', chat]]),
        pendingRequests: [],
        pendingAudioCalls: [],
        pendingVideoCalls: [],
        outgoingRequests: [],
        notices: [],
        username: 'ALPHA',
        dmChatEffect: 'matrix',
      },
      global: { stubs: { VideoWindow: true } },
    });

    await wrapper.find('.tab').trigger('click');
    const saveButton = wrapper.findAll('.file-action-btn').find((btn) => btn.text().includes('SAVE'));
    await saveButton!.trigger('click');
    await vi.waitFor(() => expect(wrapper.emitted('fileSaved')?.slice(-1)?.[0]).toEqual(['BRAVO', 'file-r']));

    const revealButton = wrapper.findAll('.file-action-btn').find((btn) => btn.text().includes('SHOW IN FOLDER'));
    await revealButton!.trigger('click');

    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith('Failed to reveal file in folder:', expect.any(Error));
    });
  });

  it('resolves unique filename when download target already exists', async () => {
    setTauriRuntime(true);
    tauriExistsMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const chat = makeChat(true) as any;
    chat.fileTransfers.set('file-collide', {
      id: 'file-collide',
      filename: 'report.txt',
      mimeType: 'text/plain',
      totalSize: 4,
      receivedSize: 4,
      totalChunks: 1,
      chunks: new Map([[0, new Uint8Array([1, 2, 3, 4])]]),
      progress: 100,
      direction: 'incoming',
      status: 'completed',
      savedToDisk: false,
    });

    const wrapper = mount(DMChatModal, {
      props: {
        showModal: true,
        activeChats: new Map([['BRAVO', chat]]),
        pendingRequests: [],
        pendingAudioCalls: [],
        pendingVideoCalls: [],
        outgoingRequests: [],
        notices: [],
        username: 'ALPHA',
        dmChatEffect: 'matrix',
      },
      global: { stubs: { VideoWindow: true } },
    });

    await wrapper.find('.tab').trigger('click');
    const saveButton = wrapper.findAll('.file-action-btn').find((btn) => btn.text().includes('SAVE'));
    await saveButton!.trigger('click');

    await vi.waitFor(() => {
      expect(tauriWriteFileMock).toHaveBeenCalledWith(
        'report (2).txt',
        expect.any(Uint8Array),
        expect.objectContaining({ baseDir: 'Download' })
      );
    });
  });
});
