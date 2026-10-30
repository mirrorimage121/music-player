const DB_NAME = 'pulse_os_offline_db_v1';
const DB_VERSION = 1;
const AUDIO_STORE = 'offline_audio_blobs';
const STATE_STORE = 'player_state';

export interface StoredAudioEntry {
  trackId: string;
  blob: Blob;
  mimeType: string;
  sizeBytes: number;
  cachedAt: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE, { keyPath: 'trackId' });
      }
      if (!db.objectStoreNames.contains(STATE_STORE)) {
        db.createObjectStore(STATE_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveOfflineAudioBlob(trackId: string, blob: Blob): Promise<StoredAudioEntry> {
  const db = await openDatabase();
  const entry: StoredAudioEntry = {
    trackId,
    blob,
    mimeType: blob.type || 'audio/mpeg',
    sizeBytes: blob.size,
    cachedAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, 'readwrite');
    tx.objectStore(AUDIO_STORE).put(entry);
    tx.oncomplete = () => resolve(entry);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getOfflineAudioBlob(trackId: string): Promise<StoredAudioEntry | null> {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_STORE, 'readonly');
      const req = tx.objectStore(AUDIO_STORE).get(trackId);
      req.onsuccess = () => resolve((req.result as StoredAudioEntry) || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function removeOfflineAudioBlob(trackId: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, 'readwrite');
    tx.objectStore(AUDIO_STORE).delete(trackId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listOfflineAudioMeta(): Promise<Record<string, { sizeBytes: number; cachedAt: number }>> {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_STORE, 'readonly');
      const req = tx.objectStore(AUDIO_STORE).getAll();
      req.onsuccess = () => {
        const list = (req.result as StoredAudioEntry[]) || [];
        const map: Record<string, { sizeBytes: number; cachedAt: number }> = {};
        for (const item of list) {
          map[item.trackId] = { sizeBytes: item.sizeBytes, cachedAt: item.cachedAt };
        }
        resolve(map);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return {};
  }
}

export async function savePersistedData<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STATE_STORE, 'readwrite');
      tx.objectStore(STATE_STORE).put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback to localStorage if IndexedDB unavailable
    try {
      localStorage.setItem(`pulse_${key}`, JSON.stringify(value));
    } catch {
      // Ignore quota errors
    }
  }
}

export async function loadPersistedData<T>(key: string): Promise<T | null> {
  try {
    const db = await openDatabase();
    const res = await new Promise<{ key: string; value: T } | undefined>((resolve, reject) => {
      const tx = db.transaction(STATE_STORE, 'readonly');
      const req = tx.objectStore(STATE_STORE).get(key);
      req.onsuccess = () => resolve(req.result as { key: string; value: T } | undefined);
      req.onerror = () => reject(req.error);
    });
    if (res && res.value !== undefined) return res.value;
  } catch {
    // Ignore IDB read errors
  }
  try {
    const raw = localStorage.getItem(`pulse_${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
