import { ref } from "vue";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

type PendingUpdate = NonNullable<Awaited<ReturnType<typeof check>>>;

const DEFAULT_UPDATE_PULSE_MS = 30 * 60 * 1000;

const isUpdateAvailable = ref(false);
const availableVersion = ref<string | null>(null);
const isCheckingForUpdate = ref(false);
const isInstallingUpdate = ref(false);

let pendingUpdate: PendingUpdate | null = null;
let pulseTimer: ReturnType<typeof setInterval> | null = null;

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

  if (isCheckingForUpdate.value) {
    return;
  }

  isCheckingForUpdate.value = true;

  try {
    const update = await check();

    if (!update) {
      pendingUpdate = null;
      isUpdateAvailable.value = false;
      availableVersion.value = null;
      return;
    }

    pendingUpdate = update;
    isUpdateAvailable.value = true;
    availableVersion.value = update.version;
  } catch (error) {
    console.error("Auto-update check failed:", error);
  } finally {
    isCheckingForUpdate.value = false;
  }
}

export async function installAvailableUpdate(): Promise<void> {
  if (!isTauriRuntime() || !pendingUpdate || isInstallingUpdate.value) {
    return;
  }

  isInstallingUpdate.value = true;

  try {
    await pendingUpdate.downloadAndInstall();

    pendingUpdate = null;
    isUpdateAvailable.value = false;
    availableVersion.value = null;

    const shouldRelaunch = window.confirm(
      "Update installed. Restart now to finish applying it?"
    );

    if (shouldRelaunch) {
      await relaunch();
    }
  } catch (error) {
    console.error("Auto-update install failed:", error);
  } finally {
    isInstallingUpdate.value = false;
  }
}

export function startAutoUpdaterPulse(intervalMs = DEFAULT_UPDATE_PULSE_MS): void {
  if (!isTauriRuntime()) {
    return;
  }

  if (pulseTimer) {
    return;
  }

  pulseTimer = setInterval(() => {
    void runAutoUpdater();
  }, intervalMs);
}

export function stopAutoUpdaterPulse(): void {
  if (!pulseTimer) {
    return;
  }

  clearInterval(pulseTimer);
  pulseTimer = null;
}

export function useAutoUpdaterState() {
  return {
    isUpdateAvailable,
    availableVersion,
    isCheckingForUpdate,
    isInstallingUpdate,
  };
}
