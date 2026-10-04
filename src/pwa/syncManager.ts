import {
  getPendingMutations,
  removeMutation,
  updateMutationStatus,
  type SyncQueueItem,
} from "./db";

let isSyncing = false;

export async function processSyncQueue(
  onSuccessCallback?: () => void
): Promise<{ processed: number; errors: number }> {
  if (isSyncing) return { processed: 0, errors: 0 };
  if (!navigator.onLine) return { processed: 0, errors: 0 };

  isSyncing = true;
  let processed = 0;
  let errors = 0;

  try {
    const queue = await getPendingMutations();
    for (const item of queue) {
      await updateMutationStatus(item.id, "syncing");
      try {
        let endpoint = "/api/items";
        let body: Record<string, unknown> = {
          action: item.action,
          ...item.payload,
        };

        if (item.action === "batch-paste") {
          endpoint = "/api/items/batch-paste";
          body = item.payload;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.ok) {
          await removeMutation(item.id);
          processed++;
        } else {
          errors++;
          await updateMutationStatus(item.id, "failed", item.retryCount + 1);
        }
      } catch (e) {
        errors++;
        await updateMutationStatus(item.id, "failed", item.retryCount + 1);
      }
    }

    if (processed > 0 && onSuccessCallback) {
      onSuccessCallback();
    }
  } finally {
    isSyncing = false;
  }

  return { processed, errors };
}
