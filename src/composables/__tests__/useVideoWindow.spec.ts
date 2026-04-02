import { describe, expect, it } from 'vitest';
import { useVideoWindow } from '../useVideoWindow';

function createMockStream() {
  const audioTrack = { enabled: true } as MediaStreamTrack;
  const videoTrack = { enabled: true } as MediaStreamTrack;

  return {
    stream: {
      getAudioTracks: () => [audioTrack],
      getVideoTracks: () => [videoTrack],
    } as MediaStream,
    audioTrack,
    videoTrack,
  };
}

describe('useVideoWindow', () => {
  it('opens and closes video window state', async () => {
    const { stream: local } = createMockStream();
    const { stream: remote } = createMockStream();
    const { openVideoWindow, closeVideoWindow, activeVideoWindow, isVideoWindowOpen } = useVideoWindow();

    const opened = await openVideoWindow('Echo', local, remote);

    expect(opened).toBe(true);
    expect(isVideoWindowOpen.value).toBe(true);
    expect(activeVideoWindow.value?.user).toBe('Echo');

    await closeVideoWindow();

    expect(isVideoWindowOpen.value).toBe(false);
    expect(activeVideoWindow.value).toBeNull();
  });

  it('toggles local audio/video track enabled state', async () => {
    const { stream: local, audioTrack, videoTrack } = createMockStream();
    const { stream: remote } = createMockStream();
    const { openVideoWindow, toggleAudioInWindow, toggleVideoInWindow } = useVideoWindow();

    await openVideoWindow('Delta', local, remote);

    toggleAudioInWindow(false);
    toggleVideoInWindow(false);

    expect(audioTrack.enabled).toBe(false);
    expect(videoTrack.enabled).toBe(false);
  });

  it('enables audio/video tracks when toggled on', async () => {
    const { stream: local, audioTrack, videoTrack } = createMockStream();
    const { stream: remote } = createMockStream();
    const { openVideoWindow, toggleAudioInWindow, toggleVideoInWindow } = useVideoWindow();

    await openVideoWindow('Foxtrot', local, remote);

    // Disable tracks first
    toggleAudioInWindow(false);
    toggleVideoInWindow(false);
    expect(audioTrack.enabled).toBe(false);
    expect(videoTrack.enabled).toBe(false);

    // Then enable them
    toggleAudioInWindow(true);
    toggleVideoInWindow(true);
    expect(audioTrack.enabled).toBe(true);
    expect(videoTrack.enabled).toBe(true);
  });

  it('guards against toggling when video window not open', () => {
    const { toggleAudioInWindow, toggleVideoInWindow } = useVideoWindow();

    // Should not throw when window is not open
    expect(() => toggleAudioInWindow(false)).not.toThrow();
    expect(() => toggleVideoInWindow(false)).not.toThrow();
  });

  it('closes video window when already closed', async () => {
    const { closeVideoWindow, isVideoWindowOpen } = useVideoWindow();

    // Should not throw or error when closing a non-existent window
    expect(isVideoWindowOpen.value).toBe(false);
    await closeVideoWindow();
    expect(isVideoWindowOpen.value).toBe(false);
  });

  it('handles multiple audio/video tracks', async () => {
    const audioTrack1 = { enabled: true } as MediaStreamTrack;
    const audioTrack2 = { enabled: true } as MediaStreamTrack;
    const videoTrack1 = { enabled: true } as MediaStreamTrack;
    const videoTrack2 = { enabled: true } as MediaStreamTrack;

    const local = {
      getAudioTracks: () => [audioTrack1, audioTrack2],
      getVideoTracks: () => [videoTrack1, videoTrack2],
    } as MediaStream;

    const { stream: remote } = createMockStream();
    const { openVideoWindow, toggleAudioInWindow, toggleVideoInWindow } = useVideoWindow();

    await openVideoWindow('Golf', local, remote);

    toggleAudioInWindow(false);
    toggleVideoInWindow(false);

    expect(audioTrack1.enabled).toBe(false);
    expect(audioTrack2.enabled).toBe(false);
    expect(videoTrack1.enabled).toBe(false);
    expect(videoTrack2.enabled).toBe(false);
  });

  it('stores peer name and streams in active video window', async () => {
    const { stream: local } = createMockStream();
    const { stream: remote } = createMockStream();
    const { openVideoWindow, activeVideoWindow } = useVideoWindow();

    await openVideoWindow('Hotel', local, remote);

    expect(activeVideoWindow.value?.user).toBe('Hotel');
    expect(activeVideoWindow.value?.isOpen).toBe(true);
    expect(activeVideoWindow.value?.localStream).toBeDefined();
    expect(activeVideoWindow.value?.remoteStream).toBeDefined();
  });

  it('reopens video window after closing', async () => {
    const { stream: local1 } = createMockStream();
    const { stream: remote1 } = createMockStream();
    const { stream: local2 } = createMockStream();
    const { stream: remote2 } = createMockStream();
    const { openVideoWindow, closeVideoWindow, activeVideoWindow } = useVideoWindow();

    await openVideoWindow('India', local1, remote1);
    expect(activeVideoWindow.value?.user).toBe('India');

    await closeVideoWindow();
    expect(activeVideoWindow.value).toBeNull();

    // Reopen with different peer
    await openVideoWindow('Juliet', local2, remote2);
    expect(activeVideoWindow.value?.user).toBe('Juliet');
  });
});
