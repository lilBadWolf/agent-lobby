import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import SettingsModal from '../SettingsModal.vue';

const requestMediaPermissionMock = vi.fn().mockResolvedValue(false);
const playAnimationMock = vi.fn().mockResolvedValue(undefined);

const audioInputDevicesMock = ref([] as Array<{ deviceId: string; label: string; kind: 'audioinput' }>);
const audioOutputDevicesMock = ref([] as Array<{ deviceId: string; label: string; kind: 'audiooutput' }>);
const videoInputDevicesMock = ref([] as Array<{ deviceId: string; label: string; kind: 'videoinput' }>);

vi.mock('../../composables/useMediaDevices', () => ({
  NO_WEBCAM_DEVICE_ID: '__no_webcam__',
  NO_MIC_DEVICE_ID: '__no_mic__',
  useMediaDevices: () => ({
    audioInputDevices: audioInputDevicesMock,
    audioOutputDevices: audioOutputDevicesMock,
    videoInputDevices: videoInputDevicesMock,
    requestMediaPermission: requestMediaPermissionMock,
  }),
}));

vi.mock('../../composables/useMessageAnimations', () => ({
  useMessageAnimations: () => ({
    playAnimation: playAnimationMock,
  }),
}));

describe('SettingsModal', () => {
  const baseConfig = {
    dmEnabled: true,
    audioEnabled: true,
    volume: 0.5,
    soundpack: 'default',
    theme: 'retro-terminal',
    dmChatEffect: 'matrix' as const,
    audioInputDeviceId: '',
    audioOutputDeviceId: '',
    videoInputDeviceId: '',
  };

  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    requestMediaPermissionMock.mockResolvedValue(false);
    audioInputDevicesMock.value = [];
    audioOutputDevicesMock.value = [];
    videoInputDevicesMock.value = [];
  });

  it('emits update when general settings change', async () => {
    const wrapper = mount(SettingsModal, {
      props: {
        showModal: true,
        config: baseConfig,
        availableSoundpacks: ['default', 'alt'],
        availableThemes: ['retro-terminal', 'light-blue'],
      },
    });

    await wrapper.find('#set-audio-toggle').setValue(false);

    expect(wrapper.emitted('update')).toBeTruthy();
    const payload = wrapper.emitted('update')?.slice(-1)?.[0]?.[0] as typeof baseConfig;
    expect(payload.audioEnabled).toBe(false);
  });

  it('emits clearLog and close events from buttons', async () => {
    const wrapper = mount(SettingsModal, {
      props: {
        showModal: true,
        config: baseConfig,
        availableSoundpacks: ['default'],
        availableThemes: ['retro-terminal'],
      },
    });

    await wrapper.find('.clear-btn').trigger('click');
    await wrapper.find('.close-btn').trigger('click');

    expect(wrapper.emitted('clearLog')).toBeTruthy();
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('initializes media tab and auto-selects no device fallback', async () => {
    const wrapper = mount(SettingsModal, {
      props: {
        showModal: true,
        config: baseConfig,
        availableSoundpacks: ['default'],
        availableThemes: ['retro-terminal'],
      },
    });

    await wrapper.findAll('.tab-btn')[2].trigger('click');
    await Promise.resolve();
    await Promise.resolve();

    expect(requestMediaPermissionMock).toHaveBeenCalledTimes(1);

    const updates = wrapper.emitted('update') ?? [];
    const flattened = updates.map((entry) => entry[0]);
    expect(flattened.some((c: any) => c.videoInputDeviceId === '__no_webcam__')).toBe(true);
    expect(flattened.some((c: any) => c.audioInputDeviceId === '__no_mic__')).toBe(true);
  });

  it('does not auto-select no-device fallback when devices are available', async () => {
    requestMediaPermissionMock.mockResolvedValue(true);
    audioInputDevicesMock.value = [{ deviceId: 'mic-1', label: 'Mic 1', kind: 'audioinput' }];
    videoInputDevicesMock.value = [{ deviceId: 'cam-1', label: 'Cam 1', kind: 'videoinput' }];

    const wrapper = mount(SettingsModal, {
      props: {
        showModal: true,
        config: baseConfig,
        availableSoundpacks: ['default'],
        availableThemes: ['retro-terminal'],
      },
    });

    await wrapper.findAll('.tab-btn')[2].trigger('click');
    await Promise.resolve();
    await Promise.resolve();

    expect(requestMediaPermissionMock).toHaveBeenCalledWith(true, true);
    const updates = (wrapper.emitted('update') ?? []).map((entry) => entry[0] as any);
    expect(updates.some((c) => c.videoInputDeviceId === '__no_webcam__')).toBe(false);
    expect(updates.some((c) => c.audioInputDeviceId === '__no_mic__')).toBe(false);
  });

  it('initializes media tab once per open and resets after modal reopen', async () => {
    const wrapper = mount(SettingsModal, {
      props: {
        showModal: true,
        config: baseConfig,
        availableSoundpacks: ['default'],
        availableThemes: ['retro-terminal'],
      },
    });

    await wrapper.findAll('.tab-btn')[2].trigger('click');
    await Promise.resolve();
    await Promise.resolve();
    expect(requestMediaPermissionMock).toHaveBeenCalledTimes(1);

    await wrapper.findAll('.tab-btn')[0].trigger('click');
    await wrapper.findAll('.tab-btn')[2].trigger('click');
    await Promise.resolve();
    await Promise.resolve();
    expect(requestMediaPermissionMock).toHaveBeenCalledTimes(1);

    await wrapper.setProps({ showModal: false });
    await nextTick();
    await wrapper.setProps({ showModal: true });
    await nextTick();
    await wrapper.findAll('.tab-btn')[2].trigger('click');
    await Promise.resolve();
    await Promise.resolve();

    expect(requestMediaPermissionMock).toHaveBeenCalledTimes(2);
  });

  it('normalizes selected soundpack when available soundpacks change', async () => {
    const wrapper = mount(SettingsModal, {
      props: {
        showModal: true,
        config: { ...baseConfig, soundpack: 'missing-pack' },
        availableSoundpacks: ['default', 'alt'],
        availableThemes: ['retro-terminal'],
      },
    });

    expect((wrapper.find('#set-soundpack').element as HTMLSelectElement).value).toBe('default');

    await wrapper.setProps({ availableSoundpacks: ['alt'] });
    await nextTick();
    expect((wrapper.find('#set-soundpack').element as HTMLSelectElement).value).toBe('alt');
  });

  it('runs effect preview action', async () => {
    vi.useFakeTimers();
    const wrapper = mount(SettingsModal, {
      props: {
        showModal: true,
        config: baseConfig,
        availableSoundpacks: ['default'],
        availableThemes: ['retro-terminal'],
      },
    });

    await wrapper.findAll('.tab-btn')[1].trigger('click');
    await wrapper.find('.preview-btn').trigger('click');
    await Promise.resolve();

    expect(playAnimationMock).toHaveBeenCalled();
    expect(wrapper.find('.effect-preview').exists()).toBe(true);

    vi.advanceTimersByTime(350);
    await nextTick();
    expect(wrapper.find('.effect-preview').exists()).toBe(false);
    vi.useRealTimers();
  });
});
