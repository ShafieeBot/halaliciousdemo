'use client';

import { useState } from 'react';
import { Database } from '@/lib/supabase';
import { APIProvider } from '@vis.gl/react-google-maps';
import RestaurantMap from '@/components/map';
import ChatInterface from '@/components/chat';
import PlaceDetailSidebar from '@/components/place-detail-sidebar';
import FloatingMenu from '@/components/floating-menu';
import FavoritesPanel from '@/components/favorites-panel';

type Place = Database['public']['Tables']['places']['Row'];

interface MapWrapperProps {
  initialPlaces: Place[];
}

export default function MapWrapper({ initialPlaces }: MapWrapperProps) {
  const [places, setPlaces] = useState<Place[]>(initialPlaces);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);

  /**
   * ✅ DB-driven filtering:
   * - chat returns a "filter" object (variables)
   * - we POST it to /api/places/search
   * - setPlaces() to exact DB results
   * - NO client-side filtering of initialPlaces
   */
  const handleFilter = async (filter: any) => {
    // If filter is empty or all null/empty => reset
    const hasActiveFilter =
      filter && Object.values(filter).some((v) => v !== null && v !== undefined && v !== '');

    if (!hasActiveFilter) {
      setPlaces(initialPlaces);
      return;
    }

    // Favorites: stays client-side (localStorage), same as your previous behavior
    if (filter?.favorites) {
      const favorites = JSON.parse(localStorage.getItem('halal_favorites') || '[]');
      const favPlaces = initialPlaces.filter((p) => favorites.includes(p.id));
      setPlaces(favPlaces);
      return;
    }

    try {
      const res = await fetch('/api/places/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error('places/search failed:', data?.error || res.statusText);
        return;
      }

      const newPlaces: Place[] = Array.isArray(data?.places) ? data.places : [];
      setPlaces(newPlaces);

      // If current selected place is no longer in results, close sidebar
      if (selectedPlace && !newPlaces.some((p) => p.id === selectedPlace.id)) {
        setSelectedPlace(null);
      }
    } catch (e) {
      console.error('handleFilter error:', e);
    }
  };

  const handleSelectPlaceByName = (placeName: string) => {
    // search in current places first (because places is now DB-driven)
    const place = places.find((p) => p.name === placeName) || initialPlaces.find((p) => p.name === placeName);
    if (place) setSelectedPlace(place);
  };

  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''} libraries={['places']}>
      <div className="flex h-screen w-full overflow-hidden">
        <div className="flex-1 relative flex">
          <PlaceDetailSidebar place={selectedPlace} onClose={() => setSelectedPlace(null)} />

          <div className="flex-1 relative">
            <FloatingMenu onToggleFavorites={() => setShowFavorites(!showFavorites)} />

            {showFavorites && (
              <FavoritesPanel
                places={initialPlaces}
                onSelectPlace={(place) => {
                  setSelectedPlace(place);
                  setShowFavorites(false);
                }}
                onClose={() => setShowFavorites(false)}
              />
            )}

            {/* ✅ Keep required MapProps exactly as your RestaurantMap expects */}
            <RestaurantMap
              places={places}
              selectedPlace={selectedPlace}
              onSelectPlace={setSelectedPlace}
            />
          </div>
        </div>

        <ChatInterface places={places} onFilterChange={handleFilter} onSelectPlace={handleSelectPlaceByName} />
      </div>
    </APIProvider>
  );
}
