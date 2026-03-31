import { ref } from 'vue';

export const NO_WEBCAM_DEVICE_ID = '__no_webcam__';

export interface MediaDeviceOption {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput' | 'videoinput';
}

export function useMediaDevices() {
  const audioInputDevices = ref<MediaDeviceOption[]>([]);
  const audioOutputDevices = ref<MediaDeviceOption[]>([]);
  const videoInputDevices = ref<MediaDeviceOption[]>([]);
  const permissionError = ref<string | null>(null);
  const isEnumerating = ref(false);

  async function requestMediaPermission(includeVideo = true) {
    try {
      permissionError.value = null;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: includeVideo
      });

      // Stop the tracks immediately - we only need permission
      stream.getTracks().forEach(track => track.stop());

      // Now enumerate devices
      return await enumerateDevices();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('Media permission error:', error);
      permissionError.value = errorMsg;

      // Still try to enumerate - some devices might be available without video
      try {
        return await enumerateDevices();
      } catch (e) {
        console.error('Failed to enumerate devices:', e);
        return false;
      }
    }
  }

  async function enumerateDevices() {
    try {
      isEnumerating.value = true;
      const devices = await navigator.mediaDevices.enumerateDevices();

      audioInputDevices.value = devices
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Audio Input ${audioInputDevices.value.length + 1}`,
          kind: 'audioinput'
        }));

      audioOutputDevices.value = devices
        .filter(device => device.kind === 'audiooutput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Audio Output ${audioOutputDevices.value.length + 1}`,
          kind: 'audiooutput'
        }));

      videoInputDevices.value = devices
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Video Input ${videoInputDevices.value.length + 1}`,
          kind: 'videoinput'
        }));

      return videoInputDevices.value.length > 0;
    } catch (error) {
      console.error('Error enumerating devices:', error);
      permissionError.value = `Failed to enumerate devices: ${error instanceof Error ? error.message : String(error)}`;
      return false;
    } finally {
      isEnumerating.value = false;
    }
  }

  async function getDefaultDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const firstAudioInput = devices.find(d => d.kind === 'audioinput');
      const firstAudioOutput = devices.find(d => d.kind === 'audiooutput');
      const firstVideoInput = devices.find(d => d.kind === 'videoinput');

      return {
        audioInputDeviceId: firstAudioInput?.deviceId || '',
        audioOutputDeviceId: firstAudioOutput?.deviceId || '',
        videoInputDeviceId: firstVideoInput?.deviceId || ''
      };
    } catch (error) {
      console.error('Failed to get default devices:', error);
      return {
        audioInputDeviceId: '',
        audioOutputDeviceId: '',
        videoInputDeviceId: ''
      };
    }
  }

  return {
    audioInputDevices,
    audioOutputDevices,
    videoInputDevices,
    permissionError,
    isEnumerating,
    requestMediaPermission,
    enumerateDevices,
    getDefaultDevices
  };
}
