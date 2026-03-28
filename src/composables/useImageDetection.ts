import { ref } from 'vue';

export interface DetectedImage {
  uri: string;
  loaded: boolean;
  error: boolean;
}

// Safe image formats only
const SAFE_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];

export function useImageDetection() {
  const imageStates = ref<Map<string, DetectedImage>>(new Map());

  /**
   * Check if a URI is a valid image format
   */
  function isSafeImageUri(uri: string): boolean {
    try {
      const url = new URL(uri);
      const pathname = url.pathname.toLowerCase();
      const extension = pathname.split('.').pop() || '';
      return SAFE_IMAGE_EXTENSIONS.includes(extension);
    } catch {
      return false;
    }
  }

  /**
   * Extract image URIs from text using regex
   */
  function extractImageUris(text: string): string[] {
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const matches = text.match(urlRegex) || [];
    return matches.filter(uri => isSafeImageUri(uri));
  }

  /**
   * Check if text contains any image URIs
   */
  function hasImages(text: string): boolean {
    return extractImageUris(text).length > 0;
  }

  /**
   * Initialize image loading state
   */
  function initializeImage(uri: string): void {
    if (!imageStates.value.has(uri)) {
      imageStates.value.set(uri, {
        uri,
        loaded: false,
        error: false
      });
    }
  }

  /**
   * Mark image as successfully loaded
   */
  function markImageLoaded(uri: string): void {
    const state = imageStates.value.get(uri);
    if (state) {
      state.loaded = true;
      state.error = false;
    }
  }

  /**
   * Mark image as failed to load
   */
  function markImageError(uri: string): void {
    const state = imageStates.value.get(uri);
    if (state) {
      state.loaded = false;
      state.error = true;
    }
  }

  /**
   * Get image state
   */
  function getImageState(uri: string): DetectedImage | undefined {
    return imageStates.value.get(uri);
  }

  return {
    imageStates,
    isSafeImageUri,
    extractImageUris,
    hasImages,
    initializeImage,
    markImageLoaded,
    markImageError,
    getImageState
  };
}
