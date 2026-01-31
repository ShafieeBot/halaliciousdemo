'use client';

import { useState } from 'react';
import { Send, Sparkles, Trash2, MapPin } from 'lucide-react';

interface ChatInterfaceProps {
  places: any[];
  onFilterChange: (filter: any) => void;
  onSelectPlace: (placeName: string) => void;
}

type PlaceListItem = { name: string; cuisine: string };

type ChatMsg = { role: 'user' | 'assistant'; content: string; showPlaces?: boolean };

export default function ChatInterface({ places, onFilterChange, onSelectPlace }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [lastFilter, setLastFilter] = useState<any>({});

  const handleClear = () => {
    setMessages([]);
    setLastFilter({});
    onFilterChange({});
  };

  const processMessage = async (messageMessages: typeof messages) => {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messageMessages.map((m) => ({ role: m.role, content: m.content })), // cleanse places from history
          context: { lastFilter },
        }),
      });

      // Read raw text first so we can handle non-JSON server responses safely
      const rawText = await response.text();

      let data: any = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch (e) {
        console.error('API returned non-JSON response:', rawText);
        throw new Error('Server returned an invalid response.');
      }

      // Handle 429 retry logic
      if (response.status === 429) {
        const waitSeconds = data?.retryAfter || 10;

        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Server overloaded. Retrying in ${waitSeconds}s...` },
        ]);

        await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));

        setMessages((prev) => [...prev, { role: 'assistant', content: 'Retrying now...' }]);
        await processMessage(messageMessages);
        return;
      }

      if (!response.ok) {
        throw new Error(data?.error || `Failed to connect to AI service. (${response.status})`);
      }

      /**
       * ✅ Support BOTH API formats:
       *
       * OLD:
       *   { content: "{ \"filter\": {...}, \"message\": \"...\" }" }
       *
       * NEW:
       *   { filter: {...}, message: "..." }
       */
      let parsed: any = null;

      // Old format: JSON string inside data.content
      if (typeof data?.content === 'string' && data.content.trim()) {
        try {
          parsed = JSON.parse(data.content);
        } catch (err) {
          console.error('Failed to parse AI JSON string in data.content. Raw:', data.content);
          parsed = null;
        }
      }

      // New format: already parsed object with filter/message
      if (!parsed && data && typeof data === 'object') {
        const hasFilterOrMessage = 'filter' in data || 'message' in data;
        if (hasFilterOrMessage) parsed = data;
      }

      if (!parsed) {
        console.warn('Empty/invalid AI response object from API:', data);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: "I didn’t get a response. Please try again." },
        ]);
        return;
      }

      // Normalize shape
      parsed.filter = parsed.filter || {};
      parsed.message = typeof parsed.message === 'string' && parsed.message.trim()
        ? parsed.message
        : "Okay, I've updated the map.";

      // Check if filter has actual content (not empty)
      const hasFilter = parsed.filter && Object.values(parsed.filter).some(
        (v: any) => v !== null && v !== undefined && String(v).trim() !== ''
      );

      // Apply filter - map-wrapper will query and update places prop
      if (hasFilter) {
        onFilterChange(parsed.filter);
        setLastFilter(parsed.filter);
      }

      // Add message - only show places list if there's an actual filter change
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: parsed.message,
          showPlaces: hasFilter, // Only show places when filter changes
        },
      ]);
    } catch (e: any) {
      console.error(e);
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input;
    setInput('');
    setLoading(true);

    const newMessages = [...messages, { role: 'user', content: userMessage } as const];
    setMessages(newMessages);

    await processMessage(newMessages);
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-white to-gray-50 border-l border-gray-200 shadow-2xl w-96 z-50">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-white/90 to-blue-50/50 backdrop-blur-md z-10 sticky top-0">
        <div>
          <h1 className="font-bold text-lg text-gray-900 leading-tight">Tokyo Halal Map</h1>
          <p className="text-xs text-gray-500">Finding the best halal food in Japan.</p>
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
                  onClick={() => {
                    const newMessages = [...messages, { role: 'user', content: question } as const];
                    setMessages(newMessages);
                    setLoading(true);
                    processMessage(newMessages);
                  }}
                  className="p-3 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm rounded-xl transition text-left w-full border border-blue-100 hover:border-blue-200"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          // For assistant messages with showPlaces, use the places prop (same as map)
          const displayPlaces = m.showPlaces 
            ? places.slice(0, 10).map((p: any) => ({
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
            <div className="bg-gray-100 text-gray-700 rounded-2xl px-4 py-2 text-sm">Thinking…</div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-100 bg-white">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 text-sm"
            placeholder="Ask a question..."
          />
          <button
            type="submit"
            disabled={loading}
            className="p-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
