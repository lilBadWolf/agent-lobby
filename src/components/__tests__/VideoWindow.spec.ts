import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import VideoWindow from '../VideoWindow.vue';

const playAnimationMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../composables/useMessageAnimations', () => ({
  useMessageAnimations: () => ({
    playAnimation: playAnimationMock,
  }),
}));

describe('VideoWindow', () => {
  function mediaStreamMock(audioCount = 1, videoCount = 1) {
    const audioTracks = Array.from({ length: audioCount }).map(() => ({ enabled: true, kind: 'audio' }));
    const videoTracks = Array.from({ length: videoCount }).map(() => ({ enabled: true, kind: 'video' }));
    const listeners = new Map<string, Function[]>();

    return {
      getAudioTracks: () => audioTracks,
      getVideoTracks: () => videoTracks,
      getTracks: () => [...audioTracks, ...videoTracks],
      addEventListener: (event: string, cb: Function) => {
        const arr = listeners.get(event) || [];
        arr.push(cb);
        listeners.set(event, arr);
      },
      removeEventListener: (event: string, cb: Function) => {
        const arr = listeners.get(event) || [];
        listeners.set(event, arr.filter((fn) => fn !== cb));
      },
    } as any;
  }

  it('emits toggle and close controls', async () => {
    const wrapper = mount(VideoWindow, {
      props: {
        peerName: 'echo',
        canSendMessages: true,
      },
    });

    await wrapper.findAll('.control-btn')[0].trigger('click');
    await wrapper.findAll('.control-btn')[1].trigger('click');
    await wrapper.find('.btn-end').trigger('click');

    expect(wrapper.emitted('toggleAudio')?.[0]).toEqual([false]);
    expect(wrapper.emitted('toggleVideo')?.[0]).toEqual([false]);
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('sends fallback message when allowed', async () => {
    const wrapper = mount(VideoWindow, {
      props: {
        peerName: 'echo',
        canSendMessages: true,
      },
    });

    await wrapper.find('.fallback-input').setValue('secure ping');
    await wrapper.find('.fallback-send').trigger('click');

    expect(wrapper.emitted('sendMessage')?.[0]).toEqual(['secure ping']);
  });

  it('does not send fallback message when disabled', async () => {
    const wrapper = mount(VideoWindow, {
      props: {
        peerName: 'echo',
        canSendMessages: false,
      },
    });

    await wrapper.find('.fallback-input').setValue('blocked');
    await wrapper.find('.fallback-send').trigger('click');

    expect(wrapper.emitted('sendMessage')).toBeFalsy();
  });

  it('does not send fallback message for whitespace input', async () => {
    const wrapper = mount(VideoWindow, {
      props: {
        peerName: 'echo',
        canSendMessages: true,
      },
    });

    await wrapper.find('.fallback-input').setValue('   ');
    await wrapper.find('.fallback-send').trigger('click');

    expect(wrapper.emitted('sendMessage')).toBeFalsy();
  });

  it('sends fallback message on Enter key', async () => {
    const wrapper = mount(VideoWindow, {
      props: {
        peerName: 'echo',
        canSendMessages: true,
      },
    });

    const input = wrapper.find('.fallback-input');
    await input.setValue('enter send');
    await input.trigger('keydown.enter');

    expect(wrapper.emitted('sendMessage')?.[0]).toEqual(['enter send']);
  });

  it('attaches local/remote streams and animates remote fallback text', async () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined as never);
    const local = mediaStreamMock(1, 1);
    const remote = mediaStreamMock(1, 0);

    const wrapper = mount(VideoWindow, {
      props: {
        peerName: 'echo',
        username: 'ME',
        canSendMessages: true,
        localStream: local,
        remoteStream: remote,
        peerHasVideo: false,
        dmMessages: [],
      },
    });

    await wrapper.setProps({ dmMessages: [{ user: 'echo', message: 'render me', effect: 'matrix' }] });
    await nextTick();
    await nextTick();

    expect(playSpy).toHaveBeenCalled();
    expect(playAnimationMock).toHaveBeenCalledWith('matrix', 'render me', expect.any(HTMLElement));
  });

  it('renders plain fallback text for effect none and avoids animation replay for duplicate message', async () => {
    const wrapper = mount(VideoWindow, {
      props: {
        peerName: 'echo',
        username: 'ME',
        canSendMessages: true,
        peerHasVideo: false,
        dmMessages: [],
      },
    });

    await wrapper.setProps({ dmMessages: [{ user: 'echo', message: 'plain text', effect: 'none' }] });
    await nextTick();
    await nextTick();

    const fallback = wrapper.find('.remote-fallback-animation');
    expect(fallback.text()).toContain('plain text');
    expect(playAnimationMock).not.toHaveBeenCalledWith('none', 'plain text', expect.anything());

    const callCount = playAnimationMock.mock.calls.length;
    await wrapper.setProps({ dmMessages: [{ user: 'echo', message: 'plain text', effect: 'none' }] });
    await nextTick();
    await nextTick();
    expect(playAnimationMock.mock.calls.length).toBe(callCount);
  });

  it('clears remote fallback animation content when peer video appears', async () => {
    const wrapper = mount(VideoWindow, {
      props: {
        peerName: 'echo',
        username: 'ME',
        canSendMessages: true,
        peerHasVideo: false,
        dmMessages: [],
      },
    });

    await wrapper.setProps({ dmMessages: [{ user: 'echo', message: 'to clear', effect: 'none' }] });

    await nextTick();
    await nextTick();

    const fallback = wrapper.find('.remote-fallback-animation');
    expect(fallback.text()).toContain('to clear');

    await wrapper.setProps({ peerHasVideo: true });
    await nextTick();

    expect(fallback.element.textContent).toBe('');
  });

  it('clears media element srcObject when streams become null', async () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined as never);
    const local = mediaStreamMock(1, 1);
    const remote = mediaStreamMock(1, 1);

    const wrapper = mount(VideoWindow, {
      props: {
        peerName: 'echo',
        canSendMessages: true,
        localStream: null,
        remoteStream: null,
        peerHasVideo: true,
      },
    });

    const localVideo = wrapper.find('video.local-video').element as HTMLVideoElement;
    const remoteAudio = wrapper.find('audio').element as HTMLAudioElement;

    Object.defineProperty(localVideo, 'srcObject', {
      configurable: true,
      writable: true,
      value: null,
    });

    Object.defineProperty(remoteAudio, 'srcObject', {
      configurable: true,
      writable: true,
      value: null,
    });

    await wrapper.setProps({ localStream: local, remoteStream: remote });
    await nextTick();
    await nextTick();

    expect(playSpy).toHaveBeenCalled();
    expect(localVideo.srcObject).not.toBeNull();

    await wrapper.setProps({ localStream: null, remoteStream: null });
    await nextTick();

    expect(localVideo.srcObject).toBeNull();
    expect(remoteAudio.srcObject).toBeNull();
  });

  it('does not animate fallback for own or system messages', async () => {
    const wrapper = mount(VideoWindow, {
      props: {
        peerName: 'echo',
        username: 'ME',
        canSendMessages: true,
        peerHasVideo: false,
        dmMessages: [],
      },
    });

    await wrapper.setProps({ dmMessages: [{ user: 'ME', message: 'mine', effect: 'matrix' }] });
    await nextTick();
    await nextTick();

    await wrapper.setProps({ dmMessages: [{ user: 'echo', message: 'sys', isSystem: true, effect: 'glitch' }] });
    await nextTick();
    await nextTick();

    expect(playAnimationMock).not.toHaveBeenCalledWith('matrix', 'mine', expect.anything());
    expect(playAnimationMock).not.toHaveBeenCalledWith('glitch', 'sys', expect.anything());
  });

  it('clears media sources on unmount', async () => {
    const local = mediaStreamMock(1, 1);
    const remote = mediaStreamMock(1, 1);

    const wrapper = mount(VideoWindow, {
      attachTo: document.body,
      props: {
        peerName: 'echo',
        canSendMessages: true,
        localStream: local,
        remoteStream: remote,
        peerHasVideo: true,
      },
    });

    await nextTick();
    await nextTick();

    const localVideo = wrapper.find('video.local-video').element as HTMLVideoElement;
    const remoteVideo = wrapper.find('video.remote-video').element as HTMLVideoElement;
    const remoteAudio = wrapper.find('audio').element as HTMLAudioElement;

    wrapper.unmount();

    expect(localVideo.srcObject).toBeNull();
    expect(remoteVideo.srcObject).toBeNull();
    expect(remoteAudio.srcObject).toBeNull();
  });
});

