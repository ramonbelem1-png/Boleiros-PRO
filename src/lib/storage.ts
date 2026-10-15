/**
 * Safe LocalStorage wrapper to prevent crashes in private browsing mode,
 * restricted WebViews (like WhatsApp/Instagram in-app browsers), or quota exceeded errors.
 */

export const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      return window.localStorage.getItem(key);
    } catch (e) {
      console.warn(`[SafeStorage] Could not read "${key}":`, e);
      return null;
    }
  },

  setItem: (key: string, value: string): void => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`[SafeStorage] Could not write "${key}":`, e);
    }
  },

  removeItem: (key: string): void => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.removeItem(key);
    } catch (e) {
      console.warn(`[SafeStorage] Could not remove "${key}":`, e);
    }
  },

  clear: (): void => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.clear();
    } catch (e) {
      console.warn('[SafeStorage] Could not clear storage:', e);
    }
  }
};
