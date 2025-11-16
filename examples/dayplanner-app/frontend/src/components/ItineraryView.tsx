import type { Itinerary } from '../types';
import './ItineraryView.css';

interface ItineraryViewProps {
  itinerary: Itinerary;
  onClose: () => void;
}

export default function ItineraryView({ itinerary, onClose }: ItineraryViewProps) {
  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getActivityIcon = (type: string) => {
    const icons: Record<string, string> = {
      dining: '🍽️',
      outdoor: '🌳',
      sightseeing: '🏛️',
      entertainment: '🎭',
      culture: '🎨',
      event: '🎪',
      travel: '🚶',
    };
    return icons[type] || '📍';
  };

  return (
    <div className="itinerary-view">
      <div className="itinerary-header">
        <h2>{itinerary.name}</h2>
        <button onClick={onClose} className="close-button">✕</button>
      </div>

      <div className="itinerary-summary">
        <div className="summary-item">
          <span>📅 {itinerary.dayContext.dayOfWeek}</span>
        </div>
        <div className="summary-item">
          <span>🌤️ {itinerary.weather.condition}, {itinerary.weather.temperature}°C</span>
        </div>
        <div className="summary-item">
          <span>⏱️ {Math.round(itinerary.totalDuration / 60)} hours</span>
        </div>
        <div className="summary-item">
          <span>📏 {(itinerary.totalDistance / 1000).toFixed(1)} km</span>
        </div>
      </div>

      {itinerary.dayContext.specialConsiderations.length > 0 && (
        <div className="day-notes">
          <strong>⚠️ Day Notes:</strong>
          <ul>
            {itinerary.dayContext.specialConsiderations.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="activities-list">
        {itinerary.activities.map((activity, index) => (
          <div key={activity.id} className="activity-card">
            <div className="activity-number">{index + 1}</div>
            <div className="activity-content">
              <div className="activity-header">
                <span className="activity-icon">{getActivityIcon(activity.type)}</span>
                <h3>{activity.name}</h3>
              </div>
              <p className="activity-description">{activity.description}</p>
              
              <div className="activity-details">
                <span>⏰ {formatTime(activity.startTime)}</span>
                <span>⌚ {activity.duration} min</span>
                {activity.rating && <span>⭐ {activity.rating}</span>}
              </div>

              {activity.daySpecificHours?.isClosed && (
                <div className="warning">⚠️ Closed today</div>
              )}

              {activity.daySpecificHours?.specialNote && (
                <div className="note">{activity.daySpecificHours.specialNote}</div>
              )}

              {activity.eventDetails && (
                <div className="event-info">
                  🎪 {activity.eventDetails.category}
                  {activity.eventDetails.ticketPrice && ` • ${activity.eventDetails.ticketPrice}`}
                </div>
              )}

              {activity.travelToNext && (
                <div className="travel-info">
                  🚶 {activity.travelToNext.mode} {activity.travelToNext.duration} min
                  ({(activity.travelToNext.distance / 1000).toFixed(1)} km)
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
