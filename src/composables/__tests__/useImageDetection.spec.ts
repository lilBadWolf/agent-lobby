import { describe, expect, it } from 'vitest';
import { useImageDetection } from '../useImageDetection';

describe('useImageDetection', () => {
  it('accepts only safe image URIs', () => {
    const { isSafeImageUri } = useImageDetection();

    expect(isSafeImageUri('https://example.com/photo.png')).toBe(true);
    expect(isSafeImageUri('https://example.com/photo.jpeg?size=large')).toBe(true);
    expect(isSafeImageUri('https://example.com/file.pdf')).toBe(false);
    expect(isSafeImageUri('not-a-valid-url')).toBe(false);
  });

  it('extracts image links from text and detects if any are present', () => {
    const { extractImageUris, hasImages } = useImageDetection();
    const text =
      'See https://cdn.test.com/one.jpg and https://cdn.test.com/two.webp plus https://cdn.test.com/readme.txt';

    expect(extractImageUris(text)).toEqual([
      'https://cdn.test.com/one.jpg',
      'https://cdn.test.com/two.webp',
    ]);
    expect(hasImages(text)).toBe(true);
    expect(hasImages('no links here')).toBe(false);
  });

  it('tracks image loading/error state transitions', () => {
    const {
      initializeImage,
      markImageLoaded,
      markImageError,
      getImageState,
      imageStates,
    } = useImageDetection();

    const uri = 'https://img.test.com/photo.gif';

    initializeImage(uri);
    expect(imageStates.value.size).toBe(1);
    expect(getImageState(uri)).toEqual({ uri, loaded: false, error: false });

    markImageLoaded(uri);
    expect(getImageState(uri)).toEqual({ uri, loaded: true, error: false });

    markImageError(uri);
    expect(getImageState(uri)).toEqual({ uri, loaded: false, error: true });
  });

  it('handles malformed URLs gracefully', () => {
    const { isSafeImageUri } = useImageDetection();

    expect(isSafeImageUri(':::not-valid-url:::')).toBe(false);
    expect(isSafeImageUri('http://[invalid]')).toBe(false);
    expect(isSafeImageUri('')).toBe(false);
  });

  it('marks image operations on non-existent URIs safely', () => {
    const { markImageLoaded, markImageError, getImageState } = useImageDetection();

    // Operating on URI that was never initialized (should not throw)
    markImageLoaded('https://nonexistent.example.com/image.png');
    expect(getImageState('https://nonexistent.example.com/image.png')).toBeUndefined();

    markImageError('https://nonexistent.example.com/image.png');
    expect(getImageState('https://nonexistent.example.com/image.png')).toBeUndefined();
  });

  it('extracts URLs but filters to only safe images', () => {
    const { extractImageUris } = useImageDetection();
    const text =
      'Check https://example.com/image.jpg and https://example.com/document.pdf and https://example.com/video.mp4';

    const result = extractImageUris(text);
    expect(result).toEqual(['https://example.com/image.jpg']);
    expect(result.length).toBe(1);
  });

  it('initializes same image URI only once', () => {
    const { initializeImage, imageStates } = useImageDetection();
    const uri = 'https://example.com/same.png';

    initializeImage(uri);
    const sizeAfterFirst = imageStates.value.size;

    initializeImage(uri); // Try to initialize again
    expect(imageStates.value.size).toBe(sizeAfterFirst); // Size unchanged
  });

  it('detects images with various safe extensions', () => {
    const { isSafeImageUri } = useImageDetection();

    expect(isSafeImageUri('https://example.com/a.jpg')).toBe(true);
    expect(isSafeImageUri('https://example.com/b.jpeg')).toBe(true);
    expect(isSafeImageUri('https://example.com/c.png')).toBe(true);
    expect(isSafeImageUri('https://example.com/d.gif')).toBe(true);
    expect(isSafeImageUri('https://example.com/e.webp')).toBe(true);
    expect(isSafeImageUri('https://example.com/f.svg')).toBe(true);
  });

  it('handles URLs without file extensions', () => {
    const { isSafeImageUri } = useImageDetection();

    expect(isSafeImageUri('https://example.com/image')).toBe(false);
    expect(isSafeImageUri('https://example.com/')).toBe(false);
  });

  it('handles case-insensitive extension matching', () => {
    const { isSafeImageUri } = useImageDetection();

    expect(isSafeImageUri('https://example.com/photo.PNG')).toBe(true);
    expect(isSafeImageUri('https://example.com/photo.JpEg')).toBe(true);
    expect(isSafeImageUri('https://example.com/photo.WEBP')).toBe(true);
  });

  it('extracts multiple URLs with single regex groups', () => {
    const { extractImageUris } = useImageDetection();
    const text = 'https://a.com/img1.jpg https://b.com/img2.png https://c.com/img3.gif';

    expect(extractImageUris(text).length).toBe(3);
  });

  it('handles text with no URLs at all', () => {
    const { extractImageUris, hasImages } = useImageDetection();
    const text = 'This is just plain text with no links';

    expect(extractImageUris(text)).toEqual([]);
    expect(hasImages(text)).toBe(false);
  });
});
