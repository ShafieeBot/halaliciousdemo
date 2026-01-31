'use client';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { Database } from '@/lib/supabase';
import { X, Star, Clock, MapPin, Globe, Phone, Utensils, User, Heart, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';

type Place = Database['public']['Tables']['places']['Row'];

interface PlaceDetailSidebarProps {
    place: Place | null;
    onClose: () => void;
}

interface PlaceDetails {
    photos?: google.maps.places.PlacePhoto[];
    rating?: number;
    user_ratings_total?: number;
    opening_hours?: google.maps.places.PlaceOpeningHours;
    reviews?: google.maps.places.PlaceReview[];
    website?: string;
    formatted_phone_number?: string;
    isOpen?: boolean;
}

export default function PlaceDetailSidebar({ place, onClose }: PlaceDetailSidebarProps) {
    const placesLib = useMapsLibrary('places');
    const [details, setDetails] = useState<PlaceDetails | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Persist the last valid place to show during closing animation
    const [displayPlace, setDisplayPlace] = useState<Place | null>(place);
    const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);

    // Favorites Logic
    const [isFavorite, setIsFavorite] = useState(false);

    useEffect(() => {
        if (displayPlace && typeof window !== 'undefined') {
            try {
                const favorites = JSON.parse(localStorage.getItem('halal_favorites') || '[]');
                setIsFavorite(favorites.includes(displayPlace.id));
            } catch {
                setIsFavorite(false);
            }
        }
    }, [displayPlace]);

    // Define navigatePhoto BEFORE the effect that uses it
    const navigatePhoto = useCallback((direction: number) => {
        if (selectedPhotoIndex === null || !details?.photos) return;
        const newIndex = selectedPhotoIndex + direction;
        if (newIndex >= 0 && newIndex < details.photos.length) {
            setSelectedPhotoIndex(newIndex);
        }
    }, [selectedPhotoIndex, details?.photos]);

    // Keyboard navigation for lightbox
    useEffect(() => {
        if (selectedPhotoIndex === null) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setSelectedPhotoIndex(null);
            if (e.key === 'ArrowLeft') navigatePhoto(-1);
            if (e.key === 'ArrowRight') navigatePhoto(1);
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedPhotoIndex, navigatePhoto]);

    useEffect(() => {
        if (place) {
            setDisplayPlace(place);
        }
    }, [place]);

    useEffect(() => {
        if (!displayPlace?.place_id || !placesLib) {
            setDetails(null);
            return;
        }

        setLoading(true);
        setError(null);

        const service = new placesLib.PlacesService(document.createElement('div'));

        service.getDetails(
            {
                placeId: displayPlace.place_id,
                fields: ['photos', 'rating', 'user_ratings_total', 'opening_hours', 'reviews', 'website', 'formatted_phone_number']
            },
            (result, status) => {
                setLoading(false);
                if (status === placesLib.PlacesServiceStatus.OK && result) {
                    setDetails({
                        ...result,
                        isOpen: result.opening_hours?.isOpen ? result.opening_hours.isOpen() : undefined
                    });
                } else {
                    console.error("Places API failed:", status);
                    setError(`Google Details unavailable (${status})`);
                }
            }
        );
    }, [displayPlace, placesLib]);

    // Don't render until we have a place to display (initial load)
    if (!displayPlace) return null;

    const isOpen = !!place; // controlled by prop

    const toggleFavorite = () => {
        if (!displayPlace || typeof window === 'undefined') return;
        try {
            const favorites = JSON.parse(localStorage.getItem('halal_favorites') || '[]');
            let newFavorites;
            if (favorites.includes(displayPlace.id)) {
                newFavorites = favorites.filter((id: string) => id !== displayPlace.id);
            } else {
                newFavorites = [...favorites, displayPlace.id];
            }
            localStorage.setItem('halal_favorites', JSON.stringify(newFavorites));
            setIsFavorite(!isFavorite);
        } catch (e) {
            console.error('Failed to update favorites:', e);
        }
    };

    return (
        <div className={`absolute top-0 left-0 h-full w-96 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-20 overflow-y-auto ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            {/* Header Image */}
            <div className="relative h-48 bg-gray-200">
                <button
                    onClick={toggleFavorite}
                    className="absolute top-4 right-16 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full z-10 transition group"
                    title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
                >
                    <Heart className={`w-5 h-5 transition-transform group-hover:scale-110 ${isFavorite ? 'fill-rose-500 text-rose-500' : 'text-white'}`} />
                </button>
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full z-10 transition"
                >
                    <X className="w-5 h-5" />
                </button>
                {details?.photos && details.photos.length > 0 ? (
                    <>
                        <img
                            src={details.photos[0].getUrl({ maxWidth: 400, maxHeight: 300 })}
                            alt={displayPlace.name}
                            onClick={() => setSelectedPhotoIndex(0)}
                            className="w-full h-full object-cover cursor-zoom-in hover:brightness-110 transition"
                        />
                        <button
                            onClick={() => setSelectedPhotoIndex(0)}
                            className="absolute bottom-3 right-3 bg-black/60 hover:bg-black/80 text-white text-xs font-medium px-3 py-1.5 rounded-full backdrop-blur-md transition flex items-center gap-1.5"
                        >
                            <ImageIcon className="w-3 h-3" />
                            View Photos
                        </button>
                    </>
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gray-100">
                        <MapPin className="w-8 h-8 opacity-20 mb-2" />
                        <span className="text-xs">No Image Available</span>
                    </div>
                )}
            </div>

            <div className="p-6 space-y-6">
                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 leading-tight">{displayPlace.name}</h1>
                    <div className="flex items-center gap-2 text-gray-500 mt-1">
                        <Utensils className="w-4 h-4" />
                        <p className="text-sm font-medium">{displayPlace.cuisine_subtype || displayPlace.cuisine_category}</p>
                    </div>

                    {loading && <div className="text-xs text-blue-500 mt-2 animate-pulse">Loading details...</div>}
                    {error && <div className="text-xs text-orange-400 mt-2">{error}</div>}
                    {!displayPlace.place_id && <div className="text-xs text-gray-400 mt-2 italic">Database missing Place ID connection.</div>}

                    {details?.rating && (
                        <div className="flex items-center gap-2 mt-2">
                            <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                {details.rating} <Star className="w-3 h-3 fill-current" />
                            </span>
                            <span className="text-gray-500 text-sm">({details.user_ratings_total} reviews)</span>
                        </div>
                    )}
                </div>


                {/* Quick Info */}
                <div className="space-y-4 pt-4 border-t border-gray-100">
                    {/* Status */}
                    {details?.opening_hours && (
                        <div className="flex items-start gap-3">
                            <Clock className="w-5 h-5 text-gray-400 mt-0.5" />
                            <div>
                                <span className={`font-medium ${details.isOpen ? 'text-green-600' : 'text-red-500'}`}>
                                    {details.isOpen ? 'Open Now' : 'Closed'}
                                </span>
                                {details.opening_hours.weekday_text && (
                                    <div className="mt-1 text-xs text-gray-500 space-y-1">
                                        {details.opening_hours.weekday_text.map((day, i) => (
                                            <div key={i}>{day}</div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="flex items-start gap-3">
                        <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                        <p className="text-sm text-gray-600">{displayPlace.address}</p>
                    </div>

                    {details?.website && (
                        <a href={details.website} target="_blank" rel="noopener" className="flex items-center gap-3 group">
                            <Globe className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition" />
                            <span className="text-sm text-blue-600 hover:underline truncate w-64">{details.website}</span>
                        </a>
                    )}
                    {details?.formatted_phone_number && (
                        <div className="flex items-center gap-3">
                            <Phone className="w-5 h-5 text-gray-400" />
                            <span className="text-sm text-gray-600">{details.formatted_phone_number}</span>
                        </div>
                    )}
                </div>

                {/* Reviews */}
                {details?.reviews && details.reviews.length > 0 && (
                    <div className="pt-6 border-t border-gray-100">
                        <h3 className="font-semibold text-gray-900 mb-4">Recent Reviews</h3>
                        <div className="space-y-4">
                            {details.reviews.slice(0, 3).map((review, i) => (
                                <div key={i} className="bg-gray-50 p-3 rounded-xl">
                                    <div className="flex items-center gap-2 mb-2">
                                        {review.profile_photo_url ? (
                                            <img
                                                src={review.profile_photo_url}
                                                alt={review.author_name}
                                                className="w-6 h-6 rounded-full object-cover"
                                                onError={(e) => {
                                                    e.currentTarget.style.display = 'none';
                                                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                                }}
                                            />
                                        ) : null}
                                        <div className={`bg-gray-200 rounded-full p-1 ${review.profile_photo_url ? 'hidden' : ''}`}>
                                            <User className="w-4 h-4 text-gray-400" />
                                        </div>
                                        <span className="text-sm font-medium text-gray-800 truncate max-w-[150px]">{review.author_name}</span>
                                        <div className="flex text-yellow-500">
                                            {[...Array(5)].map((_, starI) => (
                                                <Star key={starI} className={`w-3 h-3 ${starI < (review.rating || 0) ? 'fill-current' : 'text-gray-300 fill-none'}`} />
                                            ))}
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed">"{review.text}"</p>
                                    <p className="text-[10px] text-gray-400 mt-2">{review.relative_time_description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="pt-6">
                    <a
                        href={displayPlace.google_maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayPlace.name + " " + displayPlace.address)}`}
                        target="_blank"
                        rel="noopener"
                        className="block w-full text-center bg-blue-600 text-white font-medium py-3 rounded-xl hover:bg-blue-700 transition shadow-lg shadow-blue-200"
                    >
                        View on Google Maps
                    </a>
                </div>
            </div>

            {/* Lightbox */}
            {selectedPhotoIndex !== null && details?.photos && createPortal(
                <div
                    className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-md flex items-center justify-center animate-in fade-in duration-200"
                    onClick={() => setSelectedPhotoIndex(null)}
                >
                    {/* Close Button */}
                    <button
                        onClick={() => setSelectedPhotoIndex(null)}
                        className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition z-50"
                    >
                        <X className="w-6 h-6" />
                    </button>

                    {/* Prev Button */}
                    {selectedPhotoIndex > 0 && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                navigatePhoto(-1);
                            }}
                            className="absolute left-4 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-3 transition z-50 group"
                        >
                            <ChevronLeft className="w-8 h-8 group-hover:-translate-x-1 transition-transform" />
                        </button>
                    )}

                    {/* Image */}
                    <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
                        <img
                            src={details.photos[selectedPhotoIndex].getUrl({ maxWidth: 1600, maxHeight: 1200 })}
                            alt={`Photo ${selectedPhotoIndex + 1}`}
                            className="max-h-[85vh] max-w-[90vw] object-contain rounded-md shadow-2xl"
                        />
                        <div className="absolute bottom-[-40px] left-0 right-0 text-center text-white/50 text-sm">
                            {selectedPhotoIndex + 1} / {details.photos.length}
                        </div>
                    </div>

                    {/* Next Button */}
                    {selectedPhotoIndex < details.photos.length - 1 && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                navigatePhoto(1);
                            }}
                            className="absolute right-4 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-3 transition z-50 group"
                        >
                            <ChevronRight className="w-8 h-8 group-hover:translate-x-1 transition-transform" />
                        </button>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
}
