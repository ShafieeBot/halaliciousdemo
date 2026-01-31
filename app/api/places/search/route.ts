import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { PlaceFilter, PlacesSearchResponse } from '@/lib/types';
import { API_CONFIG } from '@/lib/constants';
import { sanitizeInput, hasNonEmptyValues } from '@/lib/utils';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const filter: PlaceFilter = body?.filter || {};

    // If empty filter => return all
    if (!hasNonEmptyValues(filter)) {
      const { data, error } = await supabase
        .from('places')
        .select('*')
        .limit(API_CONFIG.MAX_PLACES_LIMIT);

      if (error) {
        return NextResponse.json({ error: error.message } as PlacesSearchResponse, { status: 500 });
      }
      return NextResponse.json({ places: data ?? [] } as PlacesSearchResponse);
    }

    // Build query with AND logic for different filter types
    let query = supabase.from('places').select('*');

    // Cuisine filter (cuisine_subtype OR cuisine_category) - applied as AND
    const cuisineSubtype = sanitizeInput(filter.cuisine_subtype);
    const cuisineCategory = sanitizeInput(filter.cuisine_category);

    if (cuisineSubtype || cuisineCategory) {
      const cuisineConditions: string[] = [];
      if (cuisineSubtype) {
        cuisineConditions.push(`cuisine_subtype.ilike.%${cuisineSubtype}%`);
      }
      if (cuisineCategory) {
        cuisineConditions.push(`cuisine_category.ilike.%${cuisineCategory}%`);
      }
      query = query.or(cuisineConditions.join(','));
    }

    // Location/keyword filter (name OR address OR city) - applied as AND with cuisine
    const keyword = sanitizeInput(filter.keyword);
    if (keyword) {
      query = query.or(
        `name.ilike.%${keyword}%,address.ilike.%${keyword}%,city.ilike.%${keyword}%`
      );
    }

    // Tag filter - applied as AND
    const tag = sanitizeInput(filter.tag);
    if (tag) {
      query = query.contains('tags', [tag]);
    }

    // Price filter - applied as AND
    const priceLevel = sanitizeInput(filter.price_level);
    if (priceLevel) {
      query = query.ilike('price_level', `%${priceLevel}%`);
    }

    // Handle search_terms array (legacy support) - loose OR search
    if (filter.search_terms && Array.isArray(filter.search_terms) && filter.search_terms.length > 0) {
      const orConditions: string[] = [];
      for (const term of filter.search_terms) {
        const t = sanitizeInput(term);
        if (!t) continue;
        orConditions.push(
          `name.ilike.%${t}%`,
          `address.ilike.%${t}%`,
          `city.ilike.%${t}%`,
          `cuisine_subtype.ilike.%${t}%`,
          `cuisine_category.ilike.%${t}%`
        );
      }
      if (orConditions.length > 0) {
        query = query.or(orConditions.join(','));
      }
    }

    const { data, error } = await query.limit(API_CONFIG.MAX_PLACES_LIMIT);

    if (error) {
      return NextResponse.json({ error: error.message } as PlacesSearchResponse, { status: 500 });
    }
    return NextResponse.json({ places: data ?? [] } as PlacesSearchResponse);

  } catch (e: unknown) {
    const error = e as Error;
    return NextResponse.json(
      { error: error?.message || 'Unexpected server error' } as PlacesSearchResponse,
      { status: 500 }
    );
  }
}
