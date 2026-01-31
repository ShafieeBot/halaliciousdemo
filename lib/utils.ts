/**
 * Shared utility functions
 */

import { VALIDATION } from './constants';

/**
 * Sanitize user input to prevent injection attacks
 * Removes special characters and limits length
 */
export function sanitizeInput(str: string | null | undefined): string | null {
  if (!str || typeof str !== 'string') return null;
  // Remove potential SQL/query injection characters and limit length
  return str.replace(/[%_'"\\]/g, '').trim().slice(0, VALIDATION.MAX_SEARCH_LENGTH) || null;
}

/**
 * Check if an object has any non-empty values
 */
export function hasNonEmptyValues(obj: object): boolean {
  return Object.values(obj).some(
    (v) => v !== null && v !== undefined &&
    (Array.isArray(v) ? v.length > 0 : String(v).trim() !== '')
  );
}

/**
 * Safely parse JSON with a fallback
 */
export function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/**
 * Create a timeout promise that rejects after specified milliseconds
 */
export function createTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Request timeout')), ms);
  });
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}
