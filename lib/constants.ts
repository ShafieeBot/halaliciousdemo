/**
 * Shared constants for the app
 */

// LocalStorage keys
export const STORAGE_KEYS = {
  FAVORITES: 'halal_favorites',
  GUEST_QUERIES_USED: 'halalicious_guest_queries_used',
  LAST_MAP_POSITION: 'halalicious_last_map_position',
} as const;

// Guest mode configuration
export const GUEST_CONFIG = {
  MAX_FREE_QUERIES: 3,
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
  NAME: 'Halalicious',
  DESCRIPTION: 'Your AI-powered halal guide for Japan',
} as const;

// Halal status configuration - single source of truth for pin colors and labels
export const HALAL_STATUS = {
  CERTIFIED: {
    value: 'Certified',
    label: 'Halal Certified',
    color: '#10B981',
    borderColor: '#059669',
    description: 'Officially halal certified restaurant',
    confidenceBoost: 40,
  },
  MUSLIM_FRIENDLY: {
    value: 'Muslim Friendly',
    label: 'Muslim Friendly',
    color: '#3B82F6',
    borderColor: '#2563EB',
    description: 'Accommodates Muslim dietary needs',
    confidenceBoost: 25,
  },
  UNVERIFIED: {
    value: 'Unverified',
    label: 'Unverified',
    color: '#9CA3AF',
    borderColor: '#6B7280',
    description: 'Halal status not yet verified',
    confidenceBoost: 0,
  },
} as const;

// Get halal status config by value
export function getHalalStatusConfig(status: string | null | undefined) {
  if (!status) return HALAL_STATUS.UNVERIFIED;
  const normalized = status.toLowerCase();
  if (normalized.includes('certified')) return HALAL_STATUS.CERTIFIED;
  if (normalized.includes('muslim') || normalized.includes('friendly')) return HALAL_STATUS.MUSLIM_FRIENDLY;
  return HALAL_STATUS.UNVERIFIED;
}
