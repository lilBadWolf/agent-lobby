import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ === "object"
  );
}

export async function runAutoUpdater(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    const update = await check();

    if (!update) {
      return;
    }

    const shouldInstall = window.confirm(
      `A new version (${update.version}) is available. Download and install now?`
    );

    if (!shouldInstall) {
      return;
    }

    await update.downloadAndInstall();

    const shouldRelaunch = window.confirm(
      "Update installed. Restart now to finish applying it?"
    );

    if (shouldRelaunch) {
      await relaunch();
    }
  } catch (error) {
    console.error("Auto-update check failed:", error);
  }
}
