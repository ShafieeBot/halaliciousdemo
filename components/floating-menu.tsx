'use client';

import { Heart, Tag, Sparkles, Menu } from 'lucide-react';

interface FloatingMenuProps {
    onToggleFavorites: () => void;
    onToggleMore: () => void;
}

export default function FloatingMenu({ onToggleFavorites, onToggleMore }: FloatingMenuProps) {
    return (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 flex gap-2 bg-gradient-to-b from-white/95 to-blue-50/90 backdrop-blur-xl p-1.5 rounded-full shadow-2xl shadow-blue-900/10 border border-white/50 ring-1 ring-black/5">
            <MenuButton
                icon={<Heart className="w-4 h-4 text-rose-500" />}
                label="Favorites"
                onClick={onToggleFavorites}
            />
            <div className="w-px h-6 bg-gray-200 my-auto mx-1"></div>
            <MenuButton icon={<Tag className="w-4 h-4 text-amber-500" />} label="Promos" />
            <MenuButton icon={<Sparkles className="w-4 h-4 text-indigo-500" />} label="Featured" />
            <MenuButton
                icon={<Menu className="w-4 h-4 text-gray-600" />}
                label="More"
                onClick={onToggleMore}
            />
        </div>
    );
}

function MenuButton({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick?: () => void }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100/80 rounded-full transition group"
        >
            <span className="group-hover:scale-110 transition-transform">{icon}</span>
            <span className="text-sm font-medium text-gray-700">{label}</span>
        </button>
    );
}
