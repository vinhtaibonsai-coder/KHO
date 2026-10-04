import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Item, ItemHistory, ZaloMessage } from "@/types";

export interface SyncQueueItem {
  id: string;
  action: "remove" | "transfer" | "sold" | "restock" | "batch-paste";
  payload: Record<string, unknown>;
  status: "pending" | "syncing" | "failed" | "synced";
  retryCount: number;
  createdAt: number;
  updatedAt: number;
}

interface LuaNhutDB extends DBSchema {
  items: {
    key: string; // sku
    value: Item;
  };
  messages: {
    key: string; // message id
    value: ZaloMessage;
  };
  history: {
    key: string;
    value: ItemHistory;
  };
  syncQueue: {
    key: string;
    value: SyncQueueItem;
  };
  meta: {
    key: string;
    value: { key: string; value: unknown };
  };
}

const DB_NAME = "lua-nhut-pwa-db";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<LuaNhutDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<LuaNhutDB>> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Cannot access IndexedDB on server"));
  }

  if (!dbPromise) {
    dbPromise = openDB<LuaNhutDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore("items", { keyPath: "sku" });
          db.createObjectStore("messages", { keyPath: "id" });
          db.createObjectStore("history", { keyPath: "id" });
          db.createObjectStore("syncQueue", { keyPath: "id" });
          db.createObjectStore("meta", { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

// Lưu danh sách items vào IndexedDB
export async function saveLocalItems(items: Item[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("items", "readwrite");
  await tx.store.clear();
  for (const item of items) {
    await tx.store.put(item);
  }
  await tx.done;
}

// Lấy danh sách items từ IndexedDB
export async function getLocalItems(): Promise<Item[]> {
  const db = await getDB();
  return db.getAll("items");
}

// Lưu danh sách messages vào IndexedDB
export async function saveLocalMessages(messages: ZaloMessage[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("messages", "readwrite");
  await tx.store.clear();
  for (const m of messages) {
    await tx.store.put(m);
  }
  await tx.done;
}

export async function getLocalMessages(): Promise<ZaloMessage[]> {
  const db = await getDB();
  return db.getAll("messages");
}

// Lưu danh sách history vào IndexedDB
export async function saveLocalHistory(history: ItemHistory[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("history", "readwrite");
  await tx.store.clear();
  for (const h of history) {
    await tx.store.put(h);
  }
  await tx.done;
}

export async function getLocalHistory(): Promise<ItemHistory[]> {
  const db = await getDB();
  return db.getAll("history");
}

// Hàng đợi ngoại tuyến (Offline Mutation Queue)
export async function enqueueMutation(
  action: SyncQueueItem["action"],
  payload: Record<string, unknown>
): Promise<SyncQueueItem> {
  const db = await getDB();
  const now = Date.now();
  const queueItem: SyncQueueItem = {
    id: `queue_${now}_${Math.random().toString(36).slice(2, 7)}`,
    action,
    payload,
    status: "pending",
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await db.put("syncQueue", queueItem);
  return queueItem;
}

export async function getPendingMutations(): Promise<SyncQueueItem[]> {
  const db = await getDB();
  const all = await db.getAll("syncQueue");
  return all.filter((i) => i.status === "pending" || i.status === "failed");
}

export async function removeMutation(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("syncQueue", id);
}

export async function updateMutationStatus(
  id: string,
  status: SyncQueueItem["status"],
  retryCount?: number
): Promise<void> {
  const db = await getDB();
  const item = await db.get("syncQueue", id);
  if (item) {
    item.status = status;
    item.updatedAt = Date.now();
    if (typeof retryCount === "number") item.retryCount = retryCount;
    await db.put("syncQueue", item);
  }
}
