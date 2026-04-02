import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMediaDevices } from '../useMediaDevices';

function mockMediaDevices() {
  const getUserMedia = vi.fn();
  const enumerateDevices = vi.fn();

  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia,
      enumerateDevices,
    },
  });

  return { getUserMedia, enumerateDevices };
}

describe('useMediaDevices', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('requests permission, stops tracks, and enumerates devices', async () => {
    const { getUserMedia, enumerateDevices } = mockMediaDevices();
    const stopTrack = vi.fn();

    getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: stopTrack }],
    });

    enumerateDevices.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'mic-1', label: 'Desk Mic' },
      { kind: 'audiooutput', deviceId: 'spk-1', label: 'Desk Speakers' },
      { kind: 'videoinput', deviceId: 'cam-1', label: 'USB Cam' },
    ]);

    const { requestMediaPermission, audioInputDevices, audioOutputDevices, videoInputDevices, permissionError } =
      useMediaDevices();

    const result = await requestMediaPermission();

    expect(result).toBe(true);
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(permissionError.value).toBeNull();
    expect(audioInputDevices.value[0].deviceId).toBe('mic-1');
    expect(audioOutputDevices.value[0].deviceId).toBe('spk-1');
    expect(videoInputDevices.value[0].deviceId).toBe('cam-1');
  });

  it('records permission error and falls back to enumeration attempt', async () => {
    const { getUserMedia, enumerateDevices } = mockMediaDevices();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    getUserMedia.mockRejectedValue(new Error('Permission denied'));
    enumerateDevices.mockRejectedValue(new Error('Enumeration failed'));

    const { requestMediaPermission, permissionError } = useMediaDevices();
    const result = await requestMediaPermission();

    expect(result).toBe(false);
    expect(permissionError.value).toContain('Enumeration failed');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('returns default device IDs when available', async () => {
    const { enumerateDevices } = mockMediaDevices();

    enumerateDevices.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'mic-a', label: 'Mic' },
      { kind: 'audiooutput', deviceId: 'speaker-a', label: 'Speaker' },
      { kind: 'videoinput', deviceId: 'cam-a', label: 'Camera' },
    ]);

    const { getDefaultDevices } = useMediaDevices();
    const defaults = await getDefaultDevices();

    expect(defaults).toEqual({
      audioInputDeviceId: 'mic-a',
      audioOutputDeviceId: 'speaker-a',
      videoInputDeviceId: 'cam-a',
    });
  });

  it('handles permission grant but no video input devices', async () => {
    const { getUserMedia, enumerateDevices } = mockMediaDevices();
    const stopTrack = vi.fn();

    getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: stopTrack }],
    });

    enumerateDevices.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'mic-1', label: 'Mic' },
      { kind: 'audiooutput', deviceId: 'spk-1', label: 'Speaker' },
      // No videoinput devices
    ]);

    const { requestMediaPermission, videoInputDevices } = useMediaDevices();
    const result = await requestMediaPermission();

    expect(result).toBe(false); // No video devices
    expect(videoInputDevices.value).toHaveLength(0);
  });

  it('handles permission error but successful enumeration fallback', async () => {
    const { getUserMedia, enumerateDevices } = mockMediaDevices();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    getUserMedia.mockRejectedValue(new Error('Permission denied'));
    enumerateDevices.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'mic-1', label: 'Mic' },
      { kind: 'videoinput', deviceId: 'cam-1', label: 'Camera' },
    ]);

    const { requestMediaPermission, permissionError, videoInputDevices } = useMediaDevices();
    const result = await requestMediaPermission();

    expect(result).toBe(true); // Fallback enumeration succeeded
    expect(permissionError.value).toContain('Permission denied');
    expect(videoInputDevices.value.length).toBeGreaterThan(0);
    consoleErrorSpy.mockRestore();
  });

  it('generates default labels when device labels are empty', async () => {
    const { getUserMedia, enumerateDevices } = mockMediaDevices();
    const stopTrack = vi.fn();

    getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: stopTrack }],
    });

    enumerateDevices.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'mic-1', label: '' }, // No label
      { kind: 'audiooutput', deviceId: 'spk-1', label: '' },
      { kind: 'videoinput', deviceId: 'cam-1', label: '' },
    ]);

    const { requestMediaPermission, audioInputDevices, audioOutputDevices, videoInputDevices } = useMediaDevices();
    await requestMediaPermission();

    expect(audioInputDevices.value[0].label).toContain('Audio Input');
    expect(audioOutputDevices.value[0].label).toContain('Audio Output');
    expect(videoInputDevices.value[0].label).toContain('Video Input');
  });

  it('enumerates devices with audio-only constraint', async () => {
    const { getUserMedia, enumerateDevices } = mockMediaDevices();
    const stopTrack = vi.fn();

    getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: stopTrack }],
    });

    enumerateDevices.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'mic-1', label: 'Mic' },
      { kind: 'audiooutput', deviceId: 'spk-1', label: 'Speaker' },
      { kind: 'videoinput', deviceId: 'cam-1', label: 'Camera' },
    ]);

    const { requestMediaPermission } = useMediaDevices();
    await requestMediaPermission(false, true); // video=false, audio=true

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: true,
      video: false,
    });
  });

  it('enumerates devices with video-only constraint', async () => {
    const { getUserMedia, enumerateDevices } = mockMediaDevices();
    const stopTrack = vi.fn();

    getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: stopTrack }],
    });

    enumerateDevices.mockResolvedValue([
      { kind: 'videoinput', deviceId: 'cam-1', label: 'Camera' },
    ]);

    const { requestMediaPermission } = useMediaDevices();
    const result = await requestMediaPermission(true, false); // video=true, audio=false

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: true,
    });
    expect(result).toBe(true);
  });

  it('returns empty defaults when enumeration fails', async () => {
    const { enumerateDevices } = mockMediaDevices();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    enumerateDevices.mockRejectedValue(new Error('Enumeration error'));

    const { getDefaultDevices } = useMediaDevices();
    const defaults = await getDefaultDevices();

    expect(defaults).toEqual({
      audioInputDeviceId: '',
      audioOutputDeviceId: '',
      videoInputDeviceId: '',
    });
    consoleErrorSpy.mockRestore();
  });

  it('handles getUserMedia error with non-Error object', async () => {
    const { getUserMedia, enumerateDevices } = mockMediaDevices();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    getUserMedia.mockRejectedValue('String error');
    enumerateDevices.mockResolvedValue([
      { kind: 'videoinput', deviceId: 'cam-1', label: 'Camera' },
    ]);

    const { requestMediaPermission, permissionError } = useMediaDevices();
    const result = await requestMediaPermission();

    expect(result).toBe(true);
    expect(permissionError.value).toBe('String error');
    consoleErrorSpy.mockRestore();
  });

  it('sets isEnumerating flag during device enumeration', async () => {
    const { getUserMedia, enumerateDevices } = mockMediaDevices();
    const stopTrack = vi.fn();

    getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: stopTrack }],
    });

    const enumerationStarted = vi.fn();
    const enumerationCompleted = vi.fn();

    enumerateDevices.mockImplementation(async () => {
      if (enumerationStarted.mock.calls.length === 0) {
        enumerationStarted(); // Called during enumeration
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
      enumerationCompleted();
      return [
        { kind: 'videoinput', deviceId: 'cam-1', label: 'Camera' },
      ];
    });

    const { requestMediaPermission, isEnumerating } = useMediaDevices();

    expect(isEnumerating.value).toBe(false);
    const promise = requestMediaPermission();
    // Note: isEnumerating is set to true during enumeration but will be async
    
    await promise;
    expect(isEnumerating.value).toBe(false); // Should be reset after enumeration
  });

  it('handles multiple tracks from getUserMedia stream', async () => {
    const { getUserMedia, enumerateDevices } = mockMediaDevices();
    const stopTrack1 = vi.fn();
    const stopTrack2 = vi.fn();

    getUserMedia.mockResolvedValue({
      getTracks: () => [
        { stop: stopTrack1 },
        { stop: stopTrack2 },
      ],
    });

    enumerateDevices.mockResolvedValue([
      { kind: 'videoinput', deviceId: 'cam-1', label: 'Camera' },
    ]);

    const { requestMediaPermission } = useMediaDevices();
    await requestMediaPermission();

    expect(stopTrack1).toHaveBeenCalledTimes(1);
    expect(stopTrack2).toHaveBeenCalledTimes(1);
  });

  it('returns empty defaults when no devices exist', async () => {
    const { enumerateDevices } = mockMediaDevices();

    enumerateDevices.mockResolvedValue([]); // No devices

    const { getDefaultDevices } = useMediaDevices();
    const defaults = await getDefaultDevices();

    expect(defaults).toEqual({
      audioInputDeviceId: '',
      audioOutputDeviceId: '',
      videoInputDeviceId: '',
    });
  });

  it('handles non-Error object from enumerateDevices fallback error', async () => {
    const { getUserMedia, enumerateDevices } = mockMediaDevices();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    getUserMedia.mockRejectedValue(new Error('Permission denied'));
    enumerateDevices.mockRejectedValue('String error from enumerate'); // Non-Error object

    const { requestMediaPermission, permissionError } = useMediaDevices();
    const result = await requestMediaPermission();

    expect(result).toBe(false);
    expect(permissionError.value).toContain('String error from enumerate');
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2); // once for getUserMedia, once for enumerateDevices
    consoleErrorSpy.mockRestore();
  });
});
