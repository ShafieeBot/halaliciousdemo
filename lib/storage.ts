/**
 * Safe localStorage utilities with SSR support
 */

import { STORAGE_KEYS } from './constants';

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
