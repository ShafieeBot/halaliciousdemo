'use client';

import { useState } from 'react';
import { X, Info, Share2, MessageSquare, Globe, ExternalLink, PlusCircle } from 'lucide-react';
import SuggestPlaceModal from './suggest-place-modal';

interface MoreMenuPanelProps {
  onClose: () => void;
}

export default function MoreMenuPanel({ onClose }: MoreMenuPanelProps) {
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const handleShare = async () => {
    const shareData = {
      title: 'Tokyo Halal Map',
      text: 'Find halal restaurants in Tokyo and Japan!',
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // User cancelled or share failed - copy to clipboard instead
        await navigator.clipboard.writeText(window.location.href);
        alert('Link copied to clipboard!');
      }
    } else {
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    }
  };

  const handleFeedback = () => {
    // Opens default email client
    window.location.href = 'mailto:feedback@halalicious.jp?subject=Feedback%20for%20Tokyo%20Halal%20Map';
  };

  return (
    <>
    <div className="absolute top-16 left-1/2 transform -translate-x-1/2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
        <h2 className="text-lg font-semibold text-gray-800">More</h2>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-gray-100 rounded-full transition"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Menu Items */}
      <div className="p-2">
        <MenuItem
          icon={<PlusCircle className="w-5 h-5 text-emerald-500" />}
          label="Suggest a Place"
          description="Add a restaurant to our map"
          onClick={() => setShowSuggestModal(true)}
        />

        <MenuItem
          icon={<Share2 className="w-5 h-5 text-blue-500" />}
          label="Share"
          description="Share this map with friends"
          onClick={handleShare}
        />

        <MenuItem
          icon={<MessageSquare className="w-5 h-5 text-green-500" />}
          label="Feedback"
          description="Help us improve"
          onClick={handleFeedback}
        />

        <MenuItem
          icon={<Globe className="w-5 h-5 text-purple-500" />}
          label="Language"
          description="English"
          onClick={() => {}}
          disabled
          badge="Coming Soon"
        />

        <div className="border-t border-gray-100 my-2" />

        <MenuItem
          icon={<Info className="w-5 h-5 text-gray-500" />}
          label="About"
          description="Tokyo Halal Map v1.0"
          onClick={() => {}}
        />

        <a
          href="https://halalicious.jp"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl transition group"
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-50">
            <ExternalLink className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-800 group-hover:text-amber-600 transition">
              Visit Halalicious
            </div>
            <div className="text-xs text-gray-500">Our main website</div>
          </div>
        </a>
      </div>

      {/* Footer */}
      <div className="p-3 bg-gray-50 border-t border-gray-100">
        <p className="text-xs text-gray-400 text-center">
          Made with love for the Muslim community in Japan
        </p>
      </div>
    </div>

    {/* Suggest Place Modal */}
    {showSuggestModal && (
      <SuggestPlaceModal onClose={() => setShowSuggestModal(false)} />
    )}
    </>
  );
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  badge?: string;
}

function MenuItem({ icon, label, description, onClick, disabled, badge }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 p-3 rounded-xl transition text-left ${
        disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-50'
      }`}
    >
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-50">
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800">{label}</span>
          {badge && (
            <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500">{description}</div>
      </div>
    </button>
  );
}
