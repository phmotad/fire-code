export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  tags: string[];
}

export interface CacheOptions {
  ttl?: number;
  tags?: string[];
}

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;
  delete(key: string): Promise<void>;
  deleteByTag(tag: string): Promise<number>;
  has(key: string): Promise<boolean>;
  flush(): Promise<void>;
  stats(): CacheStats;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

export class MemoryCache implements Cache {
  private store = new Map<string, CacheEntry<unknown>>();
  private tagIndex = new Map<string, Set<string>>();
  private hits = 0;
  private misses = 0;

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) { this.misses++; return null; }
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return null;
    }
    this.hits++;
    return entry.value as T;
  }

  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    const { ttl = 0, tags = [] } = options;
    const expiresAt = ttl > 0 ? Date.now() + ttl * 1000 : 0;
    this.store.set(key, { value, expiresAt, tags });
    for (const tag of tags) {
      if (!this.tagIndex.has(tag)) this.tagIndex.set(tag, new Set());
      this.tagIndex.get(tag)!.add(key);
    }
  }

  async delete(key: string): Promise<void> {
    const entry = this.store.get(key);
    if (entry) {
      for (const tag of entry.tags) this.tagIndex.get(tag)?.delete(key);
      this.store.delete(key);
    }
  }

  async deleteByTag(tag: string): Promise<number> {
    const keys = this.tagIndex.get(tag) ?? new Set();
    let count = 0;
    for (const key of keys) { await this.delete(key); count++; }
    this.tagIndex.delete(tag);
    return count;
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  async flush(): Promise<void> {
    this.store.clear();
    this.tagIndex.clear();
    this.hits = 0;
    this.misses = 0;
  }

  stats(): CacheStats {
    const total = this.hits + this.misses;
    return { hits: this.hits, misses: this.misses, size: this.store.size, hitRate: total > 0 ? this.hits / total : 0 };
  }
}

export function buildCacheKey(...parts: string[]): string {
  return parts.map(p => p.replace(/[^a-zA-Z0-9_\-]/g, '_')).join(':');
}

export function withCache<T>(cache: Cache, key: string, fn: () => Promise<T>, options?: CacheOptions): Promise<T> {
  return cache.get<T>(key).then(cached => {
    if (cached !== null) return cached;
    return fn().then(value => cache.set(key, value, options).then(() => value));
  });
}
