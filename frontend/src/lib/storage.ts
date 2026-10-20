/**
 * localStorage access that never throws (spec F0 §11: storage unavailable →
 * the app keeps working for the session, using an in-memory fallback).
 */
const memory = new Map<string, string>();

export const storageKeys = {
  theme: 'hm.theme',
  activeCompany: 'hm.activeCompany',
} as const;

export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memory.get(key) ?? null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      memory.set(key, value);
    }
  },
  remove(key: string): void {
    memory.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // memory entry already dropped
    }
  },
};
