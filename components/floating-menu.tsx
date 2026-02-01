'use client';

import { useState } from 'react';
import { Heart, Tag, Sparkles, Menu, User, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import AuthModal from './auth-modal';

interface FloatingMenuProps {
    onToggleFavorites: () => void;
    onToggleMore: () => void;
}

export default function FloatingMenu({ onToggleFavorites, onToggleMore }: FloatingMenuProps) {
    const { user, isLoading, signOut } = useAuth();
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);

    const handleUserClick = () => {
        if (user) {
            setShowUserMenu(!showUserMenu);
        } else {
            setShowAuthModal(true);
        }
    };

    const handleSignOut = async () => {
        await signOut();
        setShowUserMenu(false);
    };

    return (
        <>
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
            <div className="w-px h-6 bg-gray-200 my-auto mx-1"></div>
            {/* User/Account Button */}
            <button
                onClick={handleUserClick}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100/80 rounded-full transition group"
            >
                {user ? (
                    <>
                        <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-medium">
                            {user.email?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <span className="text-sm font-medium text-gray-700 max-w-[80px] truncate hidden sm:block">
                            {user.email?.split('@')[0]}
                        </span>
                    </>
                ) : (
                    <>
                        <User className="w-4 h-4 text-gray-500 group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-medium text-gray-700">Sign In</span>
                    </>
                )}
            </button>
        </div>

        {/* User Dropdown Menu */}
        {showUserMenu && user && (
            <div className="absolute top-16 right-4 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-20 w-48 animate-in fade-in slide-in-from-top-2">
                <div className="p-3 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-800 truncate">{user.email}</p>
                    <p className="text-xs text-gray-500">Signed in</p>
                </div>
                <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition"
                >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                </button>
            </div>
        )}

        {/* Click outside to close user menu */}
        {showUserMenu && (
            <div
                className="fixed inset-0 z-10"
                onClick={() => setShowUserMenu(false)}
            />
        )}

        {/* Auth Modal */}
        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
        </>
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
