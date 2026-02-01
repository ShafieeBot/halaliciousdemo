/**
 * Shared type definitions for the app
 */

import { Database } from './supabase';

// Database types
export type Place = Database['public']['Tables']['places']['Row'];
export type PlaceInsert = Database['public']['Tables']['places']['Insert'];
export type PlaceUpdate = Database['public']['Tables']['places']['Update'];

// Chat types
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  showPlaces?: boolean;
  recommendedPlace?: string; // Exact name of a recommended place to show as clickable
}

// Filter types for search
export interface PlaceFilter {
  cuisine_subtype?: string | null;
  cuisine_category?: string | null;
  price_level?: string | null;
  tag?: string | null;
  keyword?: string | null;
  favorites?: boolean | null;
  search_terms?: string[];
  halal_status?: string | null; // Filter by halal status (e.g., 'Certified')
}

// API response types
export interface ChatAPIResponse {
  role?: string;
  content?: string;
  filter?: PlaceFilter;
  message?: string;
  recommended_place?: string;
  error?: string;
}

export interface PlacesSearchResponse {
  places: Place[];
  error?: string;
}

// Google Places types (for place details)
export interface PlaceDetails {
  photos?: google.maps.places.PlacePhoto[];
  rating?: number;
  user_ratings_total?: number;
  opening_hours?: google.maps.places.PlaceOpeningHours;
  reviews?: google.maps.places.PlaceReview[];
  website?: string;
  formatted_phone_number?: string;
  isOpen?: boolean;
}
