'use client';

import { useMemo } from 'react';
import { X, MapPin, Star } from 'lucide-react';
import { Place } from '@/lib/types';
import { favorites } from '@/lib/storage';

interface FavoritesPanelProps {
  places: Place[];
  onSelectPlace: (place: Place) => void;
  onClose: () => void;
}

export default function FavoritesPanel({ places, onSelectPlace, onClose }: FavoritesPanelProps) {
  // Use useMemo instead of useState + useEffect to avoid cascading re-renders
  const favoritePlaces = useMemo(() => {
    const favIds = favorites.getAll();
    return places.filter(p => favIds.includes(p.id));
  }, [places]);

  return (
    <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-20 w-80 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 flex flex-col max-h-[60vh] animate-in fade-in slide-in-from-top-4 duration-200">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white/50 rounded-t-2xl">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <Star className="w-4 h-4 text-rose-500 fill-current" />
          My Favorites
        </h3>
        <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="overflow-y-auto p-2">
        {favoritePlaces.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            <p>No favorites yet!</p>
            <p className="text-xs mt-2">Click the heart icon on a place to save it.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {favoritePlaces.map(place => (
              <button
                key={place.id}
                onClick={() => {
                  onSelectPlace(place);
                  onClose();
                }}
                className="w-full text-left p-2 hover:bg-blue-50 rounded-xl transition flex items-start gap-3 group"
              >
                <div className="mt-1 bg-blue-100 p-1.5 rounded-full text-blue-600 group-hover:bg-blue-200 transition">
                  <MapPin className="w-3 h-3" />
                </div>
                <div>
                  <div className="font-medium text-gray-900 group-hover:text-blue-700">{place.name}</div>
                  <div className="text-xs text-gray-500">{place.cuisine_subtype || place.cuisine_category}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
