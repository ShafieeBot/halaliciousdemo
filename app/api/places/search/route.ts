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

    // Build query with all filter options
    let query = supabase.from('places').select('*');
    const orConditions: string[] = [];

    // Handle cuisine_subtype (e.g., "Yakiniku", "Ramen")
    if (filter.cuisine_subtype) {
      orConditions.push(`cuisine_subtype.ilike.%${filter.cuisine_subtype}%`);
    }

    // Handle cuisine_category (e.g., "Japanese", "Indian")
    if (filter.cuisine_category) {
      orConditions.push(`cuisine_category.ilike.%${filter.cuisine_category}%`);
    }

    // Handle keyword (e.g., "Shibuya", location or name search)
    if (filter.keyword) {
      orConditions.push(
        `name.ilike.%${filter.keyword}%`,
        `address.ilike.%${filter.keyword}%`,
        `city.ilike.%${filter.keyword}%`
      );
    }

    // Handle tag filter
    if (filter.tag) {
      orConditions.push(`tags.cs.{${filter.tag}}`);
    }

    // Handle search_terms array (legacy support)
    if (filter.search_terms && Array.isArray(filter.search_terms)) {
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
    }

    // Apply OR conditions if any
    if (orConditions.length > 0) {
      query = query.or(orConditions.join(','));
    }

    // Apply price filter as AND condition
    if (filter.price_level) {
      query = query.ilike('price_level', `%${filter.price_level}%`);
    }

    const { data, error } = await query.limit(2000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ places: data ?? [] });

  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected server error' }, { status: 500 });
  }
}
