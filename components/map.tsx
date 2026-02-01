'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Map,
    AdvancedMarker,
    Pin,
    InfoWindow,
    useMap
} from '@vis.gl/react-google-maps';
import { MarkerClusterer, SuperClusterAlgorithm } from '@googlemaps/markerclusterer';
import { Place } from '@/lib/types';
import { MAP_CONFIG, getHalalStatusConfig, HALAL_STATUS } from '@/lib/constants';

interface MapProps {
    places: Place[];
    selectedPlace: Place | null;
    onSelectPlace: (place: Place | null) => void;
}

export default function RestaurantMap({ places, selectedPlace, onSelectPlace }: MapProps) {
    const defaultCenter = MAP_CONFIG.DEFAULT_CENTER;
    const [hoveredPlace, setHoveredPlace] = useState<Place | null>(null);
    const [currentZoom, setCurrentZoom] = useState<number>(MAP_CONFIG.DEFAULT_ZOOM);

    const activePlace = hoveredPlace || selectedPlace;

    // Threshold for showing individual markers vs clusters
    const CLUSTER_ZOOM_THRESHOLD = 13;
    const shouldCluster = currentZoom < CLUSTER_ZOOM_THRESHOLD;

    // At low zoom levels, only show certified places to reduce clutter
    const visiblePlaces = shouldCluster
        ? places.filter(p => p.halal_status === 'Certified' || p.halal_status === 'Muslim Friendly')
        : places;

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
                {shouldCluster ? (
                    <ClusteredMarkers
                        places={visiblePlaces}
                        onSelectPlace={onSelectPlace}
                    />
                ) : (
                    visiblePlaces.map((place) => {
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
                    })
                )}

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

// Clustered markers component
function ClusteredMarkers({
    places,
    onSelectPlace
}: {
    places: Place[];
    onSelectPlace: (place: Place) => void;
}) {
    const map = useMap();
    const clustererRef = useRef<MarkerClusterer | null>(null);
    const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);

    useEffect(() => {
        if (!map) return;

        // Clear existing markers
        markersRef.current.forEach(marker => {
            marker.map = null;
        });
        markersRef.current = [];

        if (clustererRef.current) {
            clustererRef.current.clearMarkers();
        }

        // Create markers for each place
        const markers = places
            .filter(p => p.lat && p.lng)
            .map(place => {
                const statusConfig = getHalalStatusConfig(place.halal_status);

                // Create custom marker element
                const content = document.createElement('div');
                content.innerHTML = `
                    <div style="
                        width: 12px;
                        height: 12px;
                        background-color: ${statusConfig.color};
                        border: 2px solid ${statusConfig.borderColor};
                        border-radius: 50%;
                        cursor: pointer;
                    "></div>
                `;

                const marker = new google.maps.marker.AdvancedMarkerElement({
                    position: { lat: place.lat!, lng: place.lng! },
                    content: content,
                    title: place.name,
                });

                marker.addListener('click', () => {
                    onSelectPlace(place);
                });

                return marker;
            });

        markersRef.current = markers;

        // Create or update clusterer
        if (!clustererRef.current) {
            clustererRef.current = new MarkerClusterer({
                map,
                markers,
                algorithm: new SuperClusterAlgorithm({ radius: 100 }),
                renderer: {
                    render: ({ count, position }) => {
                        // Custom cluster renderer
                        const content = document.createElement('div');
                        const size = Math.min(60, 30 + Math.log(count) * 10);
                        content.innerHTML = `
                            <div style="
                                width: ${size}px;
                                height: ${size}px;
                                background: linear-gradient(135deg, ${HALAL_STATUS.CERTIFIED.color}, ${HALAL_STATUS.MUSLIM_FRIENDLY.color});
                                border: 3px solid white;
                                border-radius: 50%;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                color: white;
                                font-weight: bold;
                                font-size: ${Math.max(12, size / 3)}px;
                                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                                cursor: pointer;
                            ">${count}</div>
                        `;
                        return new google.maps.marker.AdvancedMarkerElement({
                            position,
                            content,
                        });
                    },
                },
            });
        } else {
            clustererRef.current.clearMarkers();
            clustererRef.current.addMarkers(markers);
        }

        return () => {
            markersRef.current.forEach(marker => {
                marker.map = null;
            });
        };
    }, [map, places, onSelectPlace]);

    return null;
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
        // Only fit bounds if we have filtered results (less than initial load)
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
