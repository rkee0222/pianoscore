import type { Score } from './types';

const DB_NAME = 'scoreflow';
const STORE = 'scores';
const VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveScore(score: Score): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE, 'readwrite');
  transaction.objectStore(STORE).put(score);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function listScores(): Promise<Score[]> {
  const database = await openDatabase();
  const scores = await requestResult(database.transaction(STORE).objectStore(STORE).getAll()) as Score[];
  database.close();
  return scores.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteScore(id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE, 'readwrite');
  transaction.objectStore(STORE).delete(id);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}
