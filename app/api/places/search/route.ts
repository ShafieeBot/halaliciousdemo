// app/api/places/search/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Sanitize user input to prevent injection attacks
function sanitize(str: string | null | undefined): string | null {
  if (!str || typeof str !== 'string') return null;
  // Remove potential SQL/query injection characters and limit length
  return str.replace(/[%_'"\\]/g, '').trim().slice(0, 100) || null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const filter = body?.filter || {};

    // If empty filter => return all
    const hasAny = Object.values(filter).some(
      (v: unknown) => v !== null && v !== undefined &&
      (Array.isArray(v) ? v.length > 0 : String(v).trim() !== '')
    );

    if (!hasAny) {
      const { data, error } = await supabase.from('places').select('*').limit(2000);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ places: data ?? [] });
    }

    // Build query with AND logic for different filter types
    let query = supabase.from('places').select('*');

    // Cuisine filter (cuisine_subtype OR cuisine_category) - applied as AND
    const cuisineSubtype = sanitize(filter.cuisine_subtype);
    const cuisineCategory = sanitize(filter.cuisine_category);

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
    const keyword = sanitize(filter.keyword);
    if (keyword) {
      query = query.or(
        `name.ilike.%${keyword}%,address.ilike.%${keyword}%,city.ilike.%${keyword}%`
      );
    }

    // Tag filter - applied as AND
    const tag = sanitize(filter.tag);
    if (tag) {
      query = query.contains('tags', [tag]);
    }

    // Price filter - applied as AND
    const priceLevel = sanitize(filter.price_level);
    if (priceLevel) {
      query = query.ilike('price_level', `%${priceLevel}%`);
    }

    // Handle search_terms array (legacy support) - loose OR search
    if (filter.search_terms && Array.isArray(filter.search_terms) && filter.search_terms.length > 0) {
      const orConditions: string[] = [];
      for (const term of filter.search_terms) {
        const t = sanitize(term);
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

    const { data, error } = await query.limit(2000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ places: data ?? [] });

  } catch (e: unknown) {
    const error = e as Error;
    return NextResponse.json({ error: error?.message || 'Unexpected server error' }, { status: 500 });
  }
}
