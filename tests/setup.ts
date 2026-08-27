/**
 * Vitest global setup — runs before every test file.
 * Provides browser globals that modules imported by tests may touch at
 * module scope (e.g. src/integrations/supabase/client.ts reads
 * localStorage when constructing its auth storage).
 */

const store = new Map<string, string>();

const localStorageStub: Storage = {
  get length() {
    return store.size;
  },
  clear: () => store.clear(),
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  removeItem: (k: string) => void store.delete(k),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
};

if (typeof (globalThis as any).localStorage === "undefined") {
  (globalThis as any).localStorage = localStorageStub;
}

if (typeof (globalThis as any).sessionStorage === "undefined") {
  (globalThis as any).sessionStorage = { ...localStorageStub };
}
