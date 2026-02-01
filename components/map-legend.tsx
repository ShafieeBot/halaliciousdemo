'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { HALAL_STATUS } from '@/lib/constants';

interface MapLegendProps {
  className?: string;
}

export default function MapLegend({ className = '' }: MapLegendProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const legendItems = [
    HALAL_STATUS.CERTIFIED,
    HALAL_STATUS.MUSLIM_FRIENDLY,
    HALAL_STATUS.UNVERIFIED,
  ];

  return (
    <div
      className={`absolute bottom-4 left-4 z-10 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden transition-all duration-200 ${className}`}
    >
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 hover:bg-gray-50 transition"
        aria-expanded={isExpanded}
        aria-label="Toggle map legend"
      >
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Map Legend</span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-100 pt-2">
          {legendItems.map((item) => (
            <div key={item.value} className="flex items-start gap-2">
              {/* Pin indicator */}
              <div
                className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5 border-2"
                style={{
                  backgroundColor: item.color,
                  borderColor: item.borderColor,
                }}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-800">{item.label}</div>
                <div className="text-[10px] text-gray-500 leading-tight">{item.description}</div>
              </div>
            </div>
          ))}

          {/* Additional info */}
          <div className="pt-2 border-t border-gray-100 mt-2">
            <p className="text-[10px] text-gray-400 leading-tight">
              Tap any pin for details. Certified restaurants are verified by official halal certification bodies.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
