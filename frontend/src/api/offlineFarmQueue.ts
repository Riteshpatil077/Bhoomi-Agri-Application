import { createFarm, type CreateFarmPayload } from "./farms";

interface QueuedFarm {
  userId: string;
  requestId: string;
  payload: CreateFarmPayload;
  queuedAt: string;
}

const STORAGE_KEY = "bhoomi:pending-farms:v1";

function readQueue(): QueuedFarm[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value as QueuedFarm[] : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedFarm[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    return true;
  } catch {
    return false;
  }
}

export function countQueuedFarms(userId: string): number {
  return readQueue().filter((item) => item.userId === userId).length;
}

export function enqueueFarm(userId: string, payload: CreateFarmPayload): boolean {
  const requestId = payload.client_request_id;
  if (!requestId) throw new Error("Offline farm save requires a request ID.");
  const queue = readQueue();
  if (!queue.some((item) => item.userId === userId && item.requestId === requestId)) {
    queue.push({ userId, requestId, payload, queuedAt: new Date().toISOString() });
    return writeQueue(queue);
  }
  return true;
}

export async function syncQueuedFarms(userId: string): Promise<{ synced: number; remaining: number }> {
  const queue = readQueue();
  const pending = queue.filter((item) => item.userId === userId);
  let synced = 0;
  for (const item of pending) {
    if (!navigator.onLine) break;
    const response = await createFarm(item.payload);
    if (response.error) break;
    const current = readQueue();
    writeQueue(current.filter((candidate) => !(candidate.userId === item.userId && candidate.requestId === item.requestId)));
    synced += 1;
  }
  return { synced, remaining: countQueuedFarms(userId) };
}
