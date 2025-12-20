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

    // Handle search_terms from AI - loose OR search across all text fields
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
        let q = supabase.from('places').select('*').or(orConditions.join(','));
        
        // Apply price filter if specified
        if (filter.price_level) {
          q = q.ilike('price_level', `%${filter.price_level}%`);
        }

        const { data, error } = await q.limit(2000);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ places: data ?? [] });
      }
    }

    // Fallback: return all places
    const { data, error } = await supabase.from('places').select('*').limit(2000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ places: data ?? [] });

  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected server error' }, { status: 500 });
  }
}
