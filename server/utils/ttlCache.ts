// Simple in-memory TTL cache. NOT for cross-instance/serverless consistency —
// if this app runs on multiple instances/containers, each instance has its own
// cache. That's fine for read-reduction purposes (worst case: a few extra
// reads per instance), but do not use this for anything requiring strict
// cross-instance consistency.

type CacheEntry<T> = { data: T; ts: number };

class TTLCache {
  private store = new Map<string, CacheEntry<any>>();

  async getOrFetch<T>(
    key: string,
    ttlMs: number,
    fetchFn: () => Promise<T>
  ): Promise<T> {
    const cached = this.store.get(key);
    if (cached && Date.now() - cached.ts < ttlMs) {
      return cached.data as T;
    }
    const data = await fetchFn();
    this.store.set(key, { data, ts: Date.now() });
    return data;
  }

  invalidate(key: string) {
    this.store.delete(key);
  }

  invalidateAll() {
    this.store.clear();
  }
}

export const ttlCache = new TTLCache();
