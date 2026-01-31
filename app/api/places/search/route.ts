// app/api/places/search/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const filter = body?.filter || {};

    // If empty filter => return all
    const hasAny = Object.values(filter).some(
      (v: any) => v !== null && v !== undefined &&
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
    if (filter.cuisine_subtype || filter.cuisine_category) {
      const cuisineConditions: string[] = [];
      if (filter.cuisine_subtype) {
        cuisineConditions.push(`cuisine_subtype.ilike.%${filter.cuisine_subtype}%`);
      }
      if (filter.cuisine_category) {
        cuisineConditions.push(`cuisine_category.ilike.%${filter.cuisine_category}%`);
      }
      query = query.or(cuisineConditions.join(','));
    }

    // Location/keyword filter (name OR address OR city) - applied as AND with cuisine
    if (filter.keyword) {
      query = query.or(
        `name.ilike.%${filter.keyword}%,address.ilike.%${filter.keyword}%,city.ilike.%${filter.keyword}%`
      );
    }

    // Tag filter - applied as AND
    if (filter.tag) {
      query = query.contains('tags', [filter.tag]);
    }

    // Price filter - applied as AND
    if (filter.price_level) {
      query = query.ilike('price_level', `%${filter.price_level}%`);
    }

    // Handle search_terms array (legacy support) - loose OR search
    if (filter.search_terms && Array.isArray(filter.search_terms) && filter.search_terms.length > 0) {
      const orConditions: string[] = [];
      for (const term of filter.search_terms) {
        const t = String(term).trim();
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

  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected server error' }, { status: 500 });
  }
}
