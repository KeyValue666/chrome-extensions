const DB_NAME = 'xtab-assets';
const DB_VERSION = 1;
const STORE_NAME = 'assets';
const WALLPAPER_KEY = 'wallpaper';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开 IndexedDB'));
  });

  return dbPromise;
}

/**
 * 壁纸体积远大于 storage.local 的额度，单独放 IndexedDB：
 * 浏览器对本扩展本地存储的配额更宽松，也不会拖慢配置的读写。
 */
async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = run(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 操作失败'));
  });
}

export async function putWallpaper(blob: Blob): Promise<void> {
  await withStore('readwrite', (store) => store.put(blob, WALLPAPER_KEY));
}

export async function getWallpaper(): Promise<Blob | null> {
  const value = await withStore<unknown>('readonly', (store) => store.get(WALLPAPER_KEY));
  return value instanceof Blob ? value : null;
}

export async function deleteWallpaper(): Promise<void> {
  await withStore('readwrite', (store) => store.delete(WALLPAPER_KEY));
}
