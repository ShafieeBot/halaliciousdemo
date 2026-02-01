/**
 * Safe localStorage utilities with SSR support
 */

import { STORAGE_KEYS, GUEST_CONFIG } from './constants';

/**
 * Check if we're in a browser environment
 */
const isBrowser = typeof window !== 'undefined';

/**
 * Safely get a value from localStorage
 */
export function getStorageItem<T>(key: string, fallback: T): T {
  if (!isBrowser) return fallback;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Safely set a value in localStorage
 */
export function setStorageItem(key: string, value: unknown): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }
}

// Favorites-specific utilities
export const favorites = {
  /**
   * Get all favorite place IDs
   */
  getAll(): string[] {
    return getStorageItem<string[]>(STORAGE_KEYS.FAVORITES, []);
  },

  /**
   * Check if a place is favorited
   */
  isFavorite(placeId: string): boolean {
    return this.getAll().includes(placeId);
  },

  /**
   * Add a place to favorites
   */
  add(placeId: string): void {
    const current = this.getAll();
    if (!current.includes(placeId)) {
      setStorageItem(STORAGE_KEYS.FAVORITES, [...current, placeId]);
    }
  },

  /**
   * Remove a place from favorites
   */
  remove(placeId: string): void {
    const current = this.getAll();
    setStorageItem(
      STORAGE_KEYS.FAVORITES,
      current.filter((id) => id !== placeId)
    );
  },

  /**
   * Toggle a place's favorite status
   * Returns the new status (true = favorited, false = removed)
   */
  toggle(placeId: string): boolean {
    if (this.isFavorite(placeId)) {
      this.remove(placeId);
      return false;
    } else {
      this.add(placeId);
      return true;
    }
  },
};

// Guest query tracking for unauthenticated users
export const guestQueries = {
  /**
   * Get the number of queries used by guest
   */
  getUsedCount(): number {
    return getStorageItem<number>(STORAGE_KEYS.GUEST_QUERIES_USED, 0);
  },

  /**
   * Check if guest has remaining free queries
   */
  hasRemainingQueries(): boolean {
    return this.getUsedCount() < GUEST_CONFIG.MAX_FREE_QUERIES;
  },

  /**
   * Get remaining query count
   */
  getRemainingCount(): number {
    return Math.max(0, GUEST_CONFIG.MAX_FREE_QUERIES - this.getUsedCount());
  },

  /**
   * Increment the used query count
   */
  incrementUsed(): void {
    const current = this.getUsedCount();
    setStorageItem(STORAGE_KEYS.GUEST_QUERIES_USED, current + 1);
  },

  /**
   * Reset guest query count (for testing or admin purposes)
   */
  reset(): void {
    setStorageItem(STORAGE_KEYS.GUEST_QUERIES_USED, 0);
  },
};

// Map position persistence
export const mapPosition = {
  /**
   * Save current map position
   */
  save(center: { lat: number; lng: number }, zoom: number): void {
    setStorageItem(STORAGE_KEYS.LAST_MAP_POSITION, { center, zoom });
  },

  /**
   * Get saved map position
   */
  get(): { center: { lat: number; lng: number }; zoom: number } | null {
    return getStorageItem<{ center: { lat: number; lng: number }; zoom: number } | null>(
      STORAGE_KEYS.LAST_MAP_POSITION,
      null
    );
  },

  /**
   * Clear saved position
   */
  clear(): void {
    if (!isBrowser) return;
    try {
      localStorage.removeItem(STORAGE_KEYS.LAST_MAP_POSITION);
    } catch {
      // Ignore errors
    }
  },
};
