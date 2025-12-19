
import { supabase } from '@/lib/supabase';
import MapWrapper from '@/components/map-wrapper';

export const revalidate = 3600; // Revalidate every hour

export default async function Home() {
  // Fetch data server-side
  const { data: places, error } = await supabase
    .from('places')
    .select('*')
    .not('lat', 'is', null)
    .not('lng', 'is', null);

  if (error) {
    console.error('Error fetching places:', error);
    return <div>Error loading data.</div>;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-between">
      <div className="z-10 w-full items-center justify-between font-mono text-sm">
        <MapWrapper initialPlaces={places || []} />
      </div>

    </main>
  );
}
