/**
 * Shared constants for the app
 */

// LocalStorage keys
export const STORAGE_KEYS = {
  FAVORITES: 'halal_favorites',
} as const;

// Map configuration
export const MAP_CONFIG = {
  DEFAULT_CENTER: { lat: 35.6895, lng: 139.6917 }, // Tokyo
  DEFAULT_ZOOM: 11,
  MIN_ZOOM: 5,
  MAX_ZOOM: 18,
} as const;

// API configuration
export const API_CONFIG = {
  REQUEST_TIMEOUT: 30000, // 30 seconds
  MAX_PLACES_LIMIT: 2000,
  MAX_DISPLAY_PLACES: 10,
} as const;

// Input validation
export const VALIDATION = {
  MAX_SEARCH_LENGTH: 100,
} as const;

// App metadata
export const APP_INFO = {
  NAME: 'Tokyo Halal Map',
  DESCRIPTION: 'Finding the best halal food in Japan.',
} as const;
