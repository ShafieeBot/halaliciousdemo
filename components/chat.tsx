'use client';

import { useState } from 'react';
import { Send, Sparkles, Trash2, MapPin } from 'lucide-react';

interface ChatInterfaceProps {
  places: any[];
  onFilterChange: (filter: any) => void;
  onSelectPlace: (placeName: string) => void;
}

export default function ChatInterface({ places, onFilterChange, onSelectPlace }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<
    { role: 'user' | 'assistant'; content: string; places?: { name: string; cuisine: string }[] }[]
  >([]);

  const handleClear = () => {
    setMessages([]);
    onFilterChange({}); // Reset map filters
  };

  const processMessage = async (messageMessages: typeof messages) => {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messageMessages.map((m) => ({ role: m.role, content: m.content })), // cleanse places from history
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

      // Your API returns: { role: 'assistant', content: '...string...' }
      const content: string = typeof data?.content === 'string' ? data.content : '';

      if (!content.trim()) {
        console.warn('Empty AI content from API:', data);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: "I didn’t get a response. Please try again." },
        ]);
        return;
      }

      // Parse JSON from AI
      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch (err) {
        console.error('Failed to parse AI JSON. Raw content:', content);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: "I couldn't understand that. Try asking differently." },
        ]);
        return;
      }

      // Ensure expected shape
      parsed.filter = parsed.filter || {};
      parsed.message = typeof parsed.message === 'string' ? parsed.message : "Okay, I've updated the map.";

      let chatPlaces = parsed.places;

      // Intercept Favorites intent
      if (parsed.filter && parsed.filter.favorites) {
        console.log('Intercepting Favorites Filter');
        const favIds = JSON.parse(localStorage.getItem('halal_favorites') || '[]');
        const favPlaces = places.filter((p) => favIds.includes(p.id));

        chatPlaces = favPlaces.map((p: any) => ({
          name: p.name,
          cuisine: p.cuisine_subtype || p.cuisine_category || 'Halal',
        }));

        if (favPlaces.length === 0) {
          parsed.message = "You haven't saved any favorites yet.";
        } else if (!parsed.message || parsed.message.includes('updated the map')) {
          parsed.message = `Here are your ${favPlaces.length} favorite places!`;
        }
      }

      if (parsed.filter) {
        onFilterChange(parsed.filter);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: parsed.message,
          places: chatPlaces,
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

        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'
              }`}
            >
              {m.content}
            </div>

            {/* Render Places List if available */}
            {m.places && m.places.length > 0 && (
              <div className="mt-2 w-[85%]">
                <ul className="space-y-1">
                  {m.places.map((place, idx) => (
                    <li key={idx}>
                      <button
                        onClick={() => onSelectPlace(place.name)}
                        className="w-full text-left py-1 px-1 hover:bg-gray-50 rounded transition flex items-start gap-2 group"
                      >
                        <div className="mt-0.5 text-blue-500 group-hover:text-blue-600">
                          <MapPin className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-800 group-hover:text-blue-700 underline-offset-2 group-hover:underline">
                            {place.name}
                          </div>
                          <div className="text-xs text-gray-500">{place.cuisine}</div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl px-4 py-2">
              <Sparkles className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-gray-100 bg-white">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            placeholder="Ask a question..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            disabled={loading}
            className="bg-blue-600 text-white p-2 rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
