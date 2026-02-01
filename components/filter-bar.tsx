'use client';

import { useState, useEffect } from 'react';
import { X, Utensils, Shield, Clock, Wine } from 'lucide-react';
import { PlaceFilter } from '@/lib/types';
import { HALAL_STATUS } from '@/lib/constants';

interface FilterBarProps {
  activeFilters: PlaceFilter;
  onFilterChange: (filter: PlaceFilter) => void;
}

// Available cuisine types for quick filtering
const CUISINE_OPTIONS = [
  { value: 'Ramen', label: 'Ramen', emoji: '🍜' },
  { value: 'Yakiniku', label: 'Yakiniku', emoji: '🥩' },
  { value: 'Sushi', label: 'Sushi', emoji: '🍣' },
  { value: 'Curry', label: 'Curry', emoji: '🍛' },
  { value: 'Indian', label: 'Indian', emoji: '🫓' },
  { value: 'Middle Eastern', label: 'Middle Eastern', emoji: '🧆' },
];

export default function FilterBar({ activeFilters, onFilterChange }: FilterBarProps) {
  const [showCuisineMenu, setShowCuisineMenu] = useState(false);

  // Check if any filter is active
  const hasActiveFilters = Object.values(activeFilters).some(v => v !== null && v !== undefined && v !== '');

  // Close cuisine menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setShowCuisineMenu(false);
    if (showCuisineMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showCuisineMenu]);

  const toggleFilter = (key: keyof PlaceFilter, value: string | null) => {
    const newFilters: PlaceFilter = { ...activeFilters };
    if (newFilters[key] === value) {
      // Toggle off if already selected
      delete newFilters[key];
    } else {
      // Type-safe assignment
      if (key === 'search_terms') {
        // search_terms is string[], handled separately
        return;
      }
      (newFilters as Record<string, string | boolean | null | undefined>)[key] = value;
    }
    onFilterChange(newFilters);
  };

  const clearFilters = () => {
    onFilterChange({});
  };

  const isFilterActive = (key: keyof PlaceFilter, value?: string): boolean => {
    if (value) {
      return activeFilters[key] === value;
    }
    return !!activeFilters[key];
  };

  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 flex-wrap justify-center max-w-[90vw] md:max-w-none">
      {/* Halal Certified Only */}
      <FilterChip
        active={isFilterActive('halal_status', HALAL_STATUS.CERTIFIED.value)}
        onClick={() => toggleFilter('halal_status' as keyof PlaceFilter, HALAL_STATUS.CERTIFIED.value)}
        icon={<Shield className="w-3.5 h-3.5" />}
        label="Certified Only"
        color="green"
      />

      {/* Cuisine Type Dropdown */}
      <div className="relative">
        <FilterChip
          active={isFilterActive('cuisine_subtype') || isFilterActive('cuisine_category')}
          onClick={(e) => {
            e.stopPropagation();
            setShowCuisineMenu(!showCuisineMenu);
          }}
          icon={<Utensils className="w-3.5 h-3.5" />}
          label={
            activeFilters.cuisine_subtype ||
            activeFilters.cuisine_category ||
            'Cuisine'
          }
          color="blue"
          hasDropdown
        />

        {showCuisineMenu && (
          <div
            className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-200 py-1 min-w-[160px] z-20"
            onClick={(e) => e.stopPropagation()}
          >
            {CUISINE_OPTIONS.map((cuisine) => (
              <button
                key={cuisine.value}
                onClick={() => {
                  toggleFilter('cuisine_subtype' as keyof PlaceFilter, cuisine.value);
                  setShowCuisineMenu(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 ${
                  activeFilters.cuisine_subtype === cuisine.value ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                }`}
              >
                <span>{cuisine.emoji}</span>
                <span>{cuisine.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* No Alcohol tag filter */}
      <FilterChip
        active={isFilterActive('tag', 'no-alcohol')}
        onClick={() => toggleFilter('tag' as keyof PlaceFilter, 'no-alcohol')}
        icon={<Wine className="w-3.5 h-3.5" />}
        label="No Alcohol"
        color="purple"
      />

      {/* Open Now - placeholder for future implementation */}
      <FilterChip
        active={false}
        onClick={() => {}}
        icon={<Clock className="w-3.5 h-3.5" />}
        label="Open Now"
        color="gray"
        disabled
      />

      {/* Clear All Filters */}
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-full transition"
        >
          <X className="w-3 h-3" />
          Clear
        </button>
      )}
    </div>
  );
}

interface FilterChipProps {
  active: boolean;
  onClick: (e: React.MouseEvent) => void;
  icon: React.ReactNode;
  label: string;
  color: 'green' | 'blue' | 'purple' | 'gray';
  hasDropdown?: boolean;
  disabled?: boolean;
}

function FilterChip({ active, onClick, icon, label, color, hasDropdown, disabled }: FilterChipProps) {
  const colorClasses = {
    green: active
      ? 'bg-green-100 border-green-300 text-green-800'
      : 'bg-white border-gray-200 text-gray-700 hover:border-green-300 hover:bg-green-50',
    blue: active
      ? 'bg-blue-100 border-blue-300 text-blue-800'
      : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50',
    purple: active
      ? 'bg-purple-100 border-purple-300 text-purple-800'
      : 'bg-white border-gray-200 text-gray-700 hover:border-purple-300 hover:bg-purple-50',
    gray: 'bg-white border-gray-200 text-gray-400 cursor-not-allowed',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border shadow-sm transition ${colorClasses[color]} ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      {icon}
      <span className="max-w-[80px] truncate">{label}</span>
      {hasDropdown && (
        <svg className="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      )}
    </button>
  );
}
