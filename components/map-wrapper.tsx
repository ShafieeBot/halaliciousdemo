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

    const handleFilter = (filter: any) => {
        // If filter is empty or all null, show all places
        const hasActiveFilter = filter && Object.values(filter).some(v => v !== null && v !== undefined && v !== '');
        
        if (!hasActiveFilter) {
            setPlaces(initialPlaces);
            return;
        }

        let result = initialPlaces;

        // Filter by cuisine_subtype
        if (filter.cuisine_subtype) {
            result = result.filter(p => 
                p.cuisine_subtype?.toLowerCase().includes(filter.cuisine_subtype.toLowerCase())
            );
        }

        // Filter by cuisine_category
        if (filter.cuisine_category) {
            result = result.filter(p => 
                p.cuisine_category?.toLowerCase().includes(filter.cuisine_category.toLowerCase())
            );
        }

        // Filter by price_level
        if (filter.price_level) {
            const priceMap: Record<string, number> = {
                'Budget': 1,
                '$': 1,
                'Mid-range': 2,
                '$$': 2,
                'Fine Dining': 3,
                '$$$': 3,
                '$$$$': 4
            };
            const targetLevel = priceMap[filter.price_level] || 2;
            result = result.filter(p => {
                if (!p.price_level) return targetLevel <= 2; // Include unknown as budget-friendly
                const placeLevel = priceMap[p.price_level] || 2;
                return placeLevel <= targetLevel;
            });
        }

        // Filter by tag
        if (filter.tag) {
            result = result.filter(p => 
                p.tags && p.tags.some(t => t.toLowerCase().includes(filter.tag.toLowerCase()))
            );
        }

        // Filter by favorites
        if (filter.favorites) {
            const favorites = JSON.parse(localStorage.getItem('halal_favorites') || '[]');
            result = result.filter(p => favorites.includes(p.id));
        }

        // Filter by keyword (search in name, cuisine, tags, address, AND city)
        if (filter.keyword) {
            const k = filter.keyword.toLowerCase();
            result = result.filter(p =>
                p.name.toLowerCase().includes(k) ||
                p.cuisine_subtype?.toLowerCase().includes(k) ||
                p.cuisine_category?.toLowerCase().includes(k) ||
                p.city?.toLowerCase().includes(k) ||  // ✅ Added city search
                p.address?.toLowerCase().includes(k) ||
                (p.tags && p.tags.some(t => t.toLowerCase().includes(k)))
            );
        }

        console.log(`Filter applied:`, filter, `→ ${result.length} places`);
        setPlaces(result);
    };

    const handleSelectPlaceByName = (placeName: string) => {
        const place = initialPlaces.find(p => p.name === placeName);
        if (place) {
            setSelectedPlace(place);
        }
    };

    return (
        <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''} libraries={['places']}>
            <div className="flex h-screen w-full overflow-hidden">
                <div className="flex-1 relative flex">
                    <PlaceDetailSidebar
                        place={selectedPlace}
                        onClose={() => setSelectedPlace(null)}
                    />
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
                        <RestaurantMap
                            places={places}
                            selectedPlace={selectedPlace}
                            onSelectPlace={setSelectedPlace}
                        />
                    </div>
                </div>
                <ChatInterface
                    places={places}
                    onFilterChange={handleFilter}
                    onSelectPlace={handleSelectPlaceByName}
                />
            </div>
        </APIProvider>
    );
}
