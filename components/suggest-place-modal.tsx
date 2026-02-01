'use client';

import { useState } from 'react';
import { X, MapPin, Store, Phone, Globe, Send, CheckCircle } from 'lucide-react';

interface SuggestPlaceModalProps {
  onClose: () => void;
}

interface FormData {
  name: string;
  address: string;
  city: string;
  cuisineType: string;
  halalStatus: string;
  phone: string;
  website: string;
  notes: string;
  submitterEmail: string;
}

const initialFormData: FormData = {
  name: '',
  address: '',
  city: '',
  cuisineType: '',
  halalStatus: '',
  phone: '',
  website: '',
  notes: '',
  submitterEmail: '',
};

export default function SuggestPlaceModal({ onClose }: SuggestPlaceModalProps) {
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic validation
    if (!formData.name.trim() || !formData.address.trim()) {
      setError('Restaurant name and address are required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/places/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to submit suggestion');
      }

      setIsSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success state
  if (isSubmitted) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center animate-in fade-in zoom-in-95">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Thank You!</h2>
          <p className="text-gray-600 mb-6">
            Your suggestion has been submitted. We&apos;ll review it and add it to the map if it meets our criteria.
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-full font-medium hover:bg-blue-700 transition"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Suggest a Place</h2>
            <p className="text-xs text-gray-500">Help us grow our halal restaurant database</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-full transition"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Restaurant Name */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
              <Store className="w-4 h-4 text-gray-400" />
              Restaurant Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g., Halal Ramen Tokyo"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              required
            />
          </div>

          {/* Address */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
              <MapPin className="w-4 h-4 text-gray-400" />
              Address <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="Full address in Japan"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              required
            />
          </div>

          {/* City */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
              City/Area
            </label>
            <input
              type="text"
              name="city"
              value={formData.city}
              onChange={handleChange}
              placeholder="e.g., Shinjuku, Tokyo"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>

          {/* Two columns */}
          <div className="grid grid-cols-2 gap-4">
            {/* Cuisine Type */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                Cuisine Type
              </label>
              <select
                name="cuisineType"
                value={formData.cuisineType}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
              >
                <option value="">Select...</option>
                <option value="Japanese">Japanese</option>
                <option value="Ramen">Ramen</option>
                <option value="Sushi">Sushi</option>
                <option value="Yakiniku">Yakiniku</option>
                <option value="Curry">Curry</option>
                <option value="Indian">Indian</option>
                <option value="Middle Eastern">Middle Eastern</option>
                <option value="Turkish">Turkish</option>
                <option value="Indonesian">Indonesian</option>
                <option value="Malaysian">Malaysian</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Halal Status */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                Halal Status
              </label>
              <select
                name="halalStatus"
                value={formData.halalStatus}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
              >
                <option value="">Select...</option>
                <option value="Fully Halal">Fully Halal Certified</option>
                <option value="Muslim-Friendly">Muslim-Friendly</option>
                <option value="Halal Menu Available">Halal Menu Available</option>
                <option value="Unknown">Not Sure</option>
              </select>
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
              <Phone className="w-4 h-4 text-gray-400" />
              Phone Number
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+81 3-XXXX-XXXX"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>

          {/* Website */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
              <Globe className="w-4 h-4 text-gray-400" />
              Website or Google Maps Link
            </label>
            <input
              type="url"
              name="website"
              value={formData.website}
              onChange={handleChange}
              placeholder="https://..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
              Additional Notes
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Any additional information about the restaurant..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition resize-none"
            />
          </div>

          {/* Your Email (optional) */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
              Your Email (optional)
            </label>
            <input
              type="email"
              name="submitterEmail"
              value={formData.submitterEmail}
              onChange={handleChange}
              placeholder="We'll notify you when it's added"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50">
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-full font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Submit Suggestion
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
