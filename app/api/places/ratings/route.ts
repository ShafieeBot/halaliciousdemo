import { NextResponse } from 'next/server';

// Google Places API endpoint for fetching ratings
// This uses the Places API (New) which supports batch requests

interface PlaceRating {
  place_id: string;
  rating?: number;
  user_ratings_total?: number;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Google API key not configured' }, { status: 500 });
    }

    const body = await req.json();
    const placeIds: string[] = body.placeIds || [];

    if (!placeIds.length) {
      return NextResponse.json({ ratings: [] });
    }

    // Limit to 10 places to avoid rate limits
    const limitedIds = placeIds.slice(0, 10);

    // Fetch ratings for each place using Places API
    const ratings: PlaceRating[] = await Promise.all(
      limitedIds.map(async (placeId) => {
        try {
          // Use Places API (New) - Place Details
          const response = await fetch(
            `https://places.googleapis.com/v1/places/${placeId}?fields=rating,userRatingCount&key=${apiKey}`,
            {
              headers: {
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'rating,userRatingCount',
              },
            }
          );

          if (!response.ok) {
            console.error(`Failed to fetch rating for ${placeId}:`, response.status);
            return { place_id: placeId };
          }

          const data = await response.json();
          return {
            place_id: placeId,
            rating: data.rating,
            user_ratings_total: data.userRatingCount,
          };
        } catch (e) {
          console.error(`Error fetching rating for ${placeId}:`, e);
          return { place_id: placeId };
        }
      })
    );

    return NextResponse.json({ ratings });
  } catch (e: unknown) {
    const error = e as Error;
    console.error('Ratings API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
