export interface MediaDeviceOption {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput' | 'videoinput';
}

export interface DetectedImage {
  uri: string;
  loaded: boolean;
  error: boolean;
}
