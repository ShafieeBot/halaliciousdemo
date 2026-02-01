'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Map,
    AdvancedMarker,
    Pin,
    InfoWindow,
    useMap
} from '@vis.gl/react-google-maps';
import { Place } from '@/lib/types';
import { MAP_CONFIG, getHalalStatusConfig } from '@/lib/constants';

interface MapProps {
    places: Place[];
    selectedPlace: Place | null;
    onSelectPlace: (place: Place | null) => void;
}

// Maximum markers to show at low zoom levels to reduce clutter
const MAX_MARKERS_LOW_ZOOM = 100;
const LOW_ZOOM_THRESHOLD = 12;

export default function RestaurantMap({ places, selectedPlace, onSelectPlace }: MapProps) {
    const defaultCenter = MAP_CONFIG.DEFAULT_CENTER;
    const [hoveredPlace, setHoveredPlace] = useState<Place | null>(null);
    const [currentZoom, setCurrentZoom] = useState<number>(MAP_CONFIG.DEFAULT_ZOOM);

    const activePlace = hoveredPlace || selectedPlace;

    // At low zoom levels, prioritize certified places and limit count to reduce clutter
    const visiblePlaces = useMemo(() => {
        if (currentZoom >= LOW_ZOOM_THRESHOLD) {
            return places;
        }

        // At low zoom, prioritize certified, then muslim-friendly, limit total
        const certified = places.filter(p => p.halal_status?.toLowerCase().includes('fully'));
        const muslimFriendly = places.filter(p => p.halal_status?.toLowerCase().includes('muslim'));

        // Combine and limit
        const combined = [...certified, ...muslimFriendly];
        return combined.slice(0, MAX_MARKERS_LOW_ZOOM);
    }, [places, currentZoom]);

    const handleZoomChanged = useCallback((zoom: number) => {
        setCurrentZoom(zoom);
    }, []);

    return (
        <div className="h-full w-full">
            <Map
                defaultCenter={defaultCenter}
                defaultZoom={MAP_CONFIG.DEFAULT_ZOOM}
                mapId="Restaurant-Map-ID"
                fullscreenControl={false}
                gestureHandling={'greedy'}
                onZoomChanged={(e) => handleZoomChanged(e.detail.zoom)}
            >
                {visiblePlaces.map((place) => {
                    if (!place.lat || !place.lng) return null;
                    return (
                        <RestaurantMarker
                            key={place.id}
                            place={place}
                            onClick={(p) => onSelectPlace(p)}
                            onMouseEnter={(p) => setHoveredPlace(p)}
                            onMouseLeave={() => setHoveredPlace(null)}
                        />
                    );
                })}

                {activePlace && activePlace.lat && activePlace.lng && (
                    <InfoWindow
                        position={{ lat: activePlace.lat, lng: activePlace.lng }}
                        onCloseClick={() => {
                            setHoveredPlace(null);
                            if (selectedPlace?.id === activePlace.id) {
                                onSelectPlace(null);
                            }
                        }}
                        pixelOffset={[0, -30]}
                    >
                        <PlaceInfoPopup place={activePlace} onViewDetails={() => onSelectPlace(activePlace)} />
                    </InfoWindow>
                )}

                <MapUpdater places={places} selectedPlace={selectedPlace} />
            </Map>
        </div>
    );
}

function MapUpdater({ places, selectedPlace }: { places: Place[], selectedPlace: Place | null }) {
    const map = useMap();

    useEffect(() => {
        if (!map) return;

        // If a place is selected, pan to it
        if (selectedPlace && selectedPlace.lat && selectedPlace.lng) {
            map.panTo({ lat: selectedPlace.lat, lng: selectedPlace.lng });
            map.setZoom(15);
            return;
        }

        // Don't auto-fit bounds on initial load - let user explore from Tokyo center
    }, [selectedPlace, map]);

    return null;
}

// Improved info popup for pin click
function PlaceInfoPopup({ place, onViewDetails }: { place: Place; onViewDetails: () => void }) {
    const statusConfig = getHalalStatusConfig(place.halal_status);

    return (
        <div className="p-2 max-w-xs min-w-[200px]">
            <h3 className="font-bold text-base leading-tight mb-1">{place.name}</h3>
            <p className="text-sm text-gray-600 mb-2">
                {place.cuisine_subtype || place.cuisine_category || 'Restaurant'}
            </p>

            {/* Halal status badge */}
            <div className="flex flex-wrap gap-1.5 mb-2">
                <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: statusConfig.color }}
                >
                    {statusConfig.label}
                </span>
                {place.price_level && (
                    <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-xs">
                        {place.price_level}
                    </span>
                )}
            </div>

            {/* Address */}
            {place.address && (
                <p className="text-xs text-gray-500 mb-2 line-clamp-2">{place.address}</p>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 pt-1 border-t border-gray-100">
                <button
                    onClick={onViewDetails}
                    className="flex-1 text-center py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 rounded transition"
                >
                    View Details
                </button>
                {place.google_maps_url && (
                    <a
                        href={place.google_maps_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-center py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition"
                    >
                        Directions
                    </a>
                )}
            </div>
        </div>
    );
}

function RestaurantMarker({
    place,
    onClick,
    onMouseEnter,
    onMouseLeave
}: {
    place: Place;
    onClick: (p: Place) => void;
    onMouseEnter: (p: Place) => void;
    onMouseLeave: () => void;
}) {
    // Use centralized halal status config for consistent colors
    const statusConfig = getHalalStatusConfig(place.halal_status);

    return (
        <AdvancedMarker
            position={{ lat: place.lat!, lng: place.lng! }}
            onClick={() => onClick(place)}
            onMouseEnter={() => onMouseEnter(place)}
            onMouseLeave={() => onMouseLeave()}
        >
            <Pin
                background={statusConfig.color}
                borderColor={statusConfig.borderColor}
                glyphColor={'#fff'}
            />
        </AdvancedMarker>
    );
}
