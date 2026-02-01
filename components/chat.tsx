'use client';

import { useState, useRef } from 'react';
import { Send, Sparkles, Trash2, MapPin } from 'lucide-react';
import { Place, PlaceFilter, ChatMessage } from '@/lib/types';
import { API_CONFIG, APP_INFO } from '@/lib/constants';
import { hasNonEmptyValues, safeJsonParse } from '@/lib/utils';

interface ChatInterfaceProps {
  places: Place[];
  placesLoading: boolean;
  onFilterChange: (filter: PlaceFilter) => void;
  onSelectPlace: (placeName: string) => void;
}

export default function ChatInterface({ places, placesLoading, onFilterChange, onSelectPlace }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lastFilter, setLastFilter] = useState<PlaceFilter>({});
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleClear = () => {
    // Abort any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([]);
    setLastFilter({});
    setLoading(false);
    setIsRetrying(false);
    onFilterChange({});
  };

  const processMessage = async (messageMessages: ChatMessage[]) => {
    // Create new AbortController for this request
    abortControllerRef.current = new AbortController();
    const timeoutId = setTimeout(() => abortControllerRef.current?.abort(), API_CONFIG.REQUEST_TIMEOUT);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messageMessages.map((m) => ({ role: m.role, content: m.content })),
          context: { lastFilter },
        }),
        signal: abortControllerRef.current.signal,
      });

      clearTimeout(timeoutId);

      // Read raw text first so we can handle non-JSON server responses safely
      const rawText = await response.text();

      const data: Record<string, unknown> = safeJsonParse(rawText, {});
      if (Object.keys(data).length === 0 && rawText && rawText !== '{}') {
        console.error('API returned non-JSON response:', rawText);
        throw new Error('Server returned an invalid response.');
      }

      // Handle 429 retry logic
      if (response.status === 429) {
        const waitSeconds = (data?.retryAfter as number) || 10;

        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Server overloaded. Retrying in ${waitSeconds}s...` },
        ]);

        setIsRetrying(true);
        await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
        setIsRetrying(false);

        setMessages((prev) => [...prev, { role: 'assistant', content: 'Retrying now...' }]);
        await processMessage(messageMessages);
        return;
      }

      if (!response.ok) {
        throw new Error((data?.error as string) || `Failed to connect to AI service. (${response.status})`);
      }

      // Parse response - support both formats
      let parsed: Record<string, unknown> = {};

      // Old format: JSON string inside data.content
      if (typeof data?.content === 'string' && (data.content as string).trim()) {
        parsed = safeJsonParse(data.content as string, {});
        if (Object.keys(parsed).length === 0) {
          console.error('Failed to parse AI JSON string in data.content. Raw:', data.content);
        }
      }

      // New format: already parsed object with filter/message
      if (Object.keys(parsed).length === 0 && data && typeof data === 'object') {
        const hasFilterOrMessage = 'filter' in data || 'message' in data;
        if (hasFilterOrMessage) parsed = data;
      }

      if (Object.keys(parsed).length === 0) {
        console.warn('Empty/invalid AI response object from API:', data);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: "I didn't get a response. Please try again." },
        ]);
        return;
      }

      // Normalize shape
      const filter = (parsed.filter || {}) as PlaceFilter;
      const message = typeof parsed.message === 'string' && (parsed.message as string).trim()
        ? (parsed.message as string)
        : "Okay, I've updated the map.";

      // Check if filter has actual content (not empty)
      const hasFilter = hasNonEmptyValues(filter);

      // Apply filter - map-wrapper will query and update places prop
      if (hasFilter) {
        onFilterChange(filter);
        setLastFilter(filter);
      }

      // Add message - show places only for new searches (when filter changes)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: message,
          showPlaces: hasFilter,
        },
      ]);
    } catch (e: unknown) {
      const error = e as Error;
      if (error.name === 'AbortError') {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Request timed out. Please try again.' },
        ]);
      } else {
        console.error(error);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Error: ${error.message || 'Something went wrong.'}` },
        ]);
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
      setIsRetrying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading || isRetrying) return;

    const userMessage = input;
    setInput('');
    setLoading(true);

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);

    await processMessage(newMessages);
  };

  const handleQuickQuestion = (question: string) => {
    if (loading || isRetrying) return;
    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: question }];
    setMessages(newMessages);
    setLoading(true);
    processMessage(newMessages);
  };

  const isDisabled = loading || isRetrying;

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-white to-gray-50 border-l border-gray-200 shadow-2xl w-96 z-50">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-white/90 to-blue-50/50 backdrop-blur-md z-10 sticky top-0">
        <div>
          <h1 className="font-bold text-lg text-gray-900 leading-tight">{APP_INFO.NAME}</h1>
          <p className="text-xs text-gray-500">{APP_INFO.DESCRIPTION}</p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={handleClear}
            className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-red-500 transition"
            title="Clear Chat & Reset Map"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <div className="bg-blue-50 p-2 rounded-full">
            <Sparkles className="w-4 h-4 text-blue-500" />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="mt-8 px-2">
            <p className="text-center text-gray-400 text-sm mb-4">Ask me about halal food in Tokyo!</p>
            <div className="grid gap-2">
              {[
                'Best ramen in Shinjuku 🍜',
                'Halal yakiniku near Shibuya 🥩',
                'Spicy food in Tokyo 🌶️',
                'Cheap lunch places 💴',
              ].map((question, i) => (
                <button
                  key={i}
                  onClick={() => handleQuickQuestion(question)}
                  disabled={isDisabled}
                  className="p-3 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm rounded-xl transition text-left w-full border border-blue-100 hover:border-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          // For assistant messages with showPlaces, use the places prop (same as map)
          // Only show places when not loading to prevent showing stale data
          const shouldShowPlaces = m.showPlaces && !placesLoading;
          const displayPlaces = shouldShowPlaces
            ? places.slice(0, API_CONFIG.MAX_DISPLAY_PLACES).map((p) => ({
                name: p.name,
                cuisine: p.cuisine_subtype || p.cuisine_category || 'Halal',
              }))
            : [];

          return (
            <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                  m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'
                }`}
              >
                {m.content}
              </div>

              {/* Show loading state while places are being fetched */}
              {m.showPlaces && placesLoading && (
                <div className="mt-2 w-[85%] flex items-center gap-2 text-gray-500 text-sm py-2">
                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-gray-400 border-t-transparent"></div>
                  Loading places...
                </div>
              )}

              {displayPlaces.length > 0 && (
                <div className="mt-2 w-[85%]">
                  <ul className="space-y-1">
                    {displayPlaces.map((place, idx) => (
                      <li key={idx}>
                        <button
                          onClick={() => onSelectPlace(place.name)}
                          className="w-full text-left py-1 px-1 hover:bg-gray-50 rounded transition flex items-start gap-2 group"
                        >
                          <MapPin className="w-4 h-4 mt-0.5 text-gray-400 group-hover:text-blue-500" />
                          <div>
                            <div className="text-sm font-medium text-gray-800">{place.name}</div>
                            <div className="text-xs text-gray-500">{place.cuisine}</div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div className="flex items-start">
            <div className="bg-gray-100 text-gray-700 rounded-2xl px-4 py-2 text-sm flex items-center gap-2">
              <div className="animate-spin rounded-full h-3 w-3 border-2 border-gray-400 border-t-transparent"></div>
              {isRetrying ? 'Retrying...' : 'Thinking...'}
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-100 bg-white">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isDisabled}
            className="flex-1 px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 text-sm disabled:bg-gray-50 disabled:cursor-not-allowed"
            placeholder={isRetrying ? 'Please wait...' : 'Ask a question...'}
          />
          <button
            type="submit"
            disabled={isDisabled}
            className="p-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
