// app/api/places/search/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function dayNameUTCPlus9(now = new Date()) {
  // Tokyo time (JST) is UTC+9
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[jst.getUTCDay()];
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const filter = body?.filter || {};

    // If empty filter => return all (or you can choose to return []
    const hasAny = Object.values(filter).some(
      (v: any) => v !== null && v !== undefined && String(v).trim() !== ''
    );
    if (!hasAny) {
      const { data, error } = await supabase.from('places').select('*').limit(2000);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ places: data ?? [] });
    }

    let q = supabase.from('places').select('*');

    // cuisine_subtype
    if (filter.cuisine_subtype) {
      q = q.ilike('cuisine_subtype', `%${filter.cuisine_subtype}%`);
    }

    // cuisine_category
    if (filter.cuisine_category) {
      q = q.ilike('cuisine_category', `%${filter.cuisine_category}%`);
    }

    // halal_status
    if (filter.halal_status) {
      q = q.ilike('halal_status', `%${filter.halal_status}%`);
    }

    // price_level (exact match preferred)
    if (filter.price_level) {
      q = q.eq('price_level', filter.price_level);
    }

    // tag (tags array contains)
    if (filter.tag) {
      // Postgres array contains
      q = q.contains('tags', [filter.tag]);
    }

    // keyword search (name/address/city/cuisine/tags)
    if (filter.keyword) {
      const k = String(filter.keyword).replace(/,/g, ' ').trim();
      // Use OR condition across columns. tags is array; easiest is text cast match.
      q = q.or(
        [
          `name.ilike.%${k}%`,
          `address.ilike.%${k}%`,
          `city.ilike.%${k}%`,
          `cuisine_subtype.ilike.%${k}%`,
          `cuisine_category.ilike.%${k}%`,
          `tags.cs.{${k}}`, // array contains (best-effort if tag exactly matches a token)
        ].join(',')
      );
    }

    // open_now (basic: must have opening_hours and mention today's day name)
    if (filter.open_now === true) {
      const day = dayNameUTCPlus9();
      // opening_hours is jsonb; we can do a text ilike on its JSON representation
      q = q
        .not('opening_hours', 'is', null)
        .neq('opening_hours', '[]')
        .ilike('opening_hours::text' as any, `%${day}%`);
    }

    const { data, error } = await q.limit(2000);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ places: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected server error' }, { status: 500 });
  }
}
