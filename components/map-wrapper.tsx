'use client';

import { useState, useRef, useEffect } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { MessageCircle, X, ChevronUp } from 'lucide-react';
import RestaurantMap from '@/components/map';
import ChatInterface from '@/components/chat';
import PlaceDetailSidebar from '@/components/place-detail-sidebar';
import FloatingMenu from '@/components/floating-menu';
import FavoritesPanel from '@/components/favorites-panel';
import MoreMenuPanel from '@/components/more-menu-panel';
import MapLegend from '@/components/map-legend';
import FilterBar from '@/components/filter-bar';
import { Place, PlaceFilter } from '@/lib/types';
import { favorites } from '@/lib/storage';

interface PlaceRating {
  place_id: string;
  rating?: number;
  user_ratings_total?: number;
}

interface MapWrapperProps {
  initialPlaces: Place[];
}

export default function MapWrapper({ initialPlaces }: MapWrapperProps) {
  const [places, setPlaces] = useState<Place[]>(initialPlaces);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<PlaceFilter>({});
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Cache for Google Places ratings
  const ratingsCache = useRef<Map<string, PlaceRating>>(new Map());
  const [placesWithRatings, setPlacesWithRatings] = useState<(Place & { google_rating?: number; google_ratings_total?: number })[]>([]);

  // Fetch ratings for places from Google Places API
  const fetchRatings = async (placesToFetch: Place[]) => {
    // Get place_ids that we don't have cached
    const uncachedPlaces = placesToFetch.filter(
      (p) => p.place_id && !ratingsCache.current.has(p.place_id)
    );

    if (uncachedPlaces.length > 0) {
      try {
        const placeIds = uncachedPlaces.map((p) => p.place_id).filter(Boolean) as string[];
        const response = await fetch('/api/places/ratings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ placeIds }),
        });

        if (response.ok) {
          const data = await response.json();
          const ratings: PlaceRating[] = data.ratings || [];

          // Cache the results
          ratings.forEach((r) => {
            if (r.place_id) {
              ratingsCache.current.set(r.place_id, r);
            }
          });
        }
      } catch (e) {
        console.error('Failed to fetch ratings:', e);
      }
    }

    // Merge ratings into places
    const enriched = placesToFetch.map((p) => {
      const cached = p.place_id ? ratingsCache.current.get(p.place_id) : undefined;
      return {
        ...p,
        google_rating: cached?.rating,
        google_ratings_total: cached?.user_ratings_total,
      };
    });

    setPlacesWithRatings(enriched);
  };

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

      // Fetch Google ratings for the top places (for AI context)
      fetchRatings(newPlaces.slice(0, 10));

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
      <div className="flex flex-col md:flex-row h-screen w-full overflow-hidden">
        {/* Main map area */}
        <div className="flex-1 relative flex">
          <PlaceDetailSidebar place={selectedPlace} onClose={() => setSelectedPlace(null)} />

          <div className="flex-1 relative">
            <FloatingMenu
              onToggleFavorites={() => {
                setShowFavorites(!showFavorites);
                setShowMore(false);
              }}
              onToggleMore={() => {
                setShowMore(!showMore);
                setShowFavorites(false);
              }}
            />

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

            {showMore && (
              <MoreMenuPanel onClose={() => setShowMore(false)} />
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

            {/* Map Legend */}
            <MapLegend className="hidden md:block" />

            {/* Quick Filter Bar */}
            <FilterBar
              activeFilters={activeFilters}
              onFilterChange={(filter) => {
                setActiveFilters(filter);
                handleFilter(filter);
              }}
            />

            <RestaurantMap
              places={places}
              selectedPlace={selectedPlace}
              onSelectPlace={setSelectedPlace}
            />
          </div>
        </div>

        {/* Desktop: Right sidebar chat */}
        <div className="hidden md:block">
          <ChatInterface
            places={places}
            placesWithRatings={placesWithRatings}
            placesLoading={isFiltering}
            onFilterChange={handleFilter}
            onSelectPlace={handleSelectPlaceByName}
          />
        </div>

        {/* Mobile: Floating chat button */}
        {isMobile && !showMobileChat && (
          <button
            onClick={() => setShowMobileChat(true)}
            className="fixed bottom-6 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition"
          >
            <MessageCircle className="w-5 h-5" />
            <span className="text-sm font-medium">Ask AI</span>
          </button>
        )}

        {/* Mobile: Bottom sheet chat */}
        {isMobile && showMobileChat && (
          <div className="fixed inset-0 z-50 flex flex-col">
            {/* Backdrop */}
            <div
              className="flex-shrink-0 h-16 bg-black/30"
              onClick={() => setShowMobileChat(false)}
            />

            {/* Bottom sheet */}
            <div className="flex-1 bg-white rounded-t-2xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">
              {/* Handle bar */}
              <div className="flex items-center justify-center py-2 border-b border-gray-100">
                <button
                  onClick={() => setShowMobileChat(false)}
                  className="flex items-center gap-2 px-4 py-1 text-gray-500 hover:text-gray-700"
                >
                  <ChevronUp className="w-5 h-5 rotate-180" />
                  <span className="text-sm">Close</span>
                </button>
              </div>

              {/* Chat content */}
              <div className="flex-1 overflow-hidden">
                <ChatInterface
                  places={places}
                  placesWithRatings={placesWithRatings}
                  placesLoading={isFiltering}
                  onFilterChange={handleFilter}
                  onSelectPlace={(name) => {
                    handleSelectPlaceByName(name);
                    setShowMobileChat(false);
                  }}
                  isMobile
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </APIProvider>
  );
}
