// app/api/places/search/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function fetchRatings(placeIds: string[]) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return new Map();

  const ratings = new Map();

  for (const pid of placeIds.slice(0, 15)) {
    if (!pid || pid === 'N/A') continue;

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${pid}&fields=rating,user_ratings_total&key=${key}`;
    const res = await fetch(url);
    const json = await res.json();

    ratings.set(pid, {
      rating: json?.result?.rating ?? null,
      count: json?.result?.user_ratings_total ?? null,
    });
  }

  return ratings;
}

export async function POST(req: Request) {
  const { variables } = await req.json();

  let q = supabase
    .from('places')
    .select('*')
    .limit(50);

  if (variables.cuisine_subtype)
    q = q.ilike('cuisine_subtype', `%${variables.cuisine_subtype}%`);

  if (variables.halal_status)
    q = q.ilike('halal_status', `%${variables.halal_status}%`);

  if (variables.price_level)
    q = q.eq('price_level', variables.price_level);

  if (variables.location) {
    const k = variables.location;
    q = q.or(`name.ilike.%${k}%,address.ilike.%${k}%,city.ilike.%${k}%`);
  }

  const { data } = await q;
  let rows = data || [];

  if (variables.open_now === true) {
    rows = rows.filter(r => Array.isArray(r.opening_hours) && r.opening_hours.length > 0);
  }

  let ratings = new Map();
  if (variables.sort_by === 'rating') {
    ratings = await fetchRatings(rows.map(r => r.place_id));
    rows = rows
      .map(r => ({
        ...r,
        rating: ratings.get(r.place_id)?.rating ?? null,
        ratingCount: ratings.get(r.place_id)?.count ?? null,
      }))
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  }

  return NextResponse.json({
    places: rows,
  });
}
