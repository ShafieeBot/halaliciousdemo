'use client';

import { useState, useEffect } from 'react';
import {
    Map,
    AdvancedMarker,
    Pin,
    InfoWindow,
    useMap
} from '@vis.gl/react-google-maps';
import { Place } from '@/lib/types';
import { MAP_CONFIG } from '@/lib/constants';

interface MapProps {
    places: Place[];
    selectedPlace: Place | null;
    onSelectPlace: (place: Place | null) => void;
}

export default function RestaurantMap({ places, selectedPlace, onSelectPlace }: MapProps) {
    const defaultCenter = MAP_CONFIG.DEFAULT_CENTER;
    const [hoveredPlace, setHoveredPlace] = useState<Place | null>(null);

    const activePlace = hoveredPlace || selectedPlace;

    return (
        <div className="h-full w-full">
            <Map
                defaultCenter={defaultCenter}
                defaultZoom={12}
                mapId="Restaurant-Map-ID" // Needed for Advanced Markers
                fullscreenControl={false}
                gestureHandling={'greedy'}
            >
                {places.map((place) => {
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
                        <div className="p-2 max-w-xs">
                            <h3 className="font-bold text-lg">{activePlace.name}</h3>
                            <p className="text-sm text-gray-600 mb-1">{activePlace.cuisine_subtype || activePlace.cuisine_category}</p>
                            <div className="flex gap-2 text-xs mb-2">
                                {activePlace.halal_status === 'Certified' && (
                                    <span className="bg-green-100 text-green-800 px-1 rounded">Halal Certified</span>
                                )}
                                {activePlace.price_level && (
                                    <span className="bg-gray-100 px-1 rounded">{activePlace.price_level}</span>
                                )}
                            </div>
                            <p className="text-xs truncate">{activePlace.address}</p>
                            {activePlace.google_maps_url && (
                                <a
                                    href={activePlace.google_maps_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block mt-2 text-blue-600 text-xs hover:underline"
                                >
                                    View on Google Maps
                                </a>
                            )}
                        </div>
                    </InfoWindow>
                )}
                {/* ... existing markers ... */}
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

        // Otherwise fit bounds to all places
        if (places.length === 0) return;

        const bounds = new google.maps.LatLngBounds();
        let validPoints = 0;
        places.forEach(p => {
            if (p.lat && p.lng) {
                bounds.extend({ lat: p.lat, lng: p.lng });
                validPoints++;
            }
        });

        if (validPoints > 0) {
            map.fitBounds(bounds, 50); // 50px padding
        }
    }, [places, selectedPlace, map]);

    return null;
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
    // Color coding based on status
    let background = '#FBBC04'; // Default yellow
    let borderColor = '#E3aa00';

    if (place.halal_status === 'Certified') {
        background = '#10B981'; // Green
        borderColor = '#059669';
    } else if (place.halal_status === 'Muslim Friendly') {
        background = '#3B82F6'; // Blue
        borderColor = '#2563EB';
    }

    return (
        <AdvancedMarker
            position={{ lat: place.lat!, lng: place.lng! }}
            onClick={() => onClick(place)}
            onMouseEnter={() => onMouseEnter(place)}
            onMouseLeave={() => onMouseLeave()}
        >
            <Pin background={background} borderColor={borderColor} glyphColor={'#fff'} />
        </AdvancedMarker>
    );
}
