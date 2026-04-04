import { load, getStore, Store } from '@tauri-apps/plugin-store';

const APP_STORE_NAME = 'agent_app_state';
let appStore: Store | null = null;
let appStoreInitPromise: Promise<Store | null> | null = null;

//type StorageLogLevel = 'info' | 'warn' | 'error';

// function logPlatformStorage(level: StorageLogLevel, action: string, details?: Record<string, unknown>) {
//   const ts = new Date().toISOString();
//   const prefix = `[PlatformStorage] ${ts} ${action}`;

//   if (level === 'error') {
//     console.error(prefix, details ?? {});
//     return;
//   }

//   if (level === 'warn') {
//     console.warn(prefix, details ?? {});
//     return;
//   }

//   console.info(prefix, details ?? {});
// }

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ === 'object';
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined';
}

function parseLocalStorageValue<T>(rawValue: string): T {
  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return rawValue as T;
  }
}

async function getAppStore(): Promise<Store | null> {
  if (appStore) {
    //logPlatformStorage('info', 'store.cache.hit', { store: APP_STORE_NAME });
    return appStore;
  }

  if (appStoreInitPromise) {
    //logPlatformStorage('info', 'store.init.inflight', { store: APP_STORE_NAME });
    return appStoreInitPromise;
  }

  if (!isTauriRuntime()) {
    //logPlatformStorage('warn', 'store.init.skipped.non_tauri', { store: APP_STORE_NAME });
    return null;
  }

  //logPlatformStorage('info', 'store.init.start', { store: APP_STORE_NAME });
  appStoreInitPromise = (async () => {
    try {
      const existing = await getStore(APP_STORE_NAME);
      if (existing) {
        appStore = existing;
        //logPlatformStorage('info', 'store.init.reused', { store: APP_STORE_NAME });
        return existing;
      }

      const loaded = await load(APP_STORE_NAME, { defaults: {} });
      appStore = loaded;
      //logPlatformStorage('info', 'store.init.loaded', { store: APP_STORE_NAME });
      return loaded;
    } catch (error) {
      appStoreInitPromise = null;
      // logPlatformStorage('error', 'store.init.failed', {
      //   store: APP_STORE_NAME,
      //   error: error instanceof Error ? error.message : String(error),
      // });
      return null;
    }
  })();

  return appStoreInitPromise;
}

export async function getPersistedValue<T>(key: string): Promise<T | undefined> {
  if (typeof window === 'undefined') {
    //logPlatformStorage('warn', 'read.skipped.no_window', { key });
    return undefined;
  }

  try {
    const store = await getAppStore();
    if (store) {
      const value = await store.get<T>(key);
      // logPlatformStorage('info', 'read', {
      //   key,
      //   found: value !== undefined,
      //   value,
      // });
      if (value !== undefined) {
        return value;
      }
    }
  } catch {
    // ignore store errors
    //logPlatformStorage('error', 'read.failed', { key });
  }

  if (canUseLocalStorage()) {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        const value = parseLocalStorageValue<T>(raw);
        //logPlatformStorage('info', 'read.local_storage', {
        //  key,
        //  found: true,
        //  value,
        // });
        return value;
      }
    } catch (error) {
      //logPlatformStorage('warn', 'read.local_storage.failed', {
      //  key,
      //  error: error instanceof Error ? error.message : String(error),
      // });
    }
  }

  //logPlatformStorage('warn', 'read.unavailable', { key });

  return undefined;
}

export async function setPersistedValue<T>(key: string, value: T): Promise<void> {
  if (typeof window === 'undefined') {
    //logPlatformStorage('warn', 'write.skipped.no_window', { key });
    return;
  }

  try {
    const store = await getAppStore();
    if (store) {
      await store.set(key, value);
      await store.save();
      //logPlatformStorage('info', 'write', {
      //  key,
      //  value,
      //});
    }
  } catch (error) {
    // ignore store failures
    //logPlatformStorage('error', 'write.failed', {
    //  key,
    //  value,
    //  error: error instanceof Error ? error.message : String(error),
    //});
  }

  if (canUseLocalStorage()) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      //logPlatformStorage('info', 'write.mirror.local_storage', { key, value });
    } catch (error) {
      //logPlatformStorage('warn', 'write.mirror.local_storage.failed', {
      //  key,
      //  error: error instanceof Error ? error.message : String(error),
      //});
    }
  }
}

export async function removePersistedValue(key: string): Promise<void> {
  if (typeof window === 'undefined') {
    //logPlatformStorage('warn', 'delete.skipped.no_window', { key });
    return;
  }

  try {
    const store = await getAppStore();
    if (store) {
      await store.delete(key);
      await store.save();
      //logPlatformStorage('info', 'delete', { key });
    }
  } catch (error) {
    // ignore store failures
    //logPlatformStorage('error', 'delete.failed', {
    //  key,
    //  error: error instanceof Error ? error.message : String(error),
    //});
  }

  if (canUseLocalStorage()) {
    try {
      localStorage.removeItem(key);
      //logPlatformStorage('info', 'delete.mirror.local_storage', { key });
    } catch (error) {
      //logPlatformStorage('warn', 'delete.mirror.local_storage.failed', {
      //  key,
      //  error: error instanceof Error ? error.message : String(error),
      //});
    }
  }
}
