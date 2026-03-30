import { ref, computed } from 'vue';

export interface VideoWindowState {
  user: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isOpen: boolean;
}

export function useVideoWindow() {
  const activeVideoWindow = ref<VideoWindowState | null>(null);

  /**
   * Initialize video call window with streams
   * In Tauri v2, window creation is handled differently
   * This is a placeholder for the video window integration
   */
  async function openVideoWindow(peerName: string, localStream: MediaStream, remoteStream: MediaStream) {
    try {
      // Store video window state
      activeVideoWindow.value = {
        user: peerName,
        localStream,
        remoteStream,
        isOpen: true,
      };

      // TODO: Implement Tauri v2 window creation for video display
      // For now, emit a notification that video call is active
      console.log(`Video call initiated with ${peerName}`);
      console.log('Local stream:', localStream);
      console.log('Remote stream:', remoteStream);

      return true;
    } catch (error) {
      console.error('Failed to open video window:', error);
      throw error;
    }
  }

  /**
   * Close the active video window
   */
  async function closeVideoWindow() {
    if (!activeVideoWindow.value) return;

    activeVideoWindow.value = null;
  }

  /**
   * Toggle audio in video window
   */
  function toggleAudioInWindow(enabled: boolean) {
    if (!activeVideoWindow.value?.localStream) return;

    activeVideoWindow.value.localStream.getAudioTracks().forEach(track => {
      track.enabled = enabled;
    });
  }

  /**
   * Toggle video in video window
   */
  function toggleVideoInWindow(enabled: boolean) {
    if (!activeVideoWindow.value?.localStream) return;

    activeVideoWindow.value.localStream.getVideoTracks().forEach(track => {
      track.enabled = enabled;
    });
  }

  /**
   * Check if video window is open
   */
  const isVideoWindowOpen = computed(() => activeVideoWindow.value !== null);

  return {
    activeVideoWindow: computed(() => activeVideoWindow.value),
    isVideoWindowOpen,
    openVideoWindow,
    closeVideoWindow,
    toggleAudioInWindow,
    toggleVideoInWindow,
  };
}
