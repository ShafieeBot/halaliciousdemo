import { NextResponse } from 'next/server';

interface SuggestionData {
  name: string;
  address: string;
  city?: string;
  cuisineType?: string;
  halalStatus?: string;
  phone?: string;
  website?: string;
  notes?: string;
  submitterEmail?: string;
}

export async function POST(req: Request) {
  try {
    const body: SuggestionData = await req.json();

    // Validate required fields
    if (!body.name?.trim() || !body.address?.trim()) {
      return NextResponse.json(
        { error: 'Restaurant name and address are required.' },
        { status: 400 }
      );
    }

    // Sanitize and prepare data
    const suggestionData = {
      name: body.name.trim().slice(0, 200),
      address: body.address.trim().slice(0, 500),
      city: body.city?.trim().slice(0, 100) || null,
      cuisine_type: body.cuisineType?.trim().slice(0, 100) || null,
      halal_status: body.halalStatus?.trim().slice(0, 100) || null,
      phone: body.phone?.trim().slice(0, 50) || null,
      website: body.website?.trim().slice(0, 500) || null,
      notes: body.notes?.trim().slice(0, 1000) || null,
      submitter_email: body.submitterEmail?.trim().slice(0, 200) || null,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    // Log the suggestion for now
    // TODO: Set up a place_suggestions table in Supabase and insert there
    // For now, we log it so you can see submissions in server logs
    console.log('=== NEW PLACE SUGGESTION ===');
    console.log(JSON.stringify(suggestionData, null, 2));
    console.log('============================');

    // In production, you'd insert into Supabase:
    // const { error } = await supabase.from('place_suggestions').insert(suggestionData);

    return NextResponse.json({ success: true, message: 'Suggestion submitted successfully' });

  } catch (e: unknown) {
    const error = e as Error;
    console.error('Suggest API error:', error);
    return NextResponse.json(
      { error: error?.message || 'Unexpected server error' },
      { status: 500 }
    );
  }
}
