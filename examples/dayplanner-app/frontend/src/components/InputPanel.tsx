import React, { useState } from 'react';
import './InputPanel.css';

interface InputPanelProps {
  onGenerate: (userInput: string, radius: number) => void;
  loading: boolean;
  error: string | null;
  radius: number;
  onRadiusChange: (radius: number) => void;
}

export default function InputPanel({ onGenerate, loading, error, radius, onRadiusChange }: InputPanelProps) {
  const [userInput, setUserInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (userInput.trim()) {
      onGenerate(userInput, radius);
    }
  };

  return (
    <div className="input-panel">
      <h2>Plan Your Day</h2>
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="userInput">What would you like to do today?</label>
          <textarea
            id="userInput"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="e.g., 'Find outdoor activities and good restaurants' or 'Relaxing day with nature and coffee'"
            rows={4}
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="radius">Search Radius: {radius} km</label>
          <input
            type="range"
            id="radius"
            min="1"
            max="20"
            value={radius}
            onChange={(e) => onRadiusChange(Number(e.target.value))}
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          disabled={loading || !userInput.trim()}
          className="generate-button"
        >
          {loading ? '🔄 Generating...' : '🎯 Generate Itinerary'}
        </button>
      </form>

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      <div className="tips">
        <p><strong>Tips:</strong></p>
        <ul>
          <li>Click on the map to set your starting location</li>
          <li>Be specific about your interests</li>
          <li>Mention dietary preferences or restrictions</li>
          <li>Specify transport mode (walk, bike, transit)</li>
        </ul>
      </div>
    </div>
  );
}
