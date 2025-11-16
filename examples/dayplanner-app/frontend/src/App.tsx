import { useState } from 'react';
import MapView from './components/MapView';
import InputPanel from './components/InputPanel';
import ItineraryView from './components/ItineraryView';
import type { Itinerary, Location } from './types';
import { API_BASE_URL } from './config';
import './App.css';

function App() {
  const [location, setLocation] = useState<Location | null>(null);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (userInput: string, radius: number) => {
    if (!location) {
      setError('Please select a location on the map first');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/itinerary/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userInput,
          location,
          radius,
          date: new Date().toISOString(),
          preferences: {},
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate itinerary');
      }

      const data = await response.json();
      setItinerary(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      console.error('Error generating itinerary:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLocationSelect = (loc: Location) => {
    setLocation(loc);
    setError(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎉 Funday</h1>
        <p>Your AI-powered day planner</p>
      </header>

      <div className="app-content">
        <div className="left-panel">
          <MapView
            location={location}
            onLocationSelect={handleLocationSelect}
            itinerary={itinerary}
          />
        </div>

        <div className="right-panel">
          <InputPanel
            onGenerate={handleGenerate}
            loading={loading}
            error={error}
          />

          {itinerary && (
            <ItineraryView
              itinerary={itinerary}
              onClose={() => setItinerary(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
