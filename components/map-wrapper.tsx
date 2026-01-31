'use client';

import { useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import RestaurantMap from '@/components/map';
import ChatInterface from '@/components/chat';
import PlaceDetailSidebar from '@/components/place-detail-sidebar';
import FloatingMenu from '@/components/floating-menu';
import FavoritesPanel from '@/components/favorites-panel';
import { Place, PlaceFilter } from '@/lib/types';
import { favorites } from '@/lib/storage';

interface MapWrapperProps {
  initialPlaces: Place[];
}

export default function MapWrapper({ initialPlaces }: MapWrapperProps) {
  const [places, setPlaces] = useState<Place[]>(initialPlaces);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  /**
   * AI-driven filtering:
   * - AI returns filter params for matching
   * - We POST to /api/places/search to query DB
   */
  const handleFilter = async (filter: PlaceFilter) => {
    // If filter is empty => reset to all places
    if (!filter || Object.keys(filter).length === 0) {
      setPlaces(initialPlaces);
      setSearchError(null);
      return;
    }

    // Favorites: client-side (localStorage)
    if (filter.favorites) {
      const favIds = favorites.getAll();
      const favPlaces = initialPlaces.filter((p) => favIds.includes(p.id));
      setPlaces(favPlaces);
      setSearchError(null);
      return;
    }

    // Query DB with AI-generated filter
    setIsFiltering(true);
    setSearchError(null);

    try {
      const res = await fetch('/api/places/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error('places/search failed:', data?.error || res.statusText);
        setSearchError('Search failed. Please try again.');
        return;
      }

      const newPlaces: Place[] = Array.isArray(data?.places) ? data.places : [];
      setPlaces(newPlaces);

      // Close sidebar if selected place is no longer visible
      if (selectedPlace && !newPlaces.some((p) => p.id === selectedPlace.id)) {
        setSelectedPlace(null);
      }
    } catch (e) {
      console.error('handleFilter error:', e);
      setSearchError('Network error. Please check your connection.');
    } finally {
      setIsFiltering(false);
    }
  };

  const handleSelectPlaceByName = (placeName: string) => {
    // search in current places first (because places is now DB-driven)
    const place = places.find((p) => p.name === placeName) || initialPlaces.find((p) => p.name === placeName);
    if (place) setSelectedPlace(place);
  };

  const dismissError = () => setSearchError(null);

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

            {/* Error Toast */}
            {searchError && (
              <div
                className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center gap-2 animate-in fade-in slide-in-from-top-2"
                onClick={dismissError}
              >
                <span>{searchError}</span>
                <button className="text-white/80 hover:text-white ml-2">&times;</button>
              </div>
            )}

            {/* Loading Overlay */}
            {isFiltering && (
              <div className="absolute inset-0 bg-white/30 flex items-center justify-center z-40 pointer-events-none">
                <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent"></div>
              </div>
            )}

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
