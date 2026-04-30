export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ === 'object';
}

let tauriCoreModulePromise: Promise<typeof import('@tauri-apps/api/core') | null> | null = null;
let tauriWindowModulePromise: Promise<typeof import('@tauri-apps/api/window') | null> | null = null;

export async function getTauriCoreModule(): Promise<typeof import('@tauri-apps/api/core') | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  if (!tauriCoreModulePromise) {
    tauriCoreModulePromise = import('@tauri-apps/api/core').catch(() => null);
  }

  return tauriCoreModulePromise;
}

export async function getTauriWindowModule(): Promise<typeof import('@tauri-apps/api/window') | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  if (!tauriWindowModulePromise) {
    tauriWindowModulePromise = import('@tauri-apps/api/window').catch(() => null);
  }

  return tauriWindowModulePromise;
}

export async function tauriInvoke<T = unknown>(message: string, payload?: unknown): Promise<T | null> {
  const core = await getTauriCoreModule();
  if (!core?.invoke) {
    return null;
  }

  return core.invoke<T>(message, payload as any);
}

export async function tauriGetCurrentWindow(): Promise<any> {
  const module = await getTauriWindowModule();
  if (!module?.getCurrentWindow) {
    return null;
  }

  return module.getCurrentWindow();
}
