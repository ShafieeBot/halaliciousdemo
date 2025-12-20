// components/MapWrapper.tsx
'use client';

import { useState } from 'react';
import RestaurantMap from '@/components/map';
import ChatInterface from '@/components/chat';

export default function MapWrapper({ initialPlaces }: any) {
  const [places, setPlaces] = useState(initialPlaces);

  const handleChatResult = async (variables: any) => {
    const res = await fetch('/api/places/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variables }),
    });

    const data = await res.json();
    setPlaces(data.places);
  };

  return (
    <div className="flex h-screen">
      <RestaurantMap places={places} />
      <ChatInterface onResult={handleChatResult} />
    </div>
  );
}
