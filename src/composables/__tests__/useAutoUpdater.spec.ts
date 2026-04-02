import { beforeEach, describe, expect, it, vi } from 'vitest';

const { relaunchMock, checkMock } = vi.hoisted(() => ({
  relaunchMock: vi.fn(),
  checkMock: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: relaunchMock,
}));

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: checkMock,
}));

import {
  installAvailableUpdate,
  runAutoUpdater,
  startAutoUpdaterPulse,
  stopAutoUpdaterPulse,
  useAutoUpdaterState,
} from '../useAutoUpdater';

describe('runAutoUpdater', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

    const updaterState = useAutoUpdaterState();
    updaterState.isUpdateAvailable.value = false;
    updaterState.availableVersion.value = null;
    updaterState.isCheckingForUpdate.value = false;
    updaterState.isInstallingUpdate.value = false;

    stopAutoUpdaterPulse();
  });

  it('returns early outside tauri runtime', async () => {
    await runAutoUpdater();

    expect(checkMock).not.toHaveBeenCalled();
  });

  it('checks for update and exits when none is available', async () => {
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    checkMock.mockResolvedValue(null);
    const updaterState = useAutoUpdaterState();

    await runAutoUpdater();

    expect(checkMock).toHaveBeenCalledTimes(1);
    expect(updaterState.isUpdateAvailable.value).toBe(false);
    expect(updaterState.availableVersion.value).toBeNull();
    expect(relaunchMock).not.toHaveBeenCalled();
  });

  it('stores update availability when found', async () => {
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
    const updaterState = useAutoUpdaterState();

    checkMock.mockResolvedValue({
      version: '9.9.9',
      downloadAndInstall,
    });

    await runAutoUpdater();

    expect(downloadAndInstall).not.toHaveBeenCalled();
    expect(updaterState.isUpdateAvailable.value).toBe(true);
    expect(updaterState.availableVersion.value).toBe('9.9.9');
  });

  it('downloads and relaunches when install is triggered', async () => {
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
    const updaterState = useAutoUpdaterState();

    checkMock.mockResolvedValue({
      version: '9.9.9',
      downloadAndInstall,
    });

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await runAutoUpdater();
    await installAvailableUpdate();

    expect(downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(updaterState.isUpdateAvailable.value).toBe(false);
    expect(updaterState.availableVersion.value).toBeNull();
    expect(relaunchMock).toHaveBeenCalledTimes(1);
  });

  it('logs failures without throwing', async () => {
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    checkMock.mockRejectedValue(new Error('network down'));

    await expect(runAutoUpdater()).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('starts a periodic update pulse', async () => {
    vi.useFakeTimers();
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    checkMock.mockResolvedValue(null);

    startAutoUpdaterPulse(1_000);
    await vi.advanceTimersByTimeAsync(2_100);

    expect(checkMock).toHaveBeenCalledTimes(2);
  });
});
