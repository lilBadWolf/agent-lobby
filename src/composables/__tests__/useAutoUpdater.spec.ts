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

import { runAutoUpdater } from '../useAutoUpdater';

describe('runAutoUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.spyOn(window, 'confirm').mockReturnValue(false);
  });

  it('returns early outside tauri runtime', async () => {
    await runAutoUpdater();

    expect(checkMock).not.toHaveBeenCalled();
  });

  it('checks for update and exits when none is available', async () => {
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    checkMock.mockResolvedValue(null);

    await runAutoUpdater();

    expect(checkMock).toHaveBeenCalledTimes(1);
    expect(relaunchMock).not.toHaveBeenCalled();
  });

  it('downloads update and relaunches after confirmation', async () => {
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined);

    checkMock.mockResolvedValue({
      version: '9.9.9',
      downloadAndInstall,
    });

    vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);

    await runAutoUpdater();

    expect(downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(relaunchMock).toHaveBeenCalledTimes(1);
  });

  it('logs failures without throwing', async () => {
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    checkMock.mockRejectedValue(new Error('network down'));

    await expect(runAutoUpdater()).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
  });
});
